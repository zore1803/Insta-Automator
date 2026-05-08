import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. If you are using Supabase, go to Project Settings > Database > Connection String (Node.js) and paste it into your environment variables.",
  );
}

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
export const db = drizzle(pool, { schema });

export * from "./schema/index.js";
export { eq, and, or, gte, lte, count, sql, desc, asc, ne } from "drizzle-orm";
