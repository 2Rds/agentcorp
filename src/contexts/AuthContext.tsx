import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { posthog } from '@/lib/posthog';
import { Sentry } from '@/lib/sentry';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isSignedIn: boolean;
  orgId: string | null;
  orgName: string | null;
  displayName: string | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshOrg: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrg = async (userId: string) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, display_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[AuthContext] Failed to fetch profile:', profileError.message);
      return;
    }

    setDisplayName(profile?.display_name ?? null);
    if (profile?.organization_id) {
      setOrgId(profile.organization_id);
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', profile.organization_id)
        .maybeSingle();
      if (orgError) console.error('[AuthContext] Failed to fetch org:', orgError.message);
      setOrgName(org?.name ?? null);
    } else {
      setOrgId(null);
      setOrgName(null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchOrg(session.user.id).catch((err) =>
          console.error('[AuthContext] fetchOrg failed:', err)
        );
        posthog.identify?.(session.user.id, { email: session.user.email });
        Sentry.setUser?.({ id: session.user.id, email: session.user.email });
      } else {
        setOrgId(null);
        setOrgName(null);
        setDisplayName(null);
        posthog.reset?.();
        Sentry.setUser?.(null);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('[AuthContext] Sign out error:', error.message);
  };

  const refreshOrg = async () => {
    if (user) await fetchOrg(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, isSignedIn: !!session, orgId, orgName, displayName, isLoading, signOut, refreshOrg }}>
      {children}
    </AuthContext.Provider>
  );
};
