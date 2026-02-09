
-- Explicitly grant permissions on each table
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_base TO authenticated;
GRANT SELECT ON TABLE public.organizations TO anon;
GRANT SELECT ON TABLE public.profiles TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
