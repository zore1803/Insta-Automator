import "dotenv/config";
import { db, postsTable, eq, and, ne } from "../../lib/db/src/index.ts";

async function reformatPosts() {
  console.log("🚀 Starting post reformatting (Robust Mode)...");

  const allPosts = await db.select().from(postsTable).where(ne(postsTable.status, "rejected"));
  console.log(`📝 Found ${allPosts.length} posts to process.`);

  const handleMap: Record<string, string> = {
    "Mumbai Indians": "@mumbaiindians",
    "Rohit Sharma": "@rohitsharma45",
    "Virat Kohli": "@virat.kohli",
    "IPL": "@iplt20",
    "BCCI": "@bcci",
    "MS Dhoni": "@mahi7781",
    "Suryakumar Yadav": "@suraborivs",
    "Hardik Pandya": "@hardikpandya93",
    "Chennai Super Kings": "@chennaiipl",
    "Royal Challengers Bangalore": "@rcbtweets",
    "Kolkata Knight Riders": "@kkriders"
  };

  for (const post of allPosts) {
    // Check if already reformatted
    if (post.caption.includes("Powered by @loqit.ai") && post.hashtags.includes("#loqitai")) {
      console.log(`⏩ Skipping post ${post.id} (already reformatted)`);
      continue;
    }

    console.log(`🔄 Reformatting post ${post.id}...`);

    let newCaption = post.caption;

    // 1. Tag common handles
    for (const [name, handle] of Object.entries(handleMap)) {
      if (newCaption.includes(name) && !newCaption.includes(handle)) {
        newCaption = newCaption.replace(new RegExp(name, 'g'), `${name} (${handle})`);
      }
    }

    // 2. Add line breaks (double newline for spacing)
    newCaption = newCaption.split('. ').join('.\n\n');
    
    // 3. Add branding
    if (!newCaption.includes("Powered by @loqit.ai")) {
      newCaption += "\n\n📸 Powered by @loqit.ai";
    }

    // 4. Update hashtags
    let newHashtags = post.hashtags;
    if (!newHashtags.includes("#loqitai")) {
      newHashtags += " #loqitai";
    }

    try {
      await db.update(postsTable)
        .set({
          caption: newCaption,
          hashtags: newHashtags,
          updatedAt: new Date()
        })
        .where(eq(postsTable.id, post.id));

      console.log(`✅ Post ${post.id} updated.`);
    } catch (err) {
      console.error(`❌ Failed to update post ${post.id}:`, err);
    }
  }

  console.log("🏁 Reformatting complete!");
  process.exit(0);
}

reformatPosts();
