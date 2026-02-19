-- Backfill existing user records with Clerk user ID
-- Old Supabase auth UUID: 290a44fb-e6cf-4913-92fe-5176304ad79d
-- New Clerk user ID: user_39oUPfNFA8nGpr88OIsUn7PFcCN

UPDATE public.profiles
SET user_id = 'user_39oUPfNFA8nGpr88OIsUn7PFcCN'
WHERE user_id = '290a44fb-e6cf-4913-92fe-5176304ad79d';

UPDATE public.user_roles
SET user_id = 'user_39oUPfNFA8nGpr88OIsUn7PFcCN'
WHERE user_id = '290a44fb-e6cf-4913-92fe-5176304ad79d';
