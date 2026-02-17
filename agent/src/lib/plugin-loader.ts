import { readFileSync } from "fs";
import { join } from "path";
import { vectorSearch, isRedisAvailable } from "./redis-client.js";
import { embed } from "./model-router.js";
import { rerank, isCohereAvailable } from "./cohere-client.js";

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Registry ────────────────────────────────────────────────────────────────

const PLUGINS_DIR = join(import.meta.dirname ?? ".", "..", "..", "plugins");
const REGISTRY_PATH = join(PLUGINS_DIR, "registry.json");

let registry: SkillEntry[] | null = null;

// FIFO cache for loaded skill content (avoid repeated disk reads)
const skillContentCache = new Map<string, string>();
const CACHE_MAX = 50;

// Tool mapping for ~~placeholder replacement
let toolMapping: Record<string, { tool: string | null; description?: string; note?: string }> | null = null;

/**
 * Load the plugin registry from disk. Called once at server startup.
 */
export function loadPluginRegistry(): SkillEntry[] {
  if (registry) return registry;

  try {
    const raw = readFileSync(REGISTRY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) {
      console.error("Plugin registry is not an array");
      registry = [];
      return registry;
    }
    registry = parsed.filter((e): e is SkillEntry => {
      const valid = typeof e === "object" && e !== null
        && typeof (e as any).id === "string"
        && typeof (e as any).name === "string"
        && Array.isArray((e as any).keywords)
        && typeof (e as any).tokenEstimate === "number"
        && typeof (e as any).path === "string";
      if (!valid) console.warn("Skipping invalid skill entry:", JSON.stringify(e).slice(0, 100));
      return valid;
    });
    console.log(`Loaded plugin registry: ${registry.length} skills`);
    return registry;
  } catch (err) {
    console.warn("Plugin registry not found — run `npm run build:registry` to generate");
    registry = [];
    return registry;
  }
}

/**
 * Load tool mapping for ~~placeholder replacement.
 */
function getToolMapping(): Record<string, { tool: string | null; description?: string; note?: string }> {
  if (toolMapping) return toolMapping;

  try {
    const raw = readFileSync(join(PLUGINS_DIR, "tool-mapping.json"), "utf-8");
    toolMapping = JSON.parse(raw);
    return toolMapping!;
  } catch (err) {
    console.warn("Tool mapping not found or invalid — ~~placeholders will not be replaced:", err);
    toolMapping = {};
    return toolMapping;
  }
}

// ─── Skill resolution (keyword pre-filter + Redis vector re-rank) ────────────

/**
 * Resolve relevant skills for a user query.
 *
 * Two-stage matching:
 * 1. Keyword pre-filter: tokenize message, score against skill keywords (threshold 0.15)
 * 2. Redis vector re-rank: when 2+ keyword candidates, use idx:plugins FT.SEARCH KNN
 *
 * Returns top N skills within token budget.
 */
export async function resolveSkills(
  query: string,
  options: ResolveOptions = {},
): Promise<ResolvedSkill[]> {
  const { maxTokens = 4000, maxSkills = 3 } = options;
  const reg = loadPluginRegistry();
  if (reg.length === 0) return [];

  // Stage 1: Keyword pre-filter
  const queryTokens = tokenize(query);
  const candidates = reg
    .map((entry) => ({
      entry,
      score: keywordScore(queryTokens, entry.keywords, entry.description),
    }))
    .filter((c) => c.score > 0.15)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return [];

  // Stage 2: Redis vector re-rank (only when we have multiple candidates)
  let ranked: { id: string; score: number }[];

  if (candidates.length >= 2 && isRedisAvailable()) {
    try {
      const queryEmbedding = await embed(query);
      if (queryEmbedding.length > 0) {
        const results = await vectorSearch("idx:plugins", queryEmbedding, maxSkills * 2);
        if (results.length > 0) {
          // Use vector scores, filtered to our keyword candidates
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
      console.error("Plugin vector re-rank failed (falling back to keyword scoring):", err);
      ranked = candidates.map((c) => ({ id: c.entry.id, score: c.score }));
    }
  } else {
    ranked = candidates.map((c) => ({ id: c.entry.id, score: c.score }));
  }

  // Stage 2.5: Cohere Rerank (cross-encoder, only when 2+ candidates and Cohere is available)
  if (ranked.length >= 2 && isCohereAvailable()) {
    try {
      const rankedEntries = ranked
        .map((r) => ({ ...r, entry: reg.find((e) => e.id === r.id) }))
        .filter((r) => r.entry != null);

      if (rankedEntries.length >= 2) {
        const descriptions = rankedEntries.map(
          (r) => `${r.entry!.name}: ${r.entry!.description}`,
        );
        const reranked = await rerank(query, descriptions, maxSkills * 2);

        if (reranked.length > 0) {
          ranked = reranked.map((r) => ({
            id: rankedEntries[r.index].id,
            score: r.relevanceScore,
          }));
        }
      }
    } catch (err) {
      console.error("Cohere rerank failed (using previous ranking):", err);
    }
  }

  // Select top skills within token budget
  const selected: ResolvedSkill[] = [];
  let tokenBudget = maxTokens;

  for (const { id, score } of ranked.slice(0, maxSkills)) {
    const entry = reg.find((e) => e.id === id);
    if (!entry) continue;
    if (entry.tokenEstimate > tokenBudget) continue;

    const content = loadSkillContent(entry);
    if (!content) continue;

    tokenBudget -= entry.tokenEstimate;
    selected.push({
      id: entry.id,
      name: entry.name,
      content,
      tokenEstimate: entry.tokenEstimate,
      matchScore: score,
    });
  }

  return selected;
}

// ─── Skill content loading ───────────────────────────────────────────────────

/**
 * Load a SKILL.md file, strip frontmatter, and replace ~~placeholders.
 * FIFO cached (50 entries).
 */
function loadSkillContent(entry: SkillEntry): string | null {
  if (skillContentCache.has(entry.id)) {
    return skillContentCache.get(entry.id)!;
  }

  try {
    const filePath = join(PLUGINS_DIR, entry.path);
    const raw = readFileSync(filePath, "utf-8");

    // Strip YAML frontmatter
    let content = raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();

    // Replace ~~placeholders with actual tool names
    const mapping = getToolMapping();
    content = content.replace(/~~\w+/g, (match) => {
      const mapped = mapping[match];
      if (!mapped) return match;
      if (mapped.tool) return `\`${mapped.tool}\``;
      return `${match} (${mapped.note ?? "not connected"})`;
    });

    // LRU eviction
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

// ─── Conversation-aware skill tracking ───────────────────────────────────────

export interface SkillContext {
  activeSkills: Set<string>;
  topicHistory: string[];
}

const conversationSkills = new Map<string, SkillContext>();
const CONVERSATION_SKILLS_MAX = 500;

/**
 * Get or create skill context for a conversation.
 * Evicts oldest entries when map exceeds max size to prevent unbounded growth.
 */
export function getSkillContext(conversationId: string): SkillContext {
  if (!conversationSkills.has(conversationId)) {
    // FIFO eviction: remove oldest entries when at capacity
    if (conversationSkills.size >= CONVERSATION_SKILLS_MAX) {
      const oldestKey = conversationSkills.keys().next().value;
      if (oldestKey) conversationSkills.delete(oldestKey);
    }
    conversationSkills.set(conversationId, {
      activeSkills: new Set(),
      topicHistory: [],
    });
  }
  return conversationSkills.get(conversationId)!;
}

/**
 * Resolve skills with conversation-aware dedup.
 * Avoids re-injecting skills already active in the conversation.
 */
export async function resolveSkillsForConversation(
  query: string,
  conversationId: string,
  options: ResolveOptions = {},
): Promise<ResolvedSkill[]> {
  const ctx = getSkillContext(conversationId);
  const skills = await resolveSkills(query, options);

  // Filter out already-active skills
  const newSkills = skills.filter((s) => !ctx.activeSkills.has(s.id));

  // Track newly resolved skills
  for (const skill of newSkills) {
    ctx.activeSkills.add(skill.id);
  }

  // Track topic for conversation history
  if (query.length > 0) {
    ctx.topicHistory.push(query.slice(0, 100));
    if (ctx.topicHistory.length > 20) ctx.topicHistory.shift();
  }

  return newSkills;
}

/**
 * Clean up conversation skill context.
 */
export function clearSkillContext(conversationId: string): void {
  conversationSkills.delete(conversationId);
}

// ─── Utility functions ───────────────────────────────────────────────────────

/**
 * Tokenize a query into lowercase words (3+ chars).
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9-]/g, ""))
    .filter((w) => w.length > 2);
}

/**
 * Score keyword overlap between query tokens and skill keywords + description.
 */
function keywordScore(queryTokens: string[], keywords: string[], description: string): number {
  if (queryTokens.length === 0) return 0;

  const skillText = [...keywords, ...description.toLowerCase().split(/\s+/)].join(" ");
  let matches = 0;

  for (const token of queryTokens) {
    if (skillText.includes(token)) matches++;
  }

  return matches / queryTokens.length;
}
