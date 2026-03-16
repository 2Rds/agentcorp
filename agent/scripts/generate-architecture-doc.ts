/**
 * Generate WaaS Platform Architecture PDF
 *
 * Produces a professionally formatted investor-facing architecture
 * document using the BlockDrive letterhead styling and Playwright PDF.
 *
 * Usage: npx tsx scripts/generate-architecture-doc.ts
 * Output: agent/output/waas-platform-architecture-YYYY-MM-DD.pdf
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ── Letterhead Colors (from BlockDrive_Letterhead.docx) ─────────────────────

const C = {
  logo: "#1B1B2F",
  heading: "#2E74B5",
  subheading: "#1F4D78",
  body: "#2D2D2D",
  muted: "#5A5A72",
  border: "#C8CCD0",
  footer: "#AAAAAA",
  link: "#0563C1",
  kpiBg: "#1B1B2F",
  lightBg: "#F4F6F8",
  white: "#FFFFFF",
  stripeBg: "#FAFBFC",
  badgeGreen: "#D1FAE5",
  badgeGreenText: "#065F46",
  badgeAmber: "#FEF3C7",
  badgeAmberText: "#92400E",
};

// ── CSS ─────────────────────────────────────────────────────────────────────

function css(): string {
  return `
    @page { size: Letter; }
    * { box-sizing: border-box; }
    body {
      font-family: Calibri, 'Segoe UI', sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      color: ${C.body};
      margin: 0;
      padding: 0;
    }

    /* ── Header (fixed, every page — sits in Playwright top margin) ── */
    .lh-header {
      position: fixed; top: 0; left: 0; right: 0;
      padding: 20px 0 0 0;
      background: white; z-index: 10;
    }
    .lh-logo {
      font-family: Garamond, 'Times New Roman', serif;
      font-size: 13pt; color: ${C.logo};
      letter-spacing: 3px; margin: 0;
    }
    .lh-sep { border: none; border-bottom: 1px solid ${C.border}; margin: 8px 0 4px 0; }
    .lh-contact {
      text-align: right; font-size: 8pt; color: ${C.muted}; margin: 0;
    }
    .lh-dot { color: ${C.border}; margin: 0 4px; }

    /* ── Footer (fixed, every page — sits in Playwright bottom margin) ── */
    .lh-footer {
      position: fixed; bottom: 0; left: 0; right: 0;
      padding: 0 0 16px 0;
      background: white; z-index: 10;
    }
    .lh-footer hr { border: none; border-bottom: 0.5px solid ${C.border}; margin: 0 0 6px 0; }
    .lh-footer p {
      text-align: center; font-size: 7pt; color: ${C.footer}; margin: 0;
    }

    /* ── Typography ── */
    h1 { font-size: 16pt; color: ${C.heading}; font-weight: 600; margin: 24px 0 8px 0; line-height: 1.2; }
    h2 { font-size: 13pt; color: ${C.heading}; font-weight: 600; margin: 20px 0 6px 0; line-height: 1.3; }
    h3 { font-size: 12pt; color: ${C.subheading}; font-weight: 600; margin: 16px 0 4px 0; }
    p { margin: 6px 0; }
    a { color: ${C.link}; text-decoration: underline; }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 10px 0; }
    th {
      background: ${C.heading}; color: white; text-align: left;
      padding: 6px 10px; font-weight: 600; font-size: 9pt;
    }
    td { padding: 5px 10px; border-bottom: 1px solid ${C.border}; vertical-align: top; }
    tr:nth-child(even) td { background: ${C.stripeBg}; }

    /* ── Document title ── */
    .doc-title {
      font-size: 26pt; color: ${C.logo}; font-weight: 700;
      line-height: 1.15; margin: 0 0 4px 0;
    }
    .doc-subtitle {
      font-size: 12pt; color: ${C.muted}; font-weight: 400;
      margin: 0 0 20px 0;
    }

    /* ── Section number label ── */
    .sec {
      font-size: 8pt; color: ${C.heading}; text-transform: uppercase;
      letter-spacing: 1.5px; font-weight: 700; margin: 0 0 2px 0;
    }

    /* ── KPI bar ── */
    .kpi-bar {
      display: flex; justify-content: space-around; align-items: center;
      background: ${C.kpiBg}; border-radius: 8px; padding: 16px 10px;
      margin: 16px 0 24px 0;
    }
    .kpi { text-align: center; color: white; }
    .kpi .num { font-size: 22pt; font-weight: 700; display: block; line-height: 1.1; }
    .kpi .lbl { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.75; }

    /* ── Callout box ── */
    .callout {
      background: ${C.lightBg}; border-left: 4px solid ${C.heading};
      padding: 12px 16px; margin: 12px 0; border-radius: 0 6px 6px 0;
      font-size: 10pt;
    }
    .callout-dark {
      background: ${C.lightBg}; border-left: 4px solid ${C.subheading};
      padding: 12px 16px; margin: 12px 0; border-radius: 0 6px 6px 0;
      font-size: 10pt;
    }
    .callout strong, .callout-dark strong { color: ${C.logo}; }

    /* ── Diagram box ── */
    .diagram {
      background: ${C.lightBg}; border: 1px solid ${C.border};
      border-radius: 6px; padding: 16px 20px; margin: 12px 0;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 9pt; line-height: 1.35; white-space: pre; overflow-x: hidden;
    }

    /* ── Two-column ── */
    .cols { display: flex; gap: 24px; margin: 10px 0; }
    .col { flex: 1; }
    .col h3 { margin-top: 0; }

    /* ── Agent cards ── */
    .agent-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0; }
    .agent-card {
      width: 31%; border: 1px solid ${C.border}; border-radius: 6px;
      padding: 10px 12px; background: white;
    }
    .agent-name { font-weight: 700; color: ${C.logo}; font-size: 11pt; margin: 0; }
    .agent-role { color: ${C.muted}; font-size: 8.5pt; margin: 2px 0 4px 0; }
    .badge {
      display: inline-block; padding: 1px 8px; border-radius: 10px;
      font-size: 7.5pt; font-weight: 700; letter-spacing: 0.3px;
    }
    .badge-live { background: ${C.badgeGreen}; color: ${C.badgeGreenText}; }
    .badge-planned { background: ${C.badgeAmber}; color: ${C.badgeAmberText}; }

    /* ── Org Chart ── */
    .oc { display: flex; flex-direction: column; align-items: center; margin: 16px 0; }
    .oc-row { display: flex; justify-content: center; width: 100%; }
    .oc-single { display: flex; justify-content: center; }
    .oc-group { position: relative; margin: 0 auto; }
    .oc-node { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 0 3px; }
    .oc-box {
      border: 2px solid ${C.heading}; border-radius: 6px;
      padding: 6px 10px; text-align: center; background: white;
      width: 100%; max-width: 160px;
    }
    .oc-box .n { font-weight: 700; font-size: 10pt; color: ${C.logo}; line-height: 1.2; }
    .oc-box .t { font-size: 7.5pt; color: ${C.muted}; margin-top: 1px; line-height: 1.2; }
    .oc-box .m { font-size: 7pt; color: ${C.muted}; font-style: italic; line-height: 1.2; }
    .oc-human {
      background: ${C.kpiBg}; border-color: ${C.kpiBg};
      max-width: 260px; padding: 10px 16px;
    }
    .oc-human .n { color: white; font-size: 12pt; }
    .oc-human .t { color: rgba(255,255,255,0.75); font-size: 9pt; }
    .oc-human .m { color: rgba(255,255,255,0.55); }
    .oc-vp { background: ${C.heading}; border-color: ${C.heading}; }
    .oc-vp .n { color: white; }
    .oc-vp .t { color: rgba(255,255,255,0.8); }
    .oc-exec { background: #EBF3FB; border-color: ${C.heading}; }
    .oc-dept { border-color: ${C.subheading}; border-width: 1.5px; }
    .oc-stem { width: 2px; height: 18px; background: ${C.border}; flex-shrink: 0; }
    .oc-rail { position: absolute; top: 0; height: 2px; background: ${C.border}; }
    .oc-drop { width: 2px; height: 14px; background: ${C.border}; flex-shrink: 0; }

    /* ── Department Cards ── */
    .dept-grid { display: flex; flex-direction: column; gap: 10px; margin: 12px 0; }
    .dept-card { border: 1px solid ${C.border}; border-radius: 8px; overflow: hidden; }
    .dept-header {
      padding: 7px 14px; color: white;
      display: flex; justify-content: space-between; align-items: center;
    }
    .dept-name { font-weight: 700; font-size: 10pt; }
    .dept-head { font-size: 8.5pt; opacity: 0.85; }
    .dept-body { padding: 8px 14px; }
    .dept-stat { font-size: 8.5pt; color: ${C.muted}; margin-bottom: 4px; }
    .dept-roster { margin: 0; padding-left: 16px; font-size: 9.5pt; }
    .dept-roster li { margin: 3px 0; }
    .dept-desc { font-size: 8.5pt; color: ${C.muted}; }

    /* ── Metric cards ── */
    .metric-row { display: flex; gap: 12px; margin: 12px 0; flex-wrap: wrap; }
    .metric-card {
      flex: 1; min-width: 120px; border: 1px solid ${C.border}; border-radius: 6px;
      padding: 10px 14px; text-align: center;
    }
    .metric-card .val { font-size: 18pt; font-weight: 700; color: ${C.logo}; }
    .metric-card .lbl { font-size: 8pt; text-transform: uppercase; color: ${C.muted}; letter-spacing: 0.5px; }

    /* ── Page break ── */
    .pb { page-break-before: always; }
    .no-break { page-break-inside: avoid; }

    /* ── Lists ── */
    ul { margin: 4px 0; padding-left: 20px; }
    li { margin: 2px 0; font-size: 10.5pt; }
  `;
}

// ── Section Builders ────────────────────────────────────────────────────────

function renderHero(): string {
  return `
    <p class="doc-title">WaaS Platform Architecture</p>
    <p class="doc-subtitle">Cognitive Agent Orchestration for Enterprise Operations</p>
    <div class="kpi-bar">
      <div class="kpi"><span class="num">10</span><span class="lbl">AI Models</span></div>
      <div class="kpi"><span class="num">42</span><span class="lbl">Callable Tools</span></div>
      <div class="kpi"><span class="num">115</span><span class="lbl">Knowledge Plugins</span></div>
      <div class="kpi"><span class="num">8</span><span class="lbl">Agents</span></div>
      <div class="kpi"><span class="num">4</span><span class="lbl">AI Providers</span></div>
    </div>
  `;
}

function renderExecutiveSummary(): string {
  return `
    <p class="sec">01 &mdash; Executive Summary</p>
    <h1>Platform Overview</h1>
    <p>WaaS (Workforce-as-a-Service) is a cognitive agent orchestration platform that deploys a full AI workforce structured as a corporate hierarchy. A human CEO sits at the top; beneath them, an Executive Assistant, a VP/General Manager, and a Chief Compliance Officer coordinate eight department heads &mdash; each with junior agents and, where applicable, voice-enabled sales representatives. Every agent operates with its own curated model stack, callable tool set, domain-specific knowledge plugins, persistent memory scope, and security namespace &mdash; collaborating through a scoped message bus while maintaining strict data isolation between departments.</p>
    <p>The platform is built on four pillars:</p>
    <p><strong>Multi-model intelligence</strong> &mdash; 10 AI models across 4 providers. Each agent receives a purpose-built stack: a primary reasoning model, a structured-data generator, a document processor, and a research model, selected to match its operational domain.</p>
    <p><strong>Dual-mode runtime</strong> &mdash; Every agent can operate in cognitive mode (tool orchestration, document generation, data analysis via Claude) and conversational mode (real-time voice calls, phone trees, batch outreach via ElevenLabs + Twilio). A single identity with two runtime engines.</p>
    <p><strong>Persistent organizational memory</strong> &mdash; Graph-based knowledge that compounds across every session, not just conversation history. Entities, relationships, and decisions form an ever-growing institutional memory that new agents inherit on deployment.</p>
    <p><strong>Fail-closed namespace isolation</strong> &mdash; Enterprise-grade data boundaries enforced at the infrastructure level through ScopeEnforcer wrappers on every data client. Agents physically cannot access unauthorized namespaces &mdash; this is not prompt engineering, it is code-level enforcement.</p>

    <h2>Go-to-Market Strategy</h2>
    <p>WaaS is being built <strong>internally first</strong>. BlockDrive is its own first customer &mdash; deploying the full agent workforce to run its own finance, operations, marketing, legal, sales, and executive functions. This is not a demo or a proof of concept; these agents handle real financial models, real investor communications, real operational workflows, and real compliance requirements for a live company.</p>
    <p>This internal deployment serves as a <strong>battle-testing environment</strong> where every architectural decision, every failure mode, every edge case, and every security boundary is validated against production workloads before the platform is ever offered externally. Once the full workforce is deployed and operating reliably at scale &mdash; with compounding memory, dual-mode runtime, cross-department coordination, and enterprise governance all proven in production &mdash; WaaS becomes BlockDrive&rsquo;s <strong>second client service</strong>: a turnkey cognitive workforce that any organization can deploy to run their own operations.</p>
    <p>The internal-first approach means customers will receive a platform that has already managed a real cap table, closed real investor conversations, filed real compliance reports, and coordinated real cross-department workflows &mdash; not a framework with theoretical capabilities.</p>

    <div class="callout">
      <strong>Key Differentiators</strong><br/>
      &bull; <strong>Full corporate hierarchy</strong> &mdash; 34 agents organized as CEO &rarr; EA + VP/GM + CCO &rarr; 5 department heads &rarr; 15 junior agents + 10 voice reps<br/>
      &bull; <strong>Dual-mode agents</strong> &mdash; cognitive (tools + streaming) and conversational (voice calls) runtimes sharing one identity and memory<br/>
      &bull; <strong>Multi-model orchestration</strong> &mdash; 10 models across Anthropic, OpenRouter, Perplexity, and Cohere; per-agent curated stacks<br/>
      &bull; <strong>Board of Directors</strong> &mdash; multi-model deliberation with quorum voting and governance review for strategic decisions<br/>
      &bull; <strong>115 knowledge-work plugins</strong> &mdash; domain skills loaded on-demand via 3-stage context matching, allocated per agent by role<br/>
      &bull; <strong>Production agent runtime</strong> &mdash; @waas/runtime bootstraps any new agent in minutes: Express, auth, streaming, memory, plugins, transport<br/>
      &bull; <strong>Enterprise governance</strong> &mdash; IBM Granite-powered Chief Compliance Officer enforces ISO 42001, SOX, and corporate guardrails across the workforce<br/>
      &bull; <strong>Internal-first validation</strong> &mdash; BlockDrive is customer zero; every capability is proven in production before external offering
    </div>
  `;
}

function renderSystemArchitecture(): string {
  return `
    <div class="pb"></div>
    <p class="sec">02 &mdash; System Architecture</p>
    <h1>Three-Tier Design</h1>
    <p>The platform separates concerns across three tiers: a human-facing interface layer, a fleet of namespace-isolated agent servers for cognitive and conversational processing, and a shared data layer for persistence, memory, and inter-agent communication.</p>

    <div class="diagram">                   ┌──────────────────────────┐
                   │     Human Interface       │
                   │  Web App · Telegram · Slack│
                   │     Twilio (Voice)        │
                   └────────────┬──────────────┘
                                │
          ┌─────────┬───────────┼────────────┬──────────┐
          │         │           │            │          │
     ┌────▼───┐ ┌───▼───┐ ┌────▼────┐ ┌─────▼───┐ ┌───▼────┐
     │   EA   │ │  CFA  │ │  COA    │ │  CMA    │ │  ...   │
     │ Agent  │ │ Agent │ │  Agent  │ │  Agent  │ │ N more │
     │        │ │       │ │         │ │         │ │        │
     │ Tools  │ │ Tools │ │  Tools  │ │  Tools  │ │ Tools  │
     │Plugins │ │Plugin │ │ Plugins │ │ Plugins │ │Plugins │
     │Memory  │ │Memory │ │  Memory │ │  Memory │ │Memory  │
     └──┬──┬──┘ └──┬──┬─┘ └──┬──┬──┘ └──┬──┬──┘ └──┬──┬──┘
        │  │       │  │      │  │       │  │       │  │
     ┌──┘  └───┬───┘  └──┬───┘  └───┬───┘  └──┬───┘  │
     │         │         │         │          │       │
  ┌──▼──────┐ ┌▼────────▼┐ ┌──────▼──┐ ┌─────▼──┐ ┌─▼──────┐
  │ Claude  │ │  Redis    │ │ Supabase│ │ Redis  │ │  Open  │
  │ Opus 4.6│ │  8.4      │ │ Postgres│ │ Memory │ │ Router │
  │(Primary)│ │  Vectors  │ │ Auth+RLS│ │Persist │ │10 Models│
  └─────────┘ └───────────┘ └─────────┘ └────────┘ └────────┘</div>

    <div class="cols">
      <div class="col">
        <h3>Interface Layer</h3>
        <p>Multiple channels: a React 18 web application (Vercel), Telegram bots per agent, Slack channels per department, and Twilio voice for conversational mode. Each agent is reachable through its designated transports.</p>
      </div>
      <div class="col">
        <h3>Agent Fleet</h3>
        <p>Each agent runs as an isolated Express server via @waas/runtime. Every agent receives its own model stack, tool set, knowledge plugins, and namespace-scoped memory. New agents deploy in minutes using the shared runtime engine.</p>
      </div>
      <div class="col">
        <h3>Shared Data Layer</h3>
        <p>Supabase (Postgres + RLS + Auth) for structured data. Redis 8.4 for vector search, semantic caching, plugin matching, inter-agent message bus, and persistent memory with cross-namespace read access for executives.</p>
      </div>
    </div>

    <div class="callout-dark">
      <strong>@waas/runtime</strong> &mdash; The shared agent execution engine. A single class instantiation bootstraps any agent with: Express server, Supabase auth middleware, SSE streaming, memory enrichment pipeline, knowledge plugin loading, Telegram/Slack transport, and graceful shutdown. Every department agent &mdash; current and future &mdash; deploys on this engine.
    </div>
  `;
}

function renderMultiModelStrategy(): string {
  return `
    <div class="pb"></div>
    <p class="sec">03 &mdash; Multi-Model AI Strategy</p>
    <h1>10 Models Across 4 Providers</h1>
    <p>No uniform model orchestration &mdash; each agent receives a purpose-built model stack matched to its domain. The platform uses 8 primary models plus 2 utility models across 4 direct provider integrations.</p>

    <table>
      <tr><th>Model</th><th>Provider</th><th>Capabilities</th><th>Input $/1M</th><th>Output $/1M</th><th>Context</th></tr>
      <tr><td><strong>Claude Opus 4.6</strong></td><td>Anthropic</td><td>Reasoning, Code, Multimodal</td><td>$15.00</td><td>$75.00</td><td>200K</td></tr>
      <tr><td>Gemini 3.1 Pro</td><td>OpenRouter</td><td>Multimodal, Search Grounding</td><td>$2.00</td><td>$12.00</td><td>1M</td></tr>
      <tr><td>Sonar Pro</td><td>Perplexity</td><td>Web Search, Citations</td><td>$3.00</td><td>$15.00</td><td>200K</td></tr>
      <tr><td>Sonar Deep Research</td><td>Perplexity</td><td>Multi-step Deep Research</td><td>$2.00</td><td>$8.00</td><td>128K</td></tr>
      <tr><td>Cohere Command A</td><td>Cohere</td><td>RAG, Reasoning, Code</td><td>$2.50</td><td>$10.00</td><td>256K</td></tr>
      <tr><td>IBM Granite 4.0</td><td>OpenRouter</td><td>Compliance, Governance</td><td>$0.017</td><td>$0.11</td><td>131K</td></tr>
      <tr><td>Grok 4.1 Fast Reasoning</td><td>OpenRouter</td><td>Reasoning, 2M Context</td><td>$0.20</td><td>$0.50</td><td>2M</td></tr>
      <tr><td>Grok 4.1 Fast</td><td>OpenRouter</td><td>Code, Ultra-fast</td><td>$0.20</td><td>$0.50</td><td>2M</td></tr>
      <tr><td><em>Cohere Embed v4.0</em></td><td>Cohere</td><td>Embeddings</td><td>$0.10</td><td>&mdash;</td><td>128K</td></tr>
      <tr><td><em>Cohere Rerank v4.0</em></td><td>Cohere</td><td>Cross-encoder Reranking</td><td>$2.00</td><td>&mdash;</td><td>128K</td></tr>
    </table>

    <div class="cols">
      <div class="col">
        <h3>Why Multi-Model?</h3>
        <ul>
          <li>Different training data = different blind spots and reasoning styles</li>
          <li>Cost optimization via capability routing (Granite at $0.017/M for compliance vs. Opus at $15/M for strategy)</li>
          <li>Regulatory compliance via dedicated Granite governance engine</li>
          <li>2M context windows (Grok) for large document analysis</li>
          <li>Real-time web grounding (Sonar, Gemini) for current information</li>
        </ul>
      </div>
      <div class="col">
        <h3>Provider Strategy</h3>
        <ul>
          <li><strong>Anthropic</strong> (direct) &mdash; Primary brain for every agent. Opus 4.6 handles reasoning, tool orchestration, and streaming chat</li>
          <li><strong>OpenRouter</strong> &mdash; Aggregated access to Gemini, Grok, and Granite. Single API key for multi-provider routing</li>
          <li><strong>Perplexity</strong> (direct) &mdash; Real-time web research with citations and multi-step deep research</li>
          <li><strong>Cohere</strong> (direct) &mdash; Enterprise RAG, embedding generation, and search quality via cross-encoder reranking</li>
        </ul>
      </div>
    </div>

    <div class="callout">
      <strong>Model Exclusions:</strong> No Chinese models (Kimi K2.5, DeepSeek) &mdash; trust is non-negotiable in blockchain and fintech. No Sonnet &mdash; token inefficiency negates cost savings when memories compound over time. Opus everywhere ensures consistent quality.
    </div>
  `;
}

function renderAgentNetwork(): string {
  return `
    <div class="pb"></div>
    <p class="sec">04 &mdash; Organizational Structure</p>
    <h1>The Agentic Workforce &mdash; Full Deployment Blueprint</h1>
    <p>A hierarchical cognitive workforce organized as a corporate C-Suite. One human CEO, executive-tier agents, a VP/General Manager overseeing all departments, five department heads, and specialized junior agents in each division. At full deployment: <strong>33 AI agents</strong> operating under a single human principal.</p>

    <!-- ═══ VISUAL ORG CHART ═══ -->
    <div class="oc">

      <!-- TIER 0: CEO -->
      <div class="oc-row">
        <div class="oc-single">
          <div class="oc-box oc-human">
            <div class="n">Sean Weiss</div>
            <div class="t">Founder / CEO</div>
            <div class="m">Human Principal &mdash; all agents report upward</div>
          </div>
        </div>
      </div>

      <div class="oc-stem"></div>

      <!-- TIER 1: Executive Reports (3) -->
      <div class="oc-group" style="width:82%">
        <div class="oc-rail" style="left:16.67%;right:16.67%"></div>
        <div class="oc-row">
          <div class="oc-node">
            <div class="oc-drop"></div>
            <div class="oc-box oc-exec">
              <div class="n">Alex</div>
              <div class="t">Executive Assistant</div>
              <div class="m">11 Tools &middot; 84 Plugins</div>
              <span class="badge badge-live" style="margin-top:3px">DEPLOYED</span>
            </div>
          </div>
          <div class="oc-node">
            <div class="oc-drop"></div>
            <div class="oc-box oc-vp">
              <div class="n">Jordan</div>
              <div class="t">VP / General Manager</div>
              <div class="m" style="color:rgba(255,255,255,0.6)">Manages entire workforce</div>
              <span class="badge badge-planned" style="margin-top:3px">PLANNED</span>
            </div>
          </div>
          <div class="oc-node">
            <div class="oc-drop"></div>
            <div class="oc-box oc-exec">
              <div class="n">Compliance</div>
              <div class="t">Chief Compliance Officer</div>
              <div class="m">IBM Granite 4.0 Primary</div>
              <span class="badge badge-planned" style="margin-top:3px">PLANNED</span>
            </div>
          </div>
        </div>
      </div>

      <div class="oc-stem"></div>

      <!-- TIER 2: Department Heads (5, under Jordan) -->
      <div class="oc-group" style="width:100%">
        <div class="oc-rail" style="left:10%;right:10%"></div>
        <div class="oc-row">
          <div class="oc-node">
            <div class="oc-drop"></div>
            <div class="oc-box oc-dept">
              <div class="n">Morgan</div>
              <div class="t">Chief Financial Agent</div>
              <span class="badge badge-live" style="margin-top:2px">DEPLOYED</span>
              <div class="m">3 specialists</div>
            </div>
          </div>
          <div class="oc-node">
            <div class="oc-drop"></div>
            <div class="oc-box oc-dept">
              <div class="n">Operations</div>
              <div class="t">Chief Operating Agent</div>
              <span class="badge badge-planned" style="margin-top:2px">PLANNED</span>
              <div class="m">3 specialists</div>
            </div>
          </div>
          <div class="oc-node">
            <div class="oc-drop"></div>
            <div class="oc-box oc-dept">
              <div class="n">Taylor</div>
              <div class="t">Chief Marketing Agent</div>
              <span class="badge badge-planned" style="margin-top:2px">PLANNED</span>
              <div class="m">3 specialists</div>
            </div>
          </div>
          <div class="oc-node">
            <div class="oc-drop"></div>
            <div class="oc-box oc-dept">
              <div class="n">Casey</div>
              <div class="t">Legal Counsel</div>
              <span class="badge badge-planned" style="margin-top:2px">PLANNED</span>
              <div class="m">3 specialists</div>
            </div>
          </div>
          <div class="oc-node">
            <div class="oc-drop"></div>
            <div class="oc-box oc-dept">
              <div class="n">Sam</div>
              <div class="t">Head of Sales</div>
              <span class="badge badge-planned" style="margin-top:2px">PLANNED</span>
              <div class="m">3 + 10 voice reps</div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Summary KPIs -->
    <div class="kpi-bar" style="margin-top:12px">
      <div class="kpi"><span class="num">1</span><span class="lbl">Human CEO</span></div>
      <div class="kpi"><span class="num">8</span><span class="lbl">C-Suite Agents</span></div>
      <div class="kpi"><span class="num">15</span><span class="lbl">Junior Specialists</span></div>
      <div class="kpi"><span class="num">10</span><span class="lbl">Voice Sales Reps</span></div>
      <div class="kpi"><span class="num">34</span><span class="lbl">Total Workforce</span></div>
    </div>

    <div class="callout">
      <strong>Chief Compliance Officer &mdash; IBM Granite Governance:</strong> The CCO is the only agent where IBM Granite 4.0 serves as the <em>primary</em> model, not a support model. Granite is purpose-built for enterprise governance &mdash; ISO 42001 AI management, SOX compliance, regulatory audit, ethical guardrails, and risk assessment. Every agent action, tool call, and inter-agent message can be routed through the CCO for governance review. Opus 4.6 serves as the secondary brain for complex reasoning that requires deeper analysis beyond compliance checking.
    </div>

    <!-- ═══ DEPARTMENT BREAKDOWN ═══ -->
    <div class="pb"></div>
    <h2>Department Breakdown &mdash; Full Roster</h2>
    <p>Each department head manages specialized junior agents. Every agent &mdash; head and junior &mdash; operates with its own namespace scope, model stack, knowledge plugins, and persistent memory.</p>

    <div class="dept-grid">

      <div class="dept-card no-break">
        <div class="dept-header" style="background:${C.heading}">
          <span class="dept-name">Finance Department</span>
          <span class="dept-head">Morgan &mdash; Chief Financial Agent &nbsp;<span class="badge badge-live">DEPLOYED</span></span>
        </div>
        <div class="dept-body">
          <div class="dept-stat">31 Tools &middot; 31 Plugins &middot; Opus + Command A + Grok Fast</div>
          <ul class="dept-roster">
            <li><strong>Riley &mdash; Investor Relations</strong><br/><span class="dept-desc">Market research, data room management, investor outreach, pipeline tracking</span></li>
            <li><strong>Financial Analyst</strong><br/><span class="dept-desc">FP&amp;A modeling, variance analysis, scenario planning, burn/runway projections</span></li>
            <li><strong>Accounting Agent</strong><br/><span class="dept-desc">GL reconciliation, journal entries, month-end close, SOX workpapers</span></li>
          </ul>
        </div>
      </div>

      <div class="dept-card no-break">
        <div class="dept-header" style="background:${C.subheading}">
          <span class="dept-name">Operations Department</span>
          <span class="dept-head">Chief Operating Agent &nbsp;<span class="badge badge-planned">PLANNED</span></span>
        </div>
        <div class="dept-body">
          <div class="dept-stat">Opus + Gemini + Grok Reasoning &middot; Operations + HR + Engineering plugins</div>
          <ul class="dept-roster">
            <li><strong>HR Specialist</strong><br/><span class="dept-desc">Recruiting pipeline, onboarding checklists, people analytics, comp benchmarking</span></li>
            <li><strong>Process Analyst</strong><br/><span class="dept-desc">Workflow optimization, SOP documentation, capacity planning, change management</span></li>
            <li><strong>Procurement Agent</strong><br/><span class="dept-desc">Vendor evaluation, contract tracking, cost optimization, renewal management</span></li>
          </ul>
        </div>
      </div>

      <div class="dept-card no-break">
        <div class="dept-header" style="background:${C.heading}">
          <span class="dept-name">Marketing Department</span>
          <span class="dept-head">Taylor &mdash; Chief Marketing Agent &nbsp;<span class="badge badge-planned">PLANNED</span></span>
        </div>
        <div class="dept-body">
          <div class="dept-stat">Opus + Gemini + Sonar &middot; Marketing + Brand + Design + Data plugins</div>
          <ul class="dept-roster">
            <li><strong>Content Strategist</strong><br/><span class="dept-desc">Blog posts, social media, email sequences, landing pages, thought leadership</span></li>
            <li><strong>SEO &amp; Analytics Agent</strong><br/><span class="dept-desc">Search optimization, keyword tracking, campaign performance, attribution reporting</span></li>
            <li><strong>Brand Manager</strong><br/><span class="dept-desc">Voice consistency, design review, brand guideline enforcement, asset management</span></li>
          </ul>
        </div>
      </div>

      <div class="dept-card no-break">
        <div class="dept-header" style="background:${C.subheading}">
          <span class="dept-name">Legal Department</span>
          <span class="dept-head">Casey &mdash; Legal Counsel &nbsp;<span class="badge badge-planned">PLANNED</span></span>
        </div>
        <div class="dept-body">
          <div class="dept-stat">Opus + Command A + Grok Reasoning &middot; Legal + Compliance + Operations plugins</div>
          <ul class="dept-roster">
            <li><strong>Contract Analyst</strong><br/><span class="dept-desc">Contract review, NDA triage, clause negotiation, template management</span></li>
            <li><strong>Regulatory Agent</strong><br/><span class="dept-desc">Compliance tracking, privacy (GDPR/CCPA), policy lookup, audit readiness</span></li>
            <li><strong>IP Specialist</strong><br/><span class="dept-desc">Patent research, trademark monitoring, licensing review, IP portfolio management</span></li>
          </ul>
        </div>
      </div>

      <div class="dept-card no-break">
        <div class="dept-header" style="background:${C.heading}">
          <span class="dept-name">Sales Department</span>
          <span class="dept-head">Sam &mdash; Head of Sales &nbsp;<span class="badge badge-planned">PLANNED</span></span>
        </div>
        <div class="dept-body">
          <div class="dept-stat">Opus + Sonar + Gemini &middot; Sales + Apollo + CRM + Customer-Support plugins</div>
          <ul class="dept-roster">
            <li><strong>Account Executive</strong><br/><span class="dept-desc">Enterprise deal management, proposals, pricing negotiations, contract handoff</span></li>
            <li><strong>SDR Agent</strong><br/><span class="dept-desc">Prospecting, cold outreach, lead qualification, meeting booking</span></li>
            <li><strong>10 Voice Sales Reps</strong> (Swarm)<br/><span class="dept-desc">Outbound batch calling via ElevenLabs, each with unique voice + persona, automated transcript &rarr; memory knowledge extraction</span></li>
          </ul>
        </div>
      </div>

    </div>

    <!-- ═══ MODEL STACKS ═══ -->
    <div class="pb"></div>
    <h2>Per-Agent Model Stacks</h2>
    <p>No uniform model allocation. Each agent receives a curated stack matched to its domain and operational needs.</p>
    <table>
      <tr><th>Agent</th><th>Primary</th><th>Support Models</th><th>Embed</th><th>Rerank</th></tr>
      <tr><td>Alex (EA)</td><td>Opus 4.6</td><td>Gemini 3.1 Pro, Sonar Pro</td><td>Cohere Embed</td><td>Cohere Rerank</td></tr>
      <tr><td>Jordan (VP/GM)</td><td>Opus 4.6</td><td>Gemini 3.1 Pro, Grok 4.1 Reasoning</td><td>Cohere Embed</td><td>Cohere Rerank</td></tr>
      <tr><td><strong>CCO</strong></td><td><strong>Granite 4.0</strong></td><td>Opus 4.6, Command A</td><td>Cohere Embed</td><td>&mdash;</td></tr>
      <tr><td>Morgan (CFA)</td><td>Opus 4.6</td><td>Command A, Grok 4.1 Fast</td><td>Cohere Embed</td><td>Cohere Rerank</td></tr>
      <tr><td>Riley (IR)</td><td>Opus 4.6</td><td>Sonar Pro, Sonar Deep, Command A</td><td>Cohere Embed</td><td>Cohere Rerank</td></tr>
      <tr><td>Operations</td><td>Opus 4.6</td><td>Gemini 3.1 Pro, Grok 4.1 Reasoning</td><td>Cohere Embed</td><td>Cohere Rerank</td></tr>
      <tr><td>Taylor (CMA)</td><td>Opus 4.6</td><td>Gemini 3.1 Pro, Sonar Pro</td><td>Cohere Embed</td><td>&mdash;</td></tr>
      <tr><td>Casey (Legal)</td><td>Opus 4.6</td><td>Command A, Grok 4.1 Reasoning</td><td>Cohere Embed</td><td>Cohere Rerank</td></tr>
      <tr><td>Sam (Sales)</td><td>Opus 4.6</td><td>Sonar Pro, Gemini 3.1 Pro</td><td>Cohere Embed</td><td>&mdash;</td></tr>
    </table>
  `;
}

function renderDualModeRuntime(): string {
  return `
    <div class="pb"></div>
    <p class="sec">05 &mdash; Dual-Mode Runtime Architecture</p>
    <h1>The Innovation: Two Runtimes, One Employee</h1>
    <p>Traditional AI agents are either text-based utility workers <em>or</em> voice-based conversational bots. WaaS introduces a fundamentally different approach: <strong>every agent operates across two complementary runtimes that share a single identity, persistent memory, namespace scope, and knowledge-work plugins.</strong> The same agent that analyzes your cap table in the cognitive runtime picks up the phone and pitches an investor in the conversational runtime &mdash; with full context continuity and zero handoff friction.</p>
    <p>This is what makes WaaS agents <em>employees</em> rather than tools. A human employee doesn&rsquo;t become a different person when they switch from writing a report to taking a meeting. Neither does a WaaS agent.</p>

    <div class="callout">
      <strong>Why This Matters:</strong> No existing agentic framework provides this. LangChain, CrewAI, AutoGen &mdash; they orchestrate text-based tool chains. ElevenLabs, Vapi, Bland.ai &mdash; they handle voice calls. WaaS is the first platform where a single agent identity <em>seamlessly transitions</em> between deep analytical work and real-time human conversation, with persistent memory bridging every interaction regardless of modality.
    </div>

    <div class="diagram">                 ┌─────────────────────────────────┐
                 │          Agent Identity          │
                 │  Name · Memory · Scope · Plugins │
                 │  Personality · Escalation Rules  │
                 └───────────┬─────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────▼──────────┐      ┌───────────▼──────────┐
    │  Cognitive Runtime  │      │ Conversational Runtime│
    │  ─────────────────  │      │ ──────────────────── │
    │  Claude Opus 4.6    │      │  ElevenLabs Conv. AI │
    │  42 Callable Tools  │      │  Twilio/SIP Phone    │
    │  SSE Streaming      │      │  Flash TTS (&lt;75ms)   │
    │  115 Knowledge      │      │  Real-time STT       │
    │    Plugins          │      │  Custom Voice ID     │
    └─────────┬──────────┘      └───────────┬──────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                   ┌─────────▼─────────┐
                   │  Shared Data Layer │
                   │  Redis Memory      │
                   │  Supabase          │
                   │  Notion · Plugins  │
                   └───────────────────┘</div>

    <div class="cols">
      <div class="col">
        <h3>Cognitive Runtime</h3>
        <p style="font-size:10pt">The agent <em>doing work</em> &mdash; analysis, generation, tool execution, multi-step reasoning.</p>
        <ul>
          <li>Claude Opus 4.6 + specialized support models</li>
          <li>Callable tools (MCP or native Anthropic API)</li>
          <li>Agentic loop (up to 15 tool turns)</li>
          <li>Knowledge-work plugins for domain expertise</li>
          <li>SSE streaming to web, Telegram, Slack, email</li>
        </ul>
      </div>
      <div class="col">
        <h3>Conversational Runtime</h3>
        <p style="font-size:10pt">The agent <em>speaking</em> &mdash; real-time voice calls, meetings, human interaction.</p>
        <ul>
          <li>ElevenLabs Conversational AI (sub-75ms)</li>
          <li>Twilio/SIP for real phone numbers</li>
          <li>Flash TTS + real-time STT</li>
          <li>Custom or cloned voice per agent</li>
          <li>Phone (inbound/outbound), voice messages</li>
        </ul>
      </div>
    </div>

    <div class="pb"></div>
    <h2>Workflow Examples: Runtime Switching in Action</h2>
    <p>The power of dual-mode is in the seamless transitions. Each scenario below shows a single agent fluidly moving between cognitive analysis and live human conversation &mdash; with memory persisting across every mode switch.</p>

    <h3>Sales Agent (Sam) &mdash; Full-Cycle Deal Execution</h3>
    <div class="diagram" style="font-size:8.5pt">
COGNITIVE  │ 9:00 AM  Research prospect via Sonar Deep Research + CRM data
           │          Pull company financials, recent funding, tech stack
           │          Generate personalized pitch deck from template
           │          Draft talking points based on prospect&rsquo;s pain points
           │          Save research to memory: &ldquo;Acme Corp - Series B, $12M ARR, migrating from AWS&rdquo;
           │
    ──── SWITCH ────
           │
CONVERSE   │ 10:00 AM  Outbound sales call via Twilio
           │           Opens with: &ldquo;Hi David, this is Sam from BlockDrive...&rdquo;
           │           References research naturally in conversation
           │           Real-time STT captures prospect objections + requirements
           │           Call ends after 8 minutes
           │
    ──── SWITCH ────
           │
COGNITIVE  │ 10:10 AM  Auto-extract call transcript → persistent memory
           │           Update CRM: deal stage, next steps, objections
           │           Draft follow-up email with pricing proposal
           │           Create task: &ldquo;Send case study by Thursday&rdquo;
           │           Escalate to Morgan (CFA): &ldquo;Custom pricing needed for 500TB deal&rdquo;</div>

    <h3>Executive Assistant (Alex) &mdash; Meeting Day Orchestration</h3>
    <div class="diagram" style="font-size:8.5pt">
COGNITIVE  │ 8:00 AM  Pull today&rsquo;s calendar, prep meeting briefs for each
           │          Cross-namespace search: latest metrics from CFA, pipeline from IR
           │          Generate one-pager for 11 AM investor meeting
           │          Send briefing to Sean via Telegram
           │
    ──── SWITCH ────
           │
CONVERSE   │ 9:30 AM  Inbound call from investor: &ldquo;Hi, this is Alex from BlockDrive...&rdquo;
           │          Answers scheduling questions, confirms 11 AM meeting
           │          &ldquo;I&rsquo;ll send the updated deck to your email right after this call&rdquo;
           │
    ──── SWITCH ────
           │
COGNITIVE  │ 9:35 AM  Generate investor deck PDF, email to investor
           │          Update Notion Decision Log: &ldquo;Investor confirmed for 11 AM&rdquo;
           │          Save meeting notes from call to ea_meeting_notes
           │
    ──── SWITCH ────
           │
CONVERSE   │ 11:00 AM Join investor meeting as note-taker (listen-only STT)
           │          Real-time transcription of full meeting
           │
    ──── SWITCH ────
           │
COGNITIVE  │ 11:45 AM Extract action items from transcript → ea_tasks
           │          Save key decisions to memory (cross-namespace: all agents see them)
           │          Draft follow-up email to investor with next steps
           │          Update pipeline status in Notion Investor Pipeline DB</div>

    <h3>Investor Relations (Riley) &mdash; Fundraise Cycle</h3>
    <div class="diagram" style="font-size:8.5pt">
COGNITIVE  │ Morning   Research 20 target investors via Sonar Deep Research
           │           Score and rank by fit, check existing memory for prior contact
           │           Generate personalized outreach emails for top 10
           │           Prepare data room documents, update metrics one-pager
           │
    ──── SWITCH ────
           │
CONVERSE   │ 2:00 PM   Batch outbound calls to 10 investors (ElevenLabs batch API)
           │           Each call personalized with dynamic variables per prospect
           │           &ldquo;Hi [name], this is Riley from BlockDrive. I&rsquo;m reaching out because...&rdquo;
           │           Automatic call recording + real-time transcription
           │
    ──── SWITCH ────
           │
COGNITIVE  │ 3:30 PM   Process all 10 call transcripts → memory knowledge extraction
           │           Update Notion Investor Pipeline: interested / pass / follow-up
           │           Draft personalized follow-ups for interested investors
           │           Escalate to Alex: &ldquo;3 investors want meetings this week&rdquo;</div>

    <h2>Voice Configuration</h2>
    <table>
      <tr><th>Parameter</th><th>Value</th><th>Purpose</th></tr>
      <tr><td>TTS Model</td><td>eleven_flash_v2_5</td><td>Sub-75ms latency for natural real-time conversation</td></tr>
      <tr><td>STT Model</td><td>scribe_v2_realtime</td><td>Streaming transcription for live speech input</td></tr>
      <tr><td>Voice Mode</td><td>conversational / tts-only / stt-only</td><td>Full duplex, output-only, or input-only per agent</td></tr>
      <tr><td>Max Call Duration</td><td>600s (10 min)</td><td>Configurable per agent, prevents runaway calls</td></tr>
      <tr><td>First Message</td><td>Custom per agent</td><td>Opening greeting when answering inbound calls</td></tr>
    </table>

    <h2>Sales Swarm — Dual-Mode at Scale</h2>
    <p>The dual-mode architecture isn&rsquo;t limited to individual agents &mdash; it scales to entire teams. Sam (Head of Sales) commands <strong>10 voice sales reps</strong>, each a junior agent with its own voice identity, prospect list, and calling schedule. The swarm operates as a coordinated unit:</p>
    <ul>
      <li><strong>Pre-call</strong> (cognitive): Each rep researches its assigned prospects, generates personalized talking points, loads relevant knowledge plugins</li>
      <li><strong>During call</strong> (conversational): ElevenLabs batch calling API dials prospects simultaneously, each rep with a distinct voice and persona</li>
      <li><strong>Post-call</strong> (cognitive): Transcripts auto-extracted to memory, CRM updated, follow-ups drafted, objections cataloged for team learning</li>
      <li><strong>Coordination</strong>: Sam synthesizes all 10 reps&rsquo; results, identifies patterns, adjusts strategy, escalates hot leads to Riley (IR) or Morgan (CFA)</li>
    </ul>

    <div class="callout-dark">
      <strong>Current Status:</strong> The cognitive runtime is fully deployed for EA and CFO agents. All voice infrastructure types are defined in @waas/shared (VoiceConfig, VoiceMode, VoiceModel, TranscriptionModel, BatchCallRecipient, ConversationResult) and the EA agent config already includes voice configuration. ElevenLabs + Twilio integration is the Phase 2 milestone.
    </div>
  `;
}

function renderNamespaceIsolation(): string {
  return `
    <div class="pb"></div>
    <p class="sec">06 &mdash; Namespace Isolation &amp; Security</p>
    <h1>Fail-Closed Data Boundaries</h1>
    <p>Each agent operates within a defined ToolScope that controls access across six dimensions. Enforcement is fail-closed via the ScopeEnforcer class &mdash; agents receive pre-scoped clients (ScopedRedisClient, ScopedMemoryClient) that physically cannot access unauthorized namespaces. Any access outside scope throws an error.</p>

    <table>
      <tr><th>Dimension</th><th>Mechanism</th><th>Example</th></tr>
      <tr><td><strong>Supabase Tables</strong></td><td>Per-table read/readwrite ACL</td><td>CFA: financial_model (rw), organizations (r)</td></tr>
      <tr><td><strong>Notion Databases</strong></td><td>Database-ID-level ACL</td><td>EA: Decision Log (rw), Pipeline (r)</td></tr>
      <tr><td><strong>Redis Namespaces</strong></td><td>Prefix-based isolation</td><td>blockdrive:cfa: (rw), blockdrive:global: (r)</td></tr>
      <tr><td><strong>Memories</strong></td><td>Agent-ID scoped + wildcard</td><td>EA: * (r, executive privilege), own (rw)</td></tr>
      <tr><td><strong>External APIs</strong></td><td>Allowlist per agent</td><td>CFA: notion, slack, google-sheets</td></tr>
      <tr><td><strong>Inter-Agent Messaging</strong></td><td>canMessage whitelist</td><td>EA &rarr; all agents; IR &rarr; CFA only</td></tr>
    </table>

    <h2>Access Tiers</h2>
    <div class="cols">
      <div class="col">
        <h3>Executive (EA, COA)</h3>
        <p>Cross-namespace read access to all department memories. Read access to all Redis prefixes. Can message any agent.</p>
      </div>
      <div class="col">
        <h3>Department Head (CFA, CMA, Legal, Sales)</h3>
        <p>Own namespace readwrite only. Global Redis read. Can message executives and direct reports.</p>
      </div>
      <div class="col">
        <h3>Junior (IR)</h3>
        <p>Parent department read + own sub-namespace readwrite. Messages parent agent only.</p>
      </div>
    </div>

    <h2>Additional Security Controls</h2>
    <ul>
      <li><strong>Row-Level Security</strong> &mdash; All Supabase tables have RLS enabled with SECURITY DEFINER helper functions. Organization data isolation via is_org_member() and has_role() checks on every query.</li>
      <li><strong>SQL Injection Prevention</strong> &mdash; 9-layer validator for AI-generated SQL: UUID validation, SELECT-only, 28 forbidden keywords, schema blocking, single-statement, 7-table allowlist, auto org-scope injection, LIMIT 1000, comment stripping.</li>
      <li><strong>Auth</strong> &mdash; Native Supabase Auth (JWT) with 5-minute token cache (500 entries max). Agent servers verify tokens independently and check org membership before processing any request.</li>
    </ul>
  `;
}

function renderMemorySystem(): string {
  return `
    <div class="pb"></div>
    <p class="sec">07 &mdash; Compounding Intelligence</p>
    <h1>Persistent Memory as a Competitive Moat</h1>
    <p>Most AI agents are stateless &mdash; every conversation starts from zero. They have no memory of what happened yesterday, no institutional knowledge of past decisions, no accumulated expertise from thousands of prior interactions. This is the fundamental limitation that keeps AI agents as <em>tools</em> rather than <em>employees</em>.</p>
    <p>WaaS solves this with <strong>persistent graph memory that compounds over time</strong>. Every interaction, every tool call, every meeting note, every decision, every financial metric, every investor conversation is extracted, categorized, and stored as interconnected knowledge. The result is <strong>synthetic compounding intelligence</strong> &mdash; agents that get measurably smarter with every hour of operation.</p>

    <div class="callout">
      <strong>The Compounding Effect</strong><br/>
      A stateless AI agent answering &ldquo;What&rsquo;s our runway?&rdquo; on Day 1 gives a generic response. The same WaaS agent on Day 90 has accumulated: 3 months of burn data, board meeting decisions about cost cuts, fundraising conversations with 15 investors, market conditions from web research, and the CEO&rsquo;s stated preferences about runway thresholds &mdash; all automatically extracted and stored. It doesn&rsquo;t just calculate runway; it <em>contextualizes</em> it against the company&rsquo;s entire decision history. This is not retrieval-augmented generation. This is an agent that has <em>lived</em> inside the organization and remembers everything.
    </div>

    <h2>How Knowledge Compounds</h2>
    <div class="diagram">
Week 1:   Agent knows what you tell it in each conversation
          ───────────────────────────────────────────────▶  Baseline LLM

Week 4:   Agent recalls past decisions, recognizes patterns,
          cross-references data from multiple conversations
          ───────────────────────────────────────────────▶  Informed Analyst

Week 12:  Agent has institutional memory spanning thousands of
          interactions, entity relationships, and strategic context
          ───────────────────────────────────────────────▶  Domain Expert

Month 6:  Agent surfaces insights humans missed — connecting
          investor feedback to product decisions to financial
          outcomes across departments and time periods
          ───────────────────────────────────────────────▶  Strategic Advisor

Year 1+:  Agent&rsquo;s knowledge graph rivals the institutional
          memory of a tenured executive — except it never
          forgets, never leaves, and is available 24/7
          ───────────────────────────────────────────────▶  Institutional Memory</div>

    <h2>Persistent Memory Architecture</h2>
    <p>Redis Memory doesn&rsquo;t just store flat text &mdash; it uses <strong>vector search</strong> to semantically index every agent interaction. People, companies, decisions, financial events, and strategic themes are stored with rich metadata and retrieved via similarity search. This enables powerful contextual queries:</p>
    <ul>
      <li>&ldquo;What decisions have we made about Series A?&rdquo; &rarr; surfaces board discussions, investor feedback, valuation analyses, and term sheet negotiations via semantic retrieval</li>
      <li>&ldquo;What does Investor X care about?&rdquo; &rarr; synthesizes meeting notes, email threads, data room engagement, and prior Q&amp;A into a preference profile</li>
      <li>&ldquo;Why did we change our pricing model?&rdquo; &rarr; traces the decision through customer feedback, competitive analysis, financial modeling, and the board meeting where it was approved</li>
    </ul>

    <div class="callout-dark">
      <strong>Cross-Department Intelligence:</strong> The most powerful compounding effect comes from <em>cross-namespace memory access</em>. Executive-tier agents (EA, COA) can read memories from every department. When the EA prepares a board meeting brief, it doesn&rsquo;t just pull from its own memory &mdash; it synthesizes the CFA&rsquo;s latest runway projections, Legal&rsquo;s contract status updates, Sales&rsquo;s pipeline data, and Marketing&rsquo;s campaign results into a unified picture. No human assistant can match this cross-functional synthesis speed.
    </div>

    <h2>Memory Enrichment Pipeline</h2>
    <p>Before every query, the agent&rsquo;s system prompt is enriched with relevant accumulated knowledge via four parallel sources. All fetched via Promise.allSettled for resilience &mdash; one failed source never blocks the pipeline.</p>

    <div class="diagram">User Query
    │
    ▼
Promise.allSettled([
  ① Agent-scoped memories       (top 10, rerank + keyword match)
  ② Cross-namespace memories    (top 10, all departments — exec tier only)
  ③ Session memories            (last 10 from current conversation)
  ④ Matched knowledge plugins   (keyword → vector → Cohere rerank, max 3)
])
    │
    ▼
Enriched System Prompt → Claude Opus 4.6
    │
    ▼
Response + Automatic Knowledge Extraction → New memories stored</div>

    <p>The final step is critical: after every response, <strong>knowledge extraction runs automatically</strong>. New facts, decisions, metrics, and relationships discovered during the conversation are persisted back to Redis memory &mdash; closing the loop and ensuring the agent&rsquo;s knowledge base grows with every single interaction.</p>

    <h2>Per-Department Memory Scopes</h2>
    <table>
      <tr><th>Department</th><th>Memory Categories</th><th>Access</th></tr>
      <tr><td><strong>Executive (EA)</strong></td><td>scheduling, communications, executive_decisions, meeting_notes, contacts, project_tracking, investor_relations, hiring</td><td>Own (rw) + All depts (r)</td></tr>
      <tr><td><strong>Finance (CFA)</strong></td><td>financial_metrics, fundraising, company_operations, strategic_decisions, investor_relations, financial_model</td><td>Own (rw) + Global (r)</td></tr>
      <tr><td><strong>Operations (COA)</strong></td><td>process_management, vendor_tracking, hr_pipeline, capacity_planning, change_management</td><td>Own (rw) + All depts (r)</td></tr>
      <tr><td><strong>Marketing (CMA)</strong></td><td>content_strategy, campaigns, brand_guidelines, seo_analytics, audience_research</td><td>Own (rw) + Global (r)</td></tr>
      <tr><td><strong>Legal</strong></td><td>contracts, compliance_tracking, ip_portfolio, regulatory, policy</td><td>Own (rw) + Global (r)</td></tr>
      <tr><td><strong>Sales</strong></td><td>deal_pipeline, prospect_research, call_transcripts, objections, competitive_intel</td><td>Own (rw) + Global (r)</td></tr>
      <tr><td><strong>Compliance (CCO)</strong></td><td>audit_log, policy_register, risk_assessment, governance_actions</td><td>Own (rw) + All depts (r)</td></tr>
    </table>

    <div class="callout">
      <strong>Why This Is a Moat:</strong> Persistent memory is not a feature &mdash; it is a <em>compounding asset</em>. Every day the WaaS workforce operates, its institutional memory grows deeper and more interconnected. A competitor deploying stateless agents tomorrow would need months of operation to match the knowledge depth that WaaS agents have already accumulated. The longer the platform runs, the wider the intelligence gap becomes. This is synthetic compounding intelligence &mdash; and it is the single most defensible advantage of the WaaS architecture.
    </div>
  `;
}

function renderPlugins(): string {
  return `
    <div class="pb"></div>
    <p class="sec">08 &mdash; Knowledge-Work Plugins</p>
    <h1>115 Domain Skills — Purpose-Built for Agentic Employees</h1>
    <p>Anthropic&rsquo;s Knowledge-Work Plugins library is the domain intelligence layer that transforms generic LLM agents into specialized cognitive employees. Each plugin is a curated skill (~2&ndash;3K tokens of domain expertise, best practices, workflows, and structured output templates) loaded on-demand into the agent&rsquo;s system prompt &mdash; giving it the equivalent of years of departmental training in the exact domain it needs, exactly when it needs it.</p>

    <div class="callout">
      <strong>Why This Library Is a Perfect Fit for WaaS</strong><br/>
      WaaS agents aren&rsquo;t chatbots &mdash; they are <em>cognitive employees</em> with job descriptions, reporting chains, and departmental responsibilities. Knowledge-work plugins mirror exactly how real employees develop expertise: a CFO analyst doesn&rsquo;t study marketing; a sales lead doesn&rsquo;t need compliance training. Each WaaS agent receives a <strong>role-specific build</strong> of the plugin library, curated to its department and responsibilities. The result: agents that don&rsquo;t just answer questions, but operate with genuine domain fluency.
    </div>

    <h2>Role-Specific Plugin Builds</h2>
    <p>Every agent in the WaaS network receives a custom subset of the 115-skill library, selected to match its departmental function. This isn&rsquo;t blanket knowledge &mdash; it&rsquo;s precision allocation that ensures each agent has deep expertise in its domain without knowledge bleed from unrelated departments.</p>

    <table>
      <tr><th>Agent</th><th>Role</th><th>Plugin Domains</th><th>Skills</th><th>Rationale</th></tr>
      <tr><td><strong>Alex (EA)</strong></td><td>Executive Assistant</td><td>17 domains (full library)</td><td>84</td><td>Cross-functional visibility &mdash; must understand every department to coordinate across the org</td></tr>
      <tr><td><strong>Morgan (CFA)</strong></td><td>Chief Financial Agent</td><td>6 domains</td><td>31</td><td>Deep finance + data + legal expertise; brand-voice for investor communications</td></tr>
      <tr><td>Jordan (COA)</td><td>Chief Operating Agent</td><td>8 domains</td><td>&mdash;</td><td>Operations + engineering + HR for workforce management and cross-dept synthesis</td></tr>
      <tr><td>Riley (IR)</td><td>Investor Relations</td><td>7 domains</td><td>&mdash;</td><td>Sales + finance + data for investor pipeline management and outreach</td></tr>
      <tr><td>Taylor (CMA)</td><td>Chief Marketing Agent</td><td>7 domains</td><td>&mdash;</td><td>Marketing + brand-voice + design for content strategy and brand consistency</td></tr>
      <tr><td>Compliance</td><td>Chief Compliance Agent</td><td>6 domains</td><td>&mdash;</td><td>Legal + operations + finance for regulatory compliance and audit readiness</td></tr>
      <tr><td>Casey (Legal)</td><td>Legal Counsel</td><td>5 domains</td><td>&mdash;</td><td>Legal-focused with operations context for contract and compliance work</td></tr>
      <tr><td>Sam (Sales)</td><td>Head of Sales</td><td>8 domains</td><td>&mdash;</td><td>Sales + CRM + marketing + customer-support for full-cycle deal management</td></tr>
    </table>

    <h2>3-Stage Resolution Pipeline</h2>
    <p>Plugins are not pre-loaded &mdash; they are matched to each query in real-time through a 3-stage pipeline that ensures only the most relevant skills consume context window budget.</p>
    <div class="diagram">User Query → Tokenize
    │
    ▼
Stage 1: Keyword Pre-filter     (score query tokens against skill keywords)
    │
    ▼
Stage 2: Redis Vector Re-rank   (KNN search on idx:plugins, filter to candidates)
    │
    ▼
Stage 3: Cohere Cross-encoder   (Rerank v4.0 for final scoring)
    │
    ▼
Top 3 skills (max 4,000 tokens) → injected into system prompt</div>

    <div class="callout-dark">
      <strong>Zero Overhead When Inactive:</strong> Each skill is pure markdown loaded only when matched. Conversation-aware caching prevents re-injecting active skills. Budget enforcement (max 3 skills, 4,000 tokens) ensures the context window is never flooded. The enrichment pipeline runs via Promise.allSettled &mdash; if plugin matching fails, the agent still responds with full tool access and memory.
    </div>

    <h2>Plugin Categories</h2>
    <p><strong>19 categories total:</strong> 15 Anthropic first-party (productivity, sales, customer-support, product-management, marketing, legal, finance, data, enterprise-search, bio-research, engineering, design, human-resources, operations, cowork-plugin-management) + 4 partner-built (apollo, brand-voice, common-room, slack-by-salesforce). Each category contains 3&ndash;12 individual skills covering workflows, best practices, structured output templates, and domain-specific reasoning patterns.</p>
  `;
}

function renderToolEcosystem(): string {
  return `
    <div class="pb"></div>
    <p class="sec">09 &mdash; Tool Ecosystem</p>
    <h1>Callable Tools + Knowledge Plugins</h1>
    <p>Every agent in the WaaS network operates with two distinct capability layers: <strong>callable tools</strong> are functions the agent executes directly (database writes, API calls, PDF generation, web search), while <strong>knowledge plugins</strong> are domain expertise injected into the system prompt on-demand. The combination gives each agent both the ability to <em>act</em> and the intelligence to act <em>well</em>.</p>

    <h2>Tool Architecture</h2>
    <p>Tools are org-scoped via closure &mdash; each agent&rsquo;s tool factory receives the organization ID and every database query, memory write, and API call is automatically scoped. Tools can be implemented as:</p>
    <ul>
      <li><strong>MCP Tools</strong> (Claude Agent SDK) &mdash; Defined via the tool() function and served through a local MCP server. Used by agents requiring deep multi-step reasoning with Claude&rsquo;s native tool orchestration.</li>
      <li><strong>Native Anthropic API Tools</strong> (Tool Bridge) &mdash; Defined as Anthropic API Tool definitions with paired handler functions. Gives direct control over the agentic loop (configurable turn limits, custom retry logic).</li>
    </ul>

    <h2>Tool Domains Across the Network</h2>
    <table>
      <tr><th>Domain</th><th>Example Tools</th><th>Used By</th></tr>
      <tr><td><strong>Knowledge</strong></td><td>search (cross-namespace), save, add, update, delete, rate quality</td><td>All agents</td></tr>
      <tr><td><strong>Notion</strong></td><td>search, read, query database, create page, update page, append</td><td>All agents (scope-enforced)</td></tr>
      <tr><td><strong>Web Research</strong></td><td>web search (Sonar), web fetch, headless browser</td><td>All agents</td></tr>
      <tr><td><strong>Communications</strong></td><td>draft email, send Slack, create task, meeting notes</td><td>EA, COA, Sales, Marketing</td></tr>
      <tr><td><strong>Financial</strong></td><td>model get/upsert/delete, derived metrics, cap table CRUD</td><td>CFA, IR</td></tr>
      <tr><td><strong>Documents</strong></td><td>upload + vision, RAG hybrid search, PDF generation, Excel export</td><td>CFA, EA, Legal</td></tr>
      <tr><td><strong>Google Sheets</strong></td><td>populate model, read sheet, get info (service account)</td><td>CFA</td></tr>
      <tr><td><strong>Analytics</strong></td><td>natural language &rarr; SQL &rarr; chart suggestion</td><td>CFA, COA</td></tr>
      <tr><td><strong>Investor</strong></td><td>link CRUD, data room, engagement tracking</td><td>CFA, IR</td></tr>
      <tr><td><strong>CRM / Pipeline</strong></td><td>prospect research, lead enrichment, deal tracking</td><td>Sales, IR</td></tr>
      <tr><td><strong>Compliance</strong></td><td>policy check, audit log, governance review</td><td>CCO, Legal</td></tr>
    </table>

    <p>Each agent receives only the tool domains relevant to its role. The @waas/runtime engine handles tool registration, scope enforcement, and execution &mdash; new tools can be added to any agent without modifying the runtime.</p>

    <div class="callout">
      <strong>Tools + Plugins = Complete Agent Capability.</strong> Tools give agents the ability to <em>do things</em> (write to databases, call APIs, generate files). Knowledge plugins give agents the intelligence to <em>know how</em> (domain best practices, workflows, structured output templates). A sales agent doesn&rsquo;t just have a &ldquo;draft email&rdquo; tool &mdash; it has the sales outreach plugin that teaches it <em>how</em> to write effective cold emails. This separation means tool sets can be shared across agents while plugin builds remain role-specific.
    </div>
  `;
}

function renderBoardOfDirectors(): string {
  return `
    <div class="pb"></div>
    <p class="sec">10 &mdash; Board of Directors (LLM Council)</p>
    <h1>Multi-Model Strategic Deliberation</h1>
    <p>Inspired by Karpathy&rsquo;s LLM Council pattern. A 4-stage deliberation engine using 5 models across 4 board seats plus 1 governance advisor. Strategic decisions receive independent perspectives before synthesis.</p>

    <div class="diagram">Stage 1: Parallel Analysis          Stage 2: Peer Review (optional)
┌─────────┐                         Each member reviews others'
│ Opus    │──┐                      responses (anonymized as A, B, C)
│ Gemini  │──┤                      and ranks by reasoning quality
│ Grok    │──┼──▶ 4 independent
│ Sonar   │──┘    analyses          Stage 3: Governance Brief
                                    Granite reviews all analyses for
Stage 4: Chairman Synthesis         regulatory, compliance, legal,
Opus synthesizes all perspectives   ethical, and risk blind spots
+ governance brief into the         → Produces advisory for chairman
  final executive decision</div>

    <table>
      <tr><th>Board Seat</th><th>Model</th><th>Role</th></tr>
      <tr><td>Chairman + Member</td><td>Claude Opus 4.6</td><td>Debates independently, then synthesizes all perspectives</td></tr>
      <tr><td>Member</td><td>Gemini 3.1 Pro</td><td>Multimodal analysis, search-grounded reasoning</td></tr>
      <tr><td>Member</td><td>Grok 4.1 Fast Reasoning</td><td>2M context for comprehensive analysis</td></tr>
      <tr><td>Member</td><td>Sonar Pro</td><td>Web-grounded, citation-backed analysis</td></tr>
      <tr><td>Governance Advisor</td><td>IBM Granite 4.0</td><td>Regulatory/compliance review before synthesis</td></tr>
    </table>

    <div class="callout-dark">
      <strong>&ldquo;Model diversity IS the perspective diversity.&rdquo;</strong> No artificial role-playing prompts &mdash; different training data, different RLHF, different worldviews baked in at the foundation level. Default quorum: 3 of 4 members must respond. High-stakes: 4 of 4 with peer review enabled (120s timeout).
    </div>
  `;
}

function renderInterAgentComms(): string {
  return `
    <p class="sec">11 &mdash; Inter-Agent Communication</p>
    <h1>Scope-Checked MessageBus</h1>
    <p>The MessageBus is the communication backbone for the C-Suite. Every message is scope-checked against the sender&rsquo;s canMessage whitelist. Upward escalation bypasses scope checks &mdash; agents can always escalate to their reporting chain.</p>

    <div class="diagram">Agent A ──▶ MessageBus.send(message)
                    │
                    ▼
              Scope Check (canMessage?)
                    │
                    ▼
              Persist to Redis (RPUSH + LTRIM, atomic)
                    │
                    ▼
              Transport.send() ──▶ Telegram Bot API
                    │
                    ▼
              Agent B receives via webhook</div>

    <h3>Key Features</h3>
    <ul>
      <li><strong>Request-Response</strong> &mdash; Synchronous inter-agent queries with 30-second timeout and reply-chain matching</li>
      <li><strong>Escalation</strong> &mdash; Issues flow up the chain of command automatically, bypassing canMessage scope</li>
      <li><strong>Broadcast</strong> &mdash; Send to multiple recipients with per-target scope checking</li>
      <li><strong>Thread Reconstruction</strong> &mdash; Redis LIST-based tracking with automatic reply chain linking</li>
      <li><strong>Atomic Inbox</strong> &mdash; RPUSH + LTRIM (max 500 messages, no read-modify-write races). 7-day TTL.</li>
      <li><strong>Transport Abstraction</strong> &mdash; Injectable MessageTransport interface; Telegram primary, supports Slack DMs and email</li>
    </ul>
  `;
}

function renderDepartmentInfrastructure(): string {
  return `
    <div class="pb"></div>
    <p class="sec">12 &mdash; Department Infrastructure</p>
    <h1>Three-Layer Organizational Workspace</h1>
    <p>Each department doesn&rsquo;t just get an agent &mdash; it gets a complete <strong>organizational infrastructure</strong> across three layers: real-time communication channels, asynchronous collaboration workspaces, and isolated cloud environments. This mirrors how physical companies organize &mdash; every department has its own Slack channels, its own file systems, and its own tools &mdash; except here it&rsquo;s all purpose-built for AI agents.</p>

    <div class="diagram" style="font-size:8.5pt">
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 1: REAL-TIME COMMUNICATION                                    │
│  ──────────────────────────────────────                              │
│                                                                      │
│  Telegram (Agent-to-Human)           Slack (Agent-to-Agent + Human)  │
│  ┌──────────────────────┐            ┌──────────────────────┐        │
│  │ @alex_ea_bot          │            │ #blockdrive-ea       │        │
│  │ @morgan_cfa_bot       │            │ #blockdrive-cfa      │        │
│  │ @jordan_coa_bot       │            │ #blockdrive-coa      │        │
│  │ @taylor_cma_bot       │            │ #blockdrive-cma      │        │
│  │ @casey_legal_bot      │            │ #blockdrive-legal    │        │
│  │ @sam_sales_bot        │            │ #blockdrive-sales    │        │
│  │ @compliance_cco_bot   │            │ #blockdrive-compliance│       │
│  └──────────────────────┘            │ #blockdrive-executive │        │
│  1 bot per agent, whitelisted        │ #blockdrive-board     │        │
│  chat IDs for security              └──────────────────────┘        │
│                                      Department-segregated channels   │
│                                      + cross-cutting exec channels   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 2: ASYNCHRONOUS COLLABORATION (Notion)                        │
│  ──────────────────────────────────────────                          │
│                                                                      │
│  Each department gets scoped Notion databases:                       │
│                                                                      │
│  Executive    │ Decision Log, Project Hub, Meeting Notes             │
│  Finance      │ Financial Models, Cap Table, Investor Pipeline       │
│  Operations   │ Process Library, Vendor Tracker, HR Pipeline         │
│  Marketing    │ Content Calendar, Campaign Tracker, Brand Guide      │
│  Legal        │ Contract Register, Compliance Log, IP Portfolio      │
│  Sales        │ Deal Pipeline, Prospect Research, Call Transcripts   │
│                                                                      │
│  Scope-enforced: agents can only read/write databases in their ACL  │
│  EA has executive-tier read access across all department databases   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 3: CLOUD WORKSPACE ("Office Space")                           │
│  ──────────────────────────────────────────                          │
│                                                                      │
│  Each department operates in an isolated cloud environment:          │
│                                                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────┐  │
│  │  Redis       │ │  Redis       │ │  Supabase    │ │  Model Stack │  │
│  │  Namespace   │ │  Memory      │ │  RLS Scope   │ │  Per-Agent   │  │
│  │             │ │             │ │             │ │              │  │
│  │ cfa:*       │ │ cfa memories │ │ org-scoped   │ │ Opus+CmdA+  │  │
│  │ ea:*        │ │ ea memories  │ │ role-based   │ │  Grok Fast   │  │
│  │ coa:*       │ │ coa memories │ │ table ACLs   │ │ (per agent)  │  │
│  │ ...         │ │ ...          │ │              │ │              │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └──────────────┘  │
│                                                                      │
│  ScopedRedisClient + ScopedMemoryClient auto-prefix all keys          │
│  Cross-department access denied by default (fail-closed)            │
│  Executive tier (EA, COA) gets read-only cross-namespace access     │
└──────────────────────────────────────────────────────────────────────┘</div>

    <h2>Per-Department Infrastructure Matrix</h2>
    <table>
      <tr><th>Department</th><th>Telegram Bot</th><th>Slack Channel</th><th>Redis Prefix</th><th>Notion Databases</th><th>Memory Scope</th></tr>
      <tr><td><strong>Executive (EA)</strong></td><td>@alex_ea_bot</td><td>#blockdrive-ea</td><td>blockdrive:ea:*</td><td>Decision Log, Project Hub</td><td>All (read), EA (rw)</td></tr>
      <tr><td><strong>Finance (CFA)</strong></td><td>@morgan_cfa_bot</td><td>#blockdrive-cfa</td><td>blockdrive:cfa:*</td><td>Financial Models, Pipeline</td><td>CFA (rw), Global (r)</td></tr>
      <tr><td><strong>Operations (COA)</strong></td><td>@jordan_coa_bot</td><td>#blockdrive-coa</td><td>blockdrive:coa:*</td><td>Process Library, HR Pipeline</td><td>All (read), COA (rw)</td></tr>
      <tr><td><strong>Marketing (CMA)</strong></td><td>@taylor_cma_bot</td><td>#blockdrive-cma</td><td>blockdrive:cma:*</td><td>Content Calendar, Campaigns</td><td>CMA (rw), Global (r)</td></tr>
      <tr><td><strong>Legal</strong></td><td>@casey_legal_bot</td><td>#blockdrive-legal</td><td>blockdrive:legal:*</td><td>Contract Register, Compliance</td><td>Legal (rw), Global (r)</td></tr>
      <tr><td><strong>Sales</strong></td><td>@sam_sales_bot</td><td>#blockdrive-sales</td><td>blockdrive:sales:*</td><td>Deal Pipeline, Prospects</td><td>Sales (rw), Global (r)</td></tr>
      <tr><td><strong>Compliance (CCO)</strong></td><td>@compliance_cco_bot</td><td>#blockdrive-compliance</td><td>blockdrive:compliance:*</td><td>Audit Log, Policy Register</td><td>All (read), CCO (rw)</td></tr>
    </table>

    <div class="callout-dark">
      <strong>Why Three Layers?</strong> Real companies don&rsquo;t run on one communication tool. Telegram provides instant, mobile-friendly human-to-agent interaction (like texting a colleague). Slack provides structured, department-organized collaboration channels (like an office chat). And the cloud workspace (Redis + Supabase + Notion) provides the actual &ldquo;office space&rdquo; where agents do their deep work &mdash; querying databases, managing knowledge, executing tools, and building persistent memory. Each layer is department-segregated and scope-enforced.
    </div>
  `;
}

function renderDeployment(): string {
  return `
    <div class="pb"></div>
    <p class="sec">13 &mdash; Deployment &amp; Infrastructure</p>
    <h1>Production Environment</h1>

    <table>
      <tr><th>Service</th><th>Platform</th><th>Details</th><th>Status</th></tr>
      <tr><td>Frontend</td><td>Vercel (auto-build)</td><td>React app, corp.blockdrive.co</td><td><span class="badge badge-live">LIVE</span></td></tr>
      <tr><td>Agent Fleet</td><td>DigitalOcean App Platform</td><td>Docker containers, each agent on its own port with dedicated ingress</td><td><span class="badge badge-live">LIVE</span> (2 of 8)</td></tr>
      <tr><td>Redis 8.4</td><td>Docker Compose</td><td>3 RediSearch indexes (plugins, documents, LLM cache)</td><td><span class="badge badge-live">LIVE</span></td></tr>
      <tr><td>n8n Automation</td><td>DigitalOcean Droplet</td><td>Cross-agent workflow orchestration hub</td><td><span class="badge badge-live">LIVE</span></td></tr>
      <tr><td>Supabase</td><td>Supabase Cloud</td><td>Postgres + Auth + RLS + Edge Functions + Storage</td><td><span class="badge badge-live">LIVE</span></td></tr>
    </table>

    <div class="callout">
      <strong>Agent Deployment Model:</strong> Each agent deploys as an independent Docker container on DigitalOcean App Platform with its own port and ingress path. The @waas/runtime engine means deploying a new department agent requires only: (1) define the agent config in @waas/shared, (2) create a thin entry point that instantiates AgentRuntime with the config, (3) push to GitHub for auto-deploy. No infrastructure changes needed.
    </div>

    <h2>Infrastructure Components</h2>
    <div class="cols">
      <div class="col">
        <h3>Redis 8.4 (Vector Search + Cache)</h3>
        <p>Three RediSearch indexes with 768-dimensional HNSW vectors:</p>
        <ul>
          <li><strong>idx:plugins</strong> &mdash; Skill vector matching for plugin resolution</li>
          <li><strong>idx:documents</strong> &mdash; Document RAG with hybrid search</li>
          <li><strong>idx:llm_cache</strong> &mdash; Semantic caching of model responses</li>
        </ul>
      </div>
      <div class="col">
        <h3>Cloudflare AI Gateway</h3>
        <p>Optional LLM proxy providing:</p>
        <ul>
          <li>Request/response logging and cost analytics</li>
          <li>Rate limiting and caching at the edge</li>
          <li>Provider Keys mode &mdash; API keys injected at edge, never leave the server</li>
        </ul>
      </div>
    </div>
  `;
}

function renderTechStack(): string {
  return `
    <p class="sec">14 &mdash; Technology Stack</p>
    <h1>Full Stack Summary</h1>

    <table>
      <tr><th>Layer</th><th>Technology</th><th>Purpose</th></tr>
      <tr><td>Frontend</td><td>React 18, TypeScript, Vite, Tailwind, shadcn/ui, Recharts</td><td>Dashboard, chat, financial modeling</td></tr>
      <tr><td>Agent Runtime</td><td>Express, @waas/runtime, Claude Agent SDK, Anthropic Messages API</td><td>Cognitive agent execution engine for all agents</td></tr>
      <tr><td>AI Models</td><td>Opus 4.6, Gemini 3.1 Pro, Sonar Pro/Deep, Command A, Granite 4.0, Grok 4.1</td><td>10 models across 4 providers, per-agent stacks</td></tr>
      <tr><td>Database</td><td>Supabase (Postgres + RLS + Auth)</td><td>Multi-tenant data, JWT auth, edge functions</td></tr>
      <tr><td>Memory</td><td>Redis Memory (vector search)</td><td>Persistent org memory, semantic retrieval, cross-namespace search</td></tr>
      <tr><td>Search/Cache</td><td>Redis 8.4 + RediSearch</td><td>Vector search, semantic cache, message bus, plugin matching</td></tr>
      <tr><td>Plugins</td><td>Knowledge-Work Plugins (Anthropic + partners)</td><td>115 domain skills, 3-stage resolution, per-agent builds</td></tr>
      <tr><td>Communication</td><td>grammy (Telegram), Slack SDK</td><td>Per-agent bots, department channels</td></tr>
      <tr><td>Voice (Phase 2)</td><td>ElevenLabs + Twilio</td><td>Conversational runtime, TTS/STT, batch calling, sales swarm</td></tr>
      <tr><td>AI Gateway</td><td>Cloudflare Workers AI</td><td>LLM proxy, cost analytics, Provider Keys</td></tr>
      <tr><td>Automation</td><td>n8n</td><td>Cross-agent workflow orchestration</td></tr>
      <tr><td>Deployment</td><td>Vercel + DigitalOcean App Platform</td><td>Auto-deploy from GitHub, Docker containers</td></tr>
    </table>
  `;
}

function renderUnitEconomics(): string {
  return `
    <div class="pb"></div>
    <p class="sec">15 &mdash; Unit Economics</p>
    <h1>AI Workforce vs. Human Equivalent</h1>

    <p>Every WaaS agent runs on a per-agent cost structure composed of five components: primary model (Opus 4.6), support models, embeddings + reranking, shared infrastructure, and persistent memory. Costs scale linearly with interaction volume, not headcount.</p>

    <h2>Per-Agent Cost Breakdown (Monthly)</h2>
    <table>
      <tr><th>Component</th><th>Executive Tier</th><th>Department Head</th><th>Junior Agent</th><th>Voice Rep</th></tr>
      <tr>
        <td><strong>Primary Model</strong> (Opus 4.6)</td>
        <td>~$360</td>
        <td>~$215</td>
        <td>~$108</td>
        <td>~$108</td>
      </tr>
      <tr>
        <td><strong>Support Models</strong> (Gemini, Sonar, Grok, etc.)</td>
        <td>~$30</td>
        <td>~$20</td>
        <td>~$8</td>
        <td>~$8</td>
      </tr>
      <tr>
        <td><strong>Embeddings + Rerank</strong> (Cohere)</td>
        <td>~$5</td>
        <td>~$3</td>
        <td>~$1</td>
        <td>~$1</td>
      </tr>
      <tr>
        <td><strong>Infrastructure</strong> (DO, Redis, Supabase share)</td>
        <td>~$20</td>
        <td>~$15</td>
        <td>~$10</td>
        <td>~$10</td>
      </tr>
      <tr>
        <td><strong>Memory</strong> (Redis persistent memory)</td>
        <td>~$15</td>
        <td>~$10</td>
        <td>~$5</td>
        <td>~$5</td>
      </tr>
      <tr>
        <td><strong>Voice</strong> (ElevenLabs + Twilio)</td>
        <td>&mdash;</td>
        <td>&mdash;</td>
        <td>&mdash;</td>
        <td>~$200</td>
      </tr>
      <tr style="font-weight:bold;border-top:2px solid ${C.heading}">
        <td>Total per Agent</td>
        <td style="color:${C.heading}">~$430/mo</td>
        <td style="color:${C.heading}">~$263/mo</td>
        <td style="color:${C.heading}">~$132/mo</td>
        <td style="color:${C.heading}">~$332/mo</td>
      </tr>
    </table>

    <p style="font-size:9pt;color:${C.muted}">Estimates based on actual model pricing from the WaaS model registry. Executive tier assumes ~100 daily interactions; department heads ~60; juniors ~30. Opus 4.6: $15/$75 per million input/output tokens. Support models range $0.20&ndash;$15 per million tokens.</p>

    <h2>Full Workforce Cost Estimate</h2>
    <table>
      <tr><th>Role</th><th>Tier</th><th>Count</th><th>Cost / Agent</th><th>Monthly Total</th></tr>
      <tr><td>Executive Assistant (Alex)</td><td>Executive</td><td>1</td><td>$430</td><td>$430</td></tr>
      <tr><td>Chief Operating Agent (Jordan)</td><td>Executive</td><td>1</td><td>$430</td><td>$430</td></tr>
      <tr><td>Department Heads (CFA, CMA, IR, Legal, Sales, Compliance)</td><td>Department Head</td><td>6</td><td>$263</td><td>$1,578</td></tr>
      <tr><td>Junior Analysts &amp; Associates</td><td>Junior</td><td>15</td><td>$132</td><td>$1,980</td></tr>
      <tr><td>Voice Sales Reps</td><td>Voice</td><td>10</td><td>$332</td><td>$3,320</td></tr>
      <tr><td>Shared Infrastructure (Supabase, Redis, n8n, DO)</td><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td><td>$600</td></tr>
      <tr style="font-weight:bold;border-top:2px solid ${C.heading}">
        <td colspan="3">Total AI Workforce (33 agents)</td>
        <td>&mdash;</td>
        <td style="color:${C.heading};font-size:13pt">~$8,338/mo</td>
      </tr>
    </table>

    <h2>Human Equivalent Comparison</h2>
    <table>
      <tr><th>Role</th><th>Count</th><th>Human Salary (monthly)</th><th>Human Total</th><th>AI Cost</th></tr>
      <tr><td>Executive Assistant</td><td>1</td><td>$5,000&ndash;$6,700</td><td>$5,850</td><td>$430</td></tr>
      <tr><td>COO / VP Operations</td><td>1</td><td>$12,500&ndash;$18,300</td><td>$15,400</td><td>$430</td></tr>
      <tr><td>CFO</td><td>1</td><td>$16,700&ndash;$25,000</td><td>$20,850</td><td>$263</td></tr>
      <tr><td>CMO</td><td>1</td><td>$14,200&ndash;$20,800</td><td>$17,500</td><td>$263</td></tr>
      <tr><td>VP Investor Relations</td><td>1</td><td>$10,800&ndash;$16,700</td><td>$13,750</td><td>$263</td></tr>
      <tr><td>General Counsel</td><td>1</td><td>$16,700&ndash;$29,200</td><td>$22,950</td><td>$263</td></tr>
      <tr><td>VP Sales</td><td>1</td><td>$12,500&ndash;$20,800</td><td>$16,650</td><td>$263</td></tr>
      <tr><td>Chief Compliance Officer</td><td>1</td><td>$12,500&ndash;$18,300</td><td>$15,400</td><td>$263</td></tr>
      <tr><td>Junior Analysts / Associates</td><td>15</td><td>$4,600&ndash;$6,700 ea</td><td>$84,750</td><td>$1,980</td></tr>
      <tr><td>Sales Development Reps</td><td>10</td><td>$4,200&ndash;$5,800 ea</td><td>$50,000</td><td>$3,320</td></tr>
      <tr style="font-weight:bold;border-top:2px solid ${C.heading}">
        <td>Total</td>
        <td>33</td>
        <td>&mdash;</td>
        <td style="color:#C0392B;font-size:13pt">~$263,100/mo</td>
        <td style="color:${C.heading};font-size:13pt">~$8,338/mo</td>
      </tr>
    </table>

    <div class="kpi-bar">
      <div class="kpi"><span class="kpi-val">$8.3K</span><span class="kpi-label">AI Workforce / Month</span></div>
      <div class="kpi"><span class="kpi-val">$263K</span><span class="kpi-label">Human Equivalent / Month</span></div>
      <div class="kpi"><span class="kpi-val">96.8%</span><span class="kpi-label">Cost Reduction</span></div>
      <div class="kpi"><span class="kpi-val">$3.1M</span><span class="kpi-label">Annual Savings</span></div>
    </div>

    <div class="callout">
      <strong>Why This Matters for Investors:</strong> The 33-agent AI workforce delivers a functional equivalent of a $3.2M/year human team for under $100K/year &mdash; a <strong>32x cost advantage</strong>. Unlike human teams, AI agents operate 24/7 with zero vacation, zero turnover, and zero ramp time. Every new agent deployed compounds the network&rsquo;s intelligence through shared persistent memory. As model costs continue declining (OpenAI and Anthropic pricing has dropped 70-90% over the past two years), the economics only improve.
    </div>

    <h2>Cost Scaling Dynamics</h2>
    <div class="cols">
      <div class="col">
        <h3>Linear Cost, Exponential Value</h3>
        <ul>
          <li>Each new agent adds a fixed marginal cost (~$130&ndash;$430/mo)</li>
          <li>But intelligence compounds &mdash; every agent reads from the shared memory graph</li>
          <li>The 34th agent is smarter on day one than the 2nd agent was after a month</li>
          <li>No recruiting, training, or management overhead</li>
        </ul>
      </div>
      <div class="col">
        <h3>Model Cost Trajectory</h3>
        <ul>
          <li>Anthropic and OpenAI have reduced API pricing 70&ndash;90% since 2023</li>
          <li>Open-source models (Grok, Granite) provide near-zero-cost alternatives</li>
          <li>Semantic caching reduces redundant model calls by ~40%</li>
          <li>As costs decline, the same budget supports more agents or higher throughput</li>
        </ul>
      </div>
    </div>
  `;
}

function renderPlatformPackages(): string {
  return `
    <div class="pb"></div>
    <p class="sec">16 &mdash; Platform Packages</p>
    <h1>Shared Infrastructure</h1>

    <div class="cols">
      <div class="col">
        <h3>@waas/shared</h3>
        <p style="font-size:9pt;color:${C.muted}">Pure TypeScript types + logic. Zero runtime dependencies.</p>
        <ul>
          <li><strong>types.ts</strong> &mdash; AgentConfig, ModelStack, ToolScope, AgentMessage, VoiceConfig, BoardConfig</li>
          <li><strong>agents.ts</strong> &mdash; Agent registry (4 configured), hierarchy functions (getDirectReports, getChainOfCommand)</li>
          <li><strong>models/</strong> &mdash; MODEL_REGISTRY (10 models), per-agent stacks, ModelRouter with 4 provider clients, BoardSession</li>
          <li><strong>namespace/</strong> &mdash; 8 agent scopes, ScopeEnforcer (fail-closed), ScopedRedisClient, ScopedMemoryClient</li>
          <li><strong>messaging/</strong> &mdash; MessageBus with transport abstraction, routing, inbox, threads, escalation</li>
          <li><strong>plugins.ts</strong> &mdash; 19 plugin categories, per-agent allocation mapping</li>
        </ul>
      </div>
      <div class="col">
        <h3>@waas/runtime</h3>
        <p style="font-size:9pt;color:${C.muted}">Express-based agent execution engine.</p>
        <ul>
          <li><strong>AgentRuntime</strong> &mdash; One-stop agent bootstrap: Express server, middleware, routes, lifecycle, graceful shutdown</li>
          <li><strong>Auth middleware</strong> &mdash; Supabase JWT verification + org membership + 5-minute token cache (500 entries)</li>
          <li><strong>Chat route</strong> &mdash; SSE streaming with memory-enriched system prompt</li>
          <li><strong>Health route</strong> &mdash; Agent status and readiness endpoint</li>
          <li><strong>Telegram transport</strong> &mdash; grammy-based bot for inter-agent messaging</li>
          <li><strong>Plugin loader</strong> &mdash; resolveSkills, resolveSkillsForConversation, getSkillContext</li>
          <li><strong>Clients</strong> &mdash; Redis, memory, stream adapter</li>
        </ul>
      </div>
    </div>
  `;
}

function renderStatusRoadmap(): string {
  return `
    <p class="sec">17 &mdash; Status &amp; Roadmap</p>
    <h1>Current State</h1>

    <div class="cols">
      <div class="col">
        <h3>Deployed &amp; Operational</h3>
        <ul>
          <li>EA agent &ldquo;Alex&rdquo; &mdash; Telegram + web, 11 callable tools + 84 knowledge plugins</li>
          <li>CFO agent &ldquo;Morgan&rdquo; &mdash; Web dashboard, 31 callable tools + 31 knowledge plugins</li>
          <li>React 18 frontend &mdash; 9 routes (chat, model, dashboard, investors, knowledge, docs, settings)</li>
          <li>Supabase multi-tenant &mdash; RLS, auth, edge functions</li>
          <li>Redis persistent memory &mdash; 15 categories, cross-namespace search</li>
          <li>Notion integration &mdash; 4 tools per agent, scope-enforced</li>
          <li>PDF generation &mdash; Playwright HTML&rarr;PDF, branded templates</li>
          <li>Google Sheets &mdash; Service account with domain-wide delegation</li>
          <li>@waas/shared + @waas/runtime &mdash; Platform packages ready</li>
        </ul>
      </div>
      <div class="col">
        <h3>Next Milestones</h3>
        <ul>
          <li>COA agent &ldquo;Jordan&rdquo; &mdash; Workforce management, cross-dept synthesis</li>
          <li>Remaining department heads &mdash; CMA, Compliance, Legal, Sales</li>
          <li>Voice integration (Phase 2) &mdash; ElevenLabs + Twilio for dual-mode agents</li>
          <li>Sales swarm &mdash; 10 voice sales reps under Sam</li>
          <li>Google Calendar + Slack for EA &mdash; Scheduling, channel monitoring</li>
          <li>Inter-agent messaging &mdash; Real tool calls replacing Telegram relay</li>
          <li>Board of Directors &mdash; Multi-model deliberation for strategic decisions</li>
          <li>n8n automation workflows &mdash; 8 cross-agent orchestration flows</li>
        </ul>
      </div>
    </div>

    <div class="metric-row">
      <div class="metric-card no-break"><div class="val">10</div><div class="lbl">AI Models</div></div>
      <div class="metric-card no-break"><div class="val">4</div><div class="lbl">Providers</div></div>
      <div class="metric-card no-break"><div class="val">42</div><div class="lbl">Callable Tools</div></div>
      <div class="metric-card no-break"><div class="val">115</div><div class="lbl">Knowledge Plugins</div></div>
      <div class="metric-card no-break"><div class="val">8</div><div class="lbl">Cognitive Agents</div></div>
      <div class="metric-card no-break"><div class="val">6-Dim</div><div class="lbl">Security Isolation</div></div>
    </div>
  `;
}

// ── Full HTML Page ──────────────────────────────────────────────────────────

function buildFullHtml(): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const body = [
    renderHero(),
    renderExecutiveSummary(),
    renderSystemArchitecture(),
    renderMultiModelStrategy(),
    renderAgentNetwork(),
    renderDualModeRuntime(),
    renderNamespaceIsolation(),
    renderMemorySystem(),
    renderPlugins(),
    renderToolEcosystem(),
    renderBoardOfDirectors(),
    renderInterAgentComms(),
    renderDepartmentInfrastructure(),
    renderDeployment(),
    renderTechStack(),
    renderUnitEconomics(),
    renderPlatformPackages(),
    renderStatusRoadmap(),
  ].join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>${css()}</style>
</head>
<body>
  <!-- Letterhead Header (fixed, repeats every page, lives in Playwright top margin) -->
  <div class="lh-header">
    <p class="lh-logo">BlockDrive</p>
    <hr class="lh-sep"/>
    <p class="lh-contact">
      <span>sean@blockdrive.co</span>
      <span class="lh-dot">&middot;</span>
      <span>app.blockdrive.co</span>
      <span class="lh-dot">&middot;</span>
      <span>${today}</span>
    </p>
  </div>

  <!-- Letterhead Footer (fixed, repeats every page, lives in Playwright bottom margin) -->
  <div class="lh-footer">
    <hr/>
    <p>BlockDrive, Inc. &nbsp;&middot;&nbsp; Cognitive Agent Infrastructure &nbsp;&middot;&nbsp; app.blockdrive.co</p>
  </div>

  <!-- Document Content -->
  ${body}
</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Generating WaaS Platform Architecture PDF...");

  const html = buildFullHtml();

  // Use Playwright for HTML → PDF
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });

    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "130px", right: "72px", bottom: "72px", left: "72px" },
    });

    const outputDir = join(import.meta.dirname ?? ".", "..", "output");
    mkdirSync(outputDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const time = new Date().toISOString().slice(11, 16).replace(":", "");
    const outputPath = join(outputDir, `waas-platform-architecture-${date}-${time}.pdf`);
    writeFileSync(outputPath, pdfBuffer);

    console.log(`PDF generated: ${outputPath} (${Math.round(pdfBuffer.length / 1024)} KB)`);
  } finally {
    await browser.close();
  }
}

// ── Exports (for Google Docs script) ─────────────────────────────────────────
export { C, css, buildFullHtml };

// Only generate PDF when run directly (not imported)
const runDirectly = process.argv[1]?.replace(/\\/g, "/").includes("generate-architecture-doc");
if (runDirectly) {
  main().catch((err) => {
    console.error("Failed to generate PDF:", err);
    process.exit(1);
  });
}
