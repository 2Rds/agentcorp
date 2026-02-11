import express from "express";
import { config } from "./config.js";
import { corsMiddleware } from "./middleware/cors.js";
import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import knowledgeRouter from "./routes/knowledge.js";
import dataroomRouter from "./routes/dataroom.js";

const app = express();

app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));

app.use(healthRouter);
app.use(chatRouter);
app.use(knowledgeRouter);
app.use(dataroomRouter);

app.listen(config.port, () => {
  console.log(`CFO Agent server listening on port ${config.port}`);
});
