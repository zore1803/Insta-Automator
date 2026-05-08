import "dotenv/config";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startScheduler } from "./jobs/scheduler.js";

const isVercel = process.env.VERCEL === "1";

if (!isVercel) {
  const rawPort = process.env.API_PORT || process.env.PORT || "7860";
  const port = Number(rawPort);

  if (!Number.isNaN(port) && port > 0) {
    const server = app.listen(port, "0.0.0.0", () => {
      logger.info({ port }, "Local API server listening");
      startScheduler();
    });

    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        logger.error({ port }, "Port is already in use. Please kill the process using this port.");
      } else {
        logger.error({ err }, "API server failed to start");
      }
    });
  }
}

// Export for Vercel Serverless Functions
export default app;
