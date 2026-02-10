import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

export function investorLinksTools(orgId: string, userId: string) {
  const list_investor_links = tool(
    "list_investor_links",
    "List all investor sharing links, optionally filtered by active status. Includes view count analytics for each link.",
    {
      is_active: z.boolean().optional().describe("Filter by active/inactive status"),
    },
    async (args) => {
      let query = supabaseAdmin
        .from("investor_links")
        .select("*, link_views(count)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });

      if (args.is_active !== undefined) query = query.eq("is_active", args.is_active);

      const { data, error } = await query;
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  const create_investor_link = tool(
    "create_investor_link",
    "Create a new shareable investor link (DocSend-style). Returns the created link with its unique slug for sharing.",
    {
      name: z.string().describe("Display name for this link, e.g. 'Sequoia - Series A Deck'"),
      email: z.string().optional().describe("Pre-associated email for this link"),
      passcode: z.string().optional().describe("Optional access passcode"),
      require_email: z.boolean().default(false).describe("Require viewers to enter email before viewing"),
      expires_at: z.string().optional().describe("Expiration datetime (ISO 8601)"),
      allowed_document_ids: z.array(z.string()).optional().describe("Document IDs this link can access"),
    },
    async (args) => {
      // Generate a URL-safe slug
      const slug = `${args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}-${Date.now().toString(36)}`;

      const { data, error } = await supabaseAdmin
        .from("investor_links")
        .insert({
          organization_id: orgId,
          created_by: userId,
          name: args.name,
          slug,
          email: args.email,
          passcode: args.passcode,
          require_email: args.require_email,
          expires_at: args.expires_at,
          allowed_document_ids: args.allowed_document_ids,
        })
        .select()
        .single();

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: `Investor link created:\n${JSON.stringify(data, null, 2)}` }] };
    }
  );

  const update_investor_link = tool(
    "update_investor_link",
    "Update an existing investor link's properties.",
    {
      id: z.string().describe("The link ID to update"),
      name: z.string().optional(),
      email: z.string().optional(),
      passcode: z.string().optional(),
      require_email: z.boolean().optional(),
      is_active: z.boolean().optional(),
      expires_at: z.string().optional(),
      allowed_document_ids: z.array(z.string()).optional(),
    },
    async (args) => {
      const { id, ...updates } = args;
      // Remove undefined values
      const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));

      const { data, error } = await supabaseAdmin
        .from("investor_links")
        .update(cleanUpdates)
        .eq("id", id)
        .eq("organization_id", orgId)
        .select()
        .single();

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: `Link updated:\n${JSON.stringify(data, null, 2)}` }] };
    }
  );

  const get_link_analytics = tool(
    "get_link_analytics",
    "Get detailed view analytics for an investor link, including viewer emails, devices, durations, and pages viewed.",
    {
      link_id: z.string().describe("The investor link ID"),
    },
    async (args) => {
      const { data: views, error } = await supabaseAdmin
        .from("link_views")
        .select("*")
        .eq("link_id", args.link_id)
        .eq("organization_id", orgId)
        .order("started_at", { ascending: false });

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };

      const totalViews = views?.length ?? 0;
      const uniqueViewers = new Set(views?.map(v => v.viewer_email).filter(Boolean)).size;
      const avgDuration = totalViews > 0
        ? Math.round((views!.reduce((s, v) => s + (v.duration_seconds ?? 0), 0) / totalViews))
        : 0;

      const analytics = {
        totalViews,
        uniqueViewers,
        avgDurationSeconds: avgDuration,
        views,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(analytics, null, 2) }] };
    }
  );

  return [list_investor_links, create_investor_link, update_investor_link, get_link_analytics];
}
