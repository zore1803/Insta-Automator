import { db, configTable, postsTable } from "../../lib/db/src/index.js";
import { sql } from "drizzle-orm";

async function init() {
  console.log("Initializing database tables manually...");
  
  try {
    // Create config table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "config" (
        "id" serial PRIMARY KEY NOT NULL,
        "niche" text NOT NULL,
        "morning_post_time" text DEFAULT '09:00' NOT NULL,
        "evening_post_time" text DEFAULT '18:00' NOT NULL,
        "language" text DEFAULT 'English' NOT NULL,
        "auto_approve" boolean DEFAULT false NOT NULL,
        "instagram_account_id" text DEFAULT '' NOT NULL,
        "meta_access_token" text DEFAULT '' NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    
    // Create posts table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "posts" (
        "id" serial PRIMARY KEY NOT NULL,
        "caption" text NOT NULL,
        "hashtags" text NOT NULL,
        "image_url" text NOT NULL,
        "image_prompt" text NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "scheduled_for" timestamp NOT NULL,
        "posted_at" timestamp,
        "instagram_post_id" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Insert default config if none exists
    const [existing] = await db.select().from(configTable).limit(1);
    if (!existing) {
      await db.insert(configTable).values({
        niche: "Fitness",
        language: "English",
        morningPostTime: "09:00",
        eveningPostTime: "18:00",
        autoApprove: false,
        instagramAccountId: "",
        metaAccessToken: ""
      });
      console.log("Inserted default configuration.");
    }

    console.log("Database initialized successfully!");
  } catch (err) {
    console.error("Initialization failed:", err);
  } finally {
    process.exit(0);
  }
}

init();
