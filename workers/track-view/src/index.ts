/**
 * Track View Worker — Investor Link Analytics
 *
 * Migrated from Supabase Edge Function.
 * Records views on investor data room links.
 *
 * Deploy: wrangler deploy
 */

import { createClient } from "@supabase/supabase-js";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

      const body: Record<string, unknown> = await request.json();
      const slug = typeof body.slug === "string" ? body.slug : null;

      if (!slug) {
        return Response.json({ error: "slug is required" }, {
          status: 400,
          headers: corsHeaders,
        });
      }

      // Type-safe extraction of input fields
      const viewerEmail = typeof body.viewer_email === "string" ? body.viewer_email : null;
      const durationSeconds = typeof body.duration_seconds === "number" ? body.duration_seconds : 0;
      const pagesViewed = typeof body.pages_viewed === "number" ? body.pages_viewed : 0;
      const totalPages = typeof body.total_pages === "number" ? body.total_pages : 0;
      const lastPageViewed = typeof body.last_page_viewed === "number" ? body.last_page_viewed : 0;

      // Look up the link by slug
      const { data: link, error: linkError } = await supabase
        .from("investor_links")
        .select("id, organization_id, is_active, expires_at")
        .eq("slug", slug)
        .single();

      if (linkError || !link) {
        return Response.json({ error: "Link not found" }, { status: 404, headers: corsHeaders });
      }

      if (!link.is_active) {
        return Response.json({ error: "Link is disabled" }, { status: 403, headers: corsHeaders });
      }

      if (link.expires_at && new Date(link.expires_at as string) < new Date()) {
        return Response.json({ error: "Link has expired" }, { status: 410, headers: corsHeaders });
      }

      const viewerIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      const userAgent = request.headers.get("user-agent") || "";

      const { data: view, error: viewError } = await supabase
        .from("link_views")
        .insert({
          link_id: link.id,
          organization_id: link.organization_id,
          viewer_email: viewerEmail,
          viewer_ip: viewerIp,
          duration_seconds: durationSeconds,
          pages_viewed: pagesViewed,
          total_pages: totalPages,
          last_page_viewed: lastPageViewed,
          device_info: { userAgent, platform: userAgent.includes("Mobile") ? "mobile" : "desktop" },
        })
        .select()
        .single();

      if (viewError) {
        console.error("Error inserting view:", viewError);
        return Response.json({ error: "Failed to record view" }, { status: 500, headers: corsHeaders });
      }

      return Response.json({ success: true, view_id: view.id }, { headers: corsHeaders });
    } catch (err) {
      console.error("track-view error:", err);
      return Response.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders });
    }
  },
};
