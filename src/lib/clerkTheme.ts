import type { Appearance } from '@clerk/clerk-react';

/**
 * Clerk appearance theme for Chief Financial Agent.
 * Dark mode with emerald accent, matching the CFO app palette.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: '#10b981',        // emerald-500
    colorBackground: '#09090b',     // zinc-950
    colorInputBackground: '#18181b', // zinc-900
    colorInputText: '#fafafa',      // zinc-50
    colorText: '#fafafa',           // zinc-50
    colorTextSecondary: '#a1a1aa',  // zinc-400
    colorDanger: '#ef4444',         // red-500
    borderRadius: '0.5rem',
    fontFamily: 'inherit',
  },
  elements: {
    card: 'bg-zinc-950 border border-zinc-800 shadow-2xl',
    headerTitle: 'text-zinc-50',
    headerSubtitle: 'text-zinc-400',
    formFieldLabel: 'text-zinc-300',
    formFieldInput: 'bg-zinc-900 border-zinc-700 text-zinc-50 focus:border-emerald-500 focus:ring-emerald-500/20',
    formButtonPrimary: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    footerActionLink: 'text-emerald-400 hover:text-emerald-300',
    identityPreview: 'bg-zinc-900 border-zinc-700',
    identityPreviewText: 'text-zinc-300',
    identityPreviewEditButton: 'text-emerald-400',
    socialButtonsBlockButton: 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800',
    dividerLine: 'bg-zinc-800',
    dividerText: 'text-zinc-500',
    formFieldAction: 'text-emerald-400',
    alertText: 'text-zinc-300',
    avatarBox: 'w-9 h-9',
  },
};
