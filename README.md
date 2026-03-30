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

### Install the skill

```bash
# Clone the repo
git clone https://github.com/santigamo/creem-openclaw-agent.git

# Copy skill files to your OpenClaw workspace
cp SKILL.md ~/.openclaw/workspace/
cp HEARTBEAT.md ~/.openclaw/workspace/
cp -r skills/ ~/.openclaw/workspace/skills/
```

### Configure

Set the following environment variables:

```bash
export CREEM_API_KEY=creem_test_...
export TELEGRAM_BOT_TOKEN=your_bot_token
export TELEGRAM_CHAT_ID=your_chat_id
```

### Run

Start OpenClaw — the agent will begin monitoring your store automatically via the heartbeat pattern.

## Project Structure

```
├── SKILL.md              # Main agent skill — capabilities and instructions
├── HEARTBEAT.md          # Periodic store health check pattern
├── skills/
│   └── creem-cli/        # Creem CLI skill (terminal-native store operations)
├── docs/
│   ├── guide.md          # Written guide (bounty deliverable)
│   └── architecture.png  # Architecture diagram
└── examples/
    └── webhook-events/   # Sample webhook payloads for testing
```

## How It Works

See the full guide in [docs/guide.md](docs/guide.md).

## License

MIT
