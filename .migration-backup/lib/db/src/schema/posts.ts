import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const postStatusEnum = pgEnum("post_status", [
  "pending",
  "approved",
  "rejected",
  "posted",
]);

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  caption: text("caption").notNull(),
  hashtags: text("hashtags").notNull().default(""),
  imageUrl: text("image_url").notNull(),
  imagePrompt: text("image_prompt").notNull().default(""),
  status: postStatusEnum("status").notNull().default("pending"),
  scheduledFor: timestamp("scheduled_for").notNull(),
  postedAt: timestamp("posted_at"),
  instagramPostId: text("instagram_post_id"),
  mediaType: text("media_type").notNull().default("image"),
  videoUrl: text("video_url"),
  mediaUrls: text("media_urls").array(), // For carousels: list of image/video URLs
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
