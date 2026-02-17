#!/usr/bin/env node
/**
 * One-time setup script: Authenticates via OAuth 2.0, uploads all 12 BlockDrive
 * templates to Google Sheets, and outputs configuration values.
 *
 * Prerequisites:
 *   1. A Google Cloud project with Drive API + Sheets API enabled
 *   2. OAuth 2.0 Desktop App credentials (Client ID + Client Secret)
 *
 * Usage:
 *   node scripts/setup-google-sheets.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * The script will open your browser for Google authentication, then upload
 * all templates and print the config values to paste into your project.
 */

import { google } from "googleapis";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../../public/templates");

const TEMPLATES = [
  { id: "monthly-saas", file: "1. Monthly SaaS Template.xlsx", name: "BlockDrive — Monthly SaaS" },
  { id: "annual-saas", file: "2. Annual SaaS Template.xlsx", name: "BlockDrive — Annual SaaS" },
  { id: "per-unit-monthly-saas", file: "3. Per Unit Monthly SaaS Template.xlsx", name: "BlockDrive — Per Unit Monthly SaaS" },
  { id: "per-unit-annual-saas", file: "4. Per Unit Annual SaaS Template.xlsx", name: "BlockDrive — Per Unit Annual SaaS" },
  { id: "marketplace", file: "5. Marketplace Template.xlsx", name: "BlockDrive — Marketplace" },
  { id: "ecommerce", file: "6. E-Commerce Template.xlsx", name: "BlockDrive — Ecommerce" },
  { id: "transactional", file: "7. Transactional Template.xlsx", name: "BlockDrive — Transactional" },
  { id: "hourly-services", file: "8. Hourly Services Template.xlsx", name: "BlockDrive — Hourly Services" },
  { id: "user-application", file: "9. User Application Template.xlsx", name: "BlockDrive — User Application" },
  { id: "custom-contracts", file: "10. Custom Contracts Template.xlsx", name: "BlockDrive — Custom Contracts" },
  { id: "annual-saas-monthly-billing", file: "11. Annual SaaS Template - Monthly Billing.xlsx", name: "BlockDrive — Annual SaaS Monthly Billing" },
  { id: "cpg", file: "12. CPG Template.xlsx", name: "BlockDrive — CPG" },
];

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

/**
 * Run the OAuth 2.0 authorization flow with a local HTTP callback server.
 */
function authorize(clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}`;

      const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

      const authUrl = oauth2.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent",
      });

      console.log("\nOpening browser for Google authentication...");
      console.log(`If it doesn't open automatically, visit:\n${authUrl}\n`);

      // Open the browser
      try {
        execSync(`start "" "${authUrl}"`, { stdio: "ignore" });
      } catch {
        // Fallback for non-Windows or if start fails
        try { execSync(`open "${authUrl}"`, { stdio: "ignore" }); } catch { /* */ }
      }

      server.on("request", async (req, res) => {
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        const code = url.searchParams.get("code");

        if (!code) {
          res.writeHead(400);
          res.end("Missing authorization code");
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Authentication successful!</h2><p>You can close this tab and return to your terminal.</p></body></html>");

        server.close();

        try {
          const { tokens } = await oauth2.getToken(code);
          oauth2.setCredentials(tokens);
          resolve({ oauth2, tokens });
        } catch (err) {
          reject(err);
        }
      });
    });
  });
}

async function main() {
  const clientId = process.argv[2];
  const clientSecret = process.argv[3];

  if (!clientId || !clientSecret) {
    console.error("Usage: node scripts/setup-google-sheets.mjs <CLIENT_ID> <CLIENT_SECRET>");
    process.exit(1);
  }

  // Step 1: Authenticate
  const { oauth2, tokens } = await authorize(clientId, clientSecret);
  console.log("Authenticated successfully!\n");

  const drive = google.drive({ version: "v3", auth: oauth2 });
  const results = [];

  // Step 2: Upload all 12 templates
  console.log("Uploading 12 templates to Google Sheets...\n");

  for (const tmpl of TEMPLATES) {
    const filePath = path.join(TEMPLATES_DIR, tmpl.file);
    if (!fs.existsSync(filePath)) {
      console.error(`  SKIP: ${tmpl.file} not found`);
      continue;
    }

    process.stdout.write(`  ${tmpl.name}... `);

    try {
      // Upload .xlsx and convert to Google Sheets format
      const res = await drive.files.create({
        requestBody: {
          name: tmpl.name,
          mimeType: "application/vnd.google-apps.spreadsheet",
        },
        media: {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          body: fs.createReadStream(filePath),
        },
        fields: "id,webViewLink",
      });

      const spreadsheetId = res.data.id;

      // Make it accessible to anyone with the link (for iframe embed + agent writes)
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: { role: "writer", type: "anyone" },
      });

      results.push({ id: tmpl.id, spreadsheetId });
      console.log(`OK  ->  ${spreadsheetId}`);
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
    }
  }

  // Step 3: Output all configuration
  console.log("\n\n==========================================");
  console.log("  SETUP COMPLETE — Copy the values below");
  console.log("==========================================");

  console.log("\n--- ADD TO agent/.env ---\n");
  console.log(`GOOGLE_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);

  console.log("\n--- UPDATE templates.ts googleSheetId fields ---\n");
  for (const r of results) {
    console.log(`  ${r.id}: "${r.spreadsheetId}",`);
  }

  console.log(`\n${results.length}/12 templates uploaded successfully.\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
