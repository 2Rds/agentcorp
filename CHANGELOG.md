# Changelog

All notable changes to the WaaS platform.

## [v1.1.0] - 2026-03-09

WaaS platform expansion: EA agent deployment, Notion integration for both agents, PDF generation for CFO agent, and multiple bug fixes.

### Added

- WaaS platform packages: `@waas/shared` (agent registry, model registry, namespace scopes, MessageBus, BoardSession) and `@waas/runtime` (Express agent execution engine, auth middleware, Telegram transport)
- EA Agent "Alex" — Anthropic Messages API with agentic tool loop (15 turns max), 7 native tools (knowledge search/save, tasks, meeting notes, email drafts, web search), cross-namespace mem0 read access
- Telegram bot transport for EA agent (`@alex_executive_assistant_bot`)
- Google service account auth for Sheets integration (domain-wide delegation)
- Atomic org creation RPC (`create_organization`) — single transaction for org + role + profile
- Notion API integration for CFO agent: 4 tools (`query_notion_database`, `create_notion_page`, `update_notion_page`, `append_notion_content`) with CFA_SCOPE enforcement
- Notion API integration for EA agent: 4 conditional tools (`search_notion`, `read_notion_page`, `create_notion_page`, `update_notion_page`) with executive-tier access
- PDF generation tool for CFO agent (`generate_investor_document`) — Playwright HTML→PDF with branded BlockDrive template, uploads to Supabase Storage with signed URL
- Metrics one-pager template for structured financial data → HTML rendering
- Notion config (`NOTION_API_KEY`) as optional env var for both agents
- EA database tables: `ea_tasks`, `ea_meeting_notes`, `ea_communications_log`
- Enrichment pipeline for EA: parallel mem0 + cross-namespace + session + skills loading

### Changed

- CFO agent now has 31 tools (26 → 31 with Notion + PDF), EA has 11 tools (7 → 11 with Notion) when Notion is enabled
- Comprehensive documentation update for WaaS platform + EA agent

### Fixed

- Investor link URL bug: `/share/:slug` → `/dataroom/:slug` (LinkCard + LinkDetailPanel)
- Investor agent model: Sonnet → Opus 4.6 (policy compliance)
- Documents vision fallback model: Sonnet → Opus 4.6 (policy compliance)
- Notion DB IDs in `scopes.ts` reconciled with workspace (Decision Log + Project Hub)
- EA Dockerfile COPY syntax for DigitalOcean App Platform build
- EA switched from Agent SDK to Anthropic Messages API (better tool loop control)
- `claude-opus-4-6` model ID (without date suffix)
- EA agent tool result handling: handlers return `string`, not `{ content, isError }`
- Stale mem0 user ID in `enforcement.ts`: `project-block-drive-vault` → `project-waas`

## [v1.0.0] - 2026-03-04

Initial public release. Full-featured AI CFO platform with multi-model orchestration, persistent memory, and native Supabase Auth.

### Added

- Claude Agent SDK server with 26 MCP tools across 9 domains (financial model, cap table, knowledge base, investor links, documents, document RAG, analytics, Google Sheets, web/browser)
- Multi-model orchestration via OpenRouter: Kimi K2.5, Gemini 3 Flash/Pro, Gemini 2.5 Flash Lite, DeepSeek V3.2/Speciale, Sonar Pro, Granite 4.0, Sonnet 4.6
- Mem0 persistent memory with graph relationships, 6 custom categories, multi-model attribution, and session memory
- Redis 8.4 vector search infrastructure with 3 indexes (plugins, documents, LLM cache)
- Semantic caching for deterministic model outputs (Kimi, Gemini, DeepSeek)
- 16 knowledge-work plugins with 3-stage resolution (keyword pre-filter, Redis vector re-rank, Cohere rerank)
- Cohere Rerank v3.5 cross-encoder integration for plugin loading and document RAG
- Financial model with SaaS template (10 acquisition channels, 3 revenue streams, full P&L)
- Client-side derived metrics: burn rate, runway, MRR, gross margin, monthly aggregates
- Scenario toggling (base/best/worst) with instant chart updates
- Cap table management with equity positions and round tracking
- DocSend-style investor links with password gating, email capture, expiry, and view tracking
- Public data room portal (`/dataroom/:slug`) with Q&A powered by investor agent
- Document uploads with Gemini vision processing and automatic knowledge extraction
- Document RAG via Redis hybrid search with Gemini + pgvector fallbacks
- Google Sheets integration (create, populate, read model sheets)
- Natural language to SQL analytics with chart suggestions
- Excel export with multi-tab workbook generation
- Knowledge graph visualization via Mem0 native graph API
- Cloudflare AI Gateway support for LLM proxy and cost analytics (optional)
- Edge function fallback when agent server is unreachable
- Vision-based reading for images and scanned PDFs
- Headless browser tool for JS-rendered pages
- Custom .xlsx upload and financial system integrations
- CLAUDE.md, hooks, and skills for Claude Code automation
- Comprehensive platform documentation page (`/docs`)
- Dual-verify consensus mechanism (Opus + DeepSeek)
- Batch processing for parallel model dispatch

### Changed

- Migrated from Clerk to native Supabase Auth (email+password)
- All RLS policies rewritten with `auth.uid()` (UUID) instead of `auth.jwt() ->> 'sub'` (TEXT)
- Agent server auth middleware uses `supabaseAdmin.auth.getUser()` with 5-minute TTL cache
- User/org data columns reverted from TEXT to UUID with FK constraints to `auth.users(id)`
- Migrated Supabase backend from Lovable Cloud to self-hosted project
- Replaced OpenAI npm SDK with native `fetch` to OpenRouter REST API
- Docker multi-stage build for TypeScript compilation

### Fixed

- Race condition in AuthContext session initialization (subscribe before getSession)
- Non-transactional org creation with rollback on partial failure
- Missing `.catch()` on `getSession()` in AuthContext
- Org lookup queries silently discarding errors and defaulting role
- signOut errors swallowed silently
- Auth/SignUp pages missing try-catch for network errors
- Missing `DROP TRIGGER IF EXISTS` in migration SQL
- Missing `UPDATE` policy for `user_roles` table
- Infinite re-render loop in Chat page
- RLS security vulnerabilities from multiple PR reviews
- SQL injection prevention in analytics queries
- Org-scoped storage access controls

### Removed

- `@clerk/clerk-react` and `@clerk/express` dependencies
- Clerk webhook edge function (`supabase/functions/clerk-webhook/`)
- Organization creation edge function (replaced by client-side flow)
- `clerk_org_id` column from organizations table
- `openai` npm SDK dependency
- `grok` model alias
