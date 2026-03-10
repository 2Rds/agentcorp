/**
 * Notion Client — Scope-aware Notion API wrapper for CFO agent.
 *
 * Inlines scope enforcement (CFA_SCOPE Notion access rules) to avoid
 * a workspace dependency on @waas/shared. The CFO agent package lives
 * outside the npm workspaces root.
 */

import { Client } from "@notionhq/client";
import { config } from "../config.js";

// ─── Inline scope enforcement ────────────────────────────────────────────────

type AccessLevel = "read" | "readwrite";

interface NotionDbScope {
  id: string;
  access: AccessLevel;
}

// CFA_SCOPE Notion databases (mirrored from packages/shared/src/namespace/scopes.ts)
const CFA_NOTION_DBS: NotionDbScope[] = [
  { id: "b6b305990a8a438d921867d1a8628f31", access: "readwrite" }, // Investor Pipeline
  { id: "492613a71ab443eba53553f086375d0d", access: "readwrite" }, // Decision Log
  { id: "4fa32110ae2b43b6839c1d25e84111fe", access: "read" },      // Project Hub
];

function checkNotionAccess(databaseId: string, requiredAccess: AccessLevel): boolean {
  const normalizedId = databaseId.replace(/-/g, "");
  return CFA_NOTION_DBS.some(db => {
    if (db.id !== normalizedId) return false;
    if (requiredAccess === "readwrite" && db.access === "read") return false;
    return true;
  });
}

// ─── Notion Client ───────────────────────────────────────────────────────────

let notionClient: Client | null = null;

function getClient(): Client {
  if (!notionClient) {
    if (!config.notionApiKey) {
      throw new Error("Notion API key not configured (NOTION_API_KEY)");
    }
    notionClient = new Client({ auth: config.notionApiKey });
  }
  return notionClient;
}

export interface NotionQueryOptions {
  filter?: Record<string, unknown>;
  sorts?: Array<{ property: string; direction: "ascending" | "descending" }>;
  pageSize?: number;
}

/**
 * Query a Notion database with scope enforcement.
 */
export async function queryDatabase(
  databaseId: string,
  options: NotionQueryOptions = {},
) {
  if (!checkNotionAccess(databaseId, "read")) {
    throw new Error(`Access denied: CFA cannot read Notion database ${databaseId}`);
  }

  const notion = getClient();
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: options.filter as any,
    sorts: options.sorts as any,
    page_size: options.pageSize ?? 100,
  });

  return response.results;
}

/**
 * Create a page in a Notion database with scope enforcement.
 */
export async function createPage(
  databaseId: string,
  properties: Record<string, unknown>,
  children?: Array<Record<string, unknown>>,
) {
  if (!checkNotionAccess(databaseId, "readwrite")) {
    throw new Error(`Access denied: CFA cannot write to Notion database ${databaseId}`);
  }

  const notion = getClient();
  const response = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: properties as any,
    children: children as any,
  });

  return response;
}

/**
 * Create a child page under an existing page (not in a database).
 */
export async function createChildPage(
  parentPageId: string,
  title: string,
  children?: Array<Record<string, unknown>>,
) {
  const notion = getClient();
  const response = await notion.pages.create({
    parent: { page_id: parentPageId },
    properties: {
      title: { title: [{ text: { content: title } }] },
    },
    children: children as any,
  });

  return response;
}

/**
 * Update a page's properties.
 */
export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>,
) {
  const notion = getClient();
  const response = await notion.pages.update({
    page_id: pageId,
    properties: properties as any,
  });

  return response;
}

/**
 * Get a page by ID.
 */
export async function getPage(pageId: string) {
  const notion = getClient();
  return notion.pages.retrieve({ page_id: pageId });
}

/**
 * Append block children to a page or block.
 */
export async function appendBlockChildren(
  blockId: string,
  children: Array<Record<string, unknown>>,
) {
  const notion = getClient();
  const response = await notion.blocks.children.append({
    block_id: blockId,
    children: children as any,
  });

  return response;
}

/**
 * Search Notion workspace by query.
 */
export async function searchPages(query: string, pageSize: number = 10) {
  const notion = getClient();
  const response = await notion.search({
    query,
    page_size: pageSize,
    sort: { direction: "descending", timestamp: "last_edited_time" },
  });

  return response.results;
}

/**
 * Get block children (page content).
 */
export async function getBlockChildren(blockId: string) {
  const notion = getClient();
  const response = await notion.blocks.children.list({
    block_id: blockId,
    page_size: 100,
  });

  return response.results;
}

/**
 * Format Notion page results into readable text.
 */
export function formatPageResults(results: any[]): string {
  return results.map((page: any) => {
    const title = page.properties?.Name?.title?.[0]?.plain_text
      ?? page.properties?.title?.title?.[0]?.plain_text
      ?? page.properties?.Decision?.title?.[0]?.plain_text
      ?? "(untitled)";
    const lastEdited = page.last_edited_time ?? "";
    const id = page.id ?? "";
    return `- **${title}** (id: ${id}, edited: ${lastEdited})`;
  }).join("\n");
}

/**
 * Format Notion blocks into readable text.
 */
export function formatBlocks(blocks: any[]): string {
  return blocks.map((block: any) => {
    const type = block.type;
    const content = block[type];
    if (!content) return "";

    if (content.rich_text) {
      const text = content.rich_text.map((rt: any) => rt.plain_text).join("");
      if (type === "heading_1") return `# ${text}`;
      if (type === "heading_2") return `## ${text}`;
      if (type === "heading_3") return `### ${text}`;
      if (type === "bulleted_list_item") return `- ${text}`;
      if (type === "numbered_list_item") return `1. ${text}`;
      if (type === "to_do") return `- [${content.checked ? "x" : " "}] ${text}`;
      return text;
    }

    if (type === "divider") return "---";
    if (type === "code") return `\`\`\`${content.language || ""}\n${content.rich_text?.map((rt: any) => rt.plain_text).join("")}\n\`\`\``;

    return "";
  }).filter(Boolean).join("\n");
}
