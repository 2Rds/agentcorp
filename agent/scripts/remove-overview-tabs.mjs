#!/usr/bin/env node
/**
 * Removes the "Overview" tab from all 12 uploaded Google Sheet templates
 * to strip third-party branding. The financial model data lives in
 * Assumptions and Financials tabs.
 *
 * Usage: node scripts/remove-overview-tabs.mjs
 * Reads Google credentials from agent/.env
 */

import "dotenv/config";
import { google } from "googleapis";

const SHEET_IDS = {
  "monthly-saas": "1wrgilz8Nwu_daeG3Wc7Pfh0hEO0_c70PhnwQd4HR0DQ",
  "annual-saas": "15-mS5YYm7aXx7jM6KmOsFW8gzqKDmfjgf447lmqydoE",
  "per-unit-monthly-saas": "1CNX0B3iDrlNMneWibc6L06ga-xMvPAR1SuEwwEK6Or0",
  "per-unit-annual-saas": "1EFbu85_9byUpdtMkiZ66mIZlowD8HePcvZFN0YDMTS0",
  "marketplace": "10JpucpUcysVJzmmTUmVeDX9LkRBbCh5J_rq3I6WARfI",
  "ecommerce": "1It5sREIYtXkirMvpmxDVvEn4olyXaN_deC9bdf5zGyA",
  "transactional": "1dlQ6xZQs3Hpb8PcoOQGwWXYX5N4BTxoJyEQ-xd_6ITY",
  "hourly-services": "1M906Z2drwEg5I8pH-QQQaiCirHxOQ1RSIbkZZYjjS9c",
  "user-application": "15G4ZacU_FBg54mKa5N2kl1HYheGaARfGumt1zvEZ1mU",
  "custom-contracts": "17JqscFQe8DZkR0Vnzn-cJ1IfSbqJuPAymCEaIXz2VXI",
  "annual-saas-monthly-billing": "1dOxyHKuvWJkfe6i73LQEWnKbhLCNYNrlgAK2OGsqy4A",
  "cpg": "187748aHduQ3c55n1xAK4qhG2D1zbO7SVuJKQ9m8GDKI",
};

function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

async function main() {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  for (const [name, spreadsheetId] of Object.entries(SHEET_IDS)) {
    process.stdout.write(`  ${name}... `);

    try {
      // Get all sheet tabs
      const res = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties",
      });

      const overviewTab = res.data.sheets?.find(
        (s) => s.properties?.title?.toLowerCase() === "overview"
      );

      if (!overviewTab) {
        console.log("no Overview tab found, skipping");
        continue;
      }

      // Delete the Overview tab
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteSheet: {
                sheetId: overviewTab.properties.sheetId,
              },
            },
          ],
        },
      });

      console.log("OK — Overview tab deleted");
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
