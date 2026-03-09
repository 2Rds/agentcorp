import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: "blockdrive-ea",
    name: "Alex -- Executive Assistant",
    timestamp: new Date().toISOString(),
  });
});

export default router;
