-- ============================================================================
-- Revert to Native Supabase Auth
-- Removes Clerk dependency. Changes TEXT user-identifying columns back to UUID.
-- Recreates RLS policies with auth.uid() instead of auth.jwt() ->> 'sub'.
-- Clean slate: truncates user/org data tables.
-- ============================================================================

-- ─── 1. Drop ALL existing RLS policies ────────────────────────────────────────

-- organizations
DROP POLICY IF EXISTS "Authenticated users can create org" ON public.organizations;
DROP POLICY IF EXISTS "Members can view own org" ON public.organizations;
DROP POLICY IF EXISTS "Owners can update org" ON public.organizations;

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "System creates profiles" ON public.profiles;

-- user_roles
DROP POLICY IF EXISTS "Org members can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners can delete roles" ON public.user_roles;

-- conversations
DROP POLICY IF EXISTS "Org members can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Org members can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Owner/cofounder can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Owner/cofounder can delete conversations" ON public.conversations;

-- messages
DROP POLICY IF EXISTS "Org members can view messages" ON public.messages;
DROP POLICY IF EXISTS "Org members can create messages" ON public.messages;

-- knowledge_base
DROP POLICY IF EXISTS "Org members can view KB" ON public.knowledge_base;
DROP POLICY IF EXISTS "Owner/cofounder can manage KB" ON public.knowledge_base;
DROP POLICY IF EXISTS "Owner/cofounder can update KB" ON public.knowledge_base;
DROP POLICY IF EXISTS "Owner/cofounder can delete KB" ON public.knowledge_base;

-- documents
DROP POLICY IF EXISTS "Org members can view documents" ON public.documents;
DROP POLICY IF EXISTS "Org members can upload documents" ON public.documents;
DROP POLICY IF EXISTS "Owners can update documents" ON public.documents;
DROP POLICY IF EXISTS "Owners can delete documents" ON public.documents;

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

-- model_sheets
DROP POLICY IF EXISTS "Org members can view model sheets" ON public.model_sheets;
DROP POLICY IF EXISTS "Owner/cofounder can insert model sheets" ON public.model_sheets;
DROP POLICY IF EXISTS "Owner/cofounder can update model sheets" ON public.model_sheets;
DROP POLICY IF EXISTS "Owner/cofounder can delete model sheets" ON public.model_sheets;

-- integrations
DROP POLICY IF EXISTS "Org members can view integrations" ON public.integrations;
DROP POLICY IF EXISTS "Owner/cofounder can insert integrations" ON public.integrations;
DROP POLICY IF EXISTS "Owner/cofounder can update integrations" ON public.integrations;
DROP POLICY IF EXISTS "Owner/cofounder can delete integrations" ON public.integrations;

-- storage
DROP POLICY IF EXISTS "Org members can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Org members can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete documents" ON storage.objects;

-- ─── 2. Drop Clerk helper functions ──────────────────────────────────────────

DROP FUNCTION IF EXISTS public.is_org_member(TEXT, UUID);
DROP FUNCTION IF EXISTS public.has_role(TEXT, app_role, UUID);
DROP FUNCTION IF EXISTS public.get_user_org(TEXT);
DROP FUNCTION IF EXISTS public.can_create_org(TEXT);

-- Also drop any old UUID-param versions that may linger
DROP FUNCTION IF EXISTS public.is_org_member(UUID, UUID);
DROP FUNCTION IF EXISTS public.has_role(UUID, app_role, UUID);
DROP FUNCTION IF EXISTS public.get_user_org(UUID);
DROP FUNCTION IF EXISTS public.can_create_org(UUID);

-- ─── 3. Clean slate — truncate user/org data ─────────────────────────────────

TRUNCATE public.messages CASCADE;
TRUNCATE public.link_views CASCADE;
TRUNCATE public.investor_links CASCADE;
TRUNCATE public.model_sheets CASCADE;
TRUNCATE public.integrations CASCADE;
TRUNCATE public.documents CASCADE;
TRUNCATE public.knowledge_base CASCADE;
TRUNCATE public.conversations CASCADE;
TRUNCATE public.financial_model CASCADE;
TRUNCATE public.cap_table_entries CASCADE;
TRUNCATE public.user_roles CASCADE;
TRUNCATE public.profiles CASCADE;
TRUNCATE public.organizations CASCADE;

-- ─── 4. Drop constraints and indexes before column type changes ──────────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_organization_id_key;
DROP INDEX IF EXISTS idx_profiles_user_id;
DROP INDEX IF EXISTS idx_user_roles_user_id;
DROP INDEX IF EXISTS idx_organizations_clerk_org_id;

-- ─── 5. Change columns from TEXT back to UUID ────────────────────────────────

ALTER TABLE public.profiles ALTER COLUMN user_id TYPE UUID USING user_id::UUID;
ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE UUID USING user_id::UUID;
ALTER TABLE public.conversations ALTER COLUMN created_by TYPE UUID USING created_by::UUID;
ALTER TABLE public.knowledge_base ALTER COLUMN created_by TYPE UUID USING created_by::UUID;
ALTER TABLE public.documents ALTER COLUMN uploaded_by TYPE UUID USING uploaded_by::UUID;
ALTER TABLE public.investor_links ALTER COLUMN created_by TYPE UUID USING created_by::UUID;
ALTER TABLE public.integrations ALTER COLUMN connected_by TYPE UUID USING connected_by::UUID;

-- ─── 6. Re-add FK constraints to auth.users ─────────────────────────────────

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.knowledge_base
  ADD CONSTRAINT knowledge_base_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── 7. Recreate unique constraints and indexes ─────────────────────────────

ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_organization_id_key UNIQUE (user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- ─── 8. Drop clerk_org_id column ────────────────────────────────────────────

ALTER TABLE public.organizations DROP COLUMN IF EXISTS clerk_org_id;

-- ─── 9. Recreate helper functions with UUID params ──────────────────────────

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
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

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role, _org_id UUID)
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

CREATE OR REPLACE FUNCTION public.get_user_org(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_create_org(_user_id UUID)
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

-- ─── 10. Recreate on_auth_user_created trigger ─────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 11. Recreate ALL RLS policies using auth.uid() ────────────────────────

-- ── organizations ──

CREATE POLICY "Authenticated users can create org" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_create_org(auth.uid()));

CREATE POLICY "Members can view own org" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), id));

CREATE POLICY "Owners can update org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner', id)
    AND public.is_org_member(auth.uid(), id)
  );

-- ── profiles ──

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
  );

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System creates profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── user_roles ──

CREATE POLICY "Org members can view roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners can manage roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Allow self-insert when creating first org (bootstrap)
    user_id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'owner', organization_id)
      AND public.is_org_member(auth.uid(), organization_id)
    )
  );

CREATE POLICY "Owners can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner', organization_id)
    AND public.is_org_member(auth.uid(), organization_id)
  );

CREATE POLICY "Owners can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner', organization_id)
    AND public.is_org_member(auth.uid(), organization_id)
  );

-- ── conversations ──

CREATE POLICY "Org members can view conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can create conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "Owner/cofounder can update conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner', organization_id)
      OR public.has_role(auth.uid(), 'cofounder', organization_id)
      OR created_by = auth.uid()
    )
  );

CREATE POLICY "Owner/cofounder can delete conversations" ON public.conversations
  FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner', organization_id)
      OR public.has_role(auth.uid(), 'cofounder', organization_id)
    )
  );

-- ── messages ──

CREATE POLICY "Org members can view messages" ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
    AND public.is_org_member(auth.uid(), c.organization_id)
  ));

CREATE POLICY "Org members can create messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
    AND public.is_org_member(auth.uid(), c.organization_id)
  ));

-- ── knowledge_base ──

CREATE POLICY "Org members can view KB" ON public.knowledge_base
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owner/cofounder can manage KB" ON public.knowledge_base
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner', organization_id)
      OR public.has_role(auth.uid(), 'cofounder', organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update KB" ON public.knowledge_base
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner', organization_id)
      OR public.has_role(auth.uid(), 'cofounder', organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete KB" ON public.knowledge_base
  FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner', organization_id)
      OR public.has_role(auth.uid(), 'cofounder', organization_id)
    )
  );

-- ── documents ──

CREATE POLICY "Org members can view documents" ON public.documents
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can upload documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Owners can update documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner', organization_id)
      OR public.has_role(auth.uid(), 'cofounder', organization_id)
      OR uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Owners can delete documents" ON public.documents
  FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner', organization_id)
      OR public.has_role(auth.uid(), 'cofounder', organization_id)
    )
  );

-- ── financial_model ──

CREATE POLICY "Org members can view financial model" ON public.financial_model
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owner/cofounder can insert financial model" ON public.financial_model
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update financial model" ON public.financial_model
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete financial model" ON public.financial_model
  FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

-- ── cap_table_entries ──

CREATE POLICY "Org members can view cap table" ON public.cap_table_entries
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owner/cofounder can insert cap table" ON public.cap_table_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update cap table" ON public.cap_table_entries
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete cap table" ON public.cap_table_entries
  FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

-- ── investor_links ──

CREATE POLICY "Org members can view investor links" ON public.investor_links
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owner/cofounder can create investor links" ON public.investor_links
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update investor links" ON public.investor_links
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete investor links" ON public.investor_links
  FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

-- ── link_views ──

CREATE POLICY "Org members can view link analytics" ON public.link_views
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Anyone can insert link views" ON public.link_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ── model_sheets ──

CREATE POLICY "Org members can view model sheets" ON public.model_sheets
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owner/cofounder can insert model sheets" ON public.model_sheets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update model sheets" ON public.model_sheets
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete model sheets" ON public.model_sheets
  FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

-- ── integrations ──

CREATE POLICY "Org members can view integrations" ON public.integrations
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owner/cofounder can insert integrations" ON public.integrations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can update integrations" ON public.integrations
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

CREATE POLICY "Owner/cofounder can delete integrations" ON public.integrations
  FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::app_role, organization_id)
      OR public.has_role(auth.uid(), 'cofounder'::app_role, organization_id)
    )
  );

-- ── storage (agent-documents bucket) ──

CREATE POLICY "Org members can upload documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agent-documents'
    AND auth.uid() IS NOT NULL
    AND public.is_org_member(
      auth.uid(),
      (storage.foldername(name))[1]::uuid
    )
  );

CREATE POLICY "Org members can view documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agent-documents'
    AND auth.uid() IS NOT NULL
    AND public.is_org_member(
      auth.uid(),
      (storage.foldername(name))[1]::uuid
    )
  );

CREATE POLICY "Org members can delete documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'agent-documents'
    AND auth.uid() IS NOT NULL
    AND public.is_org_member(
      auth.uid(),
      (storage.foldername(name))[1]::uuid
    )
  );

-- ─── 12. Re-grant permissions ───────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Anon access for public data room
GRANT SELECT ON public.investor_links TO anon;
GRANT SELECT ON public.link_views TO anon;
GRANT INSERT ON public.link_views TO anon;
GRANT SELECT ON public.organizations TO anon;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
