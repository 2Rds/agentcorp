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
