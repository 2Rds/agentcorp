-- ============================================================================
-- Financial System Integrations
-- Stores OAuth tokens and API keys for QuickBooks, Xero, Mercury, Stripe.
-- Tokens are encrypted at the application layer (AES-256-GCM).
-- ============================================================================

CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth2', 'api_key')),
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  api_key_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  provider_metadata JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disconnected', 'error')),
  connected_by TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, provider)
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_integrations_org_id ON public.integrations(organization_id);

-- RLS: org members can view, owner/cofounder can manage

CREATE POLICY "Org members can view integrations" ON public.integrations
  FOR SELECT TO authenticated
  USING (public.is_org_member((auth.jwt() ->> 'sub'), organization_id));

CREATE POLICY "Owner/cofounder can insert integrations" ON public.integrations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update integrations" ON public.integrations
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete integrations" ON public.integrations
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;

NOTIFY pgrst, 'reload schema';
