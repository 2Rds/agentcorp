#!/usr/bin/env tsx
/**
 * Re-Index Script: Migrate all Redis vector embeddings from Cohere embed-v4.0
 * to Gemini Embedding 2 (gemini-embedding-001) at 1536 dimensions.
 *
 * Targets all 3 vector indexes:
 *   - idx:memories  (memory:* keys)    — agent persistent memory
 *   - idx:llm_cache (cache:* keys)      — semantic LLM response cache
 *   - idx:plugins   (plugin:* keys)    — knowledge plugin vectors
 *
 * Usage:
 *   REDIS_URL=redis://... GOOGLE_AI_API_KEY=... npx tsx scripts/reindex-gemini-embeddings.ts
 *
 * Options:
 *   --dry-run     Print what would be re-indexed without writing
 *   --index NAME  Only re-index a specific index (e.g. --index idx:memories)
 *   --batch-size  Number of docs to embed in parallel (default: 5)
 */

import { GoogleGenAI } from "@google/genai";
import { createClient } from "redis";

// ─── Config ──────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL;
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

if (!REDIS_URL) {
  console.error("REDIS_URL env var is required");
  process.exit(1);
}
if (!GOOGLE_AI_API_KEY) {
  console.error("GOOGLE_AI_API_KEY env var is required");
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const indexArg = args.indexOf("--index");
const ONLY_INDEX = indexArg >= 0 ? args[indexArg + 1] : null;
const batchArg = args.indexOf("--batch-size");
const BATCH_SIZE = batchArg >= 0 ? parseInt(args[batchArg + 1], 10) : 5;
const EMBEDDING_DIM = 1536;
const DELAY_BETWEEN_BATCHES_MS = 200;

const INDEXES = [
  { name: "idx:memories", textField: "text", embeddingField: "embedding" },
  // Note: prompt_embedding was originally embedded from the prompt text, but the prompt
  // is not stored as a hash field. "response" is used as a fallback for re-embedding.
  // Future: store prompt text alongside response for accurate re-indexing.
  { name: "idx:llm_cache", textField: "response", embeddingField: "prompt_embedding" },
  { name: "idx:plugins", textField: "text", embeddingField: "embedding" },
  { name: "idx:documents", textField: "content", embeddingField: "embedding" },
];

// Also check idx:llm_cache_v2 (the v2 version used by some agents)
const V2_CACHE = { name: "idx:llm_cache_v2", textField: "response", embeddingField: "prompt_embedding" };

// ─── Setup ───────────────────────────────────────────────────────────────────

const ai = new GoogleGenAI({ apiKey: GOOGLE_AI_API_KEY });

async function embedText(text: string): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: {
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: EMBEDDING_DIM,
    },
  });

  const embedding = result.embeddings?.[0]?.values;
  if (!embedding || embedding.length === 0) {
    throw new Error("Gemini embed returned empty embedding");
  }
  return embedding;
}

function toBuffer(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

// ─── Re-index logic ─────────────────────────────────────────────────────────

interface IndexConfig {
  name: string;
  textField: string;
  embeddingField: string;
}

async function getIndexDocCount(redis: ReturnType<typeof createClient>, indexName: string): Promise<number> {
  try {
    const info = await redis.sendCommand(["FT.INFO", indexName]) as unknown[];
    if (Array.isArray(info)) {
      for (let i = 0; i < info.length; i++) {
        if (info[i] === "num_docs") return parseInt(String(info[i + 1]), 10);
      }
    }
    return 0;
  } catch {
    return -1; // index doesn't exist
  }
}

async function getAllDocs(
  redis: ReturnType<typeof createClient>,
  indexName: string,
  textField: string,
): Promise<{ key: string; text: string }[]> {
  const docs: { key: string; text: string }[] = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const result = await redis.sendCommand([
      "FT.SEARCH", indexName, "*",
      "RETURN", "1", textField,
      "LIMIT", String(offset), String(pageSize),
      "DIALECT", "2",
    ]) as unknown[];

    if (!Array.isArray(result) || (result[0] as number) === 0) break;

    const total = result[0] as number;
    for (let i = 1; i < result.length; i += 2) {
      const key = result[i] as string;
      const fieldArray = result[i + 1] as string[];
      let text = "";
      if (Array.isArray(fieldArray)) {
        for (let j = 0; j < fieldArray.length; j += 2) {
          if (fieldArray[j] === textField) text = fieldArray[j + 1];
        }
      }
      if (text) docs.push({ key, text });
    }

    offset += pageSize;
    if (offset >= total) break;
  }

  return docs;
}

async function reindexBatch(
  redis: ReturnType<typeof createClient>,
  docs: { key: string; text: string }[],
  embeddingField: string,
): Promise<{ success: number; failed: number; failedKeys: string[] }> {
  let success = 0;
  let failed = 0;
  const failedKeys: string[] = [];

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (doc) => {
        const embedding = await embedText(doc.text);
        if (!DRY_RUN) {
          await redis.sendCommand([
            "HSET", doc.key,
            embeddingField, toBuffer(embedding),
          ]);
        }
        return doc.key;
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        success++;
      } else {
        failed++;
        failedKeys.push(batch[j]?.key ?? "unknown");
        console.error(`  Failed: ${r.reason}`);
      }
    }

    // Progress
    const processed = Math.min(i + BATCH_SIZE, docs.length);
    process.stdout.write(`\r  Progress: ${processed}/${docs.length} (${success} ok, ${failed} failed)`);

    // Rate limit delay between batches
    if (i + BATCH_SIZE < docs.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  console.log(); // newline after progress
  return { success, failed, failedKeys };
}

// ─── Validation ─────────────────────────────────────────────────────────────

const TEST_QUERIES = [
  "financial model revenue projections",
  "agent memory architecture decisions",
  "compliance regulatory requirements",
  "sales pipeline prospect data",
  "executive assistant scheduling preferences",
];

async function validateIndex(
  redis: ReturnType<typeof createClient>,
  indexName: string,
  embeddingField: string,
): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  for (const query of TEST_QUERIES) {
    try {
      const embedding = await embedText(query);
      const blob = toBuffer(embedding);
      const ftQuery = `*=>[KNN 3 @${embeddingField} $BLOB AS score]`;

      const result = await redis.sendCommand([
        "FT.SEARCH", indexName, ftQuery,
        "PARAMS", "2", "BLOB", blob,
        "SORTBY", "score",
        "LIMIT", "0", "3",
        "DIALECT", "2",
      ]) as unknown[];

      const count = Array.isArray(result) ? result[0] as number : 0;
      if (count > 0) {
        passed++;
        console.log(`    "${query}" -> ${count} results`);
      } else {
        failed++;
        console.log(`    "${query}" -> 0 results (WARN: index may be empty)`);
      }
    } catch (err) {
      failed++;
      console.error(`    "${query}" -> ERROR: ${err}`);
    }
  }

  return { passed, failed };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Gemini Embedding Re-Index Script ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Model: gemini-embedding-001 (${EMBEDDING_DIM}-dim, RETRIEVAL_DOCUMENT)`);
  console.log();

  const redis = createClient({ url: REDIS_URL });
  redis.on("error", (err) => console.error("Redis error:", err.message));
  await redis.connect();
  console.log("Redis connected");

  // Check for idx:llm_cache_v2 (some agents use v2)
  const allIndexes = [...INDEXES];
  const v2Count = await getIndexDocCount(redis, V2_CACHE.name);
  if (v2Count > 0) {
    allIndexes.push(V2_CACHE);
    console.log(`Found ${V2_CACHE.name} with ${v2Count} docs — adding to re-index`);
  }

  const targetIndexes = ONLY_INDEX
    ? allIndexes.filter(idx => idx.name === ONLY_INDEX)
    : allIndexes;

  if (targetIndexes.length === 0) {
    console.error(`No matching indexes found${ONLY_INDEX ? ` for "${ONLY_INDEX}"` : ""}`);
    await redis.quit();
    process.exit(1);
  }

  const summary: { index: string; total: number; success: number; failed: number }[] = [];

  for (const idx of targetIndexes) {
    console.log(`\n--- Re-indexing: ${idx.name} ---`);

    const docCount = await getIndexDocCount(redis, idx.name);
    if (docCount < 0) {
      console.log(`  Index ${idx.name} does not exist — skipping`);
      continue;
    }
    if (docCount === 0) {
      console.log(`  Index ${idx.name} is empty — skipping`);
      summary.push({ index: idx.name, total: 0, success: 0, failed: 0 });
      continue;
    }

    console.log(`  Found ${docCount} docs`);

    // Fetch all docs with text
    const docs = await getAllDocs(redis, idx.name, idx.textField);
    console.log(`  ${docs.length} docs with text content`);

    if (docs.length === 0) {
      summary.push({ index: idx.name, total: docCount, success: 0, failed: 0 });
      continue;
    }

    // Re-embed
    console.log(`  Re-embedding with Gemini Embedding 2...`);
    const { success, failed, failedKeys } = await reindexBatch(redis, docs, idx.embeddingField);

    if (failedKeys.length > 0) {
      console.log(`  Failed keys: ${failedKeys.join(", ")}`);
    }

    summary.push({ index: idx.name, total: docs.length, success, failed });

    // Validate (skip in dry run)
    if (!DRY_RUN && success > 0) {
      console.log(`  Validating search quality...`);
      const { passed, failed: valFailed } = await validateIndex(redis, idx.name, idx.embeddingField);
      console.log(`  Validation: ${passed}/${TEST_QUERIES.length} queries returned results`);
      if (valFailed > 0) {
        console.warn(`  WARNING: ${valFailed} validation queries returned 0 results`);
      }
    }
  }

  // Print summary
  console.log("\n=== Summary ===");
  for (const s of summary) {
    const status = s.failed === 0 ? "OK" : `${s.failed} FAILED`;
    console.log(`  ${s.index}: ${s.success}/${s.total} re-embedded (${status})`);
  }

  const totalFailed = summary.reduce((sum, s) => sum + s.failed, 0);
  if (totalFailed > 0) {
    console.error(`\n${totalFailed} total failures — re-run with --index to retry specific indexes`);
  }

  await redis.quit();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
