// Re-export from @waas/runtime — EA is in npm workspaces so can import directly.
// Wrap initSentry to pass the EA agent ID.
import { initSentry as initSentryBase } from "@waas/runtime";

export function initSentry(): void {
  initSentryBase("blockdrive-ea");
}

export { initPostHog, shutdownObservability, getPostHog, Sentry } from "@waas/runtime";
