import { config } from "dotenv";
import { resolve } from "path";
import pg from "pg";

config({ path: resolve(process.cwd(), ".env") });

async function check() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  const res = await client.query("SELECT id, caption, image_url, status FROM posts ORDER BY id DESC LIMIT 5");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

check().catch(console.error);
