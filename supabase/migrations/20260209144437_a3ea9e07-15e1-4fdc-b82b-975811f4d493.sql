
-- Nuclear option: drop and recreate the INSERT policy with no conditions
DROP POLICY IF EXISTS "Authenticated users can create org" ON public.organizations;

CREATE POLICY "Authenticated users can create org"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (true);
