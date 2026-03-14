import { useState } from "react";
import {
  BookOpen,
  Brain,
  BarChart3,
  Users,
  MessageSquare,
  FileText,
  Cpu,
  Database,
  Shield,
  Globe,
  Zap,
  GitBranch,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Section definitions ────────────────────────────────────────────────────

interface DocSection {
  id: string;
  title: string;
  icon: React.ElementType;
  content: React.ReactNode;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground mt-5 mb-2">{children}</h3>;
}

function Param({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1">
      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{name}</code>
      <span className="text-xs text-muted-foreground">{children}</span>
    </div>
  );
}

function ModelRow({ name, provider, role, badge }: { name: string; provider: string; role: string; badge?: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          {badge && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{badge}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{provider}</p>
      </div>
      <p className="text-xs text-muted-foreground text-right max-w-[200px]">{role}</p>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="text-xs bg-muted px-1 rounded">{children}</code>;
}

const METHOD_STYLES = {
  GET: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  POST: "bg-green-500/10 text-green-600 border-green-500/20",
} as const;

function EndpointCard({ method, path, desc }: { method: "GET" | "POST"; path: string; desc: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 mb-1">
        <Badge className={cn("text-[10px]", METHOD_STYLES[method])}>{method}</Badge>
        <code className="text-xs font-mono">{path}</code>
      </div>
      <p className="text-xs">{desc}</p>
    </div>
  );
}

function ToolRow({ name, count, desc }: { name: string; count: number; desc: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex items-center gap-2 min-w-[160px]">
        <span className="text-sm">{name}</span>
        <Badge variant="outline" className="text-[10px] px-1 py-0">{count}</Badge>
      </div>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </div>
  );
}

const sections: DocSection[] = [
  {
    id: "overview",
    title: "Overview",
    icon: BookOpen,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          BlockDrive CFO is an AI-powered financial intelligence platform for seed-stage startups.
          It combines natural language conversation with structured financial tools to help founders
          manage burn rate, runway, cap tables, investor relations, and strategic planning.
        </p>
        <p>
          The platform is built on a <strong className="text-foreground">multi-model architecture</strong> where
          Claude Opus 4.6 serves as the primary reasoning engine, Kimi K2.5 generates structured financial data,
          and Gemini handles document processing. All organizational knowledge is persisted
          in <strong className="text-foreground">Mem0</strong> with graph relationships, enabling the agent to
          build compounding institutional memory over time.
        </p>
        <SectionHeading>Version</SectionHeading>
        <div className="flex items-center gap-2">
          <Badge>v1.0.0</Badge>
          <span className="text-xs">Production release with full multi-model orchestration and persistent memory</span>
        </div>
        <SectionHeading>Architecture</SectionHeading>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-foreground">Frontend</p>
            <p className="text-xs">React 18 + TypeScript + Vite</p>
            <p className="text-xs">Deployed to Vercel</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-foreground">Agent Server</p>
            <p className="text-xs">Express + Claude Agent SDK</p>
            <p className="text-xs">Deployed via Docker</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-foreground">Database</p>
            <p className="text-xs">Supabase (PostgreSQL)</p>
            <p className="text-xs">RLS + Row-level security</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-foreground">Memory</p>
            <p className="text-xs">Mem0 Platform</p>
            <p className="text-xs">Graph + Vector + Categories</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "models",
    title: "Multi-Model Intelligence",
    icon: Cpu,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          The agent orchestrates multiple AI models, each specialized for different tasks.
          Claude handles reasoning and tool orchestration via the Anthropic API directly.
          All other models route through <strong className="text-foreground">OpenRouter</strong> via
          a single API key.
        </p>
        <SectionHeading>Models</SectionHeading>
        <div className="divide-y">
          <ModelRow name="Claude Opus 4.6" provider="Anthropic (direct)" role="Primary reasoning, tool orchestration, streaming chat" badge="brain" />
          <ModelRow name="Kimi K2.5" provider="OpenRouter (Moonshot)" role="Structured data: financial rows, cap table, SQL" badge="builder" />
          <ModelRow name="Gemini 3 Flash" provider="OpenRouter (Google)" role="Document vision, embeddings, RAG" badge="docs" />
          <ModelRow name="Gemini 2.5 Flash Lite" provider="OpenRouter (Google)" role="Lightweight classification and cheap tasks" />
          <ModelRow name="Sonar Pro" provider="OpenRouter (Perplexity)" role="Web research and intelligence gathering" />
          <ModelRow name="Grok 4" provider="OpenRouter (xAI)" role="Advanced multi-step reasoning" />
        </div>
        <SectionHeading>How It Works</SectionHeading>
        <p>
          When a user asks to build a financial model, <strong className="text-foreground">Opus</strong> reasons
          about the approach and creates a high-level plan. <strong className="text-foreground">K2.5</strong> then
          generates the structured JSON rows (revenue line items, expense categories, formulas).
          The result is written to Supabase and the knowledge is stored in Mem0 with attribution
          to the model that produced it.
        </p>
        <SectionHeading>Model Router</SectionHeading>
        <p>
          <Code>agent/src/lib/model-router.ts</Code> provides
          a unified interface. Use aliases (<Code>kimi</Code>,{" "}
          <Code>gemini</Code>,{" "}
          <Code>sonar</Code>) or full OpenRouter model IDs.
        </p>
      </div>
    ),
  },
  {
    id: "memory",
    title: "Memory System (Mem0)",
    icon: Brain,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          Mem0 is the sole knowledge store for the platform. Every meaningful interaction
          is extracted, categorized, and stored with graph relationships. The agent gets
          smarter with every conversation.
        </p>
        <SectionHeading>Custom Categories</SectionHeading>
        <div className="space-y-1">
          <Param name="financial_metrics">Burn rate, runway, MRR, ARR, revenue, margins, cash position, unit economics</Param>
          <Param name="fundraising">Investor names, round details, valuations, term sheets, cap table changes</Param>
          <Param name="company_operations">Headcount, hiring plans, vendor costs, OpEx decisions, team structure</Param>
          <Param name="strategic_decisions">Board decisions, pivots, product direction, competitive landscape</Param>
          <Param name="investor_relations">Data room activity, investor feedback, meeting notes, LP updates</Param>
          <Param name="financial_model">Scenario assumptions, forecast parameters, growth rates, formulas</Param>
        </div>
        <SectionHeading>Graph Memory</SectionHeading>
        <p>
          Relationship-heavy categories (fundraising, investor_relations, company_operations) automatically
          enable graph memory. Mem0 extracts entity relationships like:
        </p>
        <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs space-y-1">
          <p>company --[raised]--&gt; seed_round</p>
          <p>seed_round --[led_by]--&gt; sequoia</p>
          <p>seed_round --[has]--&gt; pre_money_valuation</p>
          <p>company --[has]--&gt; burn_rate</p>
        </div>
        <SectionHeading>Multi-Model Attribution</SectionHeading>
        <p>
          Every memory is tagged with the <Code>agent_id</Code> of
          the model that produced it: <Badge variant="outline" className="text-[10px]">opus-brain</Badge>{" "}
          <Badge variant="outline" className="text-[10px]">k2-builder</Badge>{" "}
          <Badge variant="outline" className="text-[10px]">gemini-docs</Badge>
        </p>
        <SectionHeading>System Prompt Enrichment</SectionHeading>
        <p>
          Before each query, the agent searches Mem0 for relevant organizational memories and session
          context. These are injected into the system prompt so the agent always has the right
          context without the user needing to repeat themselves.
        </p>
        <SectionHeading>Feedback Loop</SectionHeading>
        <p>
          The <Code>rate_knowledge_quality</Code> tool lets
          the agent (or user) rate memories as POSITIVE, NEGATIVE, or VERY_NEGATIVE. This self-healing
          mechanism ensures memory quality improves over time.
        </p>
      </div>
    ),
  },
  {
    id: "tools",
    title: "Agent Tools (23)",
    icon: Zap,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          The agent has 23 MCP tools across 8 domains. All tools are org-scoped via closure,
          ensuring multi-tenant data isolation.
        </p>
        <SectionHeading>Tool Inventory</SectionHeading>
        <div className="divide-y">
          <ToolRow name="Financial Model" count={3} desc="get, upsert (with K2.5 plan generation + memory), delete" />
          <ToolRow name="Derived Metrics" count={1} desc="Compute burn, runway, MRR, gross margin from financial data" />
          <ToolRow name="Cap Table" count={3} desc="get, upsert (with graph memory for fundraising), delete" />
          <ToolRow name="Knowledge Base" count={5} desc="search, add, update, delete, rate_quality" />
          <ToolRow name="Investor Links" count={4} desc="CRUD with enable_data_room and view tracking" />
          <ToolRow name="Documents" count={2} desc="Upload with Gemini vision processing + memory attribution" />
          <ToolRow name="Document RAG" count={1} desc="query_documents via Gemini + pgvector" />
          <ToolRow name="Analytics" count={1} desc="Natural language to SQL to chart suggestion" />
          <ToolRow name="Web Fetch" count={1} desc="Fetch and parse web content" />
          <ToolRow name="Headless Browser" count={1} desc="Full browser automation for complex web tasks" />
          <ToolRow name="Excel Export" count={1} desc="Generate downloadable Excel files from financial data" />
        </div>
        <SectionHeading>Knowledge Base Tools (Deep Dive)</SectionHeading>
        <div className="space-y-1">
          <Param name="search_knowledge_base">Semantic search with rerank + keyword expansion. Filter by category, agent, session.</Param>
          <Param name="add_knowledge_entry">Store with category, timestamp, agent_id, graph auto-enabled for relationships.</Param>
          <Param name="update_knowledge_entry">Evolve existing memories as facts change (not just append).</Param>
          <Param name="delete_knowledge_entry">Remove outdated or incorrect memories.</Param>
          <Param name="rate_knowledge_quality">POSITIVE/NEGATIVE/VERY_NEGATIVE feedback for self-healing.</Param>
        </div>
      </div>
    ),
  },
  {
    id: "financial",
    title: "Financial Engine",
    icon: BarChart3,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          The financial engine is powered by two Supabase tables and client-side metric computation.
          The agent can build, modify, and analyze financial models through natural language.
        </p>
        <SectionHeading>Data Model</SectionHeading>
        <div className="space-y-1">
          <Param name="financial_model">Line items with category, subcategory, month, amount, formula, scenario (base/best/worst)</Param>
          <Param name="cap_table_entries">Stakeholder info, shares, ownership %, round details, share class</Param>
        </div>
        <SectionHeading>Derived Metrics</SectionHeading>
        <p>Computed client-side in <Code>useFinancialModel</Code> via useMemo:</p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded-lg border p-2">
            <p className="text-xs font-medium text-foreground">Burn Rate</p>
            <p className="text-[11px]">Monthly cash consumption (COGS + OpEx)</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-xs font-medium text-foreground">Runway</p>
            <p className="text-[11px]">Months until cash reaches zero</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-xs font-medium text-foreground">MRR</p>
            <p className="text-[11px]">Monthly recurring revenue</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-xs font-medium text-foreground">Gross Margin</p>
            <p className="text-[11px]">(Revenue - COGS) / Revenue</p>
          </div>
        </div>
        <SectionHeading>Scenarios</SectionHeading>
        <p>
          Three scenarios (base, best, worst) share the same table with a scenario column filter.
          Toggling scenarios re-filters the same query for instant chart updates. The dashboard
          renders P&L, burn/runway, cap table, and OpEx breakdown charts via Recharts.
        </p>
        <SectionHeading>K2.5 Plan Generation</SectionHeading>
        <p>
          When upserting financial data, the agent can delegate to Kimi K2.5 to generate structured
          line items from a high-level plan. The result is validated and written to Supabase, then
          stored in Mem0 with the <Code>k2-builder</Code> agent_id.
        </p>
      </div>
    ),
  },
  {
    id: "dataroom",
    title: "Investor Data Room",
    icon: Users,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          DocSend-style investor portal with shareable links, engagement analytics, and an AI Q&A
          interface powered by the investor agent.
        </p>
        <SectionHeading>Features</SectionHeading>
        <div className="space-y-1">
          <Param name="Shareable links">Unique slugs with optional password protection and email capture</Param>
          <Param name="Expiry dates">Links auto-expire after a configurable date</Param>
          <Param name="View tracking">Every access logged in dataroom_interactions table</Param>
          <Param name="Realtime alerts">Supabase Realtime notifies when an investor views the data room</Param>
          <Param name="Document access">Link-level control via allowedDocumentIds</Param>
          <Param name="AI Q&A">Investors can ask questions answered by the investor agent</Param>
        </div>
        <SectionHeading>Public Routes</SectionHeading>
        <div className="space-y-1">
          <Param name="GET /dataroom/:slug/validate">Check if link is valid, check password/email requirements</Param>
          <Param name="GET /dataroom/:slug/financials">Fetch financial data for the linked org</Param>
          <Param name="GET /dataroom/:slug/cap-table">Fetch cap table for the linked org</Param>
          <Param name="POST /dataroom/:slug/ask">Ask a question to the investor agent</Param>
          <Param name="POST /dataroom/:slug/view">Track a view event</Param>
        </div>
      </div>
    ),
  },
  {
    id: "chat",
    title: "Chat & Streaming",
    icon: MessageSquare,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          The chat interface provides streaming AI conversations with full tool-use rendering.
          The agent can execute tools mid-conversation and display results inline.
        </p>
        <SectionHeading>Flow</SectionHeading>
        <div className="space-y-1 text-xs">
          <p>1. User sends message to <Code>POST /api/chat</Code></p>
          <p>2. Auth middleware verifies Supabase JWT + org membership</p>
          <p>3. System prompt enriched with relevant Mem0 memories + session context</p>
          <p>4. Claude Agent SDK <Code>query()</Code> with <Code>includePartialMessages: true</Code></p>
          <p>5. Stream adapter transforms SDK events to OpenAI SSE format</p>
          <p>6. Frontend renders tokens as they arrive</p>
          <p>7. On completion, knowledge extractor fires (fire-and-forget) to store learnings in Mem0</p>
        </div>
        <SectionHeading>Edge Function Fallback</SectionHeading>
        <p>
          If <Code>VITE_AGENT_URL</Code> is not set or the agent server
          is unreachable, Chat.tsx falls back to Supabase Edge Functions for basic chat capability.
        </p>
      </div>
    ),
  },
  {
    id: "knowledge",
    title: "Knowledge & Documents",
    icon: FileText,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          The Knowledge page provides document uploads with AI extraction and a knowledge graph
          visualization powered by Mem0's native graph API.
        </p>
        <SectionHeading>Document Pipeline</SectionHeading>
        <div className="space-y-1 text-xs">
          <p>1. User uploads a document (PDF, image, spreadsheet)</p>
          <p>2. File stored in Supabase Storage</p>
          <p>3. Gemini 3 Flash processes the document (vision for images/PDFs)</p>
          <p>4. Extracted content stored in Mem0 with <Code>gemini-docs</Code> attribution</p>
          <p>5. Document indexed for RAG queries via pgvector embeddings</p>
        </div>
        <SectionHeading>Knowledge Graph</SectionHeading>
        <p>
          The graph visualization pulls from Mem0's <Code>output_format: v1.1</Code> API,
          which returns memories, entities, and relationships natively. No more computed keyword-overlap graphs.
        </p>
        <SectionHeading>Document RAG</SectionHeading>
        <p>
          The <Code>query_documents</Code> tool uses Gemini for
          grounded generation combined with pgvector similarity search across indexed documents.
        </p>
      </div>
    ),
  },
  {
    id: "api",
    title: "API Reference",
    icon: Globe,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <SectionHeading>Endpoints</SectionHeading>
        <div className="space-y-3">
          <EndpointCard method="POST" path="/api/chat" desc="Streaming AI chat. Requires Bearer token + organizationId in body. Returns SSE stream." />
          <EndpointCard method="GET" path="/api/knowledge/graph" desc="Knowledge graph data via Mem0 graph API. Returns entities, relations, stats." />
          <EndpointCard method="POST" path="/api/webhooks/mem0" desc="Mem0 memory event webhooks: memory_add, memory_update, memory_delete." />
          <EndpointCard method="GET" path="/health" desc="Health check. Returns status and timestamp." />
        </div>
        <SectionHeading>Data Room Endpoints</SectionHeading>
        <div className="space-y-2">
          <EndpointCard method="GET" path="/dataroom/:slug/validate" desc="Validate link, check auth requirements (password/email)." />
          <EndpointCard method="GET" path="/dataroom/:slug/financials" desc="Financial model data for the linked organization." />
          <EndpointCard method="POST" path="/dataroom/:slug/ask" desc="Ask a question to the investor agent about the company." />
        </div>
      </div>
    ),
  },
  {
    id: "security",
    title: "Security",
    icon: Shield,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          Security is enforced at every layer: database, API, and agent.
        </p>
        <SectionHeading>Row-Level Security</SectionHeading>
        <p>
          All Supabase tables use RLS policies via <Code>is_org_member()</Code> and{" "}
          <Code>has_role()</Code> PostgreSQL functions. Users can only
          access data for organizations they belong to.
        </p>
        <SectionHeading>Agent Auth</SectionHeading>
        <p>
          The agent server validates Supabase JWTs and verifies org membership before processing
          any request. The service role key bypasses RLS for agent operations only.
        </p>
        <SectionHeading>SQL Validator</SectionHeading>
        <div className="space-y-1">
          <Param name="SELECT-only">Only SELECT queries allowed, no mutations</Param>
          <Param name="UUID validation">All org_id parameters validated as UUID format</Param>
          <Param name="Comment stripping">SQL comments removed to prevent injection</Param>
          <Param name="Table allowlist">Only permitted tables can be queried</Param>
          <Param name="Schema blocking">No access to information_schema or pg_catalog</Param>
        </div>
        <SectionHeading>Data Room</SectionHeading>
        <div className="space-y-1">
          <Param name="Rate limiting">Prevent abuse of public endpoints</Param>
          <Param name="Scenario validation">Only base/best/worst scenarios accepted</Param>
          <Param name="No org ID leaks">Public endpoints never expose internal org IDs</Param>
          <Param name="Document ACL">Link-level document access via allowedDocumentIds</Param>
        </div>
      </div>
    ),
  },
  {
    id: "env",
    title: "Environment & Config",
    icon: Database,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <SectionHeading>Frontend (.env)</SectionHeading>
        <div className="space-y-1">
          <Param name="VITE_SUPABASE_URL">Supabase project URL</Param>
          <Param name="VITE_SUPABASE_PUBLISHABLE_KEY">Supabase anon/public key</Param>
          <Param name="VITE_AGENT_URL">Agent server URL (falls back to edge functions if not set)</Param>
        </div>
        <SectionHeading>Agent Server (agent/.env)</SectionHeading>
        <div className="space-y-1">
          <Param name="ANTHROPIC_API_KEY">Claude API key (direct, not via OpenRouter). Required.</Param>
          <Param name="SUPABASE_URL">Supabase project URL. Required.</Param>
          <Param name="SUPABASE_SERVICE_ROLE_KEY">Supabase service role key (bypasses RLS). Required.</Param>
          <Param name="OPENROUTER_API_KEY">Single key for all non-Claude models. Required.</Param>
          <Param name="MEM0_API_KEY">Mem0 platform API key. Required.</Param>
          <Param name="PORT">Server port (default: 3001). Optional.</Param>
          <Param name="CORS_ORIGINS">Allowed origins, comma-separated. Optional.</Param>
        </div>
        <SectionHeading>Startup Behavior</SectionHeading>
        <p>
          On server start, <Code>mem0-setup.ts</Code> auto-discovers
          the Mem0 org/project from the API key, verifies custom categories and graph memory are
          configured, and updates if needed. This is idempotent and safe to run on every restart.
        </p>
      </div>
    ),
  },
  {
    id: "deployment",
    title: "Deployment",
    icon: GitBranch,
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <SectionHeading>Frontend (Vercel)</SectionHeading>
        <p>
          Auto-builds from <Code>npm run build</Code>.
          Aliased to <Code>cfo.blockdrive.co</Code>.
          Environment variables set in Vercel dashboard.
        </p>
        <SectionHeading>Agent Server (Docker)</SectionHeading>
        <p>
          Multi-stage Dockerfile in <Code>agent/Dockerfile</Code>.
          Stage 1 compiles TypeScript, stage 2 runs the production build.
        </p>
        <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs space-y-1">
          <p>$ cd agent</p>
          <p>$ docker build -t cfo-agent .</p>
          <p>$ docker run -p 3001:3001 --env-file .env cfo-agent</p>
        </div>
        <SectionHeading>Development</SectionHeading>
        <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs space-y-1">
          <p># Terminal 1: Frontend</p>
          <p>$ npm run dev</p>
          <p></p>
          <p># Terminal 2: Agent server</p>
          <p>$ cd agent && npm run dev</p>
        </div>
      </div>
    ),
  },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function Docs() {
  const [activeSection, setActiveSection] = useState("overview");

  const currentSection = sections.find((s) => s.id === activeSection) ?? sections[0];

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left nav */}
      <div className="w-56 border-r border-border bg-card/30 flex flex-col">
        <div className="p-4 pb-2">
          <h1 className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Documentation
          </h1>
          <p className="text-[10px] text-muted-foreground mt-1">BlockDrive CFO v1.0.0</p>
        </div>
        <ScrollArea className="flex-1">
          <nav className="p-2 space-y-0.5">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors text-left",
                  activeSection === section.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <section.icon className="w-3.5 h-3.5 shrink-0" />
                <span>{section.title}</span>
              </button>
            ))}
          </nav>
        </ScrollArea>
      </div>

      {/* Content area */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto p-6">
          <div className="flex items-center gap-2 mb-1">
            <currentSection.icon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{currentSection.title}</h2>
          </div>
          <Separator className="my-4" />
          {currentSection.content}
        </div>
      </ScrollArea>
    </div>
  );
}
