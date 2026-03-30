# Creem Store Heartbeat

Periodic store health check. Run every cycle, compare against saved state, notify only on changes.

## State File

Location: `~/.creem/heartbeat-state.json`

If missing, create with these defaults (first run — treat everything found as new):
```json
{
  "lastCheckAt": null,
  "lastTransactionId": null,
  "transactionCount": 0,
  "customerCount": 0,
  "subscriptions": {
    "active": 0,
    "trialing": 0,
    "past_due": 0,
    "paused": 0,
    "canceled": 0,
    "expired": 0,
    "scheduled_cancel": 0
  },
  "knownSubscriptions": {}
}
```

## Heartbeat Routine

### Step 1: Load Previous State
Read `~/.creem/heartbeat-state.json`. If missing, create with defaults above.

### Step 2: Check New Transactions
```bash
creem transactions list --limit 20 --json
```
Compare the latest transaction ID against `lastTransactionId`. Any transactions after it are new.

Key fields per transaction: `id`, `amount` (in cents), `currency`, `status`, `product`, `customer`, `created_at`.

### Step 3: Check Subscription Health
```bash
creem subscriptions list --status active --json
creem subscriptions list --status past_due --json
creem subscriptions list --status canceled --json
creem subscriptions list --status paused --json
creem subscriptions list --status trialing --json
```

Compare current counts against stored `subscriptions` object. For each subscription, compare against `knownSubscriptions` map to detect individual transitions:

| Transition | Severity |
|------------|----------|
| New subscription (active/trialing) | ✅ Good news |
| active → canceled / scheduled_cancel | 🚨 Alert |
| active → past_due | ⚠️ Warning — payment failed |
| any → expired | 🚨 Alert |
| active → paused | ℹ️ Info |
| paused → active | ✅ Resumed |

### Step 4: Check New Customers
```bash
creem customers list --json
```
Compare count against stored `customerCount`.

### Step 5: Update State File
Write new snapshot to `~/.creem/heartbeat-state.json` with:
- Current timestamp as `lastCheckAt`
- Latest transaction ID as `lastTransactionId`
- Updated counts for transactions, customers, subscriptions
- Updated `knownSubscriptions` map with current subscription ID → status

### Step 6: Report

**If changes detected:** Send a summary to Telegram with all changes grouped:
```
Creem store update:
• 2 new transactions ($39.98 total)
• 1 new customer (alice@example.com)
• 1 subscription moved to past_due
• Active subscriptions: 12 (+1)
```

**If no changes:** Reply HEARTBEAT_OK — do not send any notification.

## Notification Rules

### Notify immediately
- New transaction (revenue)
- Subscription canceled or scheduled to cancel
- Payment failure (past_due)
- Subscription expired
- New customer
- Multiple cancellations in one cycle (churn spike)

### Stay silent
- No changes since last check
- Normal subscription renewal (no status change)
- First run state file creation
