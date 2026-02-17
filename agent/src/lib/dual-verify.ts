import { chatCompletion, getAnthropicHeaders, getAnthropicBaseURL, type ChatMessage } from "./model-router.js";

export interface DualVerifyResult<T> {
  opus: T;
  deepseek: T;
  consensus: T;
  divergences: string[];
}

/**
 * Call Claude Opus 4.6 directly via Anthropic API (not OpenRouter).
 * Uses Provider Keys when AI Gateway is configured.
 */
async function callOpus(systemPrompt: string, userPrompt: string): Promise<string> {
  const resp = await fetch(`${getAnthropicBaseURL()}/v1/messages`, {
    method: "POST",
    headers: getAnthropicHeaders(),
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Opus API error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return data.content?.[0]?.text ?? "";
}

/**
 * Run Opus 4.6 and DeepSeek V3.2 in parallel on the same prompt.
 * Compare outputs for consensus and divergences.
 *
 * Opus is the primary (most intelligent). DeepSeek provides verification.
 * If they diverge on key figures, divergences are flagged for user review.
 *
 * Use for: valuations, fundraising advice, compliance checks, financial projections.
 */
export async function dualVerify<T>(
  prompt: string,
  systemPrompt: string,
  opts?: { parse?: (text: string) => T },
): Promise<DualVerifyResult<T>> {
  const parse = opts?.parse ?? ((text: string) => JSON.parse(text) as T);

  const [opusResult, deepseekResult] = await Promise.allSettled([
    callOpus(systemPrompt, prompt),
    chatCompletion("deepseek", [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ], { temperature: 0.2, maxTokens: 8192 }),
  ]);

  // Opus is the primary model — if it fails, the whole operation fails
  if (opusResult.status === "rejected") {
    throw new Error(`Opus failed: ${opusResult.reason}`);
  }

  const opusRaw = opusResult.value;
  if (!opusRaw.trim()) {
    throw new Error("Opus returned empty response (possible safety filter or overloaded)");
  }

  const opus = parse(opusRaw);

  // DeepSeek is secondary — if it fails, return Opus only with a note
  if (deepseekResult.status === "rejected") {
    console.warn("DeepSeek verification failed (using Opus only):", deepseekResult.reason);
    return {
      opus,
      deepseek: opus,
      consensus: opus,
      divergences: [`DeepSeek verification unavailable: ${deepseekResult.reason}`],
    };
  }

  const deepseekRaw = deepseekResult.value;
  if (!deepseekRaw.trim()) {
    console.warn("DeepSeek returned empty response (using Opus only)");
    return {
      opus,
      deepseek: opus,
      consensus: opus,
      divergences: ["DeepSeek returned empty response"],
    };
  }

  const deepseek = parse(deepseekRaw);

  // Compare for divergences by stringifying and checking key differences
  const divergences = findDivergences(opus, deepseek);

  // Opus is primary — use as consensus unless there's a clear disagreement
  const consensus = opus;

  return { opus, deepseek, consensus, divergences };
}

/**
 * Compare two objects recursively, returning human-readable divergence descriptions.
 */
function findDivergences(a: unknown, b: unknown, path = ""): string[] {
  const divs: string[] = [];

  if (a === b) return divs;

  if (typeof a === "number" && typeof b === "number") {
    // Allow 5% tolerance for numeric values
    const avg = (Math.abs(a) + Math.abs(b)) / 2;
    if (avg > 0 && Math.abs(a - b) / avg > 0.05) {
      divs.push(`${path || "value"}: Opus=${a}, DeepSeek=${b} (${((Math.abs(a - b) / avg) * 100).toFixed(1)}% difference)`);
    }
    return divs;
  }

  if (typeof a !== typeof b) {
    divs.push(`${path || "value"}: type mismatch (Opus: ${typeof a}, DeepSeek: ${typeof b})`);
    return divs;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      divs.push(`${path || "array"}: length mismatch (Opus: ${a.length}, DeepSeek: ${b.length})`);
    }
    const minLen = Math.min(a.length, b.length);
    for (let i = 0; i < minLen; i++) {
      divs.push(...findDivergences(a[i], b[i], `${path}[${i}]`));
    }
    return divs;
  }

  if (a && b && typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of allKeys) {
      divs.push(...findDivergences(aObj[key], bObj[key], path ? `${path}.${key}` : key));
    }
    return divs;
  }

  if (a !== b) {
    const aStr = String(a).slice(0, 100);
    const bStr = String(b).slice(0, 100);
    divs.push(`${path || "value"}: Opus="${aStr}", DeepSeek="${bStr}"`);
  }

  return divs;
}
