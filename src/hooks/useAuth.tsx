/**
 * Compatibility shim — wraps ClerkAuthContext to provide a minimal interface
 * for existing consumers (AppSidebar, useAgentThread, useConversations, etc.).
 *
 * For full Clerk user/org data, use useClerkAuth() directly.
 */
import { useClerkAuth } from "@/contexts/ClerkAuthContext";

interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthSession {
  active: true;
}

export function useAuth() {
  const ctx = useClerkAuth();
  return {
    user: ctx.user ? ({ id: ctx.user.id, email: ctx.user.email } satisfies AuthUser) : null,
    session: ctx.isSignedIn ? ({ active: true } satisfies AuthSession) : null,
    loading: !ctx.isLoaded,
    signIn: async (_email: string, _password: string) => {
      // No-op — Clerk handles sign-in via <SignIn /> component
    },
    signUp: async (_email: string, _password: string, _displayName: string) => {
      // No-op — Clerk handles sign-up via <SignUp /> component
    },
    signOut: ctx.signOut,
  };
}
