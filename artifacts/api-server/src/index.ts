import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./jobs/scheduler";
import { ensureDatabaseSchema } from "./services/dbMigration";

const rawPort = process.env["API_PORT"] || process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "API_PORT or PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await ensureDatabaseSchema();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startScheduler();
});
