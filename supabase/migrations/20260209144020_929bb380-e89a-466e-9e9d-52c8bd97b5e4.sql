
-- Create a security definer function to check if user can create org
CREATE OR REPLACE FUNCTION public.can_create_org(_user_id uuid)
RETURNS boolean
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

-- Drop the existing INSERT policy and recreate with the function
DROP POLICY IF EXISTS "Authenticated users can create org" ON public.organizations;

CREATE POLICY "Authenticated users can create org"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (public.can_create_org(auth.uid()));
