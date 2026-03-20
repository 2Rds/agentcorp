import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { addOrgMemory } from "../lib/memory-client.js";
import { chatCompletion, webSearch } from "../lib/model-router.js";

// ─── Task Management ─────────────────────────────────────────────────────────

export function taskTools(orgId: string) {
  const create_task = tool(
    "create_task",
    "Create a new task in Sean's task queue. Automatically saves to knowledge for cross-session recall. Use for action items from meetings, follow-ups, deadlines, and assigned work.",
    {
      title: z.string().describe("Short, actionable task title"),
      description: z.string().optional().describe("Detailed description of what needs to be done"),
      priority: z.enum(["urgent", "high", "normal", "low"]).default("normal").describe("Task priority level"),
      due_date: z.string().optional().describe("Deadline in YYYY-MM-DD format"),
      assigned_to: z.string().optional().describe("Person or agent responsible (e.g., 'Sean', 'blockdrive-cfa')"),
      tags: z.array(z.string()).optional().describe("Categorization tags (e.g., 'fundraising', 'hiring', 'product')"),
    },
    async (args) => {
      try {
        const { data, error } = await supabaseAdmin
          .from("ea_tasks")
          .insert({
            organization_id: orgId,
            title: args.title,
            description: args.description || null,
            priority: args.priority,
            status: "pending",
            due_date: args.due_date || null,
            assigned_to: args.assigned_to || null,
            created_by: "alex-ea",
            tags: args.tags || [],
          })
          .select()
          .single();

        if (error) throw error;

        // Save to knowledge for cross-session recall
        const duePart = args.due_date ? ` (due ${args.due_date})` : "";
        const assigneePart = args.assigned_to ? ` assigned to ${args.assigned_to}` : "";
        await addOrgMemory(
          `Task created: ${args.title}${duePart}${assigneePart}. Priority: ${args.priority}.`,
          orgId,
          { category: "project_tracking", metadata: { task_id: data.id } },
        ).catch(e => console.error("Failed to save task to memory:", e));

        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error creating task: ${e.message}` }], isError: true };
      }
    }
  );

  const update_task = tool(
    "update_task",
    "Update an existing task's status, priority, due date, or other fields.",
    {
      task_id: z.string().describe("UUID of the task to update"),
      status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional().describe("New status"),
      priority: z.enum(["urgent", "high", "normal", "low"]).optional().describe("New priority"),
      due_date: z.string().optional().describe("New deadline in YYYY-MM-DD format"),
      assigned_to: z.string().optional().describe("New assignee"),
      description: z.string().optional().describe("Updated description"),
    },
    async (args) => {
      try {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (args.status) updates.status = args.status;
        if (args.priority) updates.priority = args.priority;
        if (args.due_date) updates.due_date = args.due_date;
        if (args.assigned_to) updates.assigned_to = args.assigned_to;
        if (args.description) updates.description = args.description;

        const { data, error } = await supabaseAdmin
          .from("ea_tasks")
          .update(updates)
          .eq("id", args.task_id)
          .eq("organization_id", orgId)
          .select()
          .single();

        if (error) throw error;

        if (args.status === "completed") {
          await addOrgMemory(
            `Task completed: ${data.title}`,
            orgId,
            { category: "project_tracking", metadata: { task_id: data.id } },
          ).catch(() => {});
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error updating task: ${e.message}` }], isError: true };
      }
    }
  );

  const list_tasks = tool(
    "list_tasks",
    "List tasks from Sean's task queue. Filter by status, priority, assignee, or tags.",
    {
      status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional().describe("Filter by status"),
      priority: z.enum(["urgent", "high", "normal", "low"]).optional().describe("Filter by priority"),
      assigned_to: z.string().optional().describe("Filter by assignee"),
      limit: z.number().default(20).describe("Max results to return"),
    },
    async (args) => {
      try {
        let query = supabaseAdmin
          .from("ea_tasks")
          .select("*")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(args.limit);

        if (args.status) query = query.eq("status", args.status);
        if (args.priority) query = query.eq("priority", args.priority);
        if (args.assigned_to) query = query.eq("assigned_to", args.assigned_to);

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
          return { content: [{ type: "text" as const, text: "No tasks found matching criteria." }] };
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error listing tasks: ${e.message}` }], isError: true };
      }
    }
  );

  const delete_task = tool(
    "delete_task",
    "Delete a task from the queue. Use sparingly -- prefer marking as cancelled.",
    {
      task_id: z.string().describe("UUID of the task to delete"),
    },
    async (args) => {
      try {
        const { error } = await supabaseAdmin
          .from("ea_tasks")
          .delete()
          .eq("id", args.task_id)
          .eq("organization_id", orgId);

        if (error) throw error;
        return { content: [{ type: "text" as const, text: `Task ${args.task_id} deleted.` }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error deleting task: ${e.message}` }], isError: true };
      }
    }
  );

  return [create_task, update_task, list_tasks, delete_task];
}

// ─── Meeting Notes ───────────────────────────────────────────────────────────

export function meetingNotesTools(orgId: string) {
  const save_meeting_notes = tool(
    "save_meeting_notes",
    "Record structured meeting notes with attendees, action items, and key decisions. Automatically saves to knowledge for future retrieval.",
    {
      title: z.string().describe("Meeting title (e.g., 'Weekly standup', 'Investor call with Sequoia')"),
      date: z.string().describe("Meeting date in YYYY-MM-DD format"),
      attendees: z.array(z.string()).describe("List of attendees (names)"),
      summary: z.string().describe("Concise meeting summary (2-5 sentences)"),
      action_items: z.array(z.object({
        item: z.string().describe("Action item description"),
        owner: z.string().describe("Who is responsible"),
        deadline: z.string().optional().describe("Deadline in YYYY-MM-DD format"),
      })).optional().describe("Action items with owners and deadlines"),
      key_decisions: z.array(z.string()).optional().describe("Key decisions made during the meeting"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
    },
    async (args) => {
      try {
        const { data, error } = await supabaseAdmin
          .from("ea_meeting_notes")
          .insert({
            organization_id: orgId,
            title: args.title,
            date: args.date,
            attendees: args.attendees,
            summary: args.summary,
            action_items: args.action_items || [],
            key_decisions: args.key_decisions || [],
            tags: args.tags || [],
          })
          .select()
          .single();

        if (error) throw error;

        // Save summary to knowledge for future context retrieval
        const attendeeStr = args.attendees.join(", ");
        const decisionStr = args.key_decisions?.length
          ? ` Decisions: ${args.key_decisions.join("; ")}.`
          : "";
        await addOrgMemory(
          `Meeting "${args.title}" on ${args.date} with ${attendeeStr}. ${args.summary}${decisionStr}`,
          orgId,
          { category: "meeting_notes", metadata: { meeting_id: data.id } },
        ).catch(e => console.error("Failed to save meeting to memory:", e));

        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error saving meeting notes: ${e.message}` }], isError: true };
      }
    }
  );

  const search_meeting_notes = tool(
    "search_meeting_notes",
    "Search past meeting notes by keyword, attendee, or date range.",
    {
      query: z.string().optional().describe("Search text (searches title, summary, and attendees)"),
      attendee: z.string().optional().describe("Filter by attendee name"),
      date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
      limit: z.number().default(10).describe("Max results to return"),
    },
    async (args) => {
      try {
        let query = supabaseAdmin
          .from("ea_meeting_notes")
          .select("*")
          .eq("organization_id", orgId)
          .order("date", { ascending: false })
          .limit(args.limit);

        if (args.query) query = query.or(`title.ilike.%${args.query}%,summary.ilike.%${args.query}%`);
        if (args.attendee) query = query.contains("attendees", [args.attendee]);
        if (args.date_from) query = query.gte("date", args.date_from);
        if (args.date_to) query = query.lte("date", args.date_to);

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
          return { content: [{ type: "text" as const, text: "No meeting notes found matching criteria." }] };
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error searching meeting notes: ${e.message}` }], isError: true };
      }
    }
  );

  const list_meeting_notes = tool(
    "list_meeting_notes",
    "List recent meeting notes, optionally filtered by date range.",
    {
      limit: z.number().default(10).describe("Max results to return"),
      date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    },
    async (args) => {
      try {
        let query = supabaseAdmin
          .from("ea_meeting_notes")
          .select("id, title, date, attendees, tags")
          .eq("organization_id", orgId)
          .order("date", { ascending: false })
          .limit(args.limit);

        if (args.date_from) query = query.gte("date", args.date_from);

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
          return { content: [{ type: "text" as const, text: "No meeting notes found." }] };
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error listing meeting notes: ${e.message}` }], isError: true };
      }
    }
  );

  return [save_meeting_notes, search_meeting_notes, list_meeting_notes];
}

// ─── Communications Log ──────────────────────────────────────────────────────

export function communicationsTools(orgId: string) {
  const log_communication = tool(
    "log_communication",
    "Log a communication event -- email draft, Slack summary, or cross-department message.",
    {
      type: z.enum(["email_draft", "slack_summary", "cross_dept", "external"]).describe("Communication type"),
      subject: z.string().describe("Subject line or topic"),
      body: z.string().describe("Communication content"),
      recipients: z.array(z.string()).optional().describe("Recipients (names or emails)"),
      sender: z.string().optional().describe("Sender (defaults to Alex)"),
      status: z.enum(["draft", "sent", "archived"]).default("draft").describe("Communication status"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
    },
    async (args) => {
      try {
        const { data, error } = await supabaseAdmin
          .from("ea_communications_log")
          .insert({
            organization_id: orgId,
            type: args.type,
            subject: args.subject,
            body: args.body,
            recipients: args.recipients || [],
            sender: args.sender || "Alex (EA)",
            status: args.status,
            tags: args.tags || [],
          })
          .select()
          .single();

        if (error) throw error;

        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error logging communication: ${e.message}` }], isError: true };
      }
    }
  );

  const search_communications = tool(
    "search_communications",
    "Search past communications by type, subject, or recipients.",
    {
      query: z.string().optional().describe("Search text (searches subject and body)"),
      type: z.enum(["email_draft", "slack_summary", "cross_dept", "external"]).optional().describe("Filter by type"),
      status: z.enum(["draft", "sent", "archived"]).optional().describe("Filter by status"),
      limit: z.number().default(10).describe("Max results to return"),
    },
    async (args) => {
      try {
        let query = supabaseAdmin
          .from("ea_communications_log")
          .select("*")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(args.limit);

        if (args.query) query = query.or(`subject.ilike.%${args.query}%,body.ilike.%${args.query}%`);
        if (args.type) query = query.eq("type", args.type);
        if (args.status) query = query.eq("status", args.status);

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
          return { content: [{ type: "text" as const, text: "No communications found matching criteria." }] };
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error searching communications: ${e.message}` }], isError: true };
      }
    }
  );

  return [log_communication, search_communications];
}

// ─── Inter-Agent Messaging ───────────────────────────────────────────────────

export function interAgentTools(orgId: string) {
  const AGENT_ENDPOINTS: Record<string, string> = {
    "blockdrive-cfa": process.env.CFA_AGENT_URL || "http://localhost:3001",
    "blockdrive-coa": process.env.COA_AGENT_URL || "http://localhost:3003",
    "blockdrive-ir": process.env.IR_AGENT_URL || "http://localhost:3004",
    "blockdrive-cma": process.env.CMA_AGENT_URL || "http://localhost:3005",
    "blockdrive-legal": process.env.LEGAL_AGENT_URL || "http://localhost:3006",
    "blockdrive-sales": process.env.SALES_AGENT_URL || "http://localhost:3007",
  };

  const message_agent = tool(
    "message_agent",
    "Send a message to another agent in the WaaS system. Use for cross-department queries, status requests, or coordination. The target agent will process your request and return a response.",
    {
      agent_id: z.enum([
        "blockdrive-cfa", "blockdrive-coa", "blockdrive-ir",
        "blockdrive-cma", "blockdrive-legal", "blockdrive-sales",
      ]).describe("Target agent ID"),
      message: z.string().describe("Message to send -- be specific about what you need"),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal").describe("Message priority"),
    },
    async (args) => {
      try {
        const endpoint = AGENT_ENDPOINTS[args.agent_id];
        if (!endpoint) {
          return { content: [{ type: "text" as const, text: `Unknown agent: ${args.agent_id}` }], isError: true };
        }

        // For now, log the inter-agent message and note that the agent endpoint
        // is not yet deployed. In production, this would POST to the agent's /api/chat.
        const agentNames: Record<string, string> = {
          "blockdrive-cfa": "Chief Financial Agent",
          "blockdrive-coa": "Chief Operating Agent",
          "blockdrive-ir": "Investor Relations",
          "blockdrive-cma": "Chief Marketing Agent",
          "blockdrive-legal": "Chief Legal Agent",
          "blockdrive-sales": "Sales Manager",
        };

        console.log(`[Inter-Agent] EA -> ${args.agent_id}: ${args.message.slice(0, 100)}`);

        // Save the cross-department request to memory
        await addOrgMemory(
          `Cross-department request to ${agentNames[args.agent_id]}: ${args.message}`,
          orgId,
          { category: "cross_department" },
        ).catch(() => {});

        return {
          content: [{
            type: "text" as const,
            text: `Message queued for ${agentNames[args.agent_id]} (${args.agent_id}). Priority: ${args.priority}.\n\nNote: Agent endpoint at ${endpoint} -- direct inter-agent messaging will be available once all agents are deployed. For now, I've logged this request to cross-department memory.`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error messaging agent: ${e.message}` }], isError: true };
      }
    }
  );

  const get_agent_status = tool(
    "get_agent_status",
    "Check the health/status of another agent in the WaaS system.",
    {
      agent_id: z.enum([
        "blockdrive-cfa", "blockdrive-coa", "blockdrive-ir",
        "blockdrive-cma", "blockdrive-legal", "blockdrive-sales",
      ]).describe("Agent to check"),
    },
    async (args) => {
      try {
        const endpoint = AGENT_ENDPOINTS[args.agent_id];
        if (!endpoint) {
          return { content: [{ type: "text" as const, text: `Unknown agent: ${args.agent_id}` }], isError: true };
        }

        try {
          const resp = await fetch(`${endpoint}/health`, {
            signal: AbortSignal.timeout(5000),
          });
          if (resp.ok) {
            const status = await resp.json();
            return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
          }
          return { content: [{ type: "text" as const, text: `Agent ${args.agent_id} returned HTTP ${resp.status}` }] };
        } catch {
          return { content: [{ type: "text" as const, text: `Agent ${args.agent_id} is not reachable at ${endpoint}. It may not be deployed yet.` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error checking agent status: ${e.message}` }], isError: true };
      }
    }
  );

  return [message_agent, get_agent_status];
}

// ─── Web Browsing ────────────────────────────────────────────────────────────

export function webTools(orgId: string) {
  const MAX_CONTENT_LENGTH = 50000;

  function truncate(text: string): string {
    if (text.length <= MAX_CONTENT_LENGTH) return text;
    return text.slice(0, MAX_CONTENT_LENGTH) + `\n\n[...truncated, showing first ${MAX_CONTENT_LENGTH} characters of ${text.length} total]`;
  }

  function htmlToText(html: string): string {
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|pre|hr)[^>]*>/gi, "\n");
    text = text.replace(/<\/?(td|th)[^>]*>/gi, "\t");
    text = text.replace(/<[^>]+>/g, "");
    text = text.replace(/&amp;/g, "&");
    text = text.replace(/&lt;/g, "<");
    text = text.replace(/&gt;/g, ">");
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&nbsp;/g, " ");
    text = text.replace(/[ \t]+/g, " ");
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.trim();
  }

  const web_search = tool(
    "web_search",
    "Search the web for real-time information using Gemini Search Grounding. Returns results with source citations. Use for investor backgrounds, company research, news, competitive intel, or any current information.",
    {
      query: z.string().describe("Search query"),
    },
    async (args) => {
      try {
        const result = await webSearch(args.query, { maxTokens: 2000, agentId: "blockdrive-ea" });
        return { content: [{ type: "text" as const, text: result.content }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Web search error: ${e.message}` }], isError: true };
      }
    }
  );

  const fetch_url = tool(
    "fetch_url",
    "Fetch and read the content of a web page or URL. Useful for reading shared documents, articles, or any web resource.",
    {
      url: z.string().url().describe("The URL to fetch"),
    },
    async (args) => {
      try {
        const response = await fetch(args.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; BlockDriveEA/1.0)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          return { content: [{ type: "text" as const, text: `Error fetching URL: HTTP ${response.status} ${response.statusText}` }], isError: true };
        }

        const contentType = response.headers.get("content-type") ?? "";
        const rawBody = await response.text();

        let extractedText: string;
        if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
          extractedText = htmlToText(rawBody);
        } else if (contentType.includes("application/json")) {
          try {
            extractedText = JSON.stringify(JSON.parse(rawBody), null, 2);
          } catch {
            extractedText = rawBody;
          }
        } else {
          extractedText = rawBody;
        }

        return { content: [{ type: "text" as const, text: `${args.url} (${contentType})\n\n${truncate(extractedText)}` }] };
      } catch (err: any) {
        if (err.name === "TimeoutError") {
          return { content: [{ type: "text" as const, text: `Error: Request timed out after 15 seconds for ${args.url}` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: `Error fetching URL: ${err.message}` }], isError: true };
      }
    }
  );

  const draft_email = tool(
    "draft_email",
    "Compose a professional email draft. Saves to communications log for tracking.",
    {
      to: z.array(z.string()).describe("Recipient names or email addresses"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body content"),
      tone: z.enum(["formal", "professional", "casual", "warm"]).default("professional").describe("Desired tone"),
      cc: z.array(z.string()).optional().describe("CC recipients"),
    },
    async (args) => {
      try {
        const emailContent = `To: ${args.to.join(", ")}${args.cc ? `\nCC: ${args.cc.join(", ")}` : ""}\nSubject: ${args.subject}\n\n${args.body}`;

        // Log the draft
        const { data, error } = await supabaseAdmin
          .from("ea_communications_log")
          .insert({
            organization_id: orgId,
            type: "email_draft",
            subject: args.subject,
            body: args.body,
            recipients: [...args.to, ...(args.cc || [])],
            sender: "Sean Weiss (via Alex)",
            status: "draft",
            tags: ["email"],
          })
          .select()
          .single();

        if (error) {
          // If table doesn't exist yet, just return the draft
          return { content: [{ type: "text" as const, text: `Email Draft:\n\n${emailContent}\n\n(Note: communications log table not yet created -- draft not persisted)` }] };
        }

        return { content: [{ type: "text" as const, text: `Email Draft (logged as ${data.id}):\n\n${emailContent}` }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Email Draft:\n\nTo: ${args.to.join(", ")}\nSubject: ${args.subject}\n\n${args.body}` }] };
      }
    }
  );

  return [web_search, fetch_url, draft_email];
}
