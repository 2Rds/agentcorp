
-- Create financial_model table
CREATE TABLE public.financial_model (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- revenue, cogs, opex, headcount, funding
  subcategory TEXT NOT NULL, -- e.g. "SaaS Revenue", "Engineering Salaries"
  month DATE NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  formula TEXT, -- reasoning/formula behind the number
  scenario TEXT NOT NULL DEFAULT 'base', -- base, best, worst
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cap_table_entries table
CREATE TABLE public.cap_table_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stakeholder_name TEXT NOT NULL,
  stakeholder_type TEXT NOT NULL, -- founder, investor, option_pool, advisor
  shares NUMERIC NOT NULL DEFAULT 0,
  ownership_pct NUMERIC NOT NULL DEFAULT 0,
  investment_amount NUMERIC DEFAULT 0,
  share_price NUMERIC DEFAULT 0,
  round_name TEXT, -- e.g. "Pre-Seed", "Seed"
  date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cap_table_entries ENABLE ROW LEVEL SECURITY;

-- financial_model RLS policies
CREATE POLICY "Org members can view financial model"
  ON public.financial_model FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owner/cofounder can insert financial model"
  ON public.financial_model FOR INSERT
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role)));

CREATE POLICY "Owner/cofounder can update financial model"
  ON public.financial_model FOR UPDATE
  USING (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role)));

CREATE POLICY "Owner/cofounder can delete financial model"
  ON public.financial_model FOR DELETE
  USING (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role)));

-- cap_table_entries RLS policies
CREATE POLICY "Org members can view cap table"
  ON public.cap_table_entries FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owner/cofounder can insert cap table"
  ON public.cap_table_entries FOR INSERT
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role)));

CREATE POLICY "Owner/cofounder can update cap table"
  ON public.cap_table_entries FOR UPDATE
  USING (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role)));

CREATE POLICY "Owner/cofounder can delete cap table"
  ON public.cap_table_entries FOR DELETE
  USING (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'cofounder'::app_role)));

-- Updated_at triggers
CREATE TRIGGER update_financial_model_updated_at
  BEFORE UPDATE ON public.financial_model
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cap_table_entries_updated_at
  BEFORE UPDATE ON public.cap_table_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
