import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Supabase client with Clerk token injection via global session.
// Clerk's ClerkAuthContext exposes window.__clerk_session for non-React code.
// RLS policies use auth.jwt() ->> 'sub' to identify Clerk users.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  async accessToken() {
    const session = (window as any).__clerk_session;
    if (!session) return null;
    return (await session.getToken()) ?? null;
  },
});
