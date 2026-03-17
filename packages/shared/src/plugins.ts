/**
 * Knowledge-Work-Plugin Mapping
 *
 * Maps Anthropic's knowledge-work-plugins to each agent. NO artificial caps —
 * plugins are pure markdown/JSON (~2-3K tokens per skill), load on-demand via
 * context matching, and add zero overhead when inactive. Install everything
 * that could be useful.
 *
 * Source: https://github.com/anthropics/knowledge-work-plugins
 *
 * Plugin categories:
 *   Anthropic first-party (15): productivity, sales, customer-support,
 *     product-management, marketing, legal, finance, data, enterprise-search,
 *     bio-research, engineering, design, human-resources, operations,
 *     cowork-plugin-management
 *   Partner-built (4): apollo, brand-voice, common-room, slack-by-salesforce
 */

// ─── Plugin Inventory ───────────────────────────────────────────────────────

/** All available plugins from the knowledge-work-plugins marketplace */
export const PLUGIN_INVENTORY = {
  // Anthropic first-party
  "productivity":           { skills: ["memory-management", "task-management"], commands: ["/start", "/update"] },
  "sales":                  { skills: ["account-research", "call-prep", "daily-briefing", "draft-outreach", "competitive-intelligence", "create-an-asset"], commands: ["/call-summary", "/forecast", "/pipeline-review"] },
  "customer-support":       { skills: ["ticket-triage", "customer-research", "response-drafting", "escalation", "knowledge-management"], commands: ["/triage", "/research", "/draft-response", "/escalate", "/kb-article"] },
  "product-management":     { skills: ["feature-spec", "roadmap-management", "stakeholder-comms", "user-research-synthesis", "competitive-analysis", "metrics-tracking"], commands: ["/write-spec", "/roadmap-update", "/stakeholder-update", "/synthesize-research", "/competitive-brief", "/metrics-review"] },
  "marketing":              { skills: ["content-creation", "campaign-planning", "brand-voice", "competitive-analysis", "performance-analytics"], commands: ["/draft-content", "/campaign-plan", "/brand-review", "/competitive-brief", "/performance-report", "/seo-audit", "/email-sequence"] },
  "legal":                  { skills: ["contract-review", "nda-triage", "compliance", "canned-responses", "legal-risk-assessment", "meeting-briefing"], commands: ["/review-contract", "/triage-nda", "/vendor-check", "/brief", "/respond"] },
  "finance":                { skills: ["journal-entry-prep", "reconciliation", "financial-statements", "variance-analysis", "close-management", "audit-support"], commands: ["/journal-entry", "/reconciliation", "/income-statement", "/variance-analysis", "/sox-testing"] },
  "data":                   { skills: ["sql-optimization", "data-profiling", "statistical-methods", "visualization-design", "quality-assurance", "dashboard-construction"], commands: ["/analyze", "/explore-data", "/write-query", "/create-viz", "/build-dashboard", "/validate"] },
  "enterprise-search":      { skills: ["search-strategy", "source-management", "knowledge-synthesis"], commands: ["/search", "/digest"] },
  "bio-research":           { skills: ["single-cell-rna-qc", "scvi-tools", "nextflow-pipelines", "instrument-to-allotrope", "scientific-problem-selection"], commands: [] },
  "engineering":            { skills: ["code-review", "incident-response", "system-design", "tech-debt", "testing-strategy", "documentation"], commands: ["/standup", "/review", "/debug", "/architecture", "/incident", "/deploy-checklist"] },
  "design":                 { skills: ["design-critique", "design-system-management", "ux-writing", "accessibility-review", "user-research", "design-handoff"], commands: ["/critique", "/design-system", "/handoff", "/ux-copy", "/accessibility", "/research-synthesis"] },
  "human-resources":        { skills: ["recruiting-pipeline", "employee-handbook", "compensation-benchmarking", "org-planning", "people-analytics", "interview-prep"], commands: ["/draft-offer", "/onboarding", "/performance-review", "/policy-lookup", "/comp-analysis", "/people-report"] },
  "operations":             { skills: ["vendor-management", "process-optimization", "change-management", "risk-assessment", "compliance-tracking", "resource-planning"], commands: ["/vendor-review", "/process-doc", "/change-request", "/capacity-plan", "/status-report", "/runbook"] },
  "cowork-plugin-management": { skills: ["cowork-plugin-customizer", "create-cowork-plugin"], commands: [] },

  // Partner-built
  "apollo":                 { skills: ["enrich-lead", "prospect", "sequence-load"], commands: ["/enrich-lead", "/prospect", "/sequence-load"] },
  "brand-voice":            { skills: ["discover-brand", "brand-voice-enforcement", "guideline-generation"], commands: ["/discover-brand", "/enforce-voice", "/generate-guidelines"] },
  "common-room":            { skills: ["account-research", "contact-research", "call-prep", "compose-outreach", "prospect", "weekly-prep-brief"], commands: ["/generate-account-plan", "/weekly-brief"] },
  "slack-by-salesforce":    { skills: [], commands: [] },
} as const;

export type PluginName = keyof typeof PLUGIN_INVENTORY;

// ─── Per-Agent Plugin Mapping ───────────────────────────────────────────────

/**
 * No artificial caps — install every plugin that could be useful.
 * Skills are <3K tokens each and load on-demand via context matching.
 * Even 10+ plugins per agent adds negligible overhead.
 */
export const AGENT_PLUGINS: Record<string, PluginName[]> = {
  // ── Executive Tier ──
  "blockdrive-ea": [
    "productivity",           // Memory management, task triage, daily briefings
    "enterprise-search",      // Cross-source knowledge synthesis, daily/weekly digests
    "operations",             // Resource planning, status reports, vendor oversight
    "product-management",     // Roadmap awareness, stakeholder comms for Sean
    "human-resources",        // Scheduling interviews, team planning
    "engineering",            // Standup summaries, deploy checklist awareness
    "slack-by-salesforce",    // Slack workspace interaction
  ],

  "blockdrive-coa": [
    "productivity",           // Task management, memory, workforce tracking
    "operations",             // Process optimization, change management, capacity planning
    "enterprise-search",      // Cross-department knowledge synthesis
    "product-management",     // Roadmap management, metrics tracking
    "engineering",            // System design awareness, incident routing
    "human-resources",        // Org planning, people analytics
    "data",                   // Dashboard construction for workforce analytics
    "finance",                // Budget oversight, financial awareness across departments
    "customer-support",       // Customer operations visibility for cross-dept coordination
    "slack-by-salesforce",    // Slack workspace management
  ],

  // ── Department Heads ──
  "blockdrive-cfa": [
    "productivity",           // Memory, task management
    "finance",                // Full financial suite: journal entries, reconciliation, variance, close, audit
    "data",                   // SQL optimization, data profiling, dashboards, statistical methods
    "enterprise-search",      // Knowledge synthesis across financial docs
    "operations",             // Vendor management (for financial vendors), compliance tracking
    "slack-by-salesforce",
  ],

  "blockdrive-ir": [
    "productivity",           // Memory, task management
    "sales",                  // Account research, call prep, competitive intelligence, daily briefing
    "finance",                // Financial statements understanding (read context)
    "enterprise-search",      // Investor research synthesis
    "common-room",            // Account research, contact research, outreach
    "data",                   // Data profiling, visualization for investor materials
    "slack-by-salesforce",
  ],

  "blockdrive-cma": [
    "productivity",           // Memory, task management
    "marketing",              // Full marketing suite: content, campaigns, brand, SEO, analytics
    "brand-voice",            // Brand discovery, enforcement, guideline generation
    "design",                 // Design critique, UX writing, accessibility
    "enterprise-search",      // Trend and competitive research synthesis
    "data",                   // Performance analytics, dashboards
    "sales",                  // Competitive intel, sales enablement content
    "product-management",     // Product launch content, feature awareness
    "slack-by-salesforce",
  ],

  "blockdrive-compliance": [
    "productivity",           // Memory, task management
    "legal",                  // Compliance skills (GDPR/CCPA/DPA), contract review, risk assessment
    "operations",             // Risk assessment, compliance tracking, process documentation
    "finance",                // Audit support, SOX testing awareness
    "enterprise-search",      // Cross-department compliance search
    "human-resources",        // Labor compliance, employment law, org policy
    "data",                   // GDPR/data governance, data quality auditing
    "slack-by-salesforce",
  ],

  "blockdrive-legal": [
    "productivity",           // Memory, task management
    "legal",                  // Full legal suite: contract review, NDA triage, compliance, risk assessment
    "enterprise-search",      // Legal research synthesis
    "operations",             // Vendor management (contract lifecycle)
    "finance",                // Financial contracts, investment agreement terms
    "human-resources",        // Employment law, labor agreements, HR policy
    "data",                   // Privacy regulations, data governance compliance
    "slack-by-salesforce",
  ],

  "blockdrive-sales": [
    "productivity",           // Memory, task management
    "sales",                  // Pipeline oversight, forecasting, team performance
    "enterprise-search",      // Cross-source knowledge synthesis
    "customer-support",       // Customer research for upsell strategy
    "product-management",     // Product knowledge for pitches, roadmap awareness
    "data",                   // Pipeline analytics, data-driven forecasting
    "slack-by-salesforce",
  ],

  "blockdrive-sdr": [
    "productivity",           // Memory, task management
    "sales",                  // Account research, call prep, outreach drafting
    "apollo",                 // Lead enrichment, ICP prospecting, sequence enrollment
    "common-room",            // Account/contact research, weekly prep briefs
    "marketing",              // Competitive analysis, sales enablement content
    "enterprise-search",      // Prospect research synthesis
    "customer-support",       // Customer research (existing customers for expansion)
    "data",                   // Prospect data profiling, pipeline analytics
    "slack-by-salesforce",
  ],

  // ── Junior Templates ──
  "research-junior": [
    "productivity",
    "enterprise-search",
    "data",
  ],

  "data-junior": [
    "productivity",
    "data",
    "finance",
  ],

  "compliance-junior": [
    "productivity",
    "legal",
    "operations",
  ],
};
