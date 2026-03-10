/**
 * Notion Client — EA agent Notion API wrapper.
 *
 * Simplified version for the EA agent. Access is scoped to EA_SCOPE
 * permissions (Decision Log: readwrite, Project Hub: readwrite,
 * Investor Pipeline: read).
 */

import { Client } from "@notionhq/client";
import { config } from "../config.js";

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

export async function searchPages(query: string, pageSize: number = 10) {
  const notion = getClient();
  const response = await notion.search({
    query,
    page_size: pageSize,
    sort: { direction: "descending", timestamp: "last_edited_time" },
  });
  return response.results;
}

export async function getPage(pageId: string) {
  const notion = getClient();
  return notion.pages.retrieve({ page_id: pageId });
}

export async function getBlockChildren(blockId: string) {
  const notion = getClient();
  const response = await notion.blocks.children.list({
    block_id: blockId,
    page_size: 100,
  });
  return response.results;
}

export async function queryDatabase(
  databaseId: string,
  filter?: Record<string, unknown>,
  pageSize: number = 100,
) {
  const notion = getClient();
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: filter as any,
    page_size: pageSize,
  });
  return response.results;
}

export async function createPage(
  parentId: string,
  properties: Record<string, unknown>,
  children?: Array<Record<string, unknown>>,
  parentType: "database_id" | "page_id" = "database_id",
) {
  const notion = getClient();
  const response = await notion.pages.create({
    parent: { [parentType]: parentId } as any,
    properties: properties as any,
    children: children as any,
  });
  return response;
}

export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>,
) {
  const notion = getClient();
  return notion.pages.update({
    page_id: pageId,
    properties: properties as any,
  });
}

export async function appendBlockChildren(
  blockId: string,
  children: Array<Record<string, unknown>>,
) {
  const notion = getClient();
  return notion.blocks.children.append({
    block_id: blockId,
    children: children as any,
  });
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
    return "";
  }).filter(Boolean).join("\n");
}

/**
 * Format page properties into readable text.
 */
export function formatPageProperties(page: any): string {
  const props: string[] = [];
  for (const [key, value] of Object.entries(page.properties || {})) {
    const v = value as any;
    let text = "";
    if (v.title) text = v.title.map((t: any) => t.plain_text).join("");
    else if (v.rich_text) text = v.rich_text.map((t: any) => t.plain_text).join("");
    else if (v.select) text = v.select?.name ?? "";
    else if (v.multi_select) text = v.multi_select.map((s: any) => s.name).join(", ");
    else if (v.date) text = v.date?.start ?? "";
    else if (v.number !== undefined) text = String(v.number ?? "");
    else if (v.checkbox !== undefined) text = String(v.checkbox);
    else if (v.status) text = v.status?.name ?? "";
    if (text) props.push(`${key}: ${text}`);
  }
  return props.join("\n");
}
