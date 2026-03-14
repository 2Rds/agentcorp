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

CREATE POLICY legal_reviews_org ON legal_reviews USING (is_org_member(auth.uid(), org_id));
CREATE POLICY legal_ip_org ON legal_ip_portfolio USING (is_org_member(auth.uid(), org_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_legal_reviews_org ON legal_reviews(org_id, type, status);
CREATE INDEX IF NOT EXISTS idx_legal_ip_org ON legal_ip_portfolio(org_id, type, status);
