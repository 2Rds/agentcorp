-- Backfill existing BlockDrive org with Clerk org ID
UPDATE public.organizations
SET clerk_org_id = 'org_39oUdzq6fS7POOcicDC4eEJDUkM'
WHERE id = '5c462b89-f21a-4e38-b22b-ad53beee1139'
  AND clerk_org_id IS NULL;
