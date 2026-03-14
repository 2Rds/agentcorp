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

CREATE POLICY coa_tasks_org ON coa_tasks USING (is_org_member(auth.uid(), org_id));
CREATE POLICY coa_processes_org ON coa_processes USING (is_org_member(auth.uid(), org_id));
CREATE POLICY agent_usage_org ON agent_usage_events USING (is_org_member(auth.uid(), org_id));
CREATE POLICY coa_comms_org ON coa_communications USING (is_org_member(auth.uid(), org_id));
CREATE POLICY agent_messages_org ON agent_messages USING (is_org_member(auth.uid(), org_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coa_tasks_org ON coa_tasks(org_id, status);
CREATE INDEX IF NOT EXISTS idx_coa_processes_org ON coa_processes(org_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_usage_org ON agent_usage_events(org_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_target ON agent_messages(target_id, status);
