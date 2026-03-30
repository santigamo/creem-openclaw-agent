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

### 2.2 Verify workspace files
```bash
ls ~/.openclaw/workspace/
# Should have: AGENTS.md  HEARTBEAT.md  IDENTITY.md  SOUL.md  TOOLS.md  USER.md
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

## Phase 4: Webhook Setup (Cloudflare Tunnel + OpenClaw Hooks)

### 4.1 Install cloudflared
```bash
brew install cloudflared
```

### 4.2 Enable hooks in OpenClaw
Edit `~/.openclaw/openclaw.json` and add:
```json
{
  "hooks": {
    "enabled": true,
    "token": "your-secret-token-here"
  }
}
```
Then restart the gateway:
```bash
openclaw gateway restart
```

### 4.3 Create a stable Cloudflare Tunnel
```bash
cloudflared tunnel login
cloudflared tunnel create creem-agent
cloudflared tunnel route dns creem-agent creem-agent.yourdomain.com
```

### 4.4 Run the tunnel
```bash
cloudflared tunnel run --url http://localhost:18789 creem-agent
```
Or install as a service for persistence:
```bash
cloudflared service install
```

### 4.5 Register webhook in Creem
In the Creem dashboard, set the webhook URL to:
```
https://creem-agent.yourdomain.com/hooks/wake
```

### 4.6 Test the webhook
```bash
curl -X POST https://creem-agent.yourdomain.com/hooks/wake \
  -H "Authorization: Bearer your-secret-token-here" \
  -H "Content-Type: application/json" \
  -d '{"text": "Test webhook event: checkout.completed for customer test@example.com", "mode": "now"}'
```
The agent should wake up and process the event.

---

## Phase 5: Telegram Bot Setup

### 5.1 Create bot
1. Open Telegram → search @BotFather
2. `/newbot`
3. Name: `Creem Store Agent`
4. Save the token

### 5.2 Get your chat ID
1. Message the bot
2. Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Find `chat.id` in the response

### 5.3 Set environment variables
```bash
export TELEGRAM_BOT_TOKEN=***
export TELEGRAM_CHAT_ID=your_chat_id_here
```

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
Trigger a test event via curl:
```bash
curl -X POST https://creem-agent.yourdomain.com/hooks/wake \
  -H "Authorization: Bearer your-secret-token-here" \
  -H "Content-Type: application/json" \
  -d '{"text": "Creem webhook: subscription.canceled for customer test@example.com sub_abc123. Verify with CLI and run churn analysis.", "mode": "now"}'
```
Expected: Agent wakes, verifies via CLI, runs churn analysis if applicable.

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

### Structure
1. **Setup (2-3 min):** Show install, skill setup, CLI auth — demonstrate ease of setup
2. **Architecture (1-2 min):** Explain the 3 layers: CLI + Webhooks + Heartbeat
3. **Live demo (6-8 min):**
   - Agent running as background worker
   - Heartbeat detects changes → Telegram notification
   - Simulate failed payment → alert with context
   - Simulate cancellation → churn analysis → auto-action
   - Natural language query → response
   - Revenue digest
4. **Closing (1 min):** Recap, links

### Recording tips
- Use OpenScreen editor for recording
- Keep language simple (non-native English)
- Show terminal + Telegram side by side

---

## Phase 8: Write Guide (1,500-2,500 words)

File: `docs/guide.md`

### Outline
1. Introduction — the problem (manually checking dashboards)
2. Architecture — 3 layers diagram + explanation
3. Setup — step by step (from this runbook)
4. Heartbeat pattern — how state tracking works
5. Proactive workflows — failed payments, churn, digests
6. Natural language queries — examples
7. How to extend the agent

---

## Phase 9: Submit

- [ ] GitHub repo clean with README
- [ ] Publish to ClawHub (`clawhub publish`)
- [ ] Upload video to YouTube
- [ ] Publish guide (in repo or dev.to)
- [ ] Submit on bounty page
