Build an AgentCorp platform dashboard — a unified command center for managing an AI agent workforce. AgentCorp is a Workforce-as-a-Service (WaaS) platform. This is a React 18 + TypeScript app using Vite, shadcn/ui, Tailwind CSS, and Supabase for auth and data.

## App Overview

A single-page application where a CEO manages an AI agent workforce. The app has:
- A dashboard home page showing all 7 agent statuses, recent activity, and KPIs
- 7 department workspace pages (EA, Finance, Operations, Marketing, Compliance, Legal, Sales), each with an agent chat interface + department-specific data views
- Supabase email+password authentication with organization-based multi-tenancy

This is a NEW project built from scratch for the full 7-department platform. The Finance workspace (`/finance`) should include placeholder tabs for: Chat, Financial Model, Cap Table, Investors, Knowledge Base — the actual Finance components will be migrated in from an existing app after generation. Build the tab structure and workspace layout, but the Finance data tab contents can be simple placeholder text like "Financial Model — migrating from existing app".

## Tech Stack (REQUIRED)

- React 18 with TypeScript
- Vite build tool
- shadcn/ui components (Radix primitives)
- Tailwind CSS with CSS variables for theming (dark mode by default)
- Supabase JS client for auth and database
- Recharts for charts/visualizations
- React Router v6 for routing
- TanStack Query for server state
- Lucide React for icons
- react-markdown for rendering agent chat responses
- sonner for toast notifications

## Authentication

Use Supabase Auth with email+password sign-in.

Supabase config (use environment variables):
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY (anon key)

Auth flow:
1. `/auth` — Sign in page (email + password form, clean split-panel design)
2. After sign-in, check if user belongs to an organization via `user_roles` table
3. If no org, show onboarding page where they enter a company name (calls `supabase.rpc("create_organization", { _name })`)
4. Once org exists, show the main app layout

The auth context should provide: `user`, `session`, `isSignedIn`, `orgId`, `orgName`, `signOut()`.

## Layout

Use a collapsible sidebar navigation (shadcn Sidebar component with `collapsible="icon"`).

Sidebar sections:
- **Header:** "AgentCorp" logo/badge + "Workforce-as-a-Service" subtitle
- **Main nav:**
  - Dashboard (Home icon) — `/`
  - EA Alex (Bot icon) — `/ea`
  - Finance (DollarSign icon) — `/finance`
  - Operations (Settings icon) — `/operations`
  - Marketing (Megaphone icon) — `/marketing`
  - Compliance (Shield icon) — `/compliance`
  - Legal (Scale icon) — `/legal`
  - Sales (TrendingUp icon) — `/sales`
- **Footer:** Settings (Settings/Gear icon) — `/settings`, User email + sign out button

Each department nav item should show a small colored status dot (green = healthy, red = down, gray = unknown).

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/auth` | Auth | Sign in (public) |
| `/` | Dashboard | Agent network overview (all 7 agents) |
| `/ea` | EA Workspace | Executive Assistant chat + tasks + meeting notes |
| `/finance` | Finance Workspace | CFA chat + financial model + cap table + investors + knowledge |
| `/operations` | Operations Workspace | COA chat + tasks + processes + agent usage |
| `/marketing` | Marketing Workspace | CMA chat + content drafts + campaigns |
| `/compliance` | Compliance Workspace | CCO chat + policy register + risk assessments |
| `/legal` | Legal Workspace | Legal chat + reviews + IP portfolio |
| `/sales` | Sales Workspace | Sales chat + pipeline + call logs |
| `/settings` | Settings | User + org settings |

## Dashboard Page (`/`)

The main landing page. Shows:

### Agent Status Grid
A responsive grid of 7 agent cards. Each card shows:
- Agent name and title (e.g., "Alex — Executive Assistant")
- Status badge (online/offline) — fetched from `GET {agentUrl}/health`
- Uptime duration
- Service status indicators (Redis, Memory, Telegram) as small dots

Agent data:
| ID | Name | Title | Color |
|----|------|-------|-------|
| blockdrive-ea | Alex | Executive Assistant | blue |
| blockdrive-cfa | Morgan | Chief Financial Agent | emerald |
| blockdrive-coa | Jordan | Chief Operating Agent | amber |
| blockdrive-cma | Taylor | Chief Marketing Agent | purple |
| blockdrive-compliance | CCO | Chief Compliance Officer | red |
| blockdrive-legal | Casey | Legal Counsel | slate |
| blockdrive-sales | Sam | Head of Sales | orange |

Health endpoint URL pattern: Each agent is at a base URL (from env vars). Poll every 30 seconds.

### Quick Stats Row
4 summary cards:
- Total Agents Online (count of healthy agents / 7)
- Pipeline Value (sum of sales_pipeline.value where stage not in closed_won, closed_lost)
- Open Tasks (count of coa_tasks where status = 'pending' or 'in_progress')
- Active Campaigns (count of cma_campaigns where status = 'active')

### Recent Activity Feed
A scrollable list showing recent items across all departments:
- Latest agent messages (from agent_messages table)
- Recent tasks created/completed
- Recent content drafts
- Recent legal reviews

Show timestamp, agent name (with color dot), and brief description. Limit to 20 items.

### Org Hierarchy Visualization
A simple tree/org chart showing the reporting structure:
```
{currentUser.displayName} (CEO)
├── Alex (EA)
└── Jordan (COA)
    ├── Morgan (CFA)
    ├── Taylor (CMA)
    ├── CCO (Compliance)
    ├── Casey (Legal)
    └── Sam (Sales)
```
Use a clean card-based tree layout, not a complex library.

## Department Workspace Pages

Each department page follows the same layout pattern:

### Layout: Tabs-based workspace
- **Chat tab** (default) — Full agent chat interface
- **Data tabs** — Department-specific data views (tables, charts)

### Chat Interface (shared component)

The chat component is reused across all department pages. It connects to the agent's `/chat` endpoint via SSE streaming.

Features:
- Message list with user/assistant bubbles
- User messages: right-aligned, primary color
- Assistant messages: left-aligned, card background, rendered as Markdown (react-markdown)
- Auto-scroll to bottom on new messages
- Input bar at bottom: auto-resizing textarea, Enter to send, Shift+Enter for newline
- Streaming indicator: three bouncing dots while agent is responding
- Agent avatar with department color

Connection pattern:

IMPORTANT: There are TWO different API formats across the agent fleet:

**Type A agents (CFA + EA):** Legacy agents with `/api/chat` path and `messages` array body.
**Type B agents (COA, CMA, Compliance, Legal, Sales):** Runtime agents with `/chat` path and `message` string body.

```typescript
// Agent configuration — maps department to path prefix and API type
const AGENT_CONFIG: Record<string, { prefix: string; apiType: 'A' | 'B' }> = {
  finance:    { prefix: '',            apiType: 'A' }, // CFA at root
  ea:         { prefix: '/ea',         apiType: 'A' },
  operations: { prefix: '/coa',        apiType: 'B' },
  marketing:  { prefix: '/cma',        apiType: 'B' },
  compliance: { prefix: '/compliance', apiType: 'B' },
  legal:      { prefix: '/legal',      apiType: 'B' },
  sales:      { prefix: '/sales',      apiType: 'B' },
};

// Chat endpoint path differs by agent type
const chatPath = config.apiType === 'A' ? '/api/chat' : '/chat';
const url = `${VITE_AGENT_URL}${config.prefix}${chatPath}`;

// Request body differs by agent type
const body = config.apiType === 'A'
  ? {
      // Type A: messages array (OpenAI-style)
      messages: [...previousMessages, { role: "user", content: userMessage }],
      conversationId,
    }
  : {
      // Type B: single message string + optional history
      message: userMessage,
      organizationId: orgId,
      conversationId,
      history: previousMessages,
    };

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

// SSE stream parsing (same for both types)
const reader = response.body.getReader();
const decoder = new TextDecoder();
// Parse lines starting with "data: "
// Format: data: {"choices":[{"delta":{"content":"text chunk"}}]}
// End signal: data: [DONE]
```

Health checks also use the prefix: `GET ${VITE_AGENT_URL}${config.prefix}/health` (all agents use `/health`, not `/api/health`).

### Environment Variables for Agent URLs
```
VITE_AGENT_URL=https://cfo-agent-9glt5.ondigitalocean.app
```
All 7 agents share one base URL with path prefixes (defined in the AGENT_CONFIG above).

### Per-Department Data Tabs

#### Finance Workspace (`/finance`)
Tabs: Chat | Financial Model | Cap Table | Investors | Knowledge Base
- **Chat tab:** Same shared chat component, connected to CFA agent at `${VITE_AGENT_URL}/chat` (root path, no prefix).
- **Financial Model tab:** Placeholder content: "Financial Model — will be migrated from existing Finance app". Show an empty state card with a brief description.
- **Cap Table tab:** Placeholder content: "Cap Table — will be migrated from existing Finance app".
- **Investors tab:** Placeholder content: "Investor Portal — will be migrated from existing Finance app".
- **Knowledge Base tab:** Placeholder content: "Knowledge Base — will be migrated from existing Finance app".

Note: After Lovable generates the project, the actual Finance tab contents will be migrated from the existing `corp.blockdrive.co` app. Key assets to migrate: hooks (`useFinancialModel`, `useCapTable`, `useInvestorLinks`, `useModelSheet`), Finance page components, and Supabase query patterns. Same database, same auth — just component-level migration.

#### EA Workspace (`/ea`)
Tabs: Chat | Tasks | Meeting Notes | Communications
- **Tasks table:** columns: title, priority (color-coded badge), status (badge), assigned_to, due_date, tags. From `ea_tasks` table (filter by organization_id)
- **Meeting Notes table:** columns: title, date, attendees (avatar group), summary (truncated). Click to expand with action_items and key_decisions.
- **Communications table:** columns: type (badge), subject, recipients, status, created_at. From `ea_communications_log`.

#### Operations Workspace (`/operations`)
Tabs: Chat | Tasks | Processes | Agent Usage | Messages | Communications
- **Tasks table:** From `coa_tasks` — same pattern as EA tasks but with p0/p1/p2/p3 priority levels
- **Processes table:** From `coa_processes` — name, owner_agent_id, status (badge), metrics (expandable JSON)
- **Agent Usage:** From `agent_usage_events` — charts showing cost per agent over time (Recharts), tokens used, latency. Table with agent_id, model, tokens, cost, latency.
- **Messages table:** From `agent_messages` — sender_id, target_id, message (truncated), priority, status, response
- **Communications table:** From `coa_communications` — recipient, subject, body (truncated), type (badge), status, created_at

#### Marketing Workspace (`/marketing`)
Tabs: Chat | Content | Campaigns
- **Content Drafts table:** From `cma_content_drafts` — title, type (badge: blog/social/email/landing_page), status (badge with color), target_audience, seo_keywords (tag chips). Click to expand full content.
- **Campaigns table:** From `cma_campaigns` — name, status, channels (tag chips), dates, budget (formatted currency), metrics (expandable)

#### Compliance Workspace (`/compliance`)
Tabs: Chat | Policies | Risk Assessments | Governance Log
- **Policy Register table:** From `compliance_policy_register` — name, category, status, owner, review_date. Color-code status (active=green, under_review=amber, deprecated=red).
- **Risk Assessments table:** From `compliance_risk_assessments` — subject, risk_type (badge), likelihood x impact (risk matrix color: green/yellow/orange/red), mitigation, status.
- **Governance Log table:** From `compliance_governance_log` — action, affected_agents (avatar chips), decision, severity (badge with color)

#### Legal Workspace (`/legal`)
Tabs: Chat | Reviews | IP Portfolio
- **Legal Reviews table:** From `legal_reviews` — type (badge), subject, risk_level (color badge: critical=red, high=orange, medium=yellow, low=green), status, recommendations (expandable). Summary stats at top.
- **IP Portfolio table:** From `legal_ip_portfolio` — name, type (badge), status (badge), registration_number, filing_date, expiry_date

#### Sales Workspace (`/sales`)
Tabs: Chat | Pipeline | Call Logs
- **Pipeline table/board:** From `sales_pipeline`. Show as both:
  1. Kanban board view: columns for each stage (prospect -> qualified -> proposal -> negotiation -> closed_won/closed_lost). Cards show company, value, probability, expected_close.
  2. Table view: all columns with sorting.
  Toggle between views. Summary stats: total pipeline value, weighted value, deals by stage (horizontal bar).
- **Call Logs table:** From `sales_call_logs` — type (badge), company (from pipeline join), summary (truncated), sentiment (emoji or color), next_steps, action_items (expandable)

## UX States

- **Loading:** Use skeleton loaders for tables and cards while data is fetching. Show a subtle spinner in the sidebar status dot while health is being polled.
- **Empty states:** When a data tab has no rows, show a centered card with a department-colored icon, a brief message (e.g., "No tasks yet — chat with Alex to create one"), and a button linking to the Chat tab.
- **Error states:** Show toast notifications (sonner) for transient errors. Show inline error cards for data fetch failures with a retry button. Redirect to `/auth` on 401 responses.
- **Responsive:** Sidebar collapses to icon mode on tablet (< 1024px), hides behind hamburger menu on mobile (< 768px). Tables scroll horizontally on small screens. Chat interface is full-width on mobile.
- **Sign up:** The `/auth` page should have both sign-in and sign-up forms (toggle between them with a tab or link), not a separate `/sign-up` route.

## Settings Page (`/settings`)

- **Profile section:** Display name, avatar (from `profiles` table), email (read-only from auth)
- **Organization section:** Org name (editable), member list from `user_roles` (name, role badge, joined date)
- **Integrations section:** Show connected services (Supabase, agent fleet status) as simple status cards

## Design Direction

- Dark mode by default (dark navy/slate background)
- Clean, minimal, data-dense — this is an operations dashboard, not a marketing site
- Use consistent color coding for agent departments throughout the app
- Cards with subtle borders, not heavy shadows
- Status badges using shadcn Badge component with color variants
- Tables using shadcn Table with hover rows
- Subtle animations on page transitions and status updates
- Monospace font for data/numbers, sans-serif for text (Inter + JetBrains Mono)

## Supabase Tables

The app reads from these Supabase tables (all have RLS policies scoped by organization):

### Core tables (organization_id column):
- organizations (id, name)
- profiles (id, user_id, display_name, avatar_url, organization_id)
- user_roles (id, user_id, organization_id, role)
- conversations (id, organization_id, title, created_by, created_at)
- messages (id, conversation_id, role, content, created_at)

Note: conversations/messages tables are used by the backend for conversation persistence. The frontend chat component should save/load conversation history via these tables for cross-session continuity.

### Finance tables (organization_id column):
- financial_model (id, organization_id, scenario, category, subcategory, month, year, value)
- cap_table_entries (id, organization_id, shareholder_name, share_class, shares, price_per_share, investment_amount, ownership_pct)
- knowledge_base (id, organization_id, title, content, source, category, quality_score)
- documents (id, organization_id, name, file_path, content_type, size, extracted_text)
- investor_links (id, organization_id, name, slug, data_room_enabled, scenarios)
- link_views (id, link_id, viewer_email, viewed_at, ip_address)
- model_sheets (id, organization_id, sheet_id, sheet_url, status)

### EA tables (organization_id column):
- ea_tasks (id, organization_id, title, description, priority, status, due_date, assigned_to, tags)
- ea_meeting_notes (id, organization_id, title, date, attendees, summary, action_items, key_decisions)
- ea_communications_log (id, organization_id, type, subject, body, recipients, status, created_at)

### Department tables (org_id column — note: different column name):
- coa_tasks (id, org_id, title, description, priority, status, assigned_to, due_date, tags)
- coa_processes (id, org_id, name, owner_agent_id, status, metrics)
- agent_usage_events (id, org_id, agent_id, model, input_tokens, output_tokens, cost_usd, latency_ms, tool_calls)
- coa_communications (id, org_id, recipient, subject, body, type, status)
- agent_messages (id, org_id, sender_id, target_id, message, priority, status, response)
- cma_content_drafts (id, org_id, title, type, content, tone, target_audience, seo_keywords, status, published_url, created_at)
- cma_campaigns (id, org_id, name, status, channels, start_date, end_date, budget, metrics)
- compliance_policy_register (id, org_id, name, description, category, status, owner, review_date, created_at)
- compliance_risk_assessments (id, org_id, subject, description, risk_type, likelihood, impact, mitigation, status, created_at)
  Note: likelihood is an enum ('very_low','low','medium','high','very_high'), impact is an enum ('minimal','minor','moderate','major','severe'). Map to risk matrix colors using a severity function, not numeric multiplication.
- compliance_governance_log (id, org_id, action, affected_agents, decision, severity)
- legal_reviews (id, org_id, type, subject, summary, risk_level, key_issues, recommendations, status)
- legal_ip_portfolio (id, org_id, name, type, status, registration_number, filing_date, expiry_date)
- sales_pipeline (id, org_id, company, contact, stage, value, probability, expected_close, source, tags, notes, created_at)
- sales_call_logs (id, org_id, pipeline_id, type, summary, action_items, sentiment, next_steps)

IMPORTANT: EA tables use `organization_id`, department tables use `org_id`. Handle both in queries.
