import { db, postsTable } from "../lib/db/src/index.js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

async function check() {
  const posts = await db.select().from(postsTable).orderBy(postsTable.id).limit(10);
  console.log(JSON.stringify(posts, null, 2));
}

check().catch(console.error);
