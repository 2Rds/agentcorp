import { createClient } from '@supabase/supabase-js';
import { getClerkSession } from '@/lib/clerk-session';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Supabase client with Clerk token injection via typed session bridge.
// RLS policies use auth.jwt() ->> 'sub' to identify Clerk users.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  async accessToken() {
    const session = getClerkSession();
    if (!session) {
      // Session not yet initialized — expected during first render before ClerkAuthContext mounts.
      // Callers should guard on auth state before making RLS-dependent queries.
      return null;
    }
    try {
      return (await session.getToken()) ?? null;
    } catch (err) {
      console.error("Supabase accessToken: failed to get Clerk token", err);
      return null;
    }
  },
});
