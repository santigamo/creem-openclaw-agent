import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { Hono } from "hono";

const eventLogPath = new URL("./events.jsonl", import.meta.url);
const { CREEM_WEBHOOK_SECRET: webhookSecret, OPENCLAW_HOOKS_TOKEN: openClawToken } = process.env;
const port = Number.parseInt(process.env.WEBHOOK_PORT ?? "3000", 10) || 3000;
const seenEventIds = new Set<string>();

if (!webhookSecret) throw new Error("CREEM_WEBHOOK_SECRET is required");

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

const wakeOpenClaw = async (type: string, customerId: string | null) => {
  if (!openClawToken) throw new Error("OPENCLAW_HOOKS_TOKEN is required");
  const response = await fetch("http://localhost:18789/hooks/wake", {
    method: "POST",
    headers: { authorization: `Bearer ${openClawToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      text: `Creem webhook: ${type} for customer ${customerId ?? "unknown"}. Verify with CLI and act accordingly.`,
      mode: "now",
    }),
  });
  if (!response.ok) throw new Error(`OpenClaw wake failed: ${response.status} ${response.statusText}`);
};

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

  void wakeOpenClaw(type, customerId).then(() => {
    console.log(`🚀 [${new Date().toISOString()}] Woke OpenClaw → ${type} for ${customerId || "unknown"}`);
  }).catch((error) => {
    console.error(`❌ [${new Date().toISOString()}] Failed to wake OpenClaw:`, error);
  });

  console.log(`💾 [${new Date().toISOString()}] Event logged to events.jsonl`);
  return c.json({ ok: true });
});

Bun.serve({ fetch: app.fetch, port });
console.log(`Creem webhook receiver listening on http://localhost:${port}`);
