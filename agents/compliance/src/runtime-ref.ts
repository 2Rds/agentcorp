/**
 * Runtime reference — allows tools to access the AgentRuntime instance.
 * Set once at startup, read by tool handlers that need MessageBus.
 */

import type { AgentRuntime } from "@waas/runtime";

let _runtime: AgentRuntime | null = null;

export function setRuntime(runtime: AgentRuntime): void {
  _runtime = runtime;
}

export function getRuntime(): AgentRuntime | null {
  return _runtime;
}
