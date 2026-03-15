/**
 * Health Check Route
 *
 * Standard /health endpoint for every agent. Returns agent identity,
 * uptime, and service status (Redis, memory, Telegram).
 */

import { Router } from "express";
import { isRedisAvailable } from "../lib/redis-client.js";

export interface HealthDeps {
  agentId: string;
  agentName: string;
  version: string;
  hasMemory: boolean;
  hasTelegram: boolean;
}

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();
  const startedAt = new Date().toISOString();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      agent: {
        id: deps.agentId,
        name: deps.agentName,
        version: deps.version,
      },
      services: {
        redis: isRedisAvailable(),
        memory: deps.hasMemory,
        telegram: deps.hasTelegram,
      },
      startedAt,
      uptime: process.uptime(),
    });
  });

  return router;
}
