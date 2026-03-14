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
