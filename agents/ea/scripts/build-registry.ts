/**
 * Build-time script: generates registry.json from plugin SKILL.md files.
 * Optionally seeds Redis idx:plugins with embeddings (--seed-redis flag).
 *
 * Usage:
 *   npx tsx scripts/build-registry.ts            # Build registry.json only
 *   npx tsx scripts/build-registry.ts --seed-redis  # Build + seed Redis vectors
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const PLUGINS_DIR = join(import.meta.dirname ?? ".", "..", "plugins");
const REGISTRY_PATH = join(PLUGINS_DIR, "registry.json");

interface SkillEntry {
  id: string;
  plugin: string;
  name: string;
  description: string;
  keywords: string[];
  path: string;
  tokenEstimate: number;
}

function parseFrontmatter(content: string): { name: string; description: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { name: "", description: "", body: content };

  const yaml = match[1];
  const body = match[2];
  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  const descMatch = yaml.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch?.[1]?.trim() ?? "",
    description: descMatch?.[1]?.trim() ?? "",
    body: body.trim(),
  };
}

function extractKeywords(description: string, body: string): string[] {
  const words = new Set<string>();

  for (const word of description.toLowerCase().split(/\s+/)) {
    const clean = word.replace(/[^a-z0-9-]/g, "");
    if (clean.length > 3) words.add(clean);
  }

  const headers = body.match(/^#{2,3}\s+(.+)$/gm) ?? [];
  for (const header of headers) {
    const text = header.replace(/^#+\s+/, "").toLowerCase();
    for (const word of text.split(/\s+/)) {
      const clean = word.replace(/[^a-z0-9-]/g, "");
      if (clean.length > 3) words.add(clean);
    }
  }

  return [...words];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildRegistry(): SkillEntry[] {
  const entries: SkillEntry[] = [];

  let plugins: string[];
  try {
    plugins = readdirSync(PLUGINS_DIR).filter((dir) => {
      const fullPath = join(PLUGINS_DIR, dir, "skills");
      try { return statSync(fullPath).isDirectory(); } catch { return false; }
    });
  } catch {
    console.log("No plugins directory found -- creating empty registry");
    return [];
  }

  for (const plugin of plugins) {
    const skillsDir = join(PLUGINS_DIR, plugin, "skills");
    const skills = readdirSync(skillsDir).filter((dir) => {
      const skillPath = join(skillsDir, dir, "SKILL.md");
      try { return statSync(skillPath).isFile(); } catch { return false; }
    });

    for (const skill of skills) {
      const skillPath = join(skillsDir, skill, "SKILL.md");
      const content = readFileSync(skillPath, "utf-8");
      const { name, description, body } = parseFrontmatter(content);

      const id = `${plugin}/${name || skill}`;
      const keywords = extractKeywords(description, body);

      entries.push({
        id,
        plugin,
        name: name || skill,
        description,
        keywords,
        path: relative(PLUGINS_DIR, skillPath).replace(/\\/g, "/"),
        tokenEstimate: estimateTokens(content),
      });
    }
  }

  return entries;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const entries = buildRegistry();

// Ensure plugins directory exists for registry output
try {
  statSync(PLUGINS_DIR);
} catch {
  const { mkdirSync } = await import("fs");
  mkdirSync(PLUGINS_DIR, { recursive: true });
}

writeFileSync(REGISTRY_PATH, JSON.stringify(entries, null, 2));
console.log(`Built registry: ${entries.length} skills`);

for (const entry of entries) {
  console.log(`  ${entry.id} (${entry.tokenEstimate} tokens, ${entry.keywords.length} keywords)`);
}

if (process.argv.includes("--seed-redis")) {
  console.log("\nSeeding Redis idx:plugins...");

  const { embed } = await import("../src/lib/model-router.js");
  const { getRedis, initializeRedisIndexes } = await import("../src/lib/redis-client.js");

  const redis = await getRedis();
  if (!redis) {
    console.error("Redis not available -- cannot seed vectors");
    process.exit(1);
  }

  await initializeRedisIndexes();

  let seeded = 0;
  for (const entry of entries) {
    try {
      const embeddingText = `${entry.name}: ${entry.description}`;
      const embedding = await embed(embeddingText, "RETRIEVAL_DOCUMENT");

      if (embedding.length > 0) {
        const blob = Buffer.from(new Float32Array(embedding).buffer);
        await redis.sendCommand([
          "HSET", `plugin:${entry.id}`,
          "description", entry.description,
          "keywords", entry.keywords.join(" "),
          "skill_id", entry.id,
          "embedding", blob as unknown as string,
        ]);
        seeded++;
      }
    } catch (err) {
      console.error(`Failed to embed ${entry.id}:`, err);
    }
  }

  console.log(`Seeded ${seeded}/${entries.length} skills to Redis`);
  await redis.disconnect();
}
