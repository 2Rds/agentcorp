-- ============================================================================
-- RPC: create_organization
-- Atomic org creation: insert org, assign owner role, ensure profile, link org.
-- Runs as SECURITY DEFINER to bypass RLS (the INSERT...RETURNING on organizations
-- requires the SELECT policy to pass, but the user isn't an org member yet at
-- insert time — this function handles the chicken-and-egg problem).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_organization(_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id UUID;
  _user_id UUID := auth.uid();
BEGIN
  -- Must be authenticated
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Must not already have an org
  IF NOT public.can_create_org(_user_id) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  -- Create the organization
  INSERT INTO public.organizations (name)
  VALUES (_name)
  RETURNING id INTO _org_id;

  -- Assign the creator as owner
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (_user_id, _org_id, 'owner');

  -- Ensure profile exists (handles pre-migration users whose profile was truncated)
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    _user_id,
    (SELECT COALESCE(raw_user_meta_data ->> 'display_name', email)
     FROM auth.users WHERE id = _user_id)
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Link profile to org
  UPDATE public.profiles
  SET organization_id = _org_id
  WHERE user_id = _user_id;

  RETURN _org_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT) TO authenticated;
