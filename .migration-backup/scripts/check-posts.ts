import { db, postsTable } from "@workspace/db";

async function main() {
  const posts = await db.select().from(postsTable);
  console.log(`Found ${posts.length} posts in the database.`);
  process.exit(0);
}

main().catch(console.error);
