
-- Fix overly permissive org creation policy
DROP POLICY "Anyone can create org" ON public.organizations;
CREATE POLICY "Authenticated users can create org" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND organization_id IS NOT NULL));
