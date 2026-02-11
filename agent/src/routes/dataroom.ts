import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { supabaseAdmin } from "../lib/supabase.js";
import { createInvestorQuery } from "../agent/investor-agent.js";

const router = Router();

// Rate limit AI Q&A: 20 questions per 15 min per IP
const askLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many questions. Please wait before asking more." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit data room GET endpoints: 60 requests per 15 min per IP (prevents passcode brute-force)
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: "Too many requests. Please wait before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});

type ValidateLinkResult =
  | { link: null; error: string; requireEmail?: true }
  | { link: Record<string, any>; error: null };

/**
 * Validate a data room link by slug.
 * Returns { link, error, requireEmail? } where link is the record if valid, null otherwise.
 */
async function validateLink(slug: string, passcode?: string, email?: string): Promise<ValidateLinkResult> {
  const { data: link, error } = await supabaseAdmin
    .from("investor_links")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !link) return { link: null, error: "Link not found or inactive" };

  // Check expiry
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { link: null, error: "This link has expired" };
  }

  // Check data room enabled
  if (!link.enable_data_room) {
    return { link: null, error: "Data room not enabled for this link" };
  }

  // Check passcode
  if (link.passcode && link.passcode !== passcode) {
    return { link: null, error: "Invalid passcode" };
  }

  // Check email requirement
  if (link.require_email && !email) {
    return { link: null, error: "Email required", requireEmail: true };
  }

  return { link, error: null };
}

const VALID_SCENARIOS = ["base", "best", "worst"];

/**
 * GET /dataroom/:slug — Validate link and return data room config
 */
router.get("/dataroom/:slug", readLimiter, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const passcode = req.query.passcode as string | undefined;
    const email = req.query.email as string | undefined;

    const result = await validateLink(slug, passcode, email);
    if (!result.link) {
      const status = result.requireEmail ? 403 : 404;
      res.status(status).json({ error: result.error, requireEmail: result.requireEmail });
      return;
    }

    const link = result.link;

    // Get org name for branding
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", link.organization_id)
      .single();

    // Only return what the frontend needs — no internal IDs
    res.json({
      linkName: link.name,
      organizationName: org?.name ?? "Company",
      requireEmail: link.require_email,
      hasPasscode: !!link.passcode,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /dataroom/:slug/financials — Read-only financial data
 */
router.get("/dataroom/:slug/financials", readLimiter, async (req: Request, res: Response) => {
  try {
    const result = await validateLink(req.params.slug, req.query.passcode as string, req.query.email as string);
    if (!result.link) { res.status(404).json({ error: result.error }); return; }

    const orgId = result.link.organization_id;
    const scenario = (req.query.scenario as string) || "base";

    if (!VALID_SCENARIOS.includes(scenario)) {
      res.status(400).json({ error: "Invalid scenario. Must be base, best, or worst." });
      return;
    }

    // Get financial model data
    const { data: model } = await supabaseAdmin
      .from("financial_model")
      .select("category, subcategory, month, amount")
      .eq("organization_id", orgId)
      .eq("scenario", scenario)
      .order("month", { ascending: true });

    // Compute monthly P&L
    const monthlyData: Record<string, { revenue: number; cogs: number; opex: number }> = {};
    for (const row of model ?? []) {
      if (!monthlyData[row.month]) monthlyData[row.month] = { revenue: 0, cogs: 0, opex: 0 };
      const m = monthlyData[row.month];
      if (row.category === "revenue") m.revenue += row.amount;
      else if (row.category === "cogs") m.cogs += row.amount;
      else if (row.category === "opex" || row.category === "headcount") m.opex += row.amount;
    }

    const months = Object.keys(monthlyData).sort();
    const pnl = months.map(m => ({
      month: m,
      ...monthlyData[m],
      grossProfit: monthlyData[m].revenue - monthlyData[m].cogs,
      ebitda: monthlyData[m].revenue - monthlyData[m].cogs - monthlyData[m].opex,
    }));

    res.json({ scenario, pnl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /dataroom/:slug/cap-table — Read-only cap table
 */
router.get("/dataroom/:slug/cap-table", readLimiter, async (req: Request, res: Response) => {
  try {
    const result = await validateLink(req.params.slug, req.query.passcode as string, req.query.email as string);
    if (!result.link) { res.status(404).json({ error: result.error }); return; }

    const { data } = await supabaseAdmin
      .from("cap_table_entries")
      .select("stakeholder_name, stakeholder_type, shares, ownership_pct, investment_amount, round_name")
      .eq("organization_id", result.link.organization_id)
      .order("ownership_pct", { ascending: false });

    res.json({ entries: data ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /dataroom/:slug/ask — AI Q&A for investors (rate-limited)
 */
router.post("/dataroom/:slug/ask", askLimiter, async (req: Request, res: Response) => {
  try {
    const { question, passcode, email, sessionId } = req.body;
    if (!question) { res.status(400).json({ error: "question is required" }); return; }

    const result = await validateLink(req.params.slug, passcode, email);
    if (!result.link) { res.status(404).json({ error: result.error }); return; }

    const link = result.link;
    const orgId = link.organization_id;

    // Run investor agent query
    const agentQuery = createInvestorQuery({
      question,
      organizationId: orgId,
      allowedDocumentIds: link.allowed_document_ids,
    });

    let fullResponse = "";
    for await (const message of agentQuery) {
      if (message.type === "assistant") {
        const content = message.message?.content;
        if (content) {
          for (const block of content) {
            if ("text" in block && typeof block.text === "string") {
              fullResponse += block.text;
            }
          }
        }
      }
    }

    // Track interaction (fire-and-forget with error logging)
    Promise.resolve(
      supabaseAdmin.from("dataroom_interactions").insert({
        link_id: link.id,
        organization_id: orgId,
        interaction_type: "question",
        content: question,
        response: fullResponse.slice(0, 5000),
        session_id: sessionId,
      })
    ).then(({ error: insertErr }) => {
      if (insertErr) console.error("Failed to track dataroom interaction:", insertErr.message);
    }).catch((err: unknown) => console.error("Dataroom interaction tracking threw:", err));

    res.json({ answer: fullResponse });
  } catch (err: any) {
    console.error("Data room Q&A error:", err);
    res.status(500).json({ error: "Failed to answer question" });
  }
});

/**
 * POST /dataroom/:slug/view — Track engagement
 */
router.post("/dataroom/:slug/view", async (req: Request, res: Response) => {
  try {
    const { passcode, email, sessionId, interactionType = "chart_view", content } = req.body;

    const result = await validateLink(req.params.slug, passcode, email);
    if (!result.link) { res.status(404).json({ error: result.error }); return; }

    // Track as link view
    await supabaseAdmin.from("link_views").insert({
      link_id: result.link.id,
      organization_id: result.link.organization_id,
      viewer_email: email || null,
      viewer_ip: req.ip || null,
      duration_seconds: 0,
      pages_viewed: 1,
      completion_pct: 0,
    });

    // Track as data room interaction
    await supabaseAdmin.from("dataroom_interactions").insert({
      link_id: result.link.id,
      organization_id: result.link.organization_id,
      interaction_type: interactionType,
      content,
      session_id: sessionId,
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
