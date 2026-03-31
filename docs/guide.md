# Building an AI Store Operations Agent for Creem with OpenClaw

Your Creem store generates events all day — new sales, failed payments, cancellations, upgrades, downgrades. If you're a solo founder or a small team, checking the dashboard every few hours is not sustainable. You miss things. A payment fails on Friday night, and you don't notice until Monday. A customer cancels, and by the time you react, they're gone.

This guide shows you how to build an AI agent that monitors your Creem store 24/7. It doesn't just send alerts — it analyzes situations and takes action. When someone cancels, the agent calculates their lifetime value, decides whether to offer a discount, and executes it. No human in the loop unless the agent isn't confident enough.

## Architecture

The agent uses three layers, each solving a different problem:

```mermaid

```

### Layer 1: Webhooks — Real-time event processing

When something happens in your Creem store, the platform fires a webhook event. Our lightweight bridge service (`bridge/webhook-receiver.ts`) receives it, verifies the HMAC-SHA256 signature to confirm it's authentic, deduplicates it by event ID, and logs it to `events.jsonl` as an audit trail.

Creem often emits multiple events for one business action — for example a single purchase can generate `subscription.update`, `subscription.active`, `checkout.completed`, and `subscription.paid`. To avoid waking the agent four times for one checkout, the bridge batches events for a few seconds and sends a single summary to OpenClaw.

Instead of using `/hooks/wake`, the bridge calls OpenClaw's `/hooks/agent` endpoint. That matters because `/hooks/agent` can both run an isolated agent turn **and** deliver the result back to the user over Telegram. The bridge also auto-detects the latest Telegram recipient from OpenClaw's session store, so after you message the bot once, future webhook alerts can be routed there automatically.

The bridge is intentionally thin — a small Bun + Hono service with no business logic of its own. It doesn't decide what to do. It just makes sure the event is real, logs it, batches noisy event bursts, and hands the situation off to the brain. If you need to audit what happened, `events.jsonl` has every verified event with timestamps, customer IDs, and the full raw payload.

### Layer 2: CLI — Active control

The [Creem CLI](https://github.com/santigamo/creem-cli-developer-toolkit) is how the agent interacts with your store. It can list customers, inspect subscriptions, check transaction history, create discounts, pause subscriptions, and more — all from the terminal.

This is what makes the agent more than a notification bot. When the churn analysis says "offer a 20% discount to retain this customer," the agent actually does it. It runs `creem discounts create`, then notifies you on Telegram with what it did and why.

The CLI uses the same Creem API you'd use from the dashboard, but it's terminal-native — which means an AI agent can use it directly. No API client libraries, no SDK, no code to maintain.

### Layer 3: Heartbeat — Periodic health monitoring

Webhooks are fast, but they're not 100% reliable. Networks fail, services go down. The heartbeat is your safety net.

Every 30 minutes, OpenClaw's native heartbeat system triggers the agent to run a full store health check. The agent:

1. Loads the previous state from `~/.creem/heartbeat-state.json`
2. Queries the store for current transactions, subscriptions, and customers
3. Compares the two snapshots
4. Reports any changes — or stays silent if nothing happened

This means even if a webhook gets lost, the heartbeat catches it within 30 minutes. The state file persists across restarts, so the agent never loses track of where it was.

## Proactive Workflows

The agent handles all 13 Creem webhook events, but three workflows stand out:

### Failed payment alerts

When a subscription goes `past_due`, the agent doesn't just say "payment failed." It fetches the customer's details, checks their transaction history (first-time failure vs. repeat offender), and sends you a Telegram alert with full context:

- Customer email and product
- Payment amount
- How long they've been a subscriber
- Whether this is a recurring problem

This context matters. A first-time failure on a $200/month enterprise customer deserves more attention than a repeat failure on a $5 trial.

### Churn detection and autonomous retention

This is the agent's most powerful workflow. When a subscription is canceled or scheduled for cancellation:

1. The agent fetches the customer's full history — product, plan, country, subscription age
2. It calculates their lifetime value by summing all transactions
3. It analyzes the situation and chooses one of three actions:
   - **Create a retention discount** — for high-value customers worth saving
   - **Suggest pausing** — for customers who might come back later
   - **No action** — for very new or low-value customers

4. If the agent's confidence is **80% or higher**, it executes the action autonomously and notifies you after the fact
5. If confidence is **below 80%**, it sends you a recommendation on Telegram and waits for approval

This confidence-based execution model means the agent handles the clear cases on its own (saving you time) while escalating the ambiguous ones (keeping you in control). You get the best of both worlds: automation without blind trust.

### Daily revenue digest

Every day, the agent generates a summary of your store's activity:

- Total revenue for the day
- Number of new transactions and customers
- Subscription changes (new, canceled, upgraded, downgraded)
- Active subscriber count
- Comparison with the previous day

This replaces the "open the dashboard and squint at graphs" ritual. One Telegram message, every morning, with everything you need to know.

## Natural Language Queries

You don't need to memorize CLI commands. Just ask the agent in plain English:

- "How much revenue did we make this week?"
- "How many active subscribers do we have?"
- "Who cancelled today?"
- "Show me the last 10 transactions"
- "What products do we have?"

The agent translates your question into the right CLI commands, runs them, and gives you a human-readable answer. This works because OpenClaw agents have full access to the tools defined in their skills — the Creem CLI is just another tool.

## Setup

### Prerequisites

- [OpenClaw](https://docs.openclaw.ai/) installed and running
- [Creem CLI](https://github.com/santigamo/creem-cli-developer-toolkit) installed and authenticated
- A Creem API key (test mode recommended to start)
- A Telegram bot (create one via [@BotFather](https://t.me/botfather))
- [Bun](https://bun.sh/) runtime (for the webhook bridge)
- [ngrok](https://ngrok.com/) (to expose the webhook bridge to the internet)

### Step 1: Clone the repo

```bash
git clone https://github.com/santigamo/creem-openclaw-agent
cd creem-openclaw-agent
```

Everything lives in the repo: AGENTS.md, HEARTBEAT.md, the skill, and the webhook bridge.

### Step 2: Install the skills

```bash
# Install the Creem CLI skill
npx skills add santigamo/creem-cli-developer-toolkit

# Copy the store agent skill into the OpenClaw workspace
cp -r skills/creem-store-agent ~/.openclaw/workspace/skills/
```

### Step 3: Merge agent instructions into the workspace

Instead of blindly overwriting the workspace files, ask the agent to read the repo versions and merge them into its current workspace:

```text
Read these two files and merge their content into your current AGENTS.md and HEARTBEAT.md.
Our content takes priority — keep any useful defaults from the current files but the
core instructions should come from ours:

~/Code/creem-openclaw-agent/AGENTS.md
~/Code/creem-openclaw-agent/HEARTBEAT.md
```

This preserves any useful OpenClaw defaults while applying the Creem-specific behavior.

### Step 4: Enable hooks in OpenClaw

```bash
openclaw config set hooks.enabled true
openclaw config set hooks.token "your-hooks-secret"
openclaw gateway restart
```

### Step 5: Configure the webhook bridge

```bash
cp .env.example .env
```

Fill in your `.env`:

```bash
CREEM_WEBHOOK_SECRET=your_signing_secret   # From Creem dashboard → Webhooks
OPENCLAW_HOOKS_TOKEN=your_hooks_token      # Same value used in OpenClaw hooks config
WEBHOOK_PORT=3000
```

### Step 6: Start the bridge and tunnel

```bash
# Terminal 1: webhook bridge
pnpm install
pnpm webhook

# Terminal 2: ngrok tunnel
ngrok http 3000
```

Register the ngrok public URL in the Creem dashboard as your webhook endpoint:
```
https://your-ngrok-url.ngrok-free.app/api/webhooks/creem
```

### Step 7: Enable Telegram delivery

Message your Telegram bot **once**. That's enough.

OpenClaw creates a Telegram session for that conversation, and the webhook bridge can auto-detect that session and route future alerts there. No manual chat ID lookup is required.

### Step 8: Open the WebUI and run

```bash
openclaw dashboard
```

That's it. The agent starts monitoring on the next heartbeat cycle (every 30 minutes), and processes webhook events in real time.

## How to Extend

The agent is built with standard OpenClaw patterns, so extending it is straightforward:

- **Add more notification channels** — The skill can be modified to send alerts to Slack or Discord instead of (or in addition to) Telegram
- **Custom retention logic** — Edit the churn analysis section in `skills/creem-store-agent/SKILL.md` to adjust confidence thresholds or add new retention strategies
- **Additional workflows** — Add dispute handling, upgrade celebration messages, or weekly trend reports by extending the skill
- **Multiple stores** — Run separate OpenClaw agents with different Creem API keys, each monitoring its own store

The key design principle is that the agent's behavior is defined in plain text files (SKILL.md, AGENTS.md, HEARTBEAT.md). No code to compile, no plugins to build. You edit markdown, restart the gateway, and the agent adapts.

## Conclusion

An AI store operations agent is not about replacing human judgment — it's about making sure nothing falls through the cracks. Failed payments get caught immediately. Cancellations get analyzed before they're forgotten. Revenue summaries arrive without you asking.

The three-layer architecture (webhooks + CLI + heartbeat) gives you speed, control, and reliability. The confidence-based execution model gives you automation without blind trust. And because it's all built on OpenClaw skills, the entire thing is portable, shareable, and extensible.

Your store never sleeps. Now your monitoring doesn't have to either.

---

*This agent was built for the OpenClaw + CREEM AI Agent Worker Bounty. The full source code, skills, and setup instructions are available on [GitHub](https://github.com/santigamo/creem-openclaw-agent). Questions or feedback? Open an issue or reach out on X [@imsantigamo](https://x.com/imsantigamo).*
