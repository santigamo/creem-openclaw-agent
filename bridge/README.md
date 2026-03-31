# Webhook Bridge

Lightweight Bun + Hono service that receives Creem webhook events and wakes the OpenClaw agent.

## What it does

1. **Receives** incoming Creem webhooks at `/api/webhooks/creem`
2. **Verifies** the HMAC-SHA256 signature using your Creem webhook secret
3. **Deduplicates** events by `event_id` (rebuilt from `events.jsonl` on startup)
4. **Logs** every verified event to `events.jsonl` (append-only audit trail)
5. **Wakes** the OpenClaw agent via `/hooks/wake` so it can process the event

## Architecture

```
Creem → ngrok → bridge (port 3000) → verify + log → OpenClaw /hooks/wake → agent acts
```

The bridge is intentionally thin — it doesn't process events itself. It just makes sure the event is real, logs it, and hands it off to the agent.

## Setup

```bash
# From the repo root
cp .env.example .env
# Fill in your secrets (see .env.example for details)

pnpm install
pnpm webhook
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `CREEM_WEBHOOK_SECRET` | HMAC signing secret from Creem dashboard |
| `OPENCLAW_HOOKS_TOKEN` | OpenClaw gateway auth token |
| `WEBHOOK_PORT` | Port to listen on (default: 3000) |
