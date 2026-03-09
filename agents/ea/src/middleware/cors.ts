import cors from "cors";
import { config } from "../config.js";

export const corsMiddleware = cors({
  origin: config.corsOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});
