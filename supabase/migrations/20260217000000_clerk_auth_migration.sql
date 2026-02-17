-- ============================================================================
-- Clerk Auth Migration
-- Replaces Supabase Auth with Clerk (same project as BlockDrive).
-- Changes user-identifying columns from UUID to TEXT (Clerk IDs are strings).
-- Updates RLS to use auth.jwt() ->> 'sub' instead of auth.uid().
-- ============================================================================

-- ─── 1. Drop Supabase Auth trigger ──────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ─── 2. Drop ALL existing RLS policies ──────────────────────────────────────

-- organizations
DROP POLICY IF EXISTS "Authenticated users can create org" ON public.organizations;
DROP POLICY IF EXISTS "Members can view own org" ON public.organizations;
DROP POLICY IF EXISTS "Owners can update org" ON public.organizations;
DROP POLICY IF EXISTS "Anyone can create org" ON public.organizations;

-- profiles
DROP POLICY IF EXISTS "System creates profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- user_roles
DROP POLICY IF EXISTS "Org members can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can assign own role" ON public.user_roles;

-- conversations
DROP POLICY IF EXISTS "Org members can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Org members can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Owner/cofounder can delete conversations" ON public.conversations;
DROP POLICY IF EXISTS "Owner/cofounder can update conversations" ON public.conversations;

-- messages
DROP POLICY IF EXISTS "Org members can create messages" ON public.messages;
DROP POLICY IF EXISTS "Org members can view messages" ON public.messages;

-- knowledge_base
DROP POLICY IF EXISTS "Org members can view KB" ON public.knowledge_base;
DROP POLICY IF EXISTS "Owner/cofounder can delete KB" ON public.knowledge_base;
DROP POLICY IF EXISTS "Owner/cofounder can manage KB" ON public.knowledge_base;
DROP POLICY IF EXISTS "Owner/cofounder can update KB" ON public.knowledge_base;

-- documents
DROP POLICY IF EXISTS "Org members can upload documents" ON public.documents;
DROP POLICY IF EXISTS "Org members can view documents" ON public.documents;
DROP POLICY IF EXISTS "Owners can delete documents" ON public.documents;
DROP POLICY IF EXISTS "Owners can update documents" ON public.documents;

-- financial_model
DROP POLICY IF EXISTS "Org members can view financial model" ON public.financial_model;
DROP POLICY IF EXISTS "Owner/cofounder can insert financial model" ON public.financial_model;
DROP POLICY IF EXISTS "Owner/cofounder can update financial model" ON public.financial_model;
DROP POLICY IF EXISTS "Owner/cofounder can delete financial model" ON public.financial_model;

-- cap_table_entries
DROP POLICY IF EXISTS "Org members can view cap table" ON public.cap_table_entries;
DROP POLICY IF EXISTS "Owner/cofounder can insert cap table" ON public.cap_table_entries;
DROP POLICY IF EXISTS "Owner/cofounder can update cap table" ON public.cap_table_entries;
DROP POLICY IF EXISTS "Owner/cofounder can delete cap table" ON public.cap_table_entries;

-- investor_links
DROP POLICY IF EXISTS "Org members can view investor links" ON public.investor_links;
DROP POLICY IF EXISTS "Owner/cofounder can create investor links" ON public.investor_links;
DROP POLICY IF EXISTS "Owner/cofounder can update investor links" ON public.investor_links;
DROP POLICY IF EXISTS "Owner/cofounder can delete investor links" ON public.investor_links;

-- link_views
DROP POLICY IF EXISTS "Org members can view link analytics" ON public.link_views;
DROP POLICY IF EXISTS "Org members can insert link views" ON public.link_views;

-- storage
DROP POLICY IF EXISTS "Org members can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Org members can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;

-- ─── 3. Drop FK constraints referencing auth.users(id) ──────────────────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_created_by_fkey;
ALTER TABLE public.knowledge_base DROP CONSTRAINT IF EXISTS knowledge_base_created_by_fkey;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_uploaded_by_fkey;

-- ─── 4. Change user-identifying columns from UUID to TEXT ───────────────────

-- Drop unique constraint on profiles.user_id before type change
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key;

-- Drop unique constraint on user_roles before type change
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_organization_id_role_key;

-- Drop indexes that reference these columns (will recreate)
DROP INDEX IF EXISTS idx_profiles_user_id;
DROP INDEX IF EXISTS idx_user_roles_user_id;

-- Change column types
ALTER TABLE public.profiles ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE public.conversations ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
ALTER TABLE public.knowledge_base ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
ALTER TABLE public.documents ALTER COLUMN uploaded_by TYPE TEXT USING uploaded_by::TEXT;
ALTER TABLE public.investor_links ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;

-- ─── 5. Add clerk_org_id to organizations ───────────────────────────────────

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS clerk_org_id TEXT UNIQUE;

-- ─── 6. Recreate constraints and indexes ────────────────────────────────────

ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
-- Changed from (user_id, organization_id, role) to (user_id, organization_id):
-- a user should have exactly one role per org, not one entry per role.
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_organization_id_key UNIQUE (user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_clerk_org_id ON public.organizations(clerk_org_id);

-- ─── 7. Update RLS helper functions ─────────────────────────────────────────
-- Change parameter types from UUID to TEXT for user_id params.
-- auth.jwt() ->> 'sub' returns the Clerk user ID string.

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id TEXT, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND organization_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id TEXT, _role app_role, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND organization_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_org(_user_id TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_create_org(_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND organization_id IS NOT NULL
  )
$$;

-- ─── 8. Recreate ALL RLS policies ──────────────────────────────────────────
-- All policies now use (auth.jwt() ->> 'sub') instead of auth.uid()

-- All policies below use (auth.jwt() ->> 'sub') to get the Clerk user ID.

-- ── organizations ──

CREATE POLICY "Authenticated users can create org" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_create_org((auth.jwt() ->> 'sub')));

CREATE POLICY "Members can view own org" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member((auth.jwt() ->> 'sub'), id));

CREATE POLICY "Owners can update org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    public.has_role((auth.jwt() ->> 'sub'), 'owner', id)
    AND public.is_org_member((auth.jwt() ->> 'sub'), id)
  );

-- ── profiles ──

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    user_id = (auth.jwt() ->> 'sub')
    OR (organization_id IS NOT NULL AND public.is_org_member((auth.jwt() ->> 'sub'), organization_id))
  );

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "System creates profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

-- ── user_roles ──

CREATE POLICY "Org members can view roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_org_member((auth.jwt() ->> 'sub'), organization_id));

CREATE POLICY "Owners can manage roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((auth.jwt() ->> 'sub'), 'owner', organization_id)
    AND public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
  );

-- Removed: "Users can assign own role" — role assignment is handled exclusively
-- by the Clerk webhook (service role key bypasses RLS). Allowing self-assignment
-- would let any authenticated user grant themselves any role in any organization.

CREATE POLICY "Owners can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.has_role((auth.jwt() ->> 'sub'), 'owner', organization_id)
    AND public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
  );

-- ── conversations ──

CREATE POLICY "Org members can view conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.is_org_member((auth.jwt() ->> 'sub'), organization_id));

CREATE POLICY "Org members can create conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND created_by = (auth.jwt() ->> 'sub')
  );

CREATE POLICY "Owner/cofounder can update conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner', organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder', organization_id)
      OR created_by = (auth.jwt() ->> 'sub')
    )
  );

CREATE POLICY "Owner/cofounder can delete conversations" ON public.conversations
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner', organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder', organization_id)
    )
  );

-- ── messages ──

CREATE POLICY "Org members can view messages" ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
    AND public.is_org_member((auth.jwt() ->> 'sub'), c.organization_id)
  ));

CREATE POLICY "Org members can create messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
    AND public.is_org_member((auth.jwt() ->> 'sub'), c.organization_id)
  ));

-- ── knowledge_base ──

CREATE POLICY "Org members can view KB" ON public.knowledge_base
  FOR SELECT TO authenticated
  USING (public.is_org_member((auth.jwt() ->> 'sub'), organization_id));

CREATE POLICY "Owner/cofounder can manage KB" ON public.knowledge_base
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner', organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder', organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update KB" ON public.knowledge_base
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner', organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder', organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete KB" ON public.knowledge_base
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner', organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder', organization_id)
    )
  );

-- ── documents ──

CREATE POLICY "Org members can view documents" ON public.documents
  FOR SELECT TO authenticated
  USING (public.is_org_member((auth.jwt() ->> 'sub'), organization_id));

CREATE POLICY "Org members can upload documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND uploaded_by = (auth.jwt() ->> 'sub')
  );

CREATE POLICY "Owners can update documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner', organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder', organization_id)
      OR uploaded_by = (auth.jwt() ->> 'sub')
    )
  );

CREATE POLICY "Owners can delete documents" ON public.documents
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner', organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder', organization_id)
    )
  );

-- ── financial_model ──

CREATE POLICY "Org members can view financial model" ON public.financial_model
  FOR SELECT TO authenticated
  USING (public.is_org_member((auth.jwt() ->> 'sub'), organization_id));

CREATE POLICY "Owner/cofounder can insert financial model" ON public.financial_model
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update financial model" ON public.financial_model
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete financial model" ON public.financial_model
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

-- ── cap_table_entries ──

CREATE POLICY "Org members can view cap table" ON public.cap_table_entries
  FOR SELECT TO authenticated
  USING (public.is_org_member((auth.jwt() ->> 'sub'), organization_id));

CREATE POLICY "Owner/cofounder can insert cap table" ON public.cap_table_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update cap table" ON public.cap_table_entries
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete cap table" ON public.cap_table_entries
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

-- ── investor_links ──

CREATE POLICY "Org members can view investor links" ON public.investor_links
  FOR SELECT TO authenticated
  USING (public.is_org_member((auth.jwt() ->> 'sub'), organization_id));

CREATE POLICY "Owner/cofounder can create investor links" ON public.investor_links
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update investor links" ON public.investor_links
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete investor links" ON public.investor_links
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

-- ── link_views ──

CREATE POLICY "Org members can view link analytics" ON public.link_views
  FOR SELECT TO authenticated
  USING (public.is_org_member((auth.jwt() ->> 'sub'), organization_id));

CREATE POLICY "Org members can insert link views" ON public.link_views
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member((auth.jwt() ->> 'sub'), organization_id));

-- ── storage (agent-documents bucket) ──

-- Storage policies scoped by org: files are stored under {org_id}/ prefix.
-- is_org_member check ensures users can only access their org's files.
CREATE POLICY "Org members can upload documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agent-documents'
    AND (auth.jwt() ->> 'sub') IS NOT NULL
    AND public.is_org_member(
      (auth.jwt() ->> 'sub'),
      (storage.foldername(name))[1]::uuid
    )
  );

CREATE POLICY "Org members can view documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agent-documents'
    AND (auth.jwt() ->> 'sub') IS NOT NULL
    AND public.is_org_member(
      (auth.jwt() ->> 'sub'),
      (storage.foldername(name))[1]::uuid
    )
  );

CREATE POLICY "Org members can delete documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'agent-documents'
    AND (auth.jwt() ->> 'sub') IS NOT NULL
    AND public.is_org_member(
      (auth.jwt() ->> 'sub'),
      (storage.foldername(name))[1]::uuid
    )
  );

-- ─── 9. Create model_sheets table (Google Sheets integration) ──────────────

CREATE TABLE IF NOT EXISTS public.model_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
  spreadsheet_id TEXT NOT NULL,
  sheet_url TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.model_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view model sheets" ON public.model_sheets
  FOR SELECT TO authenticated
  USING (public.is_org_member((auth.jwt() ->> 'sub'), organization_id));

CREATE POLICY "Owner/cofounder can insert model sheets" ON public.model_sheets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update model sheets" ON public.model_sheets
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete model sheets" ON public.model_sheets
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((auth.jwt() ->> 'sub'), organization_id)
    AND (
      public.has_role((auth.jwt() ->> 'sub'), 'owner'::app_role, organization_id)
      OR public.has_role((auth.jwt() ->> 'sub'), 'cofounder'::app_role, organization_id)
    )
  );

-- ─── 10. Re-grant permissions ───────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Only grant anon access to tables needed for public data room
GRANT SELECT ON public.investor_links TO anon;
GRANT SELECT ON public.link_views TO anon;
GRANT INSERT ON public.link_views TO anon;
GRANT SELECT ON public.organizations TO anon;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
