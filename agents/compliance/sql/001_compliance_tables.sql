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
  last_updated TIMESTAMPTZ DEFAULT now(),
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

CREATE POLICY compliance_policy_org ON compliance_policy_register USING (is_org_member(auth.uid(), org_id));
CREATE POLICY compliance_risk_org ON compliance_risk_assessments USING (is_org_member(auth.uid(), org_id));
CREATE POLICY compliance_gov_org ON compliance_governance_log USING (is_org_member(auth.uid(), org_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_compliance_policy_org ON compliance_policy_register(org_id, status);
CREATE INDEX IF NOT EXISTS idx_compliance_risk_org ON compliance_risk_assessments(org_id, status, risk_type);
CREATE INDEX IF NOT EXISTS idx_compliance_gov_org ON compliance_governance_log(org_id, severity);
