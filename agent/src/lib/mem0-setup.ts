import { config } from "../config.js";
import { mem0Headers } from "./mem0-client.js";

const BASE_URL = "https://api.mem0.ai";

const CFO_CATEGORIES = [
  { financial_metrics: "Burn rate, runway, MRR, ARR, revenue, margins, cash position, unit economics, growth rates" },
  { fundraising: "Investor names, round details, valuations, term sheets, cap table changes, funding pipeline" },
  { company_operations: "Headcount, hiring plans, vendor costs, OpEx decisions, team structure, departments" },
  { strategic_decisions: "Board decisions, pivots, product direction, market positioning, competitive landscape" },
  { investor_relations: "Data room activity, investor feedback, follow-up commitments, meeting notes, LP updates" },
  { financial_model: "Scenario assumptions, forecast parameters, growth rates, formulas, model methodology" },
];

async function discoverProject(): Promise<{ orgId: string; projectId: string; name: string } | null> {
  // List orgs → find first org → list projects → find "BlockDrive CFO" or first project
  const orgsRes = await fetch(`${BASE_URL}/api/v1/orgs/organizations/`, { headers: mem0Headers() });
  if (!orgsRes.ok) return null;
  const orgs = await orgsRes.json() as Array<{ org_id: string }>;
  if (!orgs.length) return null;

  const orgId = orgs[0].org_id;
  const projRes = await fetch(`${BASE_URL}/api/v1/orgs/organizations/${orgId}/projects/`, { headers: mem0Headers() });
  if (!projRes.ok) return null;
  const projects = await projRes.json() as Array<{ project_id: string; name: string }>;
  if (!projects.length) return null;

  const cfoProject = projects.find(p => p.name === "BlockDrive CFO") ?? projects[0];
  return { orgId, projectId: cfoProject.project_id, name: cfoProject.name };
}

/**
 * Configure the Mem0 project with CFO-specific categories and graph settings.
 * Safe to call on every server start — idempotent.
 */
export async function initializeMem0Project(): Promise<void> {
  if (!config.mem0ApiKey) {
    console.log("Mem0 not configured, skipping project initialization");
    return;
  }

  try {
    const project = await discoverProject();
    if (!project) {
      console.error("Could not discover Mem0 org/project — configure via dashboard");
      return;
    }

    const { orgId, projectId, name } = project;
    const url = `${BASE_URL}/api/v1/orgs/organizations/${orgId}/projects/${projectId}/`;

    // Get current config
    const configRes = await fetch(url, { headers: mem0Headers() });
    if (!configRes.ok) {
      console.error("Failed to fetch Mem0 project config:", configRes.status);
      return;
    }

    const current = await configRes.json() as {
      custom_categories?: Array<Record<string, string>>;
      enable_graph?: boolean;
    };
    const currentCategories = current.custom_categories ?? [];
    const graphEnabled = current.enable_graph ?? false;

    // Check if categories need updating
    const categoryNames = new Set(currentCategories.map((c: Record<string, string>) => Object.keys(c)[0]));
    const needsCategories = CFO_CATEGORIES.some(c => !categoryNames.has(Object.keys(c)[0]));

    if (needsCategories || !graphEnabled) {
      const updateBody: Record<string, unknown> = { name };
      if (needsCategories) updateBody.custom_categories = CFO_CATEGORIES;
      if (!graphEnabled) updateBody.enable_graph = true;

      const updateRes = await fetch(url, {
        method: "PUT",
        headers: mem0Headers(),
        body: JSON.stringify(updateBody),
      });

      if (updateRes.ok) {
        const changes = [];
        if (needsCategories) changes.push("custom categories");
        if (!graphEnabled) changes.push("graph memory");
        console.log(`Mem0 project updated: ${changes.join(", ")} configured`);
      } else {
        console.error("Failed to update Mem0 project:", updateRes.status);
      }
    } else {
      console.log("Mem0 project config up to date");
    }
  } catch (e) {
    console.error("Mem0 project initialization error:", e);
  }
}
