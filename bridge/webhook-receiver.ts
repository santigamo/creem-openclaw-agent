import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { Hono } from "hono";
import os from "node:os";
import path from "node:path";

const eventLogPath = new URL("./events.jsonl", import.meta.url);
const {
  CREEM_WEBHOOK_SECRET: webhookSecret,
  OPENCLAW_HOOKS_TOKEN: openClawToken,
  TELEGRAM_CHAT_ID: telegramChatId,
} = process.env;

// OpenClaw Telegram recipient format is "telegram:<numeric_id>"
const configuredTelegramRecipient = telegramChatId
  ? (telegramChatId.startsWith("telegram:") ? telegramChatId : `telegram:${telegramChatId}`)
  : undefined;
const port = Number.parseInt(process.env.WEBHOOK_PORT ?? "3000", 10) || 3000;
const seenEventIds = new Set<string>();

const sessionsPath = path.join(os.homedir(), ".openclaw", "agents", "main", "sessions", "sessions.json");

const detectTelegramRecipient = async () => {
  if (configuredTelegramRecipient) return configuredTelegramRecipient;
  if (!existsSync(sessionsPath)) return undefined;

  try {
    const sessions = JSON.parse(await readFile(sessionsPath, "utf8")) as Record<string, any>;
    const telegramSessions = Object.values(sessions)
      .filter((s: any) => s?.deliveryContext?.channel === "telegram" && typeof s?.deliveryContext?.to === "string")
      .sort((a: any, b: any) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));

    return telegramSessions[0]?.deliveryContext?.to as string | undefined;
  } catch {
    return undefined;
  }
};

if (!webhookSecret) throw new Error("CREEM_WEBHOOK_SECRET is required");

// Rebuild dedup set from event log on startup
if (existsSync(eventLogPath)) {
  for (const line of (await readFile(eventLogPath, "utf8")).split("\n").filter(Boolean)) {
    try {
      const eventId = JSON.parse(line).event_id;
      if (eventId) seenEventIds.add(String(eventId));
    } catch {}
  }
}

const verifySignature = (body: string, signature: string) => {
  const expected = createHmac("sha256", webhookSecret).update(body).digest("hex");
  const actual = signature.replace(/^sha256=/, "");
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
};

// --- Event batching ---
// Creem fires multiple events per action (e.g. subscription.update, subscription.active,
// checkout.completed, subscription.paid all from one purchase). We batch events for 5 seconds
// and send a single wake to OpenClaw with a summary.

interface PendingEvent {
  type: string;
  customerId: string;
  eventId: string;
}

let pendingEvents: PendingEvent[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_DELAY_MS = 5000;

const flushBatch = async () => {
  batchTimer = null;
  if (pendingEvents.length === 0) return;

  const batch = [...pendingEvents];
  pendingEvents = [];

  // Group by customer
  const byCustomer = new Map<string, string[]>();
  for (const e of batch) {
    const key = e.customerId || "unknown";
    if (!byCustomer.has(key)) byCustomer.set(key, []);
    byCustomer.get(key)!.push(e.type);
  }

  // Build summary message
  const lines: string[] = [];
  for (const [customer, types] of byCustomer) {
    lines.push(`Customer ${customer}: ${types.join(", ")}`);
  }

  const message = `Creem webhooks received (${batch.length} events):\n${lines.join("\n")}\n\nRun a heartbeat check to detect and report all changes. Follow HEARTBEAT.md strictly.`;

  console.log(`📤 [${new Date().toISOString()}] Flushing batch: ${batch.length} events → OpenClaw`);

  try {
    if (!openClawToken) throw new Error("OPENCLAW_HOOKS_TOKEN is required");
    const telegramRecipient = await detectTelegramRecipient();

    const body: Record<string, unknown> = {
      message,
      name: "Creem Webhook",
      deliver: true,
      channel: telegramRecipient ? "telegram" : "last",
    };
    if (telegramRecipient) body.to = telegramRecipient;

    const response = await fetch("http://localhost:18789/hooks/agent", {
      method: "POST",
      headers: { authorization: `Bearer ${openClawToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    console.log(`🚀 [${new Date().toISOString()}] Woke OpenClaw → ${batch.length} events batched`);
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Failed to wake OpenClaw:`, error);
  }
};

const queueEvent = (type: string, customerId: string, eventId: string) => {
  pendingEvents.push({ type, customerId, eventId });
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(flushBatch, BATCH_DELAY_MS);
};

// --- HTTP server ---

const app = new Hono();

app.post("/api/webhooks/creem", async (c) => {
  const signature = c.req.header("creem-signature");
  const rawBody = await c.req.text();
  if (!signature || !verifySignature(rawBody, signature)) return c.json({ error: "invalid signature" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  const eventId = String(payload.id ?? payload.event_id ?? "");
  const type = String(payload.eventType ?? payload.type ?? "");
  if (!eventId || !type) {
    console.log(`⚠️  [${new Date().toISOString()}] Rejected: missing id or eventType`);
    return c.json({ error: "missing id or eventType", keys: Object.keys(payload) }, 400);
  }
  if (seenEventIds.has(eventId)) {
    console.log(`🔁 [${new Date().toISOString()}] Duplicate skipped: ${type} (${eventId})`);
    return c.json({ ok: true, duplicate: true });
  }

  const obj = (payload.object as Record<string, unknown>) ?? {};
  const customer = (obj.customer as Record<string, unknown>) ?? {};
  const customerId = String(customer.id ?? obj.customer ?? "");
  const subscriptionId = String((obj as Record<string, unknown>).id ?? "");

  console.log(`📥 [${new Date().toISOString()}] Received: ${type} | event: ${eventId} | customer: ${customerId || "unknown"}`);

  const event = {
    event_id: eventId,
    type,
    received_at: new Date().toISOString(),
    customer_id: customerId,
    subscription_id: subscriptionId,
    signature_verified: true,
    raw_payload: payload,
  };

  seenEventIds.add(eventId);
  try {
    await appendFile(eventLogPath, `${JSON.stringify(event)}\n`);
  } catch (error) {
    seenEventIds.delete(eventId);
    console.error("Failed to append event log", error);
    return c.json({ error: "failed to log event" }, 500);
  }

  console.log(`💾 [${new Date().toISOString()}] Event logged to events.jsonl`);
  queueEvent(type, customerId, eventId);

  return c.json({ ok: true });
});

Bun.serve({ fetch: app.fetch, port });
console.log(`Creem webhook receiver listening on http://localhost:${port}`);
