# Changelog

All notable changes to the Chief Financial Agent platform.

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
