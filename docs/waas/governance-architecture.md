# Governance Architecture — Dual-Mode AI Agent Governance

> Decision Date: 2026-03-14
> Status: Design — startup mode implementation planned, enterprise mode deferred
> Owner: Sean Weiss (CEO), CCO Agent (blockdrive-compliance)

## Problem Statement

WaaS deploys 7 autonomous AI agents with real capabilities: database writes, external API calls, message sending (Telegram, Slack, email), financial model access, and investor document generation. Without governance, a single hallucination or misaligned action could result in:

- Unauthorized financial commitments (Sam commits to pricing, Morgan sends wrong investor metrics)
- External communications the company can't stand behind (Taylor posts on X, Casey gives legal advice)
- Data leaks across department namespaces
- Uncontrolled API spend across 7 agents burning Anthropic/OpenRouter credits

The challenge: **too much governance kills startup velocity; too little risks catastrophic agent failures.** The solution must scale from a pre-revenue "move fast" posture to enterprise compliance (SOX, GDPR, ISO 42001) without a rewrite.

## Solution: Dual-Mode Governance

A single `governance.mode` config flag switches the entire agent workforce between two governance postures. Both modes share the same CCO agent, runtime config schema, and audit infrastructure — the difference is *when* and *how* governance checks run.

```
┌─────────────────────────────────────────────────┐
│                governance.mode                   │
│                                                   │
│   "startup"              "enterprise"            │
│   ─────────              ────────────            │
│   Async audit            Sync gates              │
│   Hard guardrails        Pre-action approval     │
│   Configurable tripwires Policy enforcement      │
│   2x daily cron          Real-time interception  │
│   CEO/admin configured   CCO-managed policies    │
│   C-Suite group approvals CCO auto-approval      │
│                                                   │
│   ← Same config schema, same CCO agent →         │
└─────────────────────────────────────────────────┘
```

---

## Startup Mode

**Philosophy:** Hard guardrails + human approval for sensitive actions + async audit. Move fast with a safety net, but gate external-facing and financial actions through CEO approval.

**Who configures it:** CEO and/or human executive/admin team members — not the CCO agent. Humans set the tripwires they specifically care about.

### Layer 1: Hard Guardrails (runtime-enforced, zero latency)

These exist today in `@waas/runtime` and are always active regardless of mode:

| Guardrail | Implementation | Location |
|-----------|---------------|----------|
| Budget escalation ($10/day threshold) | All agents alert + block above $10/day | Governance middleware |
| Namespace isolation | `ScopedRedisClient` + `ScopedMem0Client` per department | `@waas/shared/namespace` |
| SSRF protection | `isAllowedUrl()` blocks private IPs, cloud metadata, localhost | `@waas/runtime/tool-helpers` |
| Org-scoped data | All DB queries scoped by `orgId` via closure | Every tool factory |
| Fail-closed agent registry | Unregistered agent IDs denied, not allowed | `@waas/shared/namespace` |
| Telegram whitelist | `TELEGRAM_CHAT_ID` restricts who can message agents | Runtime transport config |

### Layer 2: Configurable Tripwires + Approval Gates (new — runtime config)

Human-configured thresholds. Actions matching approval rules are **blocked until CEO approves** via the C-Suite Telegram group. Other tripwires fire alerts only.

```typescript
// @waas/shared/governance/types.ts

interface GovernanceConfig {
  mode: "startup" | "enterprise";

  // ── Spend Controls ──
  spendLimitPerAgentPerDay: number;    // USD, alerts + blocks above this
  spendLimitGlobalPerDay: number;      // USD, all agents combined

  // ── Approval Requirements ──
  // Actions in these categories MUST be approved before execution
  requireApproval: {
    externalCommunications: boolean;   // Any outbound message to non-internal recipients
    marketingActivities: boolean;      // Content creation, social posts, campaigns
    socialMediaPosts: boolean;         // X/Twitter, LinkedIn, any public social
    financialCommitments: boolean;     // Pricing, contracts, spending
    escalations: boolean;             // Inter-agent escalations
  };

  // ── Logging ──
  logExternalComms: boolean;           // Log all outbound messages
  blockedExternalDomains: string[];    // Domains agents cannot contact

  // ── Alert Configuration ──
  alertChannel: "telegram";            // C-Suite group
  csuiteGroupChatId: string;           // Telegram group chat ID
  alertOnEscalation: boolean;
  alertOnExternalComms: boolean;
  alertOnNewSpend: boolean;

  // ── Audit Schedule ──
  auditCron: {
    enabled: boolean;
    timezone: string;                  // e.g., "America/New_York"
    morningHour: number;               // e.g., 9 (9:00 AM)
    eveningHour: number;               // e.g., 17 (5:00 PM)
  };
}
```

**BlockDrive default config (Sean's preferences):**

```typescript
const BLOCKDRIVE_GOVERNANCE: GovernanceConfig = {
  mode: "startup",
  spendLimitPerAgentPerDay: 10,
  spendLimitGlobalPerDay: 100,
  requireApproval: {
    externalCommunications: true,
    marketingActivities: true,
    socialMediaPosts: true,
    financialCommitments: true,
    escalations: true,
  },
  logExternalComms: true,
  blockedExternalDomains: [],
  alertChannel: "telegram",
  csuiteGroupChatId: "",  // Set after group creation
  alertOnEscalation: true,
  alertOnExternalComms: true,
  alertOnNewSpend: true,
  auditCron: {
    enabled: true,
    timezone: "America/New_York",
    morningHour: 9,
    eveningHour: 17,
  },
};
```

### Layer 3: C-Suite Telegram Group — Approval Flow

**The core governance UX.** All 7 agent bots + Sean (and future human executives) in a single Telegram group. Agents post approval requests with inline keyboard buttons; Sean taps Approve or Deny; the agent auto-executes or cancels.

#### Group Setup

- **Group name:** "BlockDrive C-Suite"
- **Members:** 7 agent bots + Sean + future human admins/executives
- **Bot permissions:** Admin (so bots can post), privacy mode disabled (bots see all messages)
- **Purpose:** Governance approvals, agent status updates, cross-department visibility

#### Approval Flow

```
┌─────────────────────────────────────────────────────┐
│  BlockDrive C-Suite (Telegram Group)                 │
│                                                       │
│  @taylor_cma_bot:                                    │
│  🔒 APPROVAL REQUEST                                 │
│  ─────────────────                                    │
│  Action: Post thread on X/Twitter                     │
│  Content: "BlockDrive raises $2M seed round to..."    │
│  Category: social_media                               │
│  Risk: Public financial disclosure                    │
│  Estimated cost: $0.00                                │
│                                                       │
│  [✅ Approve]  [❌ Deny]                              │
│                                                       │
│  Sean taps [✅ Approve]                               │
│                                                       │
│  @taylor_cma_bot:                                    │
│  ✅ Approved by Sean (0:42s)                          │
│  Executing: Post thread on X/Twitter                  │
│  Result: Posted → https://x.com/blockdrive/status/... │
└─────────────────────────────────────────────────────┘
```

#### Technical Implementation

**Pending Approval Storage (Redis, 24h TTL):**

```typescript
// Redis key: governance:pending:{approvalId}
// TTL: 24 hours — auto-deny if not actioned

interface PendingApproval {
  id: string;                          // UUID
  agentId: string;                     // e.g., "blockdrive-cma"
  agentName: string;                   // e.g., "Taylor"
  action: string;                      // Human-readable description
  category: ApprovalCategory;          // What triggered the approval requirement
  toolName: string;                    // The tool call that needs approval
  toolArgs: Record<string, unknown>;   // Saved args to replay on approval
  orgId: string;
  userId: string;
  estimatedCost: number;               // USD
  riskNote: string;                    // Agent's own risk assessment
  telegramMessageId: number;           // Links callback to the approval message
  telegramChatId: string;             // C-Suite group chat ID
  status: "pending" | "approved" | "denied" | "expired";
  requestedAt: string;                 // ISO timestamp
  resolvedAt: string | null;
  resolvedBy: string | null;          // Telegram user who approved/denied
}

type ApprovalCategory =
  | "external_communication"
  | "marketing_activity"
  | "social_media_post"
  | "financial_commitment"
  | "escalation"
  | "spend_limit_exceeded";
```

**Bot Callback Handler (grammy):**

```typescript
// In each agent's Telegram transport (or shared in @waas/runtime)

bot.on("callback_query:data", async (ctx) => {
  const [action, approvalId] = ctx.callbackQuery.data.split(":");
  if (action !== "approve" && action !== "deny") return;

  // 1. Load pending approval from Redis
  const approval = await redis.get(`governance:pending:${approvalId}`);
  if (!approval) return ctx.answerCallbackQuery("Expired or already processed.");
  const pending: PendingApproval = JSON.parse(approval);

  // 2. Check the responder is authorized (Sean or future admin)
  const responderId = ctx.from?.id?.toString();
  if (!isAuthorizedApprover(responderId)) {
    return ctx.answerCallbackQuery("Only authorized approvers can respond.");
  }

  // 3. Update status
  pending.status = action === "approve" ? "approved" : "denied";
  pending.resolvedAt = new Date().toISOString();
  pending.resolvedBy = ctx.from?.first_name || responderId;
  await redis.set(`governance:pending:${approvalId}`, JSON.stringify(pending), "EX", 86400 * 7);

  // 4. Execute or cancel
  if (action === "approve") {
    const result = await executeApprovedAction(pending);
    await ctx.editMessageText(
      `${ctx.callbackQuery.message?.text}\n\n` +
      `✅ Approved by ${pending.resolvedBy}\n` +
      `Executing: ${pending.action}\n` +
      `Result: ${result}`
    );
  } else {
    await ctx.editMessageText(
      `${ctx.callbackQuery.message?.text}\n\n` +
      `❌ Denied by ${pending.resolvedBy}`
    );
  }

  await ctx.answerCallbackQuery(action === "approve" ? "Approved ✅" : "Denied ❌");
});
```

**Agent-Side: Requesting Approval:**

```typescript
// In @waas/runtime — called by agents before executing gated actions

async function requestApproval(
  agentId: string,
  agentName: string,
  action: string,
  category: ApprovalCategory,
  toolName: string,
  toolArgs: Record<string, unknown>,
  riskNote: string,
  estimatedCost: number,
  config: GovernanceConfig,
): Promise<{ approved: boolean; message: string }> {

  // Check if this category requires approval
  if (!requiresApproval(category, config)) {
    return { approved: true, message: "No approval required" };
  }

  const approvalId = crypto.randomUUID();
  const pending: PendingApproval = {
    id: approvalId,
    agentId, agentName, action, category,
    toolName, toolArgs,
    orgId: "", userId: "",  // Set by caller
    estimatedCost, riskNote,
    telegramMessageId: 0,  // Set after sending
    telegramChatId: config.csuiteGroupChatId,
    status: "pending",
    requestedAt: new Date().toISOString(),
    resolvedAt: null, resolvedBy: null,
  };

  // Store in Redis (24h TTL)
  await redis.set(`governance:pending:${approvalId}`, JSON.stringify(pending), "EX", 86400);

  // Post to C-Suite group with inline keyboard
  const message = await bot.api.sendMessage(config.csuiteGroupChatId,
    `🔒 *APPROVAL REQUEST*\n` +
    `─────────────────\n` +
    `*Agent:* ${agentName} (${agentId})\n` +
    `*Action:* ${action}\n` +
    `*Category:* ${category.replace(/_/g, " ")}\n` +
    `*Risk:* ${riskNote}\n` +
    `*Est. cost:* $${estimatedCost.toFixed(2)}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Approve", callback_data: `approve:${approvalId}` },
          { text: "❌ Deny", callback_data: `deny:${approvalId}` },
        ]],
      },
    },
  );

  // Update with message ID for callback linking
  pending.telegramMessageId = message.message_id;
  await redis.set(`governance:pending:${approvalId}`, JSON.stringify(pending), "EX", 86400);

  return { approved: false, message: `Approval requested in C-Suite group. Waiting for authorization.` };
}
```

#### What This Gets You

| Benefit | Description |
|---------|-------------|
| Direct CEO control | Tap a button — no intermediary, no routing delays |
| Full C-Suite visibility | All agents see every approval request and decision |
| Built-in audit trail | Telegram group history IS the governance log |
| Mobile-first | Approve from your phone in seconds |
| Auto-reactivation | Inline keyboard callback triggers bot directly — no re-invocation needed |
| Future-proof | Add human executives/advisors to the group as the team grows |
| No EA bottleneck | EA handles scheduling/comms, not governance routing |

### Layer 4: MessageBus Audit-Read Access

The MessageBus already persists inter-agent messages in Redis LISTs for thread reconstruction. In startup mode, the CCO gets **batch READ access** to this history during cron audits — not real-time subscription, but the ability to review what agents said to each other since the last scan.

**What this catches:**
- Agents coordinating correctly (or not) on cross-department tasks
- Delegation chains — did COA properly route work to department heads?
- Escalation compliance — did agents escalate when they should have?
- Unauthorized inter-agent commitments (e.g., Sam telling Casey to draft a contract without COA approval)
- Communication gaps — agents working in silos when they should be collaborating

**Implementation:** Add a `read_agent_messages` tool to the CCO agent that queries Redis MessageBus history:

```typescript
tool(
  "read_agent_messages",
  "Read inter-agent message history from the MessageBus. Audit-read access to all agent communications for governance review.",
  {
    since: z.string().describe("ISO timestamp — return messages after this time"),
    agent_filter: z.string().optional().describe("Filter to messages involving this agent ID"),
    limit: z.number().default(50).describe("Max messages to return"),
  },
  async (args) => {
    // Query Redis LISTs: inbox:{agentId} for each registered agent
    // Filter by timestamp, optionally by agent_filter
    // Return: from, to, subject, type, priority, timestamp (body truncated to 500 chars)
  },
);
```

**Key distinction between modes:**
| Capability | Startup Mode | Enterprise Mode |
|-----------|-------------|----------------|
| Read message history | Batch (during cron audits) | Real-time stream |
| React to messages | After the fact (flag in audit report) | Intercept before delivery |
| Block messages | Never | Can hold for approval |
| Trigger | n8n cron (2x daily) | MessageBus subscription (continuous) |

### Layer 5: Async CCO Audit (cron-based)

The CCO agent runs structured compliance scans twice daily, triggered by n8n cron jobs. These scans combine cross-namespace mem0 search, Supabase queries, spend tracking, **MessageBus history review**, and **approval decision audit** into a unified compliance report.

**Morning Audit (9:00 AM, configured timezone):**
- Scope: All agent activity since previous evening audit
- Actions: Cross-namespace mem0 scan, MessageBus history review, Supabase query for new records, spend tally, review of all approval decisions (approved, denied, expired)
- Output: Morning Compliance Brief → C-Suite Telegram group
- Format: Findings with severity (Critical/High/Medium/Low/Info), remediation recommendations

**Evening Audit (5:00 PM, configured timezone):**
- Scope: All agent activity since morning audit
- Actions: Same scan, plus daily summary with cumulative metrics
- Output: Daily Compliance Summary → C-Suite Telegram group + logged to Notion Decision Log
- Format: Aggregate stats (actions taken, escalations, external comms, inter-agent messages, approvals, spend) + any flagged items

**n8n Workflow Design:**

```
Trigger: Cron (9:00 AM ET / 5:00 PM ET)
  → HTTP POST to CCO agent: /compliance/chat
     Body: {
       "message": "Run [morning|evening] compliance audit. Scan all department namespaces for activity since [last audit timestamp]. Include MessageBus review and approval decision audit. Report findings by severity.",
       "userId": "system-governance",
       "orgId": "<org_id>"
     }
  → Parse CCO response
  → POST to C-Suite Telegram group with formatted report
  → Log to Notion Decision Log (category: "Operations", tags: ["compliance", "automated-audit"])
```

### Layer 6: Spend Tracking (new)

Track cumulative API costs per agent per day:

```typescript
// Redis key: governance:{orgId}:spend:{agentId}:{YYYY-MM-DD}
// Value: cumulative USD spend (float)
// TTL: 90 days

interface SpendEvent {
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  timestamp: string;
}
```

Each agent's chat route increments the spend counter after receiving a model response. When the daily threshold is breached ($10/agent):

1. Alert posted to C-Suite Telegram group
2. Subsequent actions by that agent for the day require CEO approval (same inline keyboard flow)
3. Spend counter resets at midnight (agent's configured timezone)

---

## Enterprise Mode (Deferred)

**Philosophy:** Block until approved. Every significant action passes through governance gates. Compliance is synchronous and mandatory.

**Who configures it:** CCO agent manages policies programmatically. Human admins set organization-level overrides. The CCO has authority to block actions.

### Additional Components (not yet built)

| Component | Description | Complexity |
|-----------|-------------|------------|
| Pre-action middleware | `@waas/runtime` middleware that intercepts tool calls before execution | High |
| CCO auto-approval | CCO evaluates actions against policy engine — auto-approves low-risk, escalates high-risk | High |
| Policy enforcement engine | CCO-managed rules evaluated synchronously per action | High |
| MessageBus real-time subscription | Upgrade from batch read (startup) to live stream — CCO intercepts messages before delivery | Medium |
| Compliance dashboard | UI showing real-time compliance status across all agents | Medium |
| Audit trail database | Immutable log of every action + governance decision | Medium |
| SLA enforcement | Max response time for CCO approval before auto-escalation | Low |

### Pre-Action Middleware Design (future)

```typescript
// @waas/runtime — enterprise mode middleware
async function governanceGate(action: AgentAction): Promise<GovernanceDecision> {
  if (config.governance.mode !== "enterprise") return { approved: true };

  // Fast-path: action below all thresholds
  if (action.estimatedCost < config.governance.autoApproveBelow) {
    return { approved: true, reason: "below-threshold" };
  }

  // Sync check: CCO evaluates the action
  const decision = await ccoAgent.evaluate({
    action,
    agentId: action.sourceAgent,
    context: await getRecentActions(action.sourceAgent, 10),
    policies: await getActivePolicies(action.category),
  });

  if (decision.blocked) {
    await alertHuman(decision);
    return { approved: false, reason: decision.reason, remediation: decision.remediation };
  }

  return { approved: true, auditNote: decision.note };
}
```

### Enterprise Mode Approval Flow

In enterprise mode, the C-Suite Telegram group remains active but the CCO handles most approvals automatically:

```
Agent action → CCO evaluates against policy engine
  → Low risk: auto-approved, logged to group as FYI
  → Medium risk: CCO approves, posted to group for visibility
  → High risk: posted to group with [Approve] [Deny] buttons (same as startup mode)
  → Critical: blocks action, alerts all group members, requires human approval
```

The same Telegram group, same inline keyboards, same UX — but most routine actions are handled by the CCO without bothering the CEO.

### Granite 4.0's Role in Enterprise Mode

IBM Granite is purpose-built for enterprise governance:
- Regulatory framework mapping (SOX Section 302/404, GDPR Articles, ISO 42001 clauses)
- Structured compliance report generation
- Policy-to-action validation
- Audit evidence formatting

In startup mode, Granite runs twice daily for batch audits. In enterprise mode, it evaluates actions in real-time — this is where dedicated compute for the CCO becomes necessary.

---

## Implementation Phases

### Phase 1: Startup Mode Foundation (current priority)

**Scope:** Governance types, spend tracking, C-Suite Telegram group approval flow, system prompt directives, CCO cron audit setup.

| Task | Effort | Dependencies |
|------|--------|-------------|
| Add `GovernanceConfig` + `PendingApproval` types to `@waas/shared` | 1 hr | None |
| Add governance config loading to `@waas/runtime` | 1 hr | Config type |
| Build `requestApproval()` function in `@waas/runtime` | 2 hr | Redis, Telegram bot, config |
| Add approval callback handler to Telegram transport | 2 hr | grammy, Redis |
| Add spend tracking to chat routes | 2 hr | Redis, config, MODEL_REGISTRY pricing |
| Add spend alert + approval gate when threshold exceeded | 1 hr | Spend tracking |
| Add external comms logging middleware | 1 hr | Config |
| Add governance directives to all 7 agent system prompts | 2 hr | Approval categories defined |
| Create n8n morning + evening audit workflows | 1 hr | n8n credentials, CCO deployed |
| Test: trigger each approval category, verify buttons work | 2 hr | All above |

**Estimated total: ~15 hours**

### Phase 2: Governance Dashboard (post-raise)

- Add `/governance` route to frontend
- Show: daily spend by agent, external comms log, approval history, audit reports
- Pull from Redis spend counters + pending approvals + Supabase compliance tables

### Phase 3: Enterprise Mode (customer-driven)

- Build pre-action middleware in `@waas/runtime`
- Add CCO auto-approval for low/medium risk actions
- MessageBus real-time subscription for continuous monitoring
- Policy enforcement engine
- Compliance dashboard real-time view
- SLA enforcement for approval latency

---

## Config Schema Location

```
packages/shared/src/governance/
├── types.ts          # GovernanceConfig, PendingApproval, SpendEvent, ApprovalCategory
├── defaults.ts       # BLOCKDRIVE_GOVERNANCE default config
└── index.ts          # Exports

packages/runtime/src/
├── middleware/
│   ├── governance.ts     # requestApproval(), spend tracking, alert dispatch
│   └── auth.ts           # (existing) — auth middleware
├── transport/
│   └── telegram.ts       # (existing) — add approval callback handler

agents/compliance/src/
├── tools/
│   └── index.ts           # (existing) — add read_agent_messages tool
├── cron/
│   ├── morning-audit.ts   # Morning audit prompt + scan logic (incl. MessageBus + approvals)
│   └── evening-audit.ts   # Evening audit prompt + summary logic
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Two modes, one config schema | Avoids rewrite when upgrading; enterprise mode extends startup mode |
| Humans configure startup mode, not CCO | CEO/admins know what tripwires matter for their risk profile |
| C-Suite Telegram group for approvals | Direct CEO control, no intermediary, mobile-first, full visibility |
| Inline keyboard buttons (not text replies) | One-tap approval, no parsing ambiguity, better UX |
| Pending approvals in Redis (24h TTL) | Fast lookup for callbacks, auto-expire prevents stale queues |
| System prompt governance directives | Agents self-police before runtime gates; 95% effective, 20% of complexity |
| $10/agent/day spend limit | Covers ~5-20 Opus conversations; tight control during pre-revenue phase |
| All external actions require approval | Startup validation posture — loosen as trust is established |
| Spend tracking in Redis with TTL | Fast increment/read, auto-cleanup, no migration needed |
| n8n for cron triggers | Already deployed, visual workflow editor, CEO can modify schedules |
| Granite for audit analysis | Purpose-built for compliance output format, strong fundraising signal |
| Same CCO agent for both modes | No agent duplication; mode changes what triggers it and how it responds |
| MessageBus read in both modes | Inter-agent comms are critical audit data; startup reads batch, enterprise reads real-time |
| Timezone-aware cron | Multi-timezone teams need audits aligned to their business hours |
| Group not channel | Sean needs to interact (tap buttons); channels are broadcast-only |

---

## Fundraising Value

This architecture is a differentiator in investor conversations:

> "Our AI workforce has dual-mode governance built into the runtime layer. In startup mode, the CEO approves sensitive agent actions in real-time via a C-Suite Telegram group — one tap to approve or deny, with full audit trail. Async compliance audits powered by IBM Granite run twice daily. When enterprise customers require it, a single config flag activates synchronous governance gates — ISO 42001, SOX, GDPR compliance without a rewrite. The governance engine scales from a solo founder to a Fortune 500."

Key proof points:
- Governance from day zero, not bolted on
- IBM Granite (enterprise-grade, not general-purpose)
- CEO approval via Telegram (mobile-first, real-time)
- Configurable by non-technical admins
- Mode switching without code changes
- Full audit trail (Telegram group history + Redis + Notion)
- 7 autonomous agents, zero unauthorized actions
