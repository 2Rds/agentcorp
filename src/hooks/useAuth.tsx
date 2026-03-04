import { useAuthContext } from "@/contexts/AuthContext";

interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthSession {
  active: true;
}

export function useAuth() {
  const ctx = useAuthContext();
  return {
    user: ctx.user ? ({ id: ctx.user.id, email: ctx.user.email } satisfies AuthUser) : null,
    session: ctx.isSignedIn ? ({ active: true } satisfies AuthSession) : null,
    loading: !ctx.isLoaded,
    signOut: ctx.signOut,
  };
}
