/**
 * Knowledge-Work-Plugin Loader
 *
 * Resolves relevant domain knowledge (skills) from the plugin registry
 * based on user query content. Three-stage matching:
 *   1. Keyword pre-filter (tokenized query vs skill keywords)
 *   2. Redis vector re-rank (embedding similarity via RediSearch KNN)
 *   3. Conversation-aware dedup (avoid re-injecting active skills)
 *
 * Skills are ~2-3K tokens of markdown/JSON that get injected into the
 * system prompt as "Domain Knowledge". They load on-demand and add
 * zero overhead when inactive.
 */

import { readFile } from "fs/promises";
import { readFileSync } from "fs";
import { join, resolve, normalize } from "path";
import type { RedisClientType } from "redis";
import { vectorSearch } from "./redis-client.js";
import type { ModelRouter } from "@waas/shared";

// ─── Types ─────────────────────────────────────────────────────────────────

interface SkillEntry {
  id: string;
  plugin: string;
  name: string;
  description: string;
  keywords: string[];
  path: string;
  tokenEstimate: number;
}

export interface ResolvedSkill {
  id: string;
  name: string;
  content: string;
  tokenEstimate: number;
  matchScore: number;
}

interface ResolveOptions {
  maxTokens?: number;
  maxSkills?: number;
}

// ─── Stop Words (filtered from keyword matching) ────────────────────────────

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "has", "have", "been", "some", "them",
  "than", "its", "who", "did", "get", "may", "him", "how", "this", "that",
  "with", "what", "from", "will", "each", "make", "like", "just", "also",
  "into", "more", "about", "which", "when", "where", "there", "been", "would",
  "could", "should", "their", "these", "those", "other", "being", "does",
]);

// ─── Registry ──────────────────────────────────────────────────────────────

let registry: SkillEntry[] | null = null;
let pluginsDir: string | null = null;

const skillContentCache = new Map<string, string>();
const CACHE_MAX = 50;

let toolMapping: Record<string, { tool: string | null; description?: string; note?: string }> | null = null;

/**
 * Set the plugins directory path. Called once during agent initialization.
 */
export function setPluginsDir(dir: string): void {
  pluginsDir = dir;
}

/**
 * Load the plugin registry from disk. Called once at server startup.
 * Uses synchronous I/O since this runs only during initialization.
 */
export function loadPluginRegistry(): SkillEntry[] {
  if (registry) return registry;
  if (!pluginsDir) {
    console.warn("Plugins directory not set — call setPluginsDir() first");
    registry = [];
    return registry;
  }

  try {
    const raw = readFileSync(join(pluginsDir, "registry.json"), "utf-8");
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) {
      console.error("Plugin registry is not an array");
      registry = [];
      return registry;
    }
    registry = parsed.filter((e): e is SkillEntry => {
      const valid = typeof e === "object" && e !== null
        && typeof (e as Record<string, unknown>).id === "string"
        && typeof (e as Record<string, unknown>).name === "string"
        && Array.isArray((e as Record<string, unknown>).keywords)
        && typeof (e as Record<string, unknown>).tokenEstimate === "number"
        && typeof (e as Record<string, unknown>).path === "string";
      return valid;
    });
    console.log(`Loaded plugin registry: ${registry.length} skills`);
    return registry;
  } catch {
    console.warn("Plugin registry not found — run build:registry to generate");
    registry = [];
    return registry;
  }
}

function getToolMapping(): Record<string, { tool: string | null; description?: string; note?: string }> {
  if (toolMapping) return toolMapping;
  if (!pluginsDir) { toolMapping = {}; return toolMapping; }

  try {
    const raw = readFileSync(join(pluginsDir, "tool-mapping.json"), "utf-8");
    toolMapping = JSON.parse(raw);
    return toolMapping!;
  } catch {
    toolMapping = {};
    return toolMapping;
  }
}

// ─── Skill Resolution ──────────────────────────────────────────────────────

/**
 * Resolve relevant skills for a user query.
 *
 * Two-stage matching:
 *   1. Keyword pre-filter (threshold 0.15)
 *   2. Redis vector re-rank when 2+ candidates and Redis is available
 */
export async function resolveSkills(
  query: string,
  router: ModelRouter,
  redis: RedisClientType | null,
  options: ResolveOptions = {},
): Promise<ResolvedSkill[]> {
  const { maxTokens = 4000, maxSkills = 3 } = options;
  const reg = loadPluginRegistry();
  if (reg.length === 0) return [];

  // Stage 1: Keyword pre-filter
  const queryTokens = tokenize(query);
  const candidates = reg
    .map((entry) => ({ entry, score: keywordScore(queryTokens, entry.keywords, entry.description) }))
    .filter((c) => c.score > 0.15)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return [];

  // Stage 2: Redis vector re-rank
  let ranked: { id: string; score: number }[];

  if (candidates.length >= 2 && redis) {
    try {
      const result = await router.embed(query);
      if (result.embedding.length > 0) {
        const results = await vectorSearch(redis, "idx:plugins", result.embedding, maxSkills * 2);
        if (results.length > 0) {
          const candidateIds = new Set(candidates.map((c) => c.entry.id));
          ranked = results
            .filter((r) => candidateIds.has(r.fields.skill_id ?? ""))
            .map((r) => ({ id: r.fields.skill_id ?? "", score: 1 - r.distance }));
        } else {
          ranked = candidates.map((c) => ({ id: c.entry.id, score: c.score }));
        }
      } else {
        ranked = candidates.map((c) => ({ id: c.entry.id, score: c.score }));
      }
    } catch (err) {
      console.error("Plugin vector re-rank failed, falling back to keyword matching:", err);
      ranked = candidates.map((c) => ({ id: c.entry.id, score: c.score }));
    }
  } else {
    ranked = candidates.map((c) => ({ id: c.entry.id, score: c.score }));
  }

  // Select top skills within token budget
  const selected: ResolvedSkill[] = [];
  let tokenBudget = maxTokens;

  for (const { id, score } of ranked.slice(0, maxSkills)) {
    const entry = reg.find((e) => e.id === id);
    if (!entry || entry.tokenEstimate > tokenBudget) continue;
    const content = await loadSkillContent(entry);
    if (!content) continue;
    tokenBudget -= entry.tokenEstimate;
    selected.push({ id: entry.id, name: entry.name, content, tokenEstimate: entry.tokenEstimate, matchScore: score });
  }

  return selected;
}

async function loadSkillContent(entry: SkillEntry): Promise<string | null> {
  if (skillContentCache.has(entry.id)) return skillContentCache.get(entry.id)!;
  if (!pluginsDir) return null;

  try {
    // Path traversal protection: resolve and verify the path stays within pluginsDir
    const resolvedPluginsDir = resolve(pluginsDir);
    const filePath = resolve(pluginsDir, entry.path);
    const normalizedPath = normalize(filePath);

    if (!normalizedPath.startsWith(resolvedPluginsDir)) {
      console.error(`Path traversal blocked for skill ${entry.id}: ${entry.path}`);
      return null;
    }

    const raw = await readFile(filePath, "utf-8");
    // Handle both LF and CRLF line endings in YAML frontmatter
    let content = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();

    // Replace ~~placeholders with actual tool names
    const mapping = getToolMapping();
    content = content.replace(/~~\w+/g, (match) => {
      const mapped = mapping[match];
      if (!mapped) return match;
      return mapped.tool ? `\`${mapped.tool}\`` : `${match} (${mapped.note ?? "not connected"})`;
    });

    if (skillContentCache.size >= CACHE_MAX) {
      const firstKey = skillContentCache.keys().next().value;
      if (firstKey) skillContentCache.delete(firstKey);
    }
    skillContentCache.set(entry.id, content);
    return content;
  } catch (err) {
    console.error(`Failed to load skill ${entry.id}:`, err);
    return null;
  }
}

// ─── Conversation-Aware Skill Tracking ─────────────────────────────────────

export interface SkillContext {
  activeSkills: Set<string>;
  topicHistory: string[];
}

const conversationSkills = new Map<string, SkillContext>();
const CONVERSATION_SKILLS_MAX = 500;

export function getSkillContext(conversationId: string): SkillContext {
  if (!conversationSkills.has(conversationId)) {
    if (conversationSkills.size >= CONVERSATION_SKILLS_MAX) {
      const oldestKey = conversationSkills.keys().next().value;
      if (oldestKey) conversationSkills.delete(oldestKey);
    }
    conversationSkills.set(conversationId, { activeSkills: new Set(), topicHistory: [] });
  }
  return conversationSkills.get(conversationId)!;
}

/**
 * Resolve skills with conversation-aware dedup.
 */
export async function resolveSkillsForConversation(
  query: string,
  conversationId: string,
  router: ModelRouter,
  redis: RedisClientType | null,
  options: ResolveOptions = {},
): Promise<ResolvedSkill[]> {
  const ctx = getSkillContext(conversationId);
  const skills = await resolveSkills(query, router, redis, options);
  const newSkills = skills.filter((s) => !ctx.activeSkills.has(s.id));
  for (const skill of newSkills) ctx.activeSkills.add(skill.id);
  if (query.length > 0) {
    ctx.topicHistory.push(query.slice(0, 100));
    if (ctx.topicHistory.length > 20) ctx.topicHistory.shift();
  }
  return newSkills;
}

export function clearSkillContext(conversationId: string): void {
  conversationSkills.delete(conversationId);
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9-]/g, ""))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function keywordScore(queryTokens: string[], keywords: string[], description: string): number {
  if (queryTokens.length === 0) return 0;
  const skillText = [...keywords, ...description.toLowerCase().split(/\s+/)].join(" ");
  let matches = 0;
  for (const token of queryTokens) {
    if (skillText.includes(token)) matches++;
  }
  return matches / queryTokens.length;
}
