/**
 * PDF Generator — Playwright-based HTML→PDF renderer.
 *
 * Uses Playwright (already installed for headless-browser tool) to render
 * HTML content into branded PDF documents.
 */

export interface PdfOptions {
  title: string;
  format?: "Letter" | "A4";
  landscape?: boolean;
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
}

const BRAND_COLORS = {
  primary: "#1a1a2e",
  accent: "#e94560",
  text: "#1a1a2e",
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#ffffff",
};

function brandedHtmlWrapper(bodyHtml: string, options: PdfOptions): string {
  const now = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: ${BRAND_COLORS.text};
      line-height: 1.6;
      font-size: 11pt;
      padding: 60px 50px 80px 50px;
    }
    /* Header */
    .bd-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      border-bottom: 2px solid ${BRAND_COLORS.primary};
      margin-bottom: 32px;
    }
    .bd-header .logo {
      font-size: 18pt;
      font-weight: 700;
      color: ${BRAND_COLORS.primary};
      letter-spacing: -0.5px;
    }
    .bd-header .logo span { color: ${BRAND_COLORS.accent}; }
    .bd-header .meta {
      text-align: right;
      font-size: 9pt;
      color: ${BRAND_COLORS.muted};
    }
    /* Title */
    .bd-title {
      font-size: 22pt;
      font-weight: 700;
      color: ${BRAND_COLORS.primary};
      margin-bottom: 24px;
      line-height: 1.2;
    }
    /* Content */
    h1 { font-size: 18pt; font-weight: 700; margin: 28px 0 12px; color: ${BRAND_COLORS.primary}; }
    h2 { font-size: 14pt; font-weight: 600; margin: 24px 0 10px; color: ${BRAND_COLORS.primary}; }
    h3 { font-size: 12pt; font-weight: 600; margin: 20px 0 8px; color: ${BRAND_COLORS.primary}; }
    p { margin: 8px 0; }
    ul, ol { margin: 8px 0 8px 24px; }
    li { margin: 4px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 10pt;
    }
    th {
      background: ${BRAND_COLORS.primary};
      color: white;
      padding: 8px 12px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 6px 12px;
      border-bottom: 1px solid ${BRAND_COLORS.border};
    }
    tr:nth-child(even) td { background: #f9fafb; }
    code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10pt;
    }
    pre {
      background: #f3f4f6;
      padding: 12px 16px;
      border-radius: 6px;
      margin: 12px 0;
      overflow-x: auto;
      font-size: 10pt;
    }
    pre code { background: none; padding: 0; }
    blockquote {
      border-left: 3px solid ${BRAND_COLORS.accent};
      padding: 8px 16px;
      margin: 12px 0;
      color: ${BRAND_COLORS.muted};
      font-style: italic;
    }
    hr {
      border: none;
      border-top: 1px solid ${BRAND_COLORS.border};
      margin: 24px 0;
    }
    /* Metrics grid */
    .metric-card {
      display: inline-block;
      width: 48%;
      padding: 16px;
      margin: 4px 1%;
      border: 1px solid ${BRAND_COLORS.border};
      border-radius: 8px;
      vertical-align: top;
    }
    .metric-card .label { font-size: 9pt; color: ${BRAND_COLORS.muted}; text-transform: uppercase; letter-spacing: 0.5px; }
    .metric-card .value { font-size: 20pt; font-weight: 700; color: ${BRAND_COLORS.primary}; }
    /* Footer */
    .bd-footer {
      position: fixed;
      bottom: 30px;
      left: 50px;
      right: 50px;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: ${BRAND_COLORS.muted};
      border-top: 1px solid ${BRAND_COLORS.border};
      padding-top: 8px;
    }
  </style>
</head>
<body>
  <div class="bd-header">
    <div class="logo">Block<span>Drive</span></div>
    <div class="meta">
      Confidential<br>
      ${now}
    </div>
  </div>
  <div class="bd-title">${options.title}</div>
  <div class="bd-content">
    ${bodyHtml}
  </div>
  <div class="bd-footer">
    <div>BlockDrive, Inc. — Confidential</div>
    <div>${options.title}</div>
  </div>
</body>
</html>`;
}

/**
 * Generate a PDF from HTML content using Playwright.
 * Returns a Buffer of the PDF.
 */
export async function generatePdf(
  bodyHtml: string,
  options: PdfOptions,
): Promise<Buffer> {
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    const fullHtml = brandedHtmlWrapper(bodyHtml, options);

    await page.setContent(fullHtml, { waitUntil: "networkidle" });

    const pdfBuffer = await page.pdf({
      format: options.format ?? "Letter",
      landscape: options.landscape ?? false,
      printBackground: true,
      margin: options.margin ?? {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close().catch(() => {});
  }
}
