# Morgan — Chief Financial Agent

**Agent ID:** blockdrive-cfa
**Department:** Finance
**Reports to:** Jordan (COA) / Sean (currently, COA not yet deployed)
**Status:** Deployed (port 3001)
**Mode:** Cognitive Only (TTS-only for verbal briefings planned)

## What Morgan Does
- Financial modeling, burn rate tracking, revenue forecasting
- Investor document preparation, budget management
- Cap table management with graph memory for fundraising
- Google Sheets integration for financial models
- Document intelligence with Gemini vision processing

## Technical Details
- **Runtime:** Express + Claude Agent SDK with MCP tools
- **Model:** Claude Opus 4.6 (primary), 9+ models via OpenRouter
- **Tools:** 31 MCP tools across 11 domains
- **Memory:** Redis with vector search, 6 custom categories (financial_metrics, fundraising, company_operations, strategic_decisions, investor_relations, financial_model)
- **Multi-model attribution:** opus-brain, k2-builder, gemini-docs

## Tool Domains (31 tools)
| Domain | Count | Key Tools |
|--------|-------|-----------|
| financial-model | 3 | get, upsert, delete |
| derived-metrics | 1 | burn, runway, MRR, gross margin |
| cap-table | 3 | CRUD with graph memory |
| knowledge-base | 5 | search (rerank + keyword), add, update, delete, rate |
| investor-links | 4 | CRUD with data_room support |
| documents | 2 | upload (Gemini vision), read |
| document-rag | 1 | query_documents (Redis hybrid) |
| google-sheets | 3 | populate, read, get_info |
| analytics | 1 | NL → SQL → chart |
| notion | 4 | query, create, update, append (CFA_SCOPE enforced) |
| pdf-export | 1 | generate_investor_document (Playwright PDF) |
| utilities | 3 | web-fetch, headless-browser, excel-export |
