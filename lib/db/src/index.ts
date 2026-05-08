import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function getConnectionConfig(): pg.PoolConfig {
  const url = process.env.DATABASE_URL;
  // If DATABASE_URL is set but points to an unreachable external host,
  // fall back to local PGHOST-based env vars (Replit native postgres).
  if (url && (url.includes("supabase.co") || url.includes("neon.tech") || url.includes("render.com"))) {
    const host = process.env.PGHOST;
    const user = process.env.PGUSER;
    const password = process.env.PGPASSWORD;
    const database = process.env.PGDATABASE;
    const port = parseInt(process.env.PGPORT || "5432");
    if (host && user && database) {
      return { host, user, password, database, port };
    }
  }
  if (url) {
    return { connectionString: url };
  }
  // Last resort: local pg env vars
  return {
    host: process.env.PGHOST || "localhost",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "",
    database: process.env.PGDATABASE || "postgres",
    port: parseInt(process.env.PGPORT || "5432"),
  };
}

export const pool = new Pool(getConnectionConfig());
export const db = drizzle(pool, { schema });

export * from "./schema";
export { eq, and, or, gte, lte, count, sql, desc, asc, ne } from "drizzle-orm";
