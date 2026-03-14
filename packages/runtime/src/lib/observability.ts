import * as Sentry from "@sentry/node";
import { PostHog } from "posthog-node";

let posthog: PostHog | undefined;

export function initSentry(agentId: string): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    serverName: agentId,
    tracesSampleRate: 0.2,
  });
}

export function initPostHog(): PostHog | undefined {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return undefined;

  posthog = new PostHog(apiKey, {
    host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    flushAt: 20,
    flushInterval: 10000,
  });

  return posthog;
}

export function getPostHog(): PostHog | undefined {
  return posthog;
}

export async function shutdownObservability(): Promise<void> {
  const stops: Promise<void>[] = [];
  if (posthog) stops.push(posthog.shutdown());
  stops.push(Sentry.close(2000).then(() => {}));
  await Promise.allSettled(stops);
}

export { Sentry };
