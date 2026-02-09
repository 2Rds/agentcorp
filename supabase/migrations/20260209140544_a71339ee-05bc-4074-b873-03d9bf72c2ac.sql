
-- Drop all existing RESTRICTIVE policies and recreate as PERMISSIVE

-- organizations
DROP POLICY IF EXISTS "Authenticated users can create org" ON public.organizations;
DROP POLICY IF EXISTS "Members can view own org" ON public.organizations;
DROP POLICY IF EXISTS "Owners can update org" ON public.organizations;

CREATE POLICY "Authenticated users can create org" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND organization_id IS NOT NULL));

CREATE POLICY "Members can view own org" ON public.organizations
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), id));

CREATE POLICY "Owners can update org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner') AND is_org_member(auth.uid(), id));

-- profiles
DROP POLICY IF EXISTS "System creates profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "System creates profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (organization_id IS NOT NULL AND is_org_member(auth.uid(), organization_id)));

-- user_roles
DROP POLICY IF EXISTS "Org members can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can assign own role" ON public.user_roles;

CREATE POLICY "Org members can view roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner') AND is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners can manage roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner') AND is_org_member(auth.uid(), organization_id));

CREATE POLICY "Users can assign own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- conversations
DROP POLICY IF EXISTS "Org members can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Org members can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Owner/cofounder can delete conversations" ON public.conversations;
DROP POLICY IF EXISTS "Owner/cofounder can update conversations" ON public.conversations;

CREATE POLICY "Org members can create conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND created_by = auth.uid());

CREATE POLICY "Org members can view conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owner/cofounder can delete conversations" ON public.conversations
  FOR DELETE TO authenticated
  USING (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'cofounder')));

CREATE POLICY "Owner/cofounder can update conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'cofounder') OR created_by = auth.uid()));

-- messages
DROP POLICY IF EXISTS "Org members can create messages" ON public.messages;
DROP POLICY IF EXISTS "Org members can view messages" ON public.messages;

CREATE POLICY "Org members can create messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_org_member(auth.uid(), c.organization_id)));

CREATE POLICY "Org members can view messages" ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_org_member(auth.uid(), c.organization_id)));

-- documents
DROP POLICY IF EXISTS "Org members can upload documents" ON public.documents;
DROP POLICY IF EXISTS "Org members can view documents" ON public.documents;
DROP POLICY IF EXISTS "Owners can delete documents" ON public.documents;
DROP POLICY IF EXISTS "Owners can update documents" ON public.documents;

CREATE POLICY "Org members can upload documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND uploaded_by = auth.uid());

CREATE POLICY "Org members can view documents" ON public.documents
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners can delete documents" ON public.documents
  FOR DELETE TO authenticated
  USING (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'cofounder')));

CREATE POLICY "Owners can update documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'cofounder') OR uploaded_by = auth.uid()));

-- knowledge_base
DROP POLICY IF EXISTS "Org members can view KB" ON public.knowledge_base;
DROP POLICY IF EXISTS "Owner/cofounder can delete KB" ON public.knowledge_base;
DROP POLICY IF EXISTS "Owner/cofounder can manage KB" ON public.knowledge_base;
DROP POLICY IF EXISTS "Owner/cofounder can update KB" ON public.knowledge_base;

CREATE POLICY "Org members can view KB" ON public.knowledge_base
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owner/cofounder can delete KB" ON public.knowledge_base
  FOR DELETE TO authenticated
  USING (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'cofounder')));

CREATE POLICY "Owner/cofounder can manage KB" ON public.knowledge_base
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'cofounder')));

CREATE POLICY "Owner/cofounder can update KB" ON public.knowledge_base
  FOR UPDATE TO authenticated
  USING (is_org_member(auth.uid(), organization_id) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'cofounder')));

-- Also ensure the handle_new_user trigger exists
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
