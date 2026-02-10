import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { financialModelTools } from "./financial-model.js";
import { derivedMetricsTools } from "./derived-metrics.js";
import { capTableTools } from "./cap-table.js";
import { knowledgeBaseTools } from "./knowledge-base.js";
import { investorLinksTools } from "./investor-links.js";
import { documentsTools } from "./documents.js";
import { webFetchTools } from "./web-fetch.js";
import { headlessBrowserTools } from "./headless-browser.js";
import { excelExportTools } from "./excel-export.js";

export function createCfoMcpServer(orgId: string, userId: string) {
  return createSdkMcpServer({
    name: "cfo-tools",
    version: "1.0.0",
    tools: [
      ...financialModelTools(orgId),
      ...derivedMetricsTools(orgId),
      ...capTableTools(orgId),
      ...knowledgeBaseTools(orgId),
      ...investorLinksTools(orgId, userId),
      ...documentsTools(orgId),
      ...webFetchTools(),
      ...headlessBrowserTools(),
      ...excelExportTools(orgId),
    ],
  });
}
