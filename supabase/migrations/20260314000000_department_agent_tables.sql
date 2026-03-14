-- COA Agent Tables
-- Chief Operating Agent — operational task queue, process tracking, agent messaging

-- Operational task queue
CREATE TABLE IF NOT EXISTS coa_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'p2' CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  assigned_to TEXT,  -- agent ID
  due_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Process tracking
CREATE TABLE IF NOT EXISTS coa_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  owner_agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'deprecated')),
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent usage events (cost/performance tracking)
CREATE TABLE IF NOT EXISTS agent_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  latency_ms INTEGER,
  tool_calls INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Communications log
CREATE TABLE IF NOT EXISTS coa_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'internal' CHECK (type IN ('internal', 'vendor', 'report')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inter-agent message log
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  sender_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'delivered', 'processed', 'failed')),
  response TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE coa_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE coa_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE coa_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coa_tasks_org ON coa_tasks;
CREATE POLICY coa_tasks_org ON coa_tasks USING (is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS coa_processes_org ON coa_processes;
CREATE POLICY coa_processes_org ON coa_processes USING (is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS agent_usage_org ON agent_usage_events;
CREATE POLICY agent_usage_org ON agent_usage_events USING (is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS coa_comms_org ON coa_communications;
CREATE POLICY coa_comms_org ON coa_communications USING (is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS agent_messages_org ON agent_messages;
CREATE POLICY agent_messages_org ON agent_messages USING (is_org_member(auth.uid(), org_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coa_tasks_org ON coa_tasks(org_id, status);
CREATE INDEX IF NOT EXISTS idx_coa_processes_org ON coa_processes(org_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_usage_org ON agent_usage_events(org_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_target ON agent_messages(target_id, status);
-- CMA Agent Tables
-- Chief Marketing Agent — content drafts, campaigns, brand management

-- Content drafts (blog, social, email, landing page)
CREATE TABLE IF NOT EXISTS cma_content_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('blog', 'social', 'email', 'landing_page')),
  content TEXT NOT NULL,
  target_audience TEXT,
  seo_keywords TEXT[] DEFAULT '{}',
  tone TEXT DEFAULT 'professional',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived')),
  published_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Marketing campaigns
CREATE TABLE IF NOT EXISTS cma_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'paused', 'completed')),
  channels TEXT[] DEFAULT '{}',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  budget NUMERIC(10, 2),
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE cma_content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cma_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cma_drafts_org ON cma_content_drafts;
CREATE POLICY cma_drafts_org ON cma_content_drafts USING (is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS cma_campaigns_org ON cma_campaigns;
CREATE POLICY cma_campaigns_org ON cma_campaigns USING (is_org_member(auth.uid(), org_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cma_drafts_org ON cma_content_drafts(org_id, status, type);
CREATE INDEX IF NOT EXISTS idx_cma_campaigns_org ON cma_campaigns(org_id, status);
-- Compliance Agent Tables
-- Chief Compliance Officer — policy register, risk assessments, governance log

-- Policy register
CREATE TABLE IF NOT EXISTS compliance_policy_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'under_review', 'deprecated')),
  owner TEXT NOT NULL,
  description TEXT,
  review_date TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Risk assessments
CREATE TABLE IF NOT EXISTS compliance_risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  subject TEXT NOT NULL,
  risk_type TEXT NOT NULL CHECK (risk_type IN ('regulatory', 'operational', 'financial', 'reputational', 'data_privacy', 'ai_governance')),
  description TEXT NOT NULL,
  likelihood TEXT NOT NULL CHECK (likelihood IN ('very_low', 'low', 'medium', 'high', 'very_high')),
  impact TEXT NOT NULL CHECK (impact IN ('minimal', 'minor', 'moderate', 'major', 'severe')),
  mitigation TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigating', 'accepted', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Governance action log
CREATE TABLE IF NOT EXISTS compliance_governance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  action TEXT NOT NULL,
  affected_agents TEXT[] DEFAULT '{}',
  decision TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'advisory' CHECK (severity IN ('informational', 'advisory', 'mandatory', 'enforcement')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE compliance_policy_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_governance_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_policy_org ON compliance_policy_register;
CREATE POLICY compliance_policy_org ON compliance_policy_register USING (is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS compliance_risk_org ON compliance_risk_assessments;
CREATE POLICY compliance_risk_org ON compliance_risk_assessments USING (is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS compliance_gov_org ON compliance_governance_log;
CREATE POLICY compliance_gov_org ON compliance_governance_log USING (is_org_member(auth.uid(), org_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_compliance_policy_org ON compliance_policy_register(org_id, status);
CREATE INDEX IF NOT EXISTS idx_compliance_risk_org ON compliance_risk_assessments(org_id, status, risk_type);
CREATE INDEX IF NOT EXISTS idx_compliance_gov_org ON compliance_governance_log(org_id, severity);
-- Legal Agent Tables
-- Legal Counsel — legal reviews, IP portfolio

-- Legal reviews (contracts, compliance, regulatory, general)
CREATE TABLE IF NOT EXISTS legal_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  type TEXT NOT NULL CHECK (type IN ('contract', 'compliance', 'ip', 'regulatory', 'policy', 'general')),
  subject TEXT NOT NULL,
  summary TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('critical', 'high', 'medium', 'low')),
  key_issues JSONB DEFAULT '[]',
  recommendations TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'final', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- IP portfolio
CREATE TABLE IF NOT EXISTS legal_ip_portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('patent', 'trademark', 'copyright', 'trade_secret', 'domain')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'filed', 'pending', 'registered', 'expired', 'abandoned')),
  registration_number TEXT,
  filing_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE legal_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_ip_portfolio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_reviews_org ON legal_reviews;
CREATE POLICY legal_reviews_org ON legal_reviews USING (is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS legal_ip_org ON legal_ip_portfolio;
CREATE POLICY legal_ip_org ON legal_ip_portfolio USING (is_org_member(auth.uid(), org_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_legal_reviews_org ON legal_reviews(org_id, type, status);
CREATE INDEX IF NOT EXISTS idx_legal_ip_org ON legal_ip_portfolio(org_id, type, status);
-- Sales Agent Tables
-- Head of Sales — pipeline management, call logs

-- Sales pipeline
CREATE TABLE IF NOT EXISTS sales_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  company TEXT NOT NULL,
  contact TEXT,
  stage TEXT NOT NULL DEFAULT 'prospect' CHECK (stage IN ('prospect', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
  value NUMERIC(12, 2) DEFAULT 0,
  probability INTEGER DEFAULT 10 CHECK (probability >= 0 AND probability <= 100),
  expected_close TIMESTAMPTZ,
  source TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Call logs and interaction tracking
CREATE TABLE IF NOT EXISTS sales_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  pipeline_id UUID REFERENCES sales_pipeline(id),
  type TEXT NOT NULL CHECK (type IN ('discovery', 'demo', 'follow_up', 'negotiation', 'close', 'check_in', 'email')),
  summary TEXT NOT NULL,
  action_items JSONB DEFAULT '[]',
  sentiment TEXT CHECK (sentiment IN ('very_positive', 'positive', 'neutral', 'negative', 'very_negative')),
  next_steps TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE sales_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_pipeline_org ON sales_pipeline;
CREATE POLICY sales_pipeline_org ON sales_pipeline USING (is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS sales_calls_org ON sales_call_logs;
CREATE POLICY sales_calls_org ON sales_call_logs USING (is_org_member(auth.uid(), org_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_org ON sales_pipeline(org_id, stage);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_value ON sales_pipeline(org_id, value DESC) WHERE stage NOT IN ('closed_won', 'closed_lost');
CREATE INDEX IF NOT EXISTS idx_sales_calls_org ON sales_call_logs(org_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_calls_pipeline ON sales_call_logs(pipeline_id) WHERE pipeline_id IS NOT NULL;
