import { config } from "../config.js";

const MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1";

export interface MoonshotMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MoonshotOpts {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/**
 * Call Moonshot's K2.5 API directly (not through OpenRouter).
 * Used for Agent Swarm mode — supports 256K context, batch parallel processing.
 *
 * Falls back to OpenRouter K2.5 if MOONSHOT_API_KEY is not configured.
 */
export async function moonshotChat(
  messages: MoonshotMessage[],
  opts: MoonshotOpts = {},
): Promise<string> {
  const apiKey = config.moonshotApiKey;

  if (!apiKey) {
    // Fallback: route through OpenRouter
    const { chatCompletion } = await import("./model-router.js");
    return chatCompletion("kimi", messages, {
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
  }

  const model = opts.model ?? "moonshot-v1-auto";

  const resp = await fetch(`${MOONSHOT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 8192,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Moonshot API error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (content == null) {
    throw new Error(`Moonshot returned no content`);
  }
  return content;
}

/**
 * Run a K2.5 Agent Swarm: dispatch N tasks in parallel via Moonshot direct API.
 * Each task gets its own independent K2.5 call with the shared system prompt.
 *
 * @param tasks - Array of user prompts to process in parallel
 * @param systemPrompt - Shared system prompt for all tasks
 * @param opts - Concurrency limit and model options
 * @returns Array of responses (null for failed tasks)
 */
export async function swarmDispatch(
  tasks: string[],
  systemPrompt: string,
  opts?: { concurrency?: number } & MoonshotOpts,
): Promise<(string | null)[]> {
  const concurrency = opts?.concurrency ?? 20;
  const results: (string | null)[] = [];

  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map((task) =>
        moonshotChat(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: task },
          ],
          opts,
        ),
      ),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error("Swarm task failed:", result.reason);
        results.push(null);
      }
    }
  }

  const failureCount = results.filter(r => r === null).length;
  if (failureCount > 0) {
    console.error(`Swarm dispatch: ${failureCount}/${tasks.length} tasks failed`);
  }
  if (failureCount === tasks.length && tasks.length > 0) {
    throw new Error(`Swarm dispatch failed: all ${tasks.length} tasks returned errors`);
  }

  return results;
}
