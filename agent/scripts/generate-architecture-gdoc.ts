/**
 * Generate WaaS Platform Architecture — Google Doc
 *
 * Builds the same architecture document as the PDF script but uploads
 * to Google Drive as a native Google Doc via service account.
 *
 * Usage: npx tsx scripts/generate-architecture-gdoc.ts
 * Output: Google Doc in Sean's Drive → prints URL
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { C, buildFullHtml } from "./generate-architecture-doc.js";

// (Google Drive API upload removed — service account DWD doesn't allow files.create.
//  Output HTML locally instead; user imports into Google Docs manually.)

// ── HTML Post-Processing for Google Docs ─────────────────────────────────────

/**
 * Find the closing tag matching an opening tag at startIdx.
 * Handles nested tags of the same type.
 */
function findClosingDiv(html: string, startIdx: number): number {
  let depth = 0;
  let i = startIdx;
  while (i < html.length) {
    if (html.startsWith("<div", i) && /^<div[\s>]/.test(html.substring(i))) {
      depth++;
      i += 4;
    } else if (html.startsWith("</div>", i)) {
      depth--;
      if (depth === 0) return i;
      i += 6;
    } else {
      i++;
    }
  }
  return html.length;
}

/**
 * Extract inner content of a div (between opening tag's > and closing </div>).
 */
function extractDivContent(html: string, startIdx: number): { content: string; endIdx: number } {
  const gtIdx = html.indexOf(">", startIdx);
  const closeIdx = findClosingDiv(html, startIdx);
  return {
    content: html.substring(gtIdx + 1, closeIdx),
    endIdx: closeIdx + 6, // past </div>
  };
}

/**
 * Convert flex-based .cols layouts to <table> for Google Docs.
 */
function convertColsToTables(html: string): string {
  let result = html;
  let safety = 0;
  while (result.includes('class="cols"') && safety++ < 50) {
    const idx = result.indexOf('<div class="cols">');
    if (idx === -1) break;

    const colsEnd = findClosingDiv(result, idx);
    const colsContent = result.substring(idx, colsEnd + 6);

    // Find first .col
    const col1Idx = colsContent.indexOf('<div class="col">');
    if (col1Idx === -1) break;
    const col1 = extractDivContent(colsContent, col1Idx);

    // Find second .col (after first one ends)
    const afterCol1 = colsContent.substring(col1.endIdx - (idx > 0 ? 0 : 0));
    const col2RelIdx = colsContent.indexOf('<div class="col">', col1.endIdx - 0);
    let col2Content = "";
    if (col2RelIdx !== -1) {
      const col2 = extractDivContent(colsContent, col2RelIdx);
      col2Content = col2.content;
    }

    const table = `<table width="100%" cellpadding="10" style="border-collapse:collapse;border:none;margin:10px 0">
      <tr>
        <td valign="top" width="50%" style="border:none;padding:8px 12px 8px 0">${col1.content}</td>
        <td valign="top" width="50%" style="border:none;padding:8px 0 8px 12px">${col2Content}</td>
      </tr>
    </table>`;

    result = result.substring(0, idx) + table + result.substring(colsEnd + 6);
  }
  return result;
}

/**
 * Convert .kpi-bar to a styled table.
 */
function convertKpiBars(html: string): string {
  let result = html;
  let safety = 0;
  while (result.includes('class="kpi-bar"') && safety++ < 20) {
    const idx = result.indexOf('<div class="kpi-bar"');
    if (idx === -1) break;
    const endIdx = findClosingDiv(result, idx);
    const content = result.substring(idx, endIdx + 6);

    // Extract all KPI items
    const kpis: { val: string; label: string }[] = [];

    // Match .kpi spans — two patterns:
    // Pattern 1: <span class="num">X</span><span class="lbl">Y</span>
    // Pattern 2: <span class="kpi-val">X</span><span class="kpi-label">Y</span>
    const kpiRegex = /<span class="(?:num|kpi-val)">(.*?)<\/span>\s*<span class="(?:lbl|kpi-label)">(.*?)<\/span>/g;
    let match;
    while ((match = kpiRegex.exec(content)) !== null) {
      kpis.push({ val: match[1], label: match[2] });
    }

    // Also check for .metric-card style: <div class="val">X</div><div class="lbl">Y</div>
    const metricRegex = /<div class="val">(.*?)<\/div>\s*<div class="lbl">(.*?)<\/div>/g;
    while ((match = metricRegex.exec(content)) !== null) {
      kpis.push({ val: match[1], label: match[2] });
    }

    if (kpis.length === 0) {
      // Can't parse, just remove the flex wrapper
      result = result.substring(0, idx) + content + result.substring(endIdx + 6);
      continue;
    }

    const cells = kpis.map(k =>
      `<td style="text-align:center;padding:12px 8px;color:white;border:none">
        <div style="font-size:20pt;font-weight:bold;line-height:1.1">${k.val}</div>
        <div style="font-size:7.5pt;text-transform:uppercase;letter-spacing:0.5px;opacity:0.75">${k.label}</div>
      </td>`
    ).join("");

    const table = `<table width="100%" cellpadding="0" style="background:${C.kpiBg};border-radius:8px;margin:16px 0 24px 0;border:none">
      <tr>${cells}</tr>
    </table>`;

    result = result.substring(0, idx) + table + result.substring(endIdx + 6);
  }
  return result;
}

/**
 * Convert .metric-row to a table.
 */
function convertMetricRows(html: string): string {
  let result = html;
  let safety = 0;
  while (result.includes('class="metric-row"') && safety++ < 20) {
    const idx = result.indexOf('<div class="metric-row"');
    if (idx === -1) break;
    const endIdx = findClosingDiv(result, idx);
    const content = result.substring(idx, endIdx + 6);

    // Extract metric cards
    const cards: { val: string; label: string }[] = [];
    const cardRegex = /<div class="val">(.*?)<\/div>\s*<div class="lbl">(.*?)<\/div>/g;
    let match;
    while ((match = cardRegex.exec(content)) !== null) {
      cards.push({ val: match[1], label: match[2] });
    }

    const cells = cards.map(c =>
      `<td style="text-align:center;padding:10px;border:1px solid ${C.border}">
        <div style="font-size:18pt;font-weight:bold;color:${C.logo}">${c.val}</div>
        <div style="font-size:8pt;text-transform:uppercase;color:${C.muted}">${c.label}</div>
      </td>`
    ).join("");

    const table = `<table width="100%" cellpadding="0" style="border-collapse:collapse;margin:12px 0">
      <tr>${cells}</tr>
    </table>`;

    result = result.substring(0, idx) + table + result.substring(endIdx + 6);
  }
  return result;
}

/**
 * Convert .agent-grid to a table with 3 columns.
 */
function convertAgentGrid(html: string): string {
  let result = html;
  let safety = 0;
  while (result.includes('class="agent-grid"') && safety++ < 10) {
    const idx = result.indexOf('<div class="agent-grid"');
    if (idx === -1) break;
    const endIdx = findClosingDiv(result, idx);
    const content = result.substring(idx, endIdx + 6);

    // Extract agent cards
    const cards: string[] = [];
    let cardIdx = 0;
    const inner = content.substring(content.indexOf(">") + 1);
    let pos = 0;
    while ((pos = inner.indexOf('<div class="agent-card"', pos)) !== -1) {
      const cardEnd = findClosingDiv(inner, pos);
      const cardContent = inner.substring(inner.indexOf(">", pos) + 1, cardEnd);
      cards.push(cardContent);
      pos = cardEnd + 6;
    }

    // Build table rows (3 per row)
    let rows = "";
    for (let i = 0; i < cards.length; i += 3) {
      const cells = [];
      for (let j = 0; j < 3; j++) {
        const card = cards[i + j] || "";
        cells.push(`<td valign="top" width="33%" style="padding:6px;border:1px solid ${C.border}">${card}</td>`);
      }
      rows += `<tr>${cells.join("")}</tr>`;
    }

    const table = `<table width="100%" cellpadding="0" style="border-collapse:collapse;margin:12px 0">${rows}</table>`;
    result = result.substring(0, idx) + table + result.substring(endIdx + 6);
  }
  return result;
}

/**
 * Transform the PDF HTML into Google Docs-compatible HTML.
 */
function transformForGoogleDocs(html: string): string {
  let result = html;

  // 1. Remove fixed header/footer divs (they use position:fixed, won't work in Docs)
  result = result.replace(
    /<!-- Letterhead Header.*?<\/div>\s*<\/div>/s,
    ""
  );
  // More robust: remove by class
  {
    const hdrIdx = result.indexOf('<div class="lh-header">');
    if (hdrIdx !== -1) {
      const hdrEnd = findClosingDiv(result, hdrIdx);
      result = result.substring(0, hdrIdx) + result.substring(hdrEnd + 6);
    }
  }
  {
    const ftrIdx = result.indexOf('<div class="lh-footer">');
    if (ftrIdx !== -1) {
      const ftrEnd = findClosingDiv(result, ftrIdx);
      result = result.substring(0, ftrIdx) + result.substring(ftrEnd + 6);
    }
  }

  // 2. Remove print-specific CSS
  result = result.replace(/@page\s*\{[^}]*\}/g, "");
  result = result.replace(/position:\s*fixed[^;]*;/g, "");
  result = result.replace(/\.pb\s*\{[^}]*\}/g, "");

  // 3. Remove page break divs
  result = result.replace(/<div class="pb"><\/div>/g, "<hr/>");

  // 4. Convert flex layouts to tables
  result = convertKpiBars(result);
  result = convertMetricRows(result);
  result = convertAgentGrid(result);
  result = convertColsToTables(result);

  // 5. Add letterhead as normal content at the top of <body>
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const letterhead = `
    <table width="100%" style="border:none;margin-bottom:16px">
      <tr>
        <td style="border:none;font-family:Garamond,'Times New Roman',serif;font-size:13pt;color:${C.logo};letter-spacing:3px">BlockDrive</td>
        <td style="border:none;text-align:right;font-size:8pt;color:${C.muted}">sean@blockdrive.co &middot; app.blockdrive.co &middot; ${today}</td>
      </tr>
    </table>
    <hr style="border:none;border-bottom:1px solid ${C.border};margin:0 0 16px 0"/>
  `;
  result = result.replace(
    /<!-- Document Content -->/,
    `<!-- Letterhead -->\n${letterhead}\n<!-- Document Content -->`
  );

  // 6. Add Google Docs-specific CSS overrides
  const gdocCss = `
    /* Google Docs overrides */
    .lh-header, .lh-footer { display: none !important; }
    .cols { display: block; }
    .col { display: block; margin-bottom: 12px; }
    .kpi-bar { display: block; }
    .agent-grid { display: block; }
    .metric-row { display: block; }
    .pb { display: none; }
  `;
  result = result.replace("</style>", `${gdocCss}\n</style>`);

  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Generating WaaS Architecture HTML (Google Docs compatible)...");

  // 1. Build the same HTML as the PDF version
  const pdfHtml = buildFullHtml();

  // 2. Transform for Google Docs compatibility
  const gdocHtml = transformForGoogleDocs(pdfHtml);

  // 3. Save locally
  const outputDir = join(import.meta.dirname ?? ".", "..", "output");
  mkdirSync(outputDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const outputPath = join(outputDir, `waas-platform-architecture-${date}.html`);
  writeFileSync(outputPath, gdocHtml, "utf-8");

  console.log(`HTML saved: ${outputPath} (${Math.round(gdocHtml.length / 1024)} KB)`);
  console.log("");
  console.log("To import into Google Docs:");
  console.log("  1. Go to https://drive.google.com");
  console.log("  2. New → File upload → select the HTML file");
  console.log("  3. Right-click the uploaded file → Open with → Google Docs");
  console.log("");
  console.log("Or: Open the HTML in Chrome, then File → Print → Save as PDF → upload to Drive");
}

main().catch((err) => {
  console.error("Failed to generate Google Doc:", err);
  process.exit(1);
});
