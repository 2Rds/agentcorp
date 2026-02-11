import express from "express";
import { config } from "./config.js";
import { corsMiddleware } from "./middleware/cors.js";
import { initializeMem0Project } from "./lib/mem0-setup.js";
import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import knowledgeRouter from "./routes/knowledge.js";
import dataroomRouter from "./routes/dataroom.js";
import webhooksRouter from "./routes/webhooks.js";

const app = express();

app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));

app.use(healthRouter);
app.use(chatRouter);
app.use(knowledgeRouter);
app.use(dataroomRouter);
app.use(webhooksRouter);

app.listen(config.port, async () => {
  console.log(`CFO Agent server listening on port ${config.port}`);
  await initializeMem0Project();
});
