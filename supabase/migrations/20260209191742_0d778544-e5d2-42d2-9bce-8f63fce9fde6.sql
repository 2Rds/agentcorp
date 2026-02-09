
-- Investor share links (DocSend-inspired)
CREATE TABLE public.investor_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL,
  email text,
  slug text NOT NULL UNIQUE,
  passcode text,
  require_email boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  allowed_document_ids uuid[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Link view events (engagement analytics)
CREATE TABLE public.link_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.investor_links(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  viewer_email text,
  viewer_ip text,
  started_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer DEFAULT 0,
  pages_viewed integer DEFAULT 0,
  total_pages integer DEFAULT 0,
  last_page_viewed integer DEFAULT 0,
  device_info jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.investor_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_views ENABLE ROW LEVEL SECURITY;

-- RLS for investor_links
CREATE POLICY "Org members can view investor links"
  ON public.investor_links FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owner/cofounder can create investor links"
  ON public.investor_links FOR INSERT
  WITH CHECK (
    is_org_member(auth.uid(), organization_id)
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role))
  );

CREATE POLICY "Owner/cofounder can update investor links"
  ON public.investor_links FOR UPDATE
  USING (
    is_org_member(auth.uid(), organization_id)
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role))
  );

CREATE POLICY "Owner/cofounder can delete investor links"
  ON public.investor_links FOR DELETE
  USING (
    is_org_member(auth.uid(), organization_id)
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role))
  );

-- RLS for link_views
CREATE POLICY "Org members can view link analytics"
  ON public.link_views FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

-- Service role inserts views (via edge function), but also allow org members
CREATE POLICY "Org members can insert link views"
  ON public.link_views FOR INSERT
  WITH CHECK (is_org_member(auth.uid(), organization_id));

-- Indexes for performance
CREATE INDEX idx_investor_links_org ON public.investor_links(organization_id);
CREATE INDEX idx_investor_links_slug ON public.investor_links(slug);
CREATE INDEX idx_link_views_link ON public.link_views(link_id);
CREATE INDEX idx_link_views_org ON public.link_views(organization_id);

-- Triggers for updated_at
CREATE TRIGGER update_investor_links_updated_at
  BEFORE UPDATE ON public.investor_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for link_views (live alerts)
ALTER PUBLICATION supabase_realtime ADD TABLE public.link_views;
