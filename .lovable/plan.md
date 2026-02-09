

# Financial Model Engine with Dynamic Dashboard

Build a structured financial data layer that serves as the single "source of truth" for the company's finances, with a dynamic dashboard that visualizes everything derived from that core model.

## Architecture Overview

The core idea: a single `financial_model` table stores the raw, editable assumptions and line items (revenue drivers, cost categories, headcount). A `cap_table_entries` table stores ownership data. The Dashboard page reads from these tables and dynamically computes all derived metrics (burn rate, runway, MRR growth, dilution) in real-time. When the agent updates the model through chat, every chart and metric on the dashboard instantly reflects the change.

## What Gets Built

### 1. Database Tables (Source of Truth)

**`financial_model`** -- stores every line item the CFO agent produces:
- `organization_id`, `category` (revenue, cogs, opex, headcount, funding), `subcategory` (e.g. "SaaS Revenue", "Engineering Salaries")
- `month` (date), `amount` (numeric), `formula` (text -- the reasoning/formula behind the number)
- `scenario` (base, best, worst) -- supports multi-scenario modeling
- RLS: org members can read; owner/cofounder can write

**`cap_table_entries`** -- stores each stakeholder's equity position:
- `organization_id`, `stakeholder_name`, `stakeholder_type` (founder, investor, option_pool, advisor)
- `shares`, `ownership_pct`, `investment_amount`, `share_price`
- `round_name` (e.g. "Pre-Seed", "Seed"), `date`
- RLS: same as financial_model

### 2. Dashboard Page (Dynamic Visualizations)

Replace the current placeholder with a real dashboard containing these sections, all computed client-side from the `financial_model` table:

- **Summary Cards**: Monthly Burn, Runway (months), Total Funding, MRR -- all derived from the model data
- **P&L Chart**: Stacked area chart showing revenue vs. expenses over time (from `financial_model` rows grouped by category)
- **Burn & Runway Chart**: Line chart of net burn per month with a projected runway marker
- **Revenue Breakdown**: Bar chart splitting revenue subcategories
- **Cap Table**: Visual pie chart + table from `cap_table_entries`, showing ownership distribution
- **Scenario Toggle**: Switch between base/best/worst case to see all charts update instantly

### 3. Data Hooks

- `useFinancialModel(orgId, scenario)` -- fetches and groups `financial_model` rows, computes derived metrics (burn, runway, MRR, totals)
- `useCapTable(orgId)` -- fetches cap table entries, computes dilution and totals

### 4. Agent Integration

Update the chat edge function's system prompt so the CFO agent knows it can write structured financial data. When the user asks to "build a 24-month model" or "update my cap table", the agent's knowledge extraction will store structured entries. This is a future enhancement -- for now the tables support manual entry and the dashboard reads whatever is there.

## Technical Details

### Database Migration SQL

Creates two new tables with RLS policies mirroring the existing pattern (using `is_org_member` and `has_role` functions).

### New Files
- `src/hooks/useFinancialModel.ts` -- fetch + compute derived metrics
- `src/hooks/useCapTable.ts` -- fetch cap table data
- `src/pages/Dashboard.tsx` -- complete rewrite with Recharts visualizations
- `src/components/dashboard/SummaryCards.tsx` -- burn, runway, MRR, funding cards
- `src/components/dashboard/PLChart.tsx` -- P&L area chart
- `src/components/dashboard/BurnRunwayChart.tsx` -- burn rate + runway line chart
- `src/components/dashboard/CapTableView.tsx` -- pie chart + table for equity
- `src/components/dashboard/ScenarioToggle.tsx` -- base/best/worst switcher

### Modified Files
- `src/components/AppSidebar.tsx` -- no changes needed, Dashboard route already exists
- `src/App.tsx` -- no changes needed, `/dashboard` route already exists

### Key Design Decisions
- All derived metrics (burn rate, runway, growth rates) are computed client-side from raw model data -- no duplicated storage
- Scenario toggle re-filters the same query, so switching is instant
- Charts use the existing Recharts + shadcn chart components already installed
- Cap table is separated from P&L because they are fundamentally different data structures
- Investor pipeline is intentionally excluded per your direction -- that belongs to a different agent

