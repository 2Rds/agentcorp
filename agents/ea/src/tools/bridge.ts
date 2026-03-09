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
