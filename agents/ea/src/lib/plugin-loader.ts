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
const skillContentCache = new Map<string, string>();
const CACHE_MAX = 50;

let toolMapping: Record<string, { tool: string | null; description?: string; note?: string }> | null = null;

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
      return valid;
    });
    console.log(`Loaded plugin registry: ${registry.length} skills`);
    return registry;
  } catch (err) {
    console.warn("Plugin registry not found -- run `npm run build:registry` to generate");
    registry = [];
    return registry;
  }
}

function getToolMapping(): Record<string, { tool: string | null; description?: string; note?: string }> {
  if (toolMapping) return toolMapping;
  try {
    const raw = readFileSync(join(PLUGINS_DIR, "tool-mapping.json"), "utf-8");
    toolMapping = JSON.parse(raw);
    return toolMapping!;
  } catch {
    toolMapping = {};
    return toolMapping;
  }
}

// ─── Skill resolution ────────────────────────────────────────────────────────

export async function resolveSkills(
  query: string,
  options: ResolveOptions = {},
): Promise<ResolvedSkill[]> {
  const { maxTokens = 4000, maxSkills = 3 } = options;
  const reg = loadPluginRegistry();
  if (reg.length === 0) return [];

  const queryTokens = tokenize(query);
  const candidates = reg
    .map((entry) => ({
      entry,
      score: keywordScore(queryTokens, entry.keywords, entry.description),
    }))
    .filter((c) => c.score > 0.15)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return [];

  let ranked: { id: string; score: number }[];

  if (candidates.length >= 2 && isRedisAvailable()) {
    try {
      const queryEmbedding = await embed(query);
      if (queryEmbedding.length > 0) {
        const results = await vectorSearch("idx:plugins", queryEmbedding, maxSkills * 2);
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
    } catch {
      ranked = candidates.map((c) => ({ id: c.entry.id, score: c.score }));
    }
  } else {
    ranked = candidates.map((c) => ({ id: c.entry.id, score: c.score }));
  }

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
    } catch {
      // Use previous ranking
    }
  }

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

function loadSkillContent(entry: SkillEntry): string | null {
  if (skillContentCache.has(entry.id)) {
    return skillContentCache.get(entry.id)!;
  }

  try {
    const filePath = join(PLUGINS_DIR, entry.path);
    const raw = readFileSync(filePath, "utf-8");
    let content = raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();

    const mapping = getToolMapping();
    content = content.replace(/~~\w+/g, (match) => {
      const mapped = mapping[match];
      if (!mapped) return match;
      if (mapped.tool) return `\`${mapped.tool}\``;
      return `${match} (${mapped.note ?? "not connected"})`;
    });

    if (skillContentCache.size >= CACHE_MAX) {
      const firstKey = skillContentCache.keys().next().value;
      if (firstKey) skillContentCache.delete(firstKey);
    }

    skillContentCache.set(entry.id, content);
    return content;
  } catch {
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

export function getSkillContext(conversationId: string): SkillContext {
  if (!conversationSkills.has(conversationId)) {
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

export async function resolveSkillsForConversation(
  query: string,
  conversationId: string,
  options: ResolveOptions = {},
): Promise<ResolvedSkill[]> {
  const ctx = getSkillContext(conversationId);
  const skills = await resolveSkills(query, options);
  const newSkills = skills.filter((s) => !ctx.activeSkills.has(s.id));

  for (const skill of newSkills) {
    ctx.activeSkills.add(skill.id);
  }

  if (query.length > 0) {
    ctx.topicHistory.push(query.slice(0, 100));
    if (ctx.topicHistory.length > 20) ctx.topicHistory.shift();
  }

  return newSkills;
}

export function clearSkillContext(conversationId: string): void {
  conversationSkills.delete(conversationId);
}

// ─── Utility functions ───────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9-]/g, ""))
    .filter((w) => w.length > 2);
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
