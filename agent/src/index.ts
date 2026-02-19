import express from "express";
import { clerkMiddleware } from "@clerk/express";
import { config } from "./config.js";
import { corsMiddleware } from "./middleware/cors.js";
import { initializeMem0Project } from "./lib/mem0-setup.js";
import { initializeRedisIndexes, disconnectRedis } from "./lib/redis-client.js";
import { loadPluginRegistry } from "./lib/plugin-loader.js";
import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import knowledgeRouter from "./routes/knowledge.js";
import dataroomRouter from "./routes/dataroom.js";
import webhooksRouter from "./routes/webhooks.js";
import modelRouter from "./routes/model.js";
import { integrationsCallbackRouter, integrationsRouter } from "./routes/integrations.js";

const app = express();

app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));

// Health + dataroom + OAuth callbacks before auth (public endpoints)
app.use(healthRouter);
app.use(dataroomRouter);
app.use(integrationsCallbackRouter);

// Clerk auth for all remaining routes
app.use(clerkMiddleware());
app.use(chatRouter);
app.use(knowledgeRouter);
app.use(webhooksRouter);
app.use(modelRouter);
app.use(integrationsRouter);

app.listen(config.port, async () => {
  console.log(`CFO Agent server listening on port ${config.port}`);
  loadPluginRegistry();
  const results = await Promise.allSettled([
    initializeMem0Project(),
    initializeRedisIndexes(),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Startup initialization failed (non-fatal):", result.reason);
    }
  }
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down...");
  await disconnectRedis();
  process.exit(0);
});
