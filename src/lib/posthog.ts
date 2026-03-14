import posthog from 'posthog-js';

export function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) {
    console.warn('[PostHog] VITE_POSTHOG_KEY not set — analytics disabled');
    return;
  }

  try {
    posthog.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
      autocapture: true,
      capture_pageview: false,
    });
    console.log('[PostHog] Initialized');
  } catch (err) {
    console.error('[PostHog] Initialization failed (non-fatal):', err);
  }
}

export { posthog };
