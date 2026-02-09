

# CFO AI Agent — Seed Round Capital Raise Platform

## Overview
An AI-powered CFO assistant that orchestrates your seed round capital raise, built on Lovable (React frontend) with Supabase as the full-stack backend. The AI is powered by Claude Opus 4 via the Anthropic API through Supabase Edge Functions.

---

## Phase 1: Foundation & AI Chat

### AI Conversational Interface
- Full-featured chat interface (similar to ChatGPT/Claude) with markdown rendering, code blocks, and streaming responses
- Conversation history stored in Supabase with full context management
- System prompt engineered as a seed-round CFO specialist
- Edge function proxy to Anthropic API (Claude Opus 4) with your API key stored securely as a Supabase secret

### Authentication & User Roles
- Email/password and Google OAuth sign-in via Supabase Auth
- Role-based access system: **Owner**, **Co-founder**, **Advisor**, **Investor** (read-only with granular permissions)
- User profiles with organization context

### Dynamic Knowledge Base
- Conversations automatically update the AI's context/knowledge base stored in Supabase
- Upload documents (pitch decks, term sheets, financial data) that the AI can reference
- Knowledge base grows and refines with every interaction

---

## Phase 2: Financial Model Engine

### Template-Based Excel Workbook Generation
- Seed round financial model template with pre-built structure: Revenue model, COGS, OpEx, headcount plan, funding schedule
- AI fills in and customizes assumptions, formulas, and projections based on your conversations
- Bottom-up, formula-driven .xlsx file generated and downloadable
- Stored in Supabase Storage for versioning

### Interactive Dashboard (React)
- **Full Financial Suite**: P&L forecast, cash flow statement, balance sheet, burn rate & runway calculator, cap table visualization
- **Investor-Focused Metrics**: MRR/ARR projections, CAC & LTV, unit economics, cohort analysis, revenue waterfall
- Live visualization of the workbook data using Recharts
- Scenario modeling (best/base/worst case toggles)
- Dashboard syncs with the underlying model — change assumptions in chat, see dashboard update

---

## Phase 3: Document Management & Reports

### File Storage
- Supabase Storage buckets for financial workbooks, investor reports, pitch materials
- Version history for all generated documents
- AI-generated investor-ready financial reports exported as .docx
- Organized file library with tagging and search

### Report Generation
- One-click generation of investor-ready financial summaries
- Monthly/quarterly financial snapshots
- Custom report templates the AI can populate

---

## Phase 4: Investor Sharing & Analytics (DocSend-like)

### Granular Sharing & Access Control
- Share specific documents or dashboard views with individual investors via secure links
- Per-investor permission controls: which sections, metrics, and documents they can see
- Time-limited access links with optional password protection
- Revoke access instantly

### Investor Engagement Analytics
- Track who viewed what, when, and for how long (DocSend-style)
- Page-by-page time spent analytics for shared documents
- Engagement scoring per investor (frequency, depth, recency)
- Alert notifications when an investor views your materials
- Analytics dashboard showing investor interaction patterns and heat maps
- Identify most/least engaged investors to prioritize follow-ups

---

## Design & UX
- Clean, professional dark/light mode interface befitting financial tooling
- Left sidebar navigation: Chat, Dashboard, Documents, Investors, Settings
- Responsive design optimized for desktop use
- Real-time updates across all views

