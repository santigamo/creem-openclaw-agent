# Runbook — Creem Store Agent Setup & Demo

Step-by-step guide for setting up and demoing the Creem Store Agent with OpenClaw.

---

## Phase 1: Fresh OpenClaw Install

### 1.1 Install OpenClaw
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

### 1.2 Onboarding
During onboarding, set identity:
- **Name:** Creem
- **Creature:** Store manager
- **Vibe:** Warm
- **Emoji:** 🍦

When asked about you:
```
Santi. He/him. You're a store operations agent for a Creem-powered SaaS.
Your job is monitoring the store, alerting me on Telegram when something
needs attention, and handling churn autonomously when you're confident enough.
```

### 1.3 Verify
```bash
openclaw --version
openclaw gateway status
```

---

## Phase 2: Configure Agent Instructions

### 2.1 Merge AGENTS.md and HEARTBEAT.md

Tell the agent:
```
Read these two files and merge their content into your current
AGENTS.md and HEARTBEAT.md. Our content takes priority — keep any
useful defaults from the current files but the core instructions
should come from our files:

/Users/santi/Code/creem-openclaw-agent/AGENTS.md
/Users/santi/Code/creem-openclaw-agent/HEARTBEAT.md
```

---

## Phase 3: Install Skills

### 3.1 Install Creem CLI skill (you do this interactively)
```bash
npx skills add santigamo/creem-cli-developer-toolkit
```

### 3.2 Install Creem Store Agent skill (tell the agent)
```
Copy the creem-store-agent skill into your workspace:
cp -r /Users/santi/Code/creem-openclaw-agent/skills/creem-store-agent ~/.openclaw/workspace/skills/
Then verify it's loaded: list your available skills.
```

### 3.3 Verify Creem CLI is authenticated
```bash
creem whoami --json
```
Expected: `"environment": "test"`, `"authenticated": true`

---

## Phase 4: Webhook Setup (ngrok + Webhook Receiver + OpenClaw Hooks)

### 4.1 Configure environment variables
Create `.env` in the repo root (`~/Code/creem-openclaw-agent/.env`):
```bash
CREEM_WEBHOOK_SECRET=<from Creem dashboard → Developers → Webhooks → Signing secret>
OPENCLAW_HOOKS_TOKEN=<from openclaw.json gateway.auth.token, or run: python3 -c "import json; print(json.load(open('$HOME/.openclaw/openclaw.json'))['gateway']['auth']['token'])">
WEBHOOK_PORT=3000
```

### 4.2 Enable hooks in OpenClaw
Verify hooks are enabled in `~/.openclaw/openclaw.json`:
```json
{
  "hooks": {
    "internal": {
      "enabled": true
    }
  }
}
```
Then restart the gateway:
```bash
openclaw gateway restart
```

### 4.3 Install webhook receiver dependencies
```bash
cd ~/Code/creem-openclaw-agent
pnpm install
```

### 4.4 Start the webhook receiver
```bash
pnpm webhook
```
Expected: `Creem webhook receiver listening on http://localhost:3000`

### 4.5 Start ngrok tunnel
In a separate terminal:
```bash
ngrok http --url=chigger-crisp-tightly.ngrok-free.app 3000
```
Copy the public URL (e.g., `https://xxxx.ngrok-free.app`).

### 4.6 Update webhook URL in Creem dashboard
In the Creem dashboard (test mode) → Developers → Webhooks, update the endpoint URL to:
```
https://xxxx.ngrok-free.app/api/webhooks/creem
```
> **Note:** The webhook is already registered, just update the ngrok URL each time you restart the tunnel.

### 4.7 Test the webhook end-to-end
Create a test checkout in Creem to trigger a real webhook event, or manually test the receiver:
```bash
curl -X POST http://localhost:3000/api/webhooks/creem \
  -H "Content-Type: application/json" \
  -d '{"event_id": "test_001", "type": "checkout.completed", "customer_id": "cust_test"}'
```
> Note: This will fail signature verification (expected). A real Creem webhook will include the proper `creem-signature` header.

Expected flow: Creem sends webhook → ngrok → receiver verifies HMAC → logs to events.jsonl → wakes OpenClaw → agent processes event.

---

## Phase 5: Telegram Bot Setup (do this live during demo)

### 5.1 Create bot
1. Open Telegram → search @BotFather
2. `/newbot`
3. Name: `Creem Store Agent`
4. Username: `creem_store_agent_bot` (or similar available name)
5. Copy the token

### 5.2 Get your chat ID
1. Send any message to the new bot
2. Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Find `chat.id` in the response

### 5.3 Tell the agent the Telegram credentials
Tell the OpenClaw agent:
```
My Telegram bot token is <TOKEN> and my chat ID is <CHAT_ID>.
Remember these for sending me notifications.
```
> **Note:** The agent uses these to send alerts. They're stored in the agent's memory, not as system env vars.

---

## Phase 6: Test the Agent

### 6.1 Verify store access and first heartbeat
Tell the agent:
```
Run creem whoami --json to verify store access.
Then run a heartbeat check now — follow HEARTBEAT.md.
```
Expected: Creates `~/.creem/heartbeat-state.json` with baseline state, replies HEARTBEAT_OK.

### 6.2 Create a purchase and detect changes
Tell the agent:
```
Create a checkout for any of the existing products using the creem CLI.
Show me the checkout URL so I can complete the purchase.
```
Complete the sandbox purchase, then tell the agent:
```
Run a heartbeat check now. There should be new activity since the last baseline.
```
Expected: Detects new transaction, new customer, new subscription.

### 6.3 Test churn analysis
Tell the agent:
```
Cancel the subscription for <customer_email> using the CLI.
Then run a heartbeat check.
```
Expected: Detects cancellation, triggers churn analysis with:
- Customer context (product, country, tenure)
- LTV calculation from transaction history
- Retention recommendation with confidence level

### 6.4 Test natural language queries
```
How many active subscribers do I have? And what was my total revenue this month?
```

### 6.5 Test revenue digest
Tell the agent:
```
Generate a daily revenue digest for today. Include: total revenue,
new transactions, new customers, subscription changes, and active
subscriber count.
```

### 6.6 Test webhook (requires Phase 4)
Trigger a real webhook by creating a checkout + completing a test purchase in the Creem sandbox. The event will flow:
1. Creem fires webhook → ngrok URL → webhook-receiver.ts
2. Receiver verifies HMAC, logs event, wakes OpenClaw via `/hooks/wake`
3. Agent processes the event, sends Telegram notification

Check `events.jsonl` to confirm the event was logged:
```bash
cat ~/Code/creem-openclaw-agent/bridge/events.jsonl
```

### 6.7 Verify state persistence
```bash
openclaw gateway restart
```
Then tell the agent:
```
Run a heartbeat check now. Confirm you loaded the previous state
from ~/.creem/heartbeat-state.json before comparing.
```
Expected: Loads previous state, compares, reports HEARTBEAT_OK if no changes.

---

## Phase 7: Record Video (10-15 min)

### Layout
- **Main view:** OpenClaw WebUI (gateway dashboard) — shows agent messages, tool calls, reasoning
- **Side:** Terminal with bridge logs + ngrok (visible when showing webhook flow)
- **Bonus at the end:** Telegram notifications
- Use OpenScreen for recording

---

### 🎬 VIDEO SCRIPT + COMMANDS

Everything below is in order. Narration in quotes, commands in code blocks, stage directions in *italics*.

---

#### BEFORE YOU HIT RECORD

```bash
rm ~/.creem/heartbeat-state.json
rm ~/Code/creem-openclaw-agent/bridge/events.jsonl
openclaw gateway restart
```

Wait for gateway to be ready. Start recording.

---

#### INTRO (30 sec)

> "Hey, I'm Santi. I built an AI agent that replaces your Creem dashboard. It monitors your store 24/7 — new sales, failed payments, cancellations — and sends you alerts. But here's what makes it different from a simple notification bot: when someone cancels, it doesn't just tell you. It analyzes the customer, calculates their lifetime value, and decides what to do — offer a discount, pause the subscription, or let them go. All on its own. Let me show you how it works."

---

#### PART 1: ARCHITECTURE (1-2 min)

*Show: architecture diagram from `docs/guide.md` — open in GitHub or VS Code preview*

> "Before we start, let me walk you through the flow. There are four pieces, and I'll follow the diagram left to right."

> "Step 1 — **something happens in your Creem store**. A new sale, a cancellation, a failed payment. Creem fires a webhook event."

> "Steps 2 and 3 — the **webhook bridge** catches it. This is a small service that verifies the event is real, logs it for auditing, and wakes up the agent."

> "Steps 4, 5, and 6 — the **OpenClaw agent** takes over. It detects what changed by querying the store. Then it analyzes the situation — customer lifetime value, how long they've been subscribed — and makes a decision with a confidence score. If it's confident enough, it acts on its own: create a discount, pause a subscription, or let the customer go."

> "And step 7 — **you get notified**. What happened, and what the agent did about it. Today I'll show this in the OpenClaw WebUI, where you can see exactly what the agent is thinking. In production, this goes to Telegram — I'll show that at the end too."

> "That's the full loop. Let's set it all up."

---

#### PART 2: SETUP (2-3 min)

> "Let's start from zero. First, we install OpenClaw."

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

*Show: onboarding flow*

> "During onboarding, I give it a name — Creem — and tell it what its job is: you're a store operations agent."

> "Now we install two skills. The first is the Creem CLI — this is what the agent uses to talk to the Creem API. The second is the store agent skill — this teaches the agent how to monitor the store, detect problems, and respond."

```bash
npx skills add santigamo/creem-cli-developer-toolkit
cp -r skills/creem-store-agent ~/.openclaw/workspace/skills/
```

> "The CLI is already authenticated in test mode. Let me verify."

```bash
creem whoami --json
```

> "Now we need the webhook bridge. Remember the diagram — when something happens in the store, Creem sends a webhook event. But our agent runs locally, so Creem can't reach it. We need two things: a small bridge service to receive and verify the webhooks, and ngrok to give it a public URL."

> "Let me start the bridge."

```bash
cd ~/Code/creem-openclaw-agent
pnpm install
pnpm webhook
# → Creem webhook receiver listening on http://localhost:3000
```

> "It's listening on port 3000. Now I need ngrok to expose that port to the internet."

```bash
# In another terminal
ngrok http 3000
```

> "ngrok gives us a public URL. I've already registered this URL in the Creem dashboard as the webhook endpoint. So now the flow is: Creem sends a webhook to ngrok, ngrok forwards it to the bridge, the bridge verifies the signature and wakes the agent."

> "Let me open the OpenClaw WebUI — this is where we'll see everything the agent does."

```bash
openclaw dashboard
```

*Show: WebUI opening, agent session visible*

> "OK, everything is connected. Let's see it in action."

---

#### PART 3: LIVE DEMO (6-8 min)

**3a. First heartbeat (~1 min)**

> "First, let me ask the agent to check the store."

*In WebUI, tell agent:*
```
Run a heartbeat check now — follow HEARTBEAT.md.
```

> "Watch the WebUI — you can see the agent reading the heartbeat instructions, running CLI commands to check the store, and building a baseline snapshot. This is the first run, so everything it finds is new. From now on, every check compares against this."

*Point to tool calls in WebUI*

---

**3b. Webhook flow + new purchase (~2 min)**

> "Now let's see the real-time layer — the webhook flow from the diagram. I'll create a purchase to trigger it."

*In WebUI, tell agent:*
```
Create a checkout for the Pro Plan. Give me the link.
```

*Complete the sandbox purchase in browser (card: 4242 4242 4242 4242)*

> "Watch the bridge terminal..."

*Point to bridge logs showing:*
```
📥 Received: checkout.completed | event: evt_xxx | customer: cust_xxx
💾 Event logged to events.jsonl
🚀 Woke OpenClaw → checkout.completed for cust_xxx
```

> "The webhook arrived, the bridge verified it and woke the agent. Now look at the WebUI — the agent is already processing the event."

*Point to WebUI showing agent response: new transaction, new customer, new subscription*

> "The agent reacted in seconds. That's the webhook bridge doing its job — steps 1 through 3 from the diagram, happening automatically."

---

**3c. Cancellation + churn analysis (~2 min)**

> "Now the most interesting part — steps 4, 5, and 6. What happens when someone cancels?"

*In WebUI, tell agent:*
```
Cancel the subscription for [customer email].
```

> "Watch the WebUI closely. The agent is going to cancel the subscription via CLI, detect the change, fetch the customer's history, calculate their lifetime value, and make a retention decision."

*Wait for agent response, point to tool calls in WebUI*

> "Look — it ran a full churn analysis. It checked the customer's LTV, how long they've been subscribed, and decided on a recommendation with a confidence score."

> "The key here is the confidence threshold. If the agent is above 80% confident, it can execute the action on its own — create a discount, pause the subscription. If it's below 80%, it asks for your approval first. It's autonomous, but not reckless."

*Point to the retention recommendation in the response*

---

**3d. Natural language queries (~1 min)**

> "I can also just ask the agent questions in plain English."

*In WebUI, tell agent:*
```
How many active subscribers do I have? What was my total revenue this month?
```

> "Look at the WebUI — it translates my question into CLI commands, runs them, and gives me a clean answer. I don't need to know any commands."

---

**3e. Revenue digest (~1 min)**

> "Last thing before Telegram — the agent can generate a daily revenue summary."

*In WebUI, tell agent:*
```
Generate a daily revenue digest.
```

> "It pulls all the store data — transactions, subscriptions, customers — and gives me a complete summary. This can run automatically every morning."

---

**3f. Telegram (bonus, ~1 min, if time allows)**

> "All of this also works with Telegram. Let me quickly set that up."

*Open Telegram, search @BotFather, create bot, copy token. Get chat ID via `https://api.telegram.org/bot<TOKEN>/getUpdates`*

*In WebUI, tell agent:*
```
My Telegram bot token is <TOKEN> and my chat ID is <CHAT_ID>. Remember these for sending me notifications.
```

> "Now let me trigger one more event and show you the notification."

*Create another checkout + complete purchase. Point to Telegram notification arriving.*

> "In production, you'd get these alerts on your phone without opening any dashboard."

---

#### CLOSING (1 min)

> "So that's it. An AI agent that monitors your Creem store 24/7. It catches new sales, detects churn, analyzes customers, and makes retention decisions — all autonomously. Three layers: webhooks for speed, heartbeat for reliability, CLI for action."

> "Everything you saw runs on OpenClaw with two skills and a 90-line webhook bridge. The repo is on GitHub with a full setup guide. Links in the description. Thanks for watching."

---

## Phase 8: Submit

- [ ] Commit and push all changes to GitHub
- [ ] Upload video to YouTube
- [ ] Submit on bounty page with: repo link, video link, guide link (docs/guide.md)
