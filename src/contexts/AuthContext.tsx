import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export type OrgRole = 'owner' | 'cofounder' | 'advisor' | 'investor';

interface Organization {
  id: string;
  name: string;
  role: OrgRole;
}

interface AuthContextType {
  userId: string | null;
  user: { id: string; email: string | null } | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  session: Session | null;
  activeOrganization: Organization | null;
  orgLoading: boolean;
  signOut: () => Promise<void>;
  refreshOrg: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeOrganization, setActiveOrganization] = useState<Organization | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);

  // Listen for auth state changes — subscribe FIRST to avoid race condition
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setIsLoaded(true);
    });

    // Then get the initial session (listener above will catch any change in between)
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setIsLoaded(true);
    }).catch((err) => {
      console.error('Failed to get initial session:', err);
      setIsLoaded(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch org when user changes
  const fetchOrg = useCallback(async () => {
    if (!user) {
      setActiveOrganization(null);
      setOrgLoading(false);
      return;
    }

    setOrgLoading(true);
    try {
      // Get the user's profile to find their org
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.organization_id) {
        setActiveOrganization(null);
        setOrgLoading(false);
        return;
      }

      // Get org details
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', profile.organization_id)
        .single();

      if (orgError || !org) {
        console.error('Failed to fetch organization:', orgError);
        setActiveOrganization(null);
        setOrgLoading(false);
        return;
      }

      // Get user's role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', profile.organization_id)
        .single();

      if (roleError || !roleData) {
        console.error('Failed to fetch user role:', roleError);
        setActiveOrganization(null);
        setOrgLoading(false);
        return;
      }

      setActiveOrganization({
        id: org.id,
        name: org.name,
        role: roleData.role as OrgRole,
      });
    } catch (err) {
      console.error('Failed to fetch organization:', err);
      setActiveOrganization(null);
    } finally {
      setOrgLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign out failed:', error);
  };

  const value: AuthContextType = {
    userId: user?.id ?? null,
    user: user ? { id: user.id, email: user.email ?? null } : null,
    isLoaded,
    isSignedIn: !!session,
    session,
    activeOrganization,
    orgLoading,
    signOut: handleSignOut,
    refreshOrg: fetchOrg,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
