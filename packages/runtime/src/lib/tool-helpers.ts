/**
 * Shared Tool Helpers — Utilities for agent MCP tool implementations
 *
 * Provides security (SSRF protection), error handling (safeFetch, safeJsonParse),
 * and content sanitization (stripHtml) used across all department agents.
 */

// ─── SSRF Protection ──────────────────────────────────────────────────────────

const BLOCKED_HOSTNAMES = new Set([
  "localhost", "127.0.0.1", "::1", "0.0.0.0",
  "169.254.169.254",   // Cloud metadata (AWS, DO, GCP)
  "metadata.google.internal",
]);

const BLOCKED_SUFFIXES = [".internal", ".local", ".localhost"];

const PRIVATE_IP_REGEX = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|fc00:|fd[0-9a-f]{2}:)/;

/**
 * Validates a URL is safe to fetch — blocks private IPs, cloud metadata,
 * localhost, and non-HTTP protocols. Use before every outbound fetch.
 */
export function isAllowedUrl(url: string): { allowed: true } | { allowed: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "Invalid URL format" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { allowed: false, reason: `Protocol ${parsed.protocol} not allowed — only http/https` };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { allowed: false, reason: `Hostname ${hostname} is blocked (internal/metadata)` };
  }

  for (const suffix of BLOCKED_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return { allowed: false, reason: `Hostname suffix ${suffix} is blocked (internal)` };
    }
  }

  if (PRIVATE_IP_REGEX.test(hostname)) {
    return { allowed: false, reason: `Private IP range blocked: ${hostname}` };
  }

  return { allowed: true };
}

// ─── Safe JSON Parse ──────────────────────────────────────────────────────────

/**
 * Parse JSON with a specific error message instead of throwing SyntaxError
 * inside a broad catch block. Returns discriminated union.
 */
export function safeJsonParse(input: string, fieldName: string): { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(input) };
  } catch {
    return { ok: false, error: `Invalid JSON in ${fieldName}: ${input.slice(0, 200)}` };
  }
}

// ─── Safe Fetch ───────────────────────────────────────────────────────────────

export interface FetchResult<T> {
  ok: true;
  data: T;
}

export interface FetchError {
  ok: false;
  error: string;
}

/**
 * Fetch with HTTP status validation. Returns structured result instead of
 * silently consuming error responses.
 */
export async function safeFetch<T = unknown>(
  url: string,
  options: RequestInit,
  label: string,
): Promise<FetchResult<T> | FetchError> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "unknown");
      return { ok: false, error: `${label} failed (HTTP ${res.status}): ${errorBody.slice(0, 500)}` };
    }
    const data = await res.json() as T;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: `${label} failed: ${String(e)}` };
  }
}

/**
 * Fetch raw text with HTTP status validation and SSRF protection.
 */
export async function safeFetchText(
  url: string,
  options: RequestInit,
  label: string,
): Promise<FetchResult<string> | FetchError> {
  const urlCheck = isAllowedUrl(url);
  if (!urlCheck.allowed) {
    return { ok: false, error: `${label}: URL blocked — ${urlCheck.reason}` };
  }
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      return { ok: false, error: `${label}: HTTP ${res.status} ${res.statusText} for ${url}` };
    }
    const body = await res.text();
    return { ok: true, data: body };
  } catch (e) {
    return { ok: false, error: `${label} failed: ${String(e)}` };
  }
}

// ─── HTML Stripping ───────────────────────────────────────────────────────────

/**
 * Strip HTML tags and normalize whitespace for safe tool output.
 * Prevents prompt injection via raw HTML in fetched content.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
