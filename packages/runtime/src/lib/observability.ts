import * as Sentry from "@sentry/node";
import { PostHog } from "posthog-node";

let posthog: PostHog | undefined;

export function initSentry(agentId: string): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.warn(`[Sentry] SENTRY_DSN not set — error tracking disabled (${agentId})`);
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      serverName: agentId,
      tracesSampleRate: 0.2,
    });
    console.log(`[Sentry] Initialized (server=${agentId})`);
  } catch (err) {
    console.error("[Sentry] Initialization failed (non-fatal):", err);
  }
}

export function initPostHog(): void {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) {
    console.warn("[PostHog] POSTHOG_API_KEY not set — analytics disabled");
    return;
  }

  try {
    posthog = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      flushAt: 20,
      flushInterval: 10000,
    });
    console.log("[PostHog] Initialized (host=%s)", process.env.POSTHOG_HOST || "https://us.i.posthog.com");
  } catch (err) {
    console.error("[PostHog] Initialization failed (non-fatal):", err);
  }
}

export function getPostHog(): PostHog | undefined {
  return posthog;
}

export async function shutdownObservability(): Promise<void> {
  const stops: Promise<void>[] = [];
  if (posthog) stops.push(posthog.shutdown());
  stops.push(
    Sentry.close(2000).then((flushed) => {
      if (!flushed) console.warn("[Sentry] Flush timed out — some events may be lost");
    }),
  );
  const results = await Promise.allSettled(stops);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[Observability] Shutdown error:", result.reason);
    }
  }
}

export { Sentry };
