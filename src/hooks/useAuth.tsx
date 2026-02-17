/**
 * Compatibility shim — wraps ClerkAuthContext to provide the same interface
 * that existing consumers (AppSidebar, useAgentThread, useConversations, etc.) expect.
 */
import { useClerkAuth } from "@/contexts/ClerkAuthContext";

export function useAuth() {
  const ctx = useClerkAuth();
  return {
    user: ctx.user ? { id: ctx.user.id, email: ctx.user.email } as any : null,
    session: ctx.isSignedIn ? ({} as any) : null,
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
