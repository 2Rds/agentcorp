/**
 * Typed accessor for the global Clerk session bridge.
 * ClerkAuthContext sets this on window when a session is active;
 * non-React code (Supabase client, useModelSheet, etc.) reads it here.
 */

export interface ClerkSessionBridge {
  getToken: () => Promise<string | null>;
}

declare global {
  interface Window {
    __clerk_session?: ClerkSessionBridge;
  }
}

export function getClerkSession(): ClerkSessionBridge | null {
  return window.__clerk_session ?? null;
}

export function setClerkSession(session: ClerkSessionBridge | null): void {
  if (session) {
    window.__clerk_session = session;
  } else {
    delete window.__clerk_session;
  }
}
