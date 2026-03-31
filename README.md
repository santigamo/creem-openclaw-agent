# Creem Store Agent — OpenClaw Skill

An AI-powered OpenClaw skill that acts as a full-time store operations worker for your [Creem](https://creem.io) store. It monitors your store continuously using three layers:

- **Webhooks** — Creem notifies the agent of events in real-time (payments, cancellations, disputes)
- **CLI** — The agent acts on your store via the [creem CLI](https://github.com/santigamo/creem-cli-developer-toolkit) (queries, pause subscriptions, create discounts)
- **Heartbeat** — OpenClaw's native periodic check monitors store health every 30 minutes

## Features

- Real-time webhook handling with HMAC verification, deduplication, and event batching
- Native OpenClaw heartbeat with state tracking and change detection
- Failed payment alerts with customer context
- Churn detection with LTV analysis and confidence-based autonomous retention actions
- Daily revenue digests
- Natural language queries: "How much revenue this week?", "Who cancelled today?"
- Telegram delivery with automatic session discovery after you message the bot once
- Error handling and graceful recovery

## Quick Start

### Prerequisites

- [OpenClaw](https://docs.openclaw.ai/) installed and configured
- [Creem CLI](https://github.com/santigamo/creem-cli-developer-toolkit) installed and authenticated
- Creem API key (test mode recommended to start)
- Telegram bot token (via [@BotFather](https://t.me/botfather))

### 1. Clone the repo

```bash
git clone https://github.com/santigamo/creem-openclaw-agent
cd creem-openclaw-agent
```

### 2. Install the skills

```bash
# Install the Creem CLI skill
npx skills add santigamo/creem-cli-developer-toolkit

# Copy the store agent skill into the OpenClaw workspace
cp -r skills/creem-store-agent ~/.openclaw/workspace/skills/
```

### 3. Merge AGENTS.md and HEARTBEAT.md into the workspace

Ask the agent to read the repo files and merge them into its current workspace:

```text
Read these two files and merge their content into your current AGENTS.md and HEARTBEAT.md.
Our content takes priority — keep any useful defaults from the current files but the
core instructions should come from ours:

~/Code/creem-openclaw-agent/AGENTS.md
~/Code/creem-openclaw-agent/HEARTBEAT.md
```

### 4. Enable hooks in OpenClaw

```bash
openclaw config set hooks.enabled true
openclaw config set hooks.token "your-hooks-secret"
openclaw gateway restart
```

### 5. Configure the bridge

The Creem CLI handles its own authentication (`creem login`). For the webhook bridge, copy `.env.example` to `.env` and fill in:

```bash
CREEM_WEBHOOK_SECRET=your_s...cret   # From Creem dashboard → Webhooks
OPENCLAW_HOOKS_TOKEN=your_h...cret   # Same value used in OpenClaw hooks config
WEBHOOK_PORT=3000
```

### 6. Run the bridge and tunnel

```bash
# Terminal 1
pnpm install
pnpm webhook

# Terminal 2
ngrok http 3000
```

Register your ngrok URL in the Creem dashboard as:

```text
https://your-ngrok-url.ngrok-free.app/api/webhooks/creem
```

### 7. Enable Telegram delivery

Message the Telegram bot once. OpenClaw will create a Telegram session for that conversation, and the webhook bridge will auto-discover it for future deliveries. No manual chat ID setup is required.

### 8. Open the WebUI

```bash
openclaw dashboard
```

The agent will begin monitoring your store automatically via the heartbeat pattern and process webhook events in real time.

## Project Structure

```
├── AGENTS.md                 # Agent behavior instructions (merge into workspace)
├── HEARTBEAT.md              # Periodic store health check (merge into workspace)
├── bridge/
│   ├── webhook-receiver.ts   # Webhook bridge (Bun + Hono, HMAC verify, batching, delivery)
│   └── README.md             # Bridge setup and architecture
├── skills/
│   └── creem-store-agent/
│       └── SKILL.md          # Main store agent skill
└── docs/
    └── guide.md              # Written guide with architecture diagram
```

### Dependencies (installed separately)

- **creem-cli skill** — `npx skills add santigamo/creem-cli-developer-toolkit`
- **creem CLI** — Terminal-native Creem operations

## How It Works

See the full guide in [docs/guide.md](docs/guide.md).

## License

MIT
