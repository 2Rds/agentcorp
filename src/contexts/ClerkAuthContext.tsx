import { createContext, useContext, ReactNode, useMemo, useEffect } from 'react';
import { useUser, useSession, useClerk, useOrganization, useOrganizationList } from '@clerk/clerk-react';
import { createClerkSupabaseClient, supabaseAnon } from '@/integrations/clerk/ClerkSupabaseClient';
import { setClerkSession } from '@/lib/clerk-session';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

interface ClerkOrganization {
  id: string;
  name: string;
  slug: string | null;
  imageUrl: string;
  role: string;
}

function mapOrganizationListItem(item: { organization: any; membership: any }): ClerkOrganization {
  return {
    id: item.organization.id,
    name: item.organization.name,
    slug: item.organization.slug,
    imageUrl: item.organization.imageUrl,
    role: item.membership.role,
  };
}

function mapActiveOrganization(organization: any, membership: any): ClerkOrganization | null {
  if (!organization || !membership) return null;
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    imageUrl: organization.imageUrl,
    role: membership.role,
  };
}

interface ClerkAuthContextType {
  userId: string | null;
  isLoaded: boolean;
  isSignedIn: boolean;

  user: {
    id: string;
    email: string | null;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    imageUrl: string | null;
    createdAt: Date | null;
  } | null;

  activeOrganization: ClerkOrganization | null;
  organizations: ClerkOrganization[];
  isOrgLoaded: boolean;
  setActiveOrganization: (orgId: string | null) => Promise<void>;

  supabase: SupabaseClient<Database>;

  signOut: () => Promise<void>;
}

export const ClerkAuthContext = createContext<ClerkAuthContextType | undefined>(undefined);

export const useClerkAuth = () => {
  const context = useContext(ClerkAuthContext);
  if (context === undefined) {
    throw new Error('useClerkAuth must be used within a ClerkAuthProvider');
  }
  return context;
};

export const ClerkAuthProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoaded, isSignedIn } = useUser();
  const { session } = useSession();
  const { signOut: clerkSignOut } = useClerk();

  const { organization, membership, isLoaded: orgLoaded } = useOrganization();
  const { organizationList, setActive, isLoaded: listLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  });

  // Create Supabase client with Clerk token injection
  const supabase = useMemo(() => {
    if (session) {
      return createClerkSupabaseClient(async () => {
        // Native Supabase Clerk integration — no template needed
        const token = await session.getToken();
        if (!token) {
          console.error('[ClerkAuth] session.getToken() returned null');
        }
        return token;
      });
    }
    return supabaseAnon;
  }, [session]);

  // Expose Clerk session globally for non-React code (Supabase client, useModelSheet, etc.)
  useEffect(() => {
    if (session) {
      setClerkSession({ getToken: () => session.getToken() });
    } else {
      setClerkSession(null);
    }
    return () => { setClerkSession(null); };
  }, [session]);

  const handleSignOut = async () => {
    await clerkSignOut();
  };

  const handleSetActiveOrganization = async (orgId: string | null) => {
    if (setActive) {
      await setActive({ organization: orgId });
    }
  };

  const organizations: ClerkOrganization[] = useMemo(() => {
    if (!organizationList) return [];
    return organizationList.map(mapOrganizationListItem);
  }, [organizationList]);

  const activeOrganization: ClerkOrganization | null = useMemo(
    () => mapActiveOrganization(organization, membership),
    [organization, membership],
  );

  // Auto-select first organization if user has orgs but none is active (e.g. new session on different subdomain)
  useEffect(() => {
    if (
      isSignedIn &&
      orgLoaded &&
      listLoaded &&
      !organization &&
      organizationList &&
      organizationList.length > 0 &&
      setActive
    ) {
      setActive({ organization: organizationList[0].organization.id });
    }
  }, [isSignedIn, orgLoaded, listLoaded, organization, organizationList, setActive]);

  const value: ClerkAuthContextType = {
    userId: user?.id ?? null,
    isLoaded,
    isSignedIn: isSignedIn ?? false,
    user: user ? {
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      username: user.username ?? null,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      imageUrl: user.imageUrl,
      createdAt: user.createdAt ? new Date(user.createdAt) : null,
    } : null,
    activeOrganization,
    organizations,
    isOrgLoaded: orgLoaded && listLoaded,
    setActiveOrganization: handleSetActiveOrganization,
    supabase,
    signOut: handleSignOut,
  };

  return (
    <ClerkAuthContext.Provider value={value}>
      {children}
    </ClerkAuthContext.Provider>
  );
};
