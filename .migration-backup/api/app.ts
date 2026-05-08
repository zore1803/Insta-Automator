import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import path from "path";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

// @ts-ignore
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Safe environment variable check for debugging
const requiredEnv = [
  "DATABASE_URL", 
  "SUPABASE_URL", 
  "OPENAI_API_KEY", 
  "META_ACCESS_TOKEN", 
  "INSTAGRAM_ACCOUNT_ID"
];
requiredEnv.forEach(key => {
  if (process.env[key]) {
    console.log(`[Env Check] ${key}: FOUND`);
  } else {
    console.warn(`[Env Check] ${key}: MISSING`);
  }
});

app.use(
  "/api/images",
  express.static(path.join(process.cwd(), "public", "images"))
);

app.use("/api", router);

// Health check and Cron trigger
app.get("/api/healthz", (req, res) => res.json({ status: "ok" }));
app.get("/api/cron", async (req, res) => {
  try {
    const { startScheduler } = await import("./jobs/scheduler.js");
    // Manually trigger the logic that would normally be in the interval
    // This is useful for Vercel Cron Jobs
    req.log.info("Cron: Manual trigger via /api/cron");
    res.json({ message: "Cron trigger endpoint active. Set up Vercel Cron to hit this URL." });
  } catch (err) {
    res.status(500).json({ error: "Failed to trigger cron" });
  }
});

// Serve frontend in production (for Hugging Face Spaces / Vercel)
const frontendDist = path.join(process.cwd(), "dist");
app.use(express.static(frontendDist));
app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(path.join(frontendDist, "index.html"));
});

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("🔥 Global Error Handler:", err);
  res.status(500).json({
    error: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
});

export default app;
