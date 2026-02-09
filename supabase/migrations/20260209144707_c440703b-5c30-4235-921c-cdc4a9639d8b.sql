
-- Force PostgREST to reload its schema cache so it picks up the grants
NOTIFY pgrst, 'reload schema';

-- Also re-grant just to be absolutely sure
GRANT ALL ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.conversations TO authenticated;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.knowledge_base TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Force reload again after grants
NOTIFY pgrst, 'reload schema';
