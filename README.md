# Creem Store Agent — OpenClaw Skill

An AI-powered OpenClaw skill that acts as a full-time store operations worker for your [Creem](https://creem.io) store. It monitors your store continuously using three layers:

- **Webhooks** — Creem notifies the agent of events in real-time (payments, cancellations, disputes)
- **CLI** — The agent acts on your store via the [creem CLI](https://github.com/santigamo/creem-cli-developer-toolkit) (queries, pause subscriptions, create discounts)
- **Heartbeat** — OpenClaw's native periodic check monitors store health every 30 minutes

## Features

- Real-time alerts for all 13 Creem webhook events via Telegram
- Heartbeat monitoring with state tracking and change detection
- Failed payment alerts with customer context
- Churn detection with LLM analysis and autonomous retention actions
- Daily revenue digests
- Natural language queries: "How much revenue this week?", "Who cancelled today?"
- Error handling and graceful recovery

## Quick Start

### Prerequisites

- [OpenClaw](https://docs.openclaw.ai/) installed and configured
- [Creem CLI](https://github.com/santigamo/creem-cli-developer-toolkit) installed and authenticated
- Creem API key (test mode recommended to start)
- Telegram bot token (via [@BotFather](https://t.me/botfather))

### 1. Install the skills

```bash
# Install the Creem store agent skill
clawhub install creem-store-agent

# Install the Creem CLI skill
npx skills add santigamo/creem-cli-developer-toolkit
```

### 2. Set up the workspace

Copy the workspace files to your OpenClaw workspace:

```bash
cp AGENTS.md ~/.openclaw/workspace/
cp HEARTBEAT.md ~/.openclaw/workspace/
```

### 3. Configure

Set the following environment variables:

```bash
export CREEM_API_KEY=creem_test_...
export TELEGRAM_BOT_TOKEN=your_bot_token
export TELEGRAM_CHAT_ID=your_chat_id
export CREEM_WEBHOOK_SECRET=your_creem_webhook_secret
export OPENCLAW_HOOKS_TOKEN=your_openclaw_hooks_token
```

### 4. Run

Start OpenClaw — the agent will begin monitoring your store automatically via the heartbeat pattern.

To run the local Creem webhook bridge:

```bash
pnpm install
pnpm webhook
```

## Project Structure

```
├── AGENTS.md                 # Agent behavior instructions (copy to workspace)
├── HEARTBEAT.md              # Periodic store health check (copy to workspace)
├── skills/
│   └── creem-store-agent/
│       └── SKILL.md          # Publishable skill for ClawHub
├── docs/
│   ├── guide.md              # Written guide
│   └── architecture.png      # Architecture diagram
└── examples/
    └── webhook-events/       # Sample webhook payloads for testing
```

### Dependencies (installed separately)

- **creem-cli skill** — `npx skills add santigamo/creem-cli-developer-toolkit`
- **creem CLI** — Terminal-native Creem operations

## How It Works

See the full guide in [docs/guide.md](docs/guide.md).

## License

MIT
