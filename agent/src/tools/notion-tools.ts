/**
 * Notion Tools — CFO agent Notion database access.
 *
 * Provides query, create, update, and append operations on Notion databases.
 * Access is enforced by CFA_SCOPE rules inlined in notion-client.ts.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { config } from "../config.js";
import {
  queryDatabase,
  createPage,
  updatePage,
  appendBlockChildren,
  formatBlocks,
} from "../lib/notion-client.js";

const MAX_RESULT_LENGTH = 30000;

function truncate(text: string): string {
  if (text.length <= MAX_RESULT_LENGTH) return text;
  return text.slice(0, MAX_RESULT_LENGTH) + "\n\n[...truncated]";
}

export function notionTools(_orgId: string) {
  if (!config.notionEnabled) return [];

  const query_notion_database = tool(
    "query_notion_database",
    "Query a Notion database with optional filters and sorting. Returns page entries with their properties. Use this to read the Decision Log, Investor Pipeline, or Project Hub databases.",
    {
      database_id: z.string().describe("Notion database ID (with or without dashes)"),
      filter: z.string().optional().describe("JSON filter object per Notion API spec (optional)"),
      sorts: z.string().optional().describe("JSON array of sort objects [{property, direction}] (optional)"),
      page_size: z.number().optional().describe("Max results (default 100)"),
    },
    async (args) => {
      try {
        const filter = args.filter ? JSON.parse(args.filter) : undefined;
        const sorts = args.sorts ? JSON.parse(args.sorts) : undefined;

        const results = await queryDatabase(args.database_id, {
          filter,
          sorts,
          pageSize: args.page_size,
        });

        if (!results.length) {
          return { content: [{ type: "text" as const, text: "No results found in database." }] };
        }

        // Format results showing properties
        const formatted = results.map((page: any) => {
          const props: Record<string, string> = {};
          for (const [key, value] of Object.entries(page.properties || {})) {
            const v = value as any;
            if (v.title) props[key] = v.title.map((t: any) => t.plain_text).join("");
            else if (v.rich_text) props[key] = v.rich_text.map((t: any) => t.plain_text).join("");
            else if (v.select) props[key] = v.select?.name ?? "";
            else if (v.multi_select) props[key] = v.multi_select.map((s: any) => s.name).join(", ");
            else if (v.date) props[key] = v.date?.start ?? "";
            else if (v.number !== undefined) props[key] = String(v.number ?? "");
            else if (v.checkbox !== undefined) props[key] = String(v.checkbox);
            else if (v.status) props[key] = v.status?.name ?? "";
            else if (v.url) props[key] = v.url ?? "";
            else if (v.relation) props[key] = `[${v.relation.length} relations]`;
          }
          return { id: page.id, ...props };
        });

        return { content: [{ type: "text" as const, text: truncate(JSON.stringify(formatted, null, 2)) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error querying database: ${err.message}` }], isError: true };
      }
    }
  );

  const create_notion_page = tool(
    "create_notion_page",
    "Create a new page in a Notion database. Provide properties as a JSON object matching the database schema. Optionally include page content as markdown.",
    {
      database_id: z.string().describe("Target Notion database ID"),
      properties: z.string().describe("JSON object of page properties matching the database schema"),
      content: z.string().optional().describe("Page body content as markdown (converted to Notion blocks)"),
    },
    async (args) => {
      try {
        const properties = JSON.parse(args.properties);
        const children = args.content ? markdownToBlocks(args.content) : undefined;

        const page = await createPage(args.database_id, properties, children);
        return { content: [{ type: "text" as const, text: `Page created: ${(page as any).url ?? page.id}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error creating page: ${err.message}` }], isError: true };
      }
    }
  );

  const update_notion_page = tool(
    "update_notion_page",
    "Update an existing Notion page's properties. Provide the page ID and properties to update as a JSON object.",
    {
      page_id: z.string().describe("Notion page ID to update"),
      properties: z.string().describe("JSON object of properties to update"),
    },
    async (args) => {
      try {
        const properties = JSON.parse(args.properties);
        const page = await updatePage(args.page_id, properties);
        return { content: [{ type: "text" as const, text: `Page updated: ${(page as any).url ?? page.id}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error updating page: ${err.message}` }], isError: true };
      }
    }
  );

  const append_notion_content = tool(
    "append_notion_content",
    "Append content blocks to an existing Notion page. Use this to add sections, paragraphs, headings, lists, and other content to a page.",
    {
      page_id: z.string().describe("Notion page ID to append content to"),
      content: z.string().describe("Content to append as markdown (converted to Notion blocks)"),
    },
    async (args) => {
      try {
        const blocks = markdownToBlocks(args.content);
        const result = await appendBlockChildren(args.page_id, blocks);
        return { content: [{ type: "text" as const, text: `Appended ${result.results.length} blocks to page.` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error appending content: ${err.message}` }], isError: true };
      }
    }
  );

  return [query_notion_database, create_notion_page, update_notion_page, append_notion_content];
}

/**
 * Convert simple markdown to Notion block objects.
 * Handles headings, paragraphs, bullet lists, numbered lists, code blocks, and dividers.
 */
function markdownToBlocks(markdown: string): Array<Record<string, unknown>> {
  const lines = markdown.split("\n");
  const blocks: Array<Record<string, unknown>> = [];
  let inCodeBlock = false;
  let codeContent = "";
  let codeLanguage = "";

  for (const line of lines) {
    // Code block start/end
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        blocks.push({
          object: "block",
          type: "code",
          code: {
            rich_text: [{ type: "text", text: { content: codeContent.trimEnd() } }],
            language: codeLanguage || "plain text",
          },
        });
        codeContent = "";
        codeLanguage = "";
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + "\n";
      continue;
    }

    // Divider
    if (line.trim() === "---") {
      blocks.push({ object: "block", type: "divider", divider: {} });
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: [{ type: "text", text: { content: line.slice(4) } }] },
      });
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: line.slice(3) } }] },
      });
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: [{ type: "text", text: { content: line.slice(2) } }] },
      });
      continue;
    }

    // Bullet list
    if (line.startsWith("- ") || line.startsWith("* ")) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: line.slice(2) } }] },
      });
      continue;
    }

    // Numbered list
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);
    if (numberedMatch) {
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: [{ type: "text", text: { content: numberedMatch[1] } }] },
      });
      continue;
    }

    // Empty line → skip (Notion doesn't need explicit blank paragraphs)
    if (line.trim() === "") continue;

    // Paragraph
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ type: "text", text: { content: line } }] },
    });
  }

  return blocks;
}
