#!/usr/bin/env tsx
/**
 * Google OAuth2 refresh token generator.
 * Runs a local server, opens the consent page in the browser,
 * exchanges the code for tokens, and writes GOOGLE_REFRESH_TOKEN to agent/.env.
 *
 * Usage: cd agent && npx tsx scripts/google-auth.ts
 */

import { google } from "googleapis";
import http from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env");
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

function loadEnvVar(name: string): string {
  if (!existsSync(ENV_PATH)) {
    console.error(`No .env file found at ${ENV_PATH}`);
    process.exit(1);
  }
  const content = readFileSync(ENV_PATH, "utf-8");
  const match = content.match(new RegExp(`^${name}=(.+)$`, "m"));
  if (!match) {
    console.error(`${name} not found in ${ENV_PATH}`);
    process.exit(1);
  }
  return match[1].trim().replace(/^["']|["']$/g, "");
}

function updateEnvVar(name: string, value: string): void {
  let content = readFileSync(ENV_PATH, "utf-8");
  const regex = new RegExp(`^${name}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${name}=${value}`);
  } else {
    content = content.trimEnd() + `\n${name}=${value}\n`;
  }
  writeFileSync(ENV_PATH, content);
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log(`\nOpen this URL manually:\n${url}\n`);
  });
}

async function main() {
  const clientId = loadEnvVar("GOOGLE_CLIENT_ID");
  const clientSecret = loadEnvVar("GOOGLE_CLIENT_SECRET");

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force new refresh token
    scope: SCOPES,
  });

  // Write URL to temp file for automation, and also print it
  const urlFile = resolve(__dirname, "..", ".google-auth-url");
  writeFileSync(urlFile, authUrl);
  console.log(`AUTH_URL=${authUrl}`);

  if (process.env.NO_OPEN_BROWSER) {
    console.log("\nNO_OPEN_BROWSER set — waiting for browser navigation...\n");
  } else {
    console.log("Opening browser for Google OAuth consent...\n");
    openBrowser(authUrl);
  }

  // Wait for the callback
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith("/callback")) {
        res.writeHead(404);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://localhost:${PORT}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<h2>Authorization denied: ${error}</h2><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`OAuth denied: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h2>Missing authorization code</h2>");
        server.close();
        reject(new Error("No code in callback"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h2>Success! Refresh token saved.</h2><p>You can close this tab and return to the terminal.</p>");
      server.close();
      resolve(code);
    });

    server.listen(PORT, () => {
      console.log(`Listening on http://localhost:${PORT}/callback for OAuth redirect...\n`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for OAuth callback (5 min)"));
    }, 300_000);
  });

  // Exchange code for tokens
  console.log("Exchanging authorization code for tokens...");
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    console.error("No refresh_token returned. The app may already be authorized.");
    console.error("Go to https://myaccount.google.com/permissions, revoke the app, and try again.");
    process.exit(1);
  }

  // Write to .env
  updateEnvVar("GOOGLE_REFRESH_TOKEN", tokens.refresh_token);
  console.log(`\nRefresh token saved to ${ENV_PATH}`);
  console.log("Restart the agent server to pick up the new token.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
