import { config } from "../config.js";
import { mem0Headers } from "./mem0-client.js";

const BASE_URL = "https://api.mem0.ai";

const EA_CATEGORIES = [
  { scheduling: "Meeting times, calendar events, availability, timezone preferences, recurring schedules, booking confirmations" },
  { communications: "Email drafts, Slack summaries, cross-department messages, notification preferences, communication templates" },
  { cross_department: "Status updates from CFA/COA/CMA, department deliverables, cross-team blockers, coordination requests" },
  { executive_decisions: "CEO decisions, approvals, strategic direction, policy changes, priority shifts" },
  { meeting_notes: "Meeting summaries, action items, attendees, follow-ups, key takeaways, decisions made" },
  { contacts: "People names, roles, organizations, relationships, communication preferences, introduction context" },
  { project_tracking: "Project milestones, deadlines, deliverables, status updates, blockers, team assignments" },
  { investor_relations: "Investor meetings, follow-up commitments, deck sharing, data room requests, pipeline updates" },
  { hiring: "Job openings, candidate pipeline, interview schedules, offer status, team planning" },
];

async function discoverProject(): Promise<{ orgId: string; projectId: string; name: string } | null> {
  const orgsRes = await fetch(`${BASE_URL}/api/v1/orgs/organizations/`, { headers: mem0Headers() });
  if (!orgsRes.ok) return null;
  const orgs = await orgsRes.json() as Array<{ org_id: string }>;
  if (!orgs.length) return null;

  const orgId = orgs[0].org_id;
  const projRes = await fetch(`${BASE_URL}/api/v1/orgs/organizations/${orgId}/projects/`, { headers: mem0Headers() });
  if (!projRes.ok) return null;
  const projects = await projRes.json() as Array<{ project_id: string; name: string }>;
  if (!projects.length) return null;

  const eaProject = projects.find(p => p.name === "BlockDrive EA") ?? projects[0];
  return { orgId, projectId: eaProject.project_id, name: eaProject.name };
}

/**
 * Configure the Mem0 project with EA-specific categories and graph settings.
 * Safe to call on every server start -- idempotent.
 */
export async function initializeMem0Project(): Promise<void> {
  if (!config.mem0ApiKey) {
    console.log("Mem0 not configured, skipping project initialization");
    return;
  }

  try {
    const project = await discoverProject();
    if (!project) {
      console.error("Could not discover Mem0 org/project -- configure via dashboard");
      return;
    }

    const { orgId, projectId, name } = project;
    const url = `${BASE_URL}/api/v1/orgs/organizations/${orgId}/projects/${projectId}/`;

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

    const categoryNames = new Set(currentCategories.map((c: Record<string, string>) => Object.keys(c)[0]));
    const needsCategories = EA_CATEGORIES.some(c => !categoryNames.has(Object.keys(c)[0]));

    if (needsCategories || !graphEnabled) {
      const updateBody: Record<string, unknown> = { name };
      if (needsCategories) updateBody.custom_categories = EA_CATEGORIES;
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
