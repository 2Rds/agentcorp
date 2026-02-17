import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Creates a Supabase client that uses Clerk session tokens for authentication.
 * RLS policies use auth.jwt() ->> 'sub' to identify Clerk users.
 */
export function createClerkSupabaseClient(getToken: () => Promise<string | null>) {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    async accessToken() {
      return (await getToken()) ?? null;
    },
  });
}

/** Standard Supabase client for unauthenticated/public requests */
export const supabaseAnon = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
