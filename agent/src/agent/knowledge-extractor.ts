import { config } from "../config.js";
import { supabaseAdmin } from "../lib/supabase.js";

const EXTRACT_PROMPT = `You extract structured knowledge from a conversation between a startup founder and their AI CFO.
Given the latest user message and assistant response, extract 0-3 distinct knowledge items that are worth remembering long-term.
Only extract concrete, reusable facts — company metrics, decisions, goals, financial figures, investor names, etc.
Skip generic advice or questions.

Return a JSON array (can be empty). Each item: {"title": "short label", "content": "detail paragraph"}
Return ONLY the JSON array, no markdown fences.`;

export async function extractKnowledge(userMsg: string, assistantMsg: string, organizationId: string) {
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1000,
        system: EXTRACT_PROMPT,
        messages: [
          { role: "user", content: `User: ${userMsg}\n\nAssistant: ${assistantMsg.slice(0, 2000)}` },
        ],
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      console.error("Knowledge extraction API error:", resp.status);
      return;
    }

    const data = await resp.json();
    const raw = data.content?.[0]?.text?.trim();
    if (!raw) return;

    let items: { title: string; content: string }[];
    try {
      items = JSON.parse(raw);
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return;
      items = JSON.parse(match[0]);
    }

    if (!Array.isArray(items) || items.length === 0) return;

    const rows = items.filter(i => i.title && i.content).slice(0, 3).map(i => ({
      organization_id: organizationId,
      title: i.title,
      content: i.content,
      source: "chat",
    }));

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("knowledge_base").insert(rows);
      if (error) console.error("KB insert error:", error);
      else console.log(`Extracted ${rows.length} knowledge items`);
    }
  } catch (e) {
    console.error("Knowledge extraction error:", e);
  }
}
