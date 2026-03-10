import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { financialModelTools } from "./financial-model.js";
import { derivedMetricsTools } from "./derived-metrics.js";
import { capTableTools } from "./cap-table.js";
import { knowledgeBaseTools } from "./knowledge-base.js";
import { investorLinksTools } from "./investor-links.js";
import { documentsTools } from "./documents.js";
import { documentRagTools } from "./document-rag.js";
import { webFetchTools } from "./web-fetch.js";
import { headlessBrowserTools } from "./headless-browser.js";
import { excelExportTools } from "./excel-export.js";
import { analyticsTools } from "./analytics.js";
import { googleSheetsTools } from "./google-sheets-tools.js";
import { notionTools } from "./notion-tools.js";
import { pdfExportTools } from "./pdf-export.js";

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
      ...documentRagTools(orgId),
      ...webFetchTools(),
      ...headlessBrowserTools(),
      ...excelExportTools(orgId),
      ...analyticsTools(orgId),
      ...googleSheetsTools(orgId),
      ...notionTools(orgId),
      ...pdfExportTools(orgId),
    ],
  });
}
