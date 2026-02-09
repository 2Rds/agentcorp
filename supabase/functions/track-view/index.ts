import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { slug, viewer_email, duration_seconds, pages_viewed, total_pages, last_page_viewed } = body;

    if (!slug) {
      return new Response(JSON.stringify({ error: "slug is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the link by slug
    const { data: link, error: linkError } = await supabase
      .from("investor_links")
      .select("id, organization_id, is_active, expires_at, passcode, require_email")
      .eq("slug", slug)
      .single();

    if (linkError || !link) {
      return new Response(JSON.stringify({ error: "Link not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!link.is_active) {
      return new Response(JSON.stringify({ error: "Link is disabled" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Link has expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get viewer IP from headers
    const viewerIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    // Parse user agent
    const userAgent = req.headers.get("user-agent") || "";
    const deviceInfo = {
      userAgent,
      platform: userAgent.includes("Mobile") ? "mobile" : "desktop",
    };

    // Insert view record
    const { data: view, error: viewError } = await supabase
      .from("link_views")
      .insert({
        link_id: link.id,
        organization_id: link.organization_id,
        viewer_email: viewer_email || null,
        viewer_ip: viewerIp,
        duration_seconds: duration_seconds || 0,
        pages_viewed: pages_viewed || 0,
        total_pages: total_pages || 0,
        last_page_viewed: last_page_viewed || 0,
        device_info: deviceInfo,
      })
      .select()
      .single();

    if (viewError) {
      console.error("Error inserting view:", viewError);
      return new Response(JSON.stringify({ error: "Failed to record view" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, view_id: view.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("track-view error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
