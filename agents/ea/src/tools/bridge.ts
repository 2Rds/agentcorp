/**
 * Tool Bridge — Defines EA tools natively for the Anthropic Messages API.
 *
 * Instead of trying to convert Agent SDK tool() objects, this defines tools
 * directly as Anthropic API tool definitions + handler functions.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "../lib/supabase.js";
import { searchOrgMemories, addOrgMemory, searchCrossNamespaceMemories } from "../lib/mem0-client.js";
import { chatCompletion } from "../lib/model-router.js";
import { config } from "../config.js";
import * as notion from "../lib/notion-client.js";
import { sendSlackMessage, readSlackChannel, listChannels, resolveUserName } from "../transport/slack.js";

type ToolHandler = (args: Record<string, any>) => Promise<string>;

interface ToolEntry {
  def: Anthropic.Tool;
  handler: ToolHandler;
}

function createTools(orgId: string, _userId: string): ToolEntry[] {
  return [
    // ─── Knowledge Tools ──────────────────────────────────────────────
    {
      def: {
        name: "search_knowledge",
        description: "Search the knowledge base by semantic relevance. Has executive-tier cross-namespace read access to all department memories.",
        input_schema: {
          type: "object" as const,
          properties: {
            query: { type: "string", description: "Natural language search query" },
            cross_namespace: { type: "boolean", description: "Search across all departments (default true)" },
          },
          required: ["query"],
        },
      },
      handler: async (args) => {
        try {
          const results = args.cross_namespace !== false
            ? await searchCrossNamespaceMemories(args.query, orgId, { limit: 10 })
            : await searchOrgMemories(args.query, orgId, { agentId: "blockdrive-ea", limit: 10 });
          if (!results.length) return "No matching knowledge found.";
          return results.map((r: any) => `- ${r.memory}`).join("\n");
        } catch (e: any) { return `Error: ${e.message}`; }
      },
    },
    {
      def: {
        name: "save_knowledge",
        description: "Save a fact, preference, or decision to persistent memory. Persists across conversations.",
        input_schema: {
          type: "object" as const,
          properties: {
            content: { type: "string", description: "The fact or knowledge to save" },
            category: { type: "string", description: "Category: scheduling, communications, cross_department, executive_decisions, meeting_notes, contacts, project_tracking, investor_relations, hiring" },
            tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
          },
          required: ["content"],
        },
      },
      handler: async (args) => {
        try {
          await addOrgMemory(args.content, orgId, {
            category: args.category || "executive_decisions",
            metadata: { tags: args.tags || [], agent: "blockdrive-ea" },
          });
          return "Saved to knowledge base.";
        } catch (e: any) { return `Error saving: ${e.message}`; }
      },
    },

    // ─── Task Tools ───────────────────────────────────────────────────
    {
      def: {
        name: "create_task",
        description: "Create a new task in Sean's task queue.",
        input_schema: {
          type: "object" as const,
          properties: {
            title: { type: "string", description: "Short task title" },
            description: { type: "string", description: "Detailed description" },
            priority: { type: "string", enum: ["urgent", "high", "normal", "low"], description: "Priority level" },
            due_date: { type: "string", description: "Deadline YYYY-MM-DD" },
            assigned_to: { type: "string", description: "Assignee" },
          },
          required: ["title"],
        },
      },
      handler: async (args) => {
        try {
          const { data, error } = await supabaseAdmin.from("ea_tasks").insert({
            organization_id: orgId,
            title: args.title,
            description: args.description || null,
            priority: args.priority || "normal",
            status: "pending",
            due_date: args.due_date || null,
            assigned_to: args.assigned_to || null,
            created_by: "alex-ea",
          }).select().single();
          if (error) throw error;
          return `Task created: "${data.title}" (${data.priority}, ${data.status})`;
        } catch (e: any) { return `Error: ${e.message}`; }
      },
    },
    {
      def: {
        name: "list_tasks",
        description: "List current tasks, optionally filtered by status or priority.",
        input_schema: {
          type: "object" as const,
          properties: {
            status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"], description: "Filter by status" },
            limit: { type: "number", description: "Max results (default 10)" },
          },
        },
      },
      handler: async (args) => {
        try {
          let query = supabaseAdmin.from("ea_tasks").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(args.limit || 10);
          if (args.status) query = query.eq("status", args.status);
          const { data, error } = await query;
          if (error) throw error;
          if (!data?.length) return "No tasks found.";
          return data.map((t: any) => `- [${t.priority}] ${t.title} (${t.status})${t.due_date ? ` due ${t.due_date}` : ""}`).join("\n");
        } catch (e: any) { return `Error: ${e.message}`; }
      },
    },

    // ─── Meeting Notes Tools ──────────────────────────────────────────
    {
      def: {
        name: "save_meeting_notes",
        description: "Save structured meeting notes with attendees, summary, and action items.",
        input_schema: {
          type: "object" as const,
          properties: {
            title: { type: "string", description: "Meeting title" },
            date: { type: "string", description: "Meeting date YYYY-MM-DD" },
            attendees: { type: "array", items: { type: "string" }, description: "List of attendees" },
            summary: { type: "string", description: "Meeting summary" },
            action_items: { type: "array", items: { type: "object", properties: { action: { type: "string" }, assignee: { type: "string" }, due: { type: "string" } } }, description: "Action items" },
            key_decisions: { type: "array", items: { type: "string" }, description: "Key decisions made" },
          },
          required: ["title", "summary"],
        },
      },
      handler: async (args) => {
        try {
          const { data, error } = await supabaseAdmin.from("ea_meeting_notes").insert({
            organization_id: orgId,
            title: args.title,
            date: args.date || new Date().toISOString().split("T")[0],
            attendees: args.attendees || [],
            summary: args.summary,
            action_items: args.action_items || [],
            key_decisions: args.key_decisions || [],
          }).select().single();
          if (error) throw error;
          return `Meeting notes saved: "${data.title}"`;
        } catch (e: any) { return `Error: ${e.message}`; }
      },
    },

    // ─── Communications Tools ─────────────────────────────────────────
    {
      def: {
        name: "draft_email",
        description: "Compose an email draft. Stores the draft — does not send.",
        input_schema: {
          type: "object" as const,
          properties: {
            subject: { type: "string", description: "Email subject" },
            body: { type: "string", description: "Email body" },
            recipients: { type: "array", items: { type: "string" }, description: "Recipient emails" },
          },
          required: ["subject", "body"],
        },
      },
      handler: async (args) => {
        try {
          const { data, error } = await supabaseAdmin.from("ea_communications_log").insert({
            organization_id: orgId,
            type: "email_draft",
            subject: args.subject,
            body: args.body,
            recipients: args.recipients || [],
            status: "draft",
          }).select().single();
          if (error) throw error;
          return `Email draft saved: "${data.subject}"`;
        } catch (e: any) { return `Error: ${e.message}`; }
      },
    },

    // ─── Web Search Tool ──────────────────────────────────────────────
    {
      def: {
        name: "web_search",
        description: "Search the web for real-time information using Perplexity Sonar.",
        input_schema: {
          type: "object" as const,
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      },
      handler: async (args) => {
        try {
          const result = await chatCompletion("sonar", [{ role: "user", content: args.query }], { maxTokens: 1000 });
          return result || "No results found.";
        } catch (e: any) { return `Search error: ${e.message}`; }
      },
    },

    // ─── Slack Tools (conditional — only if SLACK_BOT_TOKEN is set) ──
    // EA has admin access to all channels. Department agents are isolated
    // to their #workforce-* channel. These tools give the EA full workspace
    // awareness for the Slack communication layer.
    ...(config.slackEnabled ? [
      {
        def: {
          name: "send_slack_message",
          description: "Send a message to a Slack channel. Use for notifications, updates, cross-department announcements, feed posts, or proactive communications. Channel can be a name (e.g., 'workforce-finance', 'fundraise') or a channel ID.",
          input_schema: {
            type: "object" as const,
            properties: {
              channel: { type: "string", description: "Slack channel name (e.g., workforce-alex, fundraise, feed-ops) or channel ID" },
              message: { type: "string", description: "Message text to send" },
              thread_ts: { type: "string", description: "Thread timestamp to reply in a thread (optional)" },
            },
            required: ["channel", "message"],
          },
        },
        handler: async (args: Record<string, any>) => {
          try {
            await sendSlackMessage(args.channel, args.message, args.thread_ts);
            return `Message sent to #${args.channel}.`;
          } catch (e: any) { return `Error sending Slack message: ${e.message}`; }
        },
      },
      {
        def: {
          name: "read_slack_channel",
          description: "Read recent messages from a Slack channel. Use to monitor department activity, check status updates, or gather context before responding. EA has admin read access to all channels.",
          input_schema: {
            type: "object" as const,
            properties: {
              channel: { type: "string", description: "Channel name (e.g., workforce-finance, command-center) or channel ID" },
              limit: { type: "number", description: "Number of messages to retrieve (default 10, max 50)" },
            },
            required: ["channel"],
          },
        },
        handler: async (args: Record<string, any>) => {
          try {
            const limit = Math.min(args.limit || 10, 50);
            const messages = await readSlackChannel(args.channel, limit);
            if (!messages.length) return `No recent messages in #${args.channel}.`;

            const formatted = await Promise.all(messages.map(async (m) => {
              const name = await resolveUserName(m.user);
              const time = new Date(parseFloat(m.ts) * 1000).toLocaleString();
              return `[${time}] ${name}: ${m.text}`;
            }));

            return `Recent messages in #${args.channel}:\n${formatted.join("\n")}`;
          } catch (e: any) { return `Error reading channel: ${e.message}`; }
        },
      },
      {
        def: {
          name: "list_slack_channels",
          description: "List all Slack channels the bot has access to, with their type (workforce, purpose, feed) and description. Use to discover available channels or check workspace structure.",
          input_schema: {
            type: "object" as const,
            properties: {},
          },
        },
        handler: async () => {
          try {
            const channels = listChannels();
            if (!channels.length) return "No channels discovered yet.";

            const grouped: Record<string, string[]> = {};
            for (const ch of channels) {
              const type = ch.type;
              if (!grouped[type]) grouped[type] = [];
              grouped[type].push(`  - #${ch.name}${ch.description ? ` — ${ch.description}` : ""}`);
            }

            const sections = Object.entries(grouped).map(([type, lines]) =>
              `**${type.charAt(0).toUpperCase() + type.slice(1)} channels:**\n${lines.join("\n")}`
            );
            return sections.join("\n\n");
          } catch (e: any) { return `Error listing channels: ${e.message}`; }
        },
      },
    ] as ToolEntry[] : []),

    // ─── Notion Tools (conditional — only if NOTION_API_KEY is set) ──
    ...(config.notionEnabled ? [
      {
        def: {
          name: "search_notion",
          description: "Search the Notion workspace by query. Returns matching pages with titles, IDs, and last-edited timestamps.",
          input_schema: {
            type: "object" as const,
            properties: {
              query: { type: "string", description: "Search query" },
              page_size: { type: "number", description: "Max results (default 10)" },
            },
            required: ["query"],
          },
        },
        handler: async (args: Record<string, any>) => {
          try {
            const results = await notion.searchPages(args.query, args.page_size || 10);
            if (!results.length) return "No matching Notion pages found.";
            return results.map((page: any) => {
              const title = page.properties?.Name?.title?.[0]?.plain_text
                ?? page.properties?.title?.title?.[0]?.plain_text
                ?? "(untitled)";
              return `- **${title}** (id: ${page.id}, edited: ${page.last_edited_time ?? "unknown"})`;
            }).join("\n");
          } catch (e: any) { return `Notion search error: ${e.message}`; }
        },
      },
      {
        def: {
          name: "read_notion_page",
          description: "Read a Notion page's content by ID. Returns the page properties and body content as text.",
          input_schema: {
            type: "object" as const,
            properties: {
              page_id: { type: "string", description: "Notion page ID" },
            },
            required: ["page_id"],
          },
        },
        handler: async (args: Record<string, any>) => {
          try {
            const [page, blocks] = await Promise.allSettled([
              notion.getPage(args.page_id),
              notion.getBlockChildren(args.page_id),
            ]);

            const parts: string[] = [];
            if (page.status === "fulfilled") {
              parts.push("## Properties\n" + notion.formatPageProperties(page.value));
            }
            if (blocks.status === "fulfilled") {
              parts.push("## Content\n" + notion.formatBlocks(blocks.value));
            }
            return parts.join("\n\n") || "Page found but no readable content.";
          } catch (e: any) { return `Error reading page: ${e.message}`; }
        },
      },
      {
        def: {
          name: "create_notion_page",
          description: "Create a new page in a Notion database or as a child of an existing page. For databases, provide properties matching the schema. For child pages, provide a parent page ID and title.",
          input_schema: {
            type: "object" as const,
            properties: {
              parent_id: { type: "string", description: "Parent database ID or page ID" },
              parent_type: { type: "string", enum: ["database_id", "page_id"], description: "Type of parent (default: database_id)" },
              properties: { type: "string", description: "JSON object of page properties" },
              content: { type: "string", description: "Page body content as plain text (optional)" },
            },
            required: ["parent_id", "properties"],
          },
        },
        handler: async (args: Record<string, any>) => {
          try {
            const properties = JSON.parse(args.properties);
            const children = args.content ? [{
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ type: "text", text: { content: args.content } }] },
            }] : undefined;
            const parentType = args.parent_type || "database_id";
            const page = await notion.createPage(args.parent_id, properties, children, parentType);
            return `Page created: ${(page as any).url ?? page.id}`;
          } catch (e: any) { return `Error creating page: ${e.message}`; }
        },
      },
      {
        def: {
          name: "update_notion_page",
          description: "Update an existing Notion page's properties or append content to it.",
          input_schema: {
            type: "object" as const,
            properties: {
              page_id: { type: "string", description: "Notion page ID to update" },
              properties: { type: "string", description: "JSON object of properties to update (optional)" },
              append_content: { type: "string", description: "Text content to append to the page body (optional)" },
            },
            required: ["page_id"],
          },
        },
        handler: async (args: Record<string, any>) => {
          try {
            const results: string[] = [];

            if (args.properties) {
              const properties = JSON.parse(args.properties);
              await notion.updatePage(args.page_id, properties);
              results.push("Properties updated.");
            }

            if (args.append_content) {
              await notion.appendBlockChildren(args.page_id, [{
                object: "block",
                type: "paragraph",
                paragraph: { rich_text: [{ type: "text", text: { content: args.append_content } }] },
              }]);
              results.push("Content appended.");
            }

            return results.join(" ") || "No changes specified.";
          } catch (e: any) { return `Error updating page: ${e.message}`; }
        },
      },
    ] as ToolEntry[] : []),

    // ─── Inter-Agent Messaging ─────────────────────────────────────────
    {
      def: {
        name: "message_agent",
        description: "Send a message to another agent in the network. Executive-tier: can message COA, CFA, CMA, Legal, Sales. Messages are queued for delivery.",
        input_schema: {
          type: "object" as const,
          properties: {
            target_agent_id: { type: "string", description: "Agent ID to message (e.g., blockdrive-coa, blockdrive-cma, blockdrive-legal)" },
            subject: { type: "string", description: "Message subject (max 200 chars)" },
            message: { type: "string", description: "Message content (max 4000 chars)" },
            priority: { type: "string", enum: ["normal", "urgent"], description: "Message priority" },
          },
          required: ["target_agent_id", "subject", "message"],
        },
      },
      handler: async (args: Record<string, any>) => {
        try {
          const { data, error } = await supabaseAdmin
            .from("agent_messages")
            .insert({
              org_id: orgId,
              sender_id: "blockdrive-ea",
              target_id: args.target_agent_id,
              message: `${args.subject}: ${args.message}`,
              priority: args.priority || "normal",
              status: "queued",
            })
            .select("id, target_id, status")
            .single();
          if (error) return `Message send failed: ${error.message}`;
          return `Message sent to ${args.target_agent_id} (ID: ${data.id}, status: ${data.status})`;
        } catch (e: any) {
          return `Message send failed: ${e.message}`;
        }
      },
    },
  ];
}

/**
 * Creates all EA tools for the Anthropic Messages API.
 */
export function createEaTools(orgId: string, userId: string): {
  toolDefs: Anthropic.Tool[];
  handlers: Map<string, ToolHandler>;
} {
  const tools = createTools(orgId, userId);
  const toolDefs = tools.map((t) => t.def);
  const handlers = new Map<string, ToolHandler>();
  for (const t of tools) {
    handlers.set(t.def.name, t.handler);
  }
  return { toolDefs, handlers };
}
