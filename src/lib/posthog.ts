import posthog from 'posthog-js';
import * as Sentry from '@sentry/react';

export function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) {
    console.warn('[PostHog] VITE_POSTHOG_KEY not set — analytics disabled');
    return;
  }

  try {
    posthog.init(key, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      autocapture: true,
      capture_pageview: false,
    });

    // Link PostHog sessions to Sentry errors (bidirectional integration)
    const sessionId = posthog.get_session_id();
    if (sessionId) {
      Sentry.getCurrentScope().setTag('posthog_session_id', sessionId);
    }

    console.log('[PostHog] Initialized (Sentry integration active)');
  } catch (err) {
    console.error('[PostHog] Initialization failed (non-fatal):', err);
  }
}

export { posthog };
