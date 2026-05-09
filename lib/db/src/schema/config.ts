import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const configTable = pgTable("config", {
  id: serial("id").primaryKey(),
  niche: text("niche").notNull().default("India Instagram trends"),
  morningPostTime: text("morning_post_time").notNull().default("09:00"),
  afternoonPostTime: text("afternoon_post_time").notNull().default("12:00"),
  eveningPostTime: text("evening_post_time").notNull().default("15:00"),
  nightPostTime: text("night_post_time").notNull().default("18:00"),
  lateNightPostTime: text("late_night_post_time").notNull().default("21:00"),
  midnightPostTime: text("midnight_post_time").notNull().default("00:00"),
  language: text("language").notNull().default("English"),
  autoApprove: boolean("auto_approve").notNull().default(false),
  instagramAccountId: text("instagram_account_id").notNull().default(""),
  metaAccessToken: text("meta_access_token").notNull().default(""),
  imageSource: text("image_source").notNull().default("ai"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type InsertConfig = typeof configTable.$inferInsert;
export type Config = typeof configTable.$inferSelect;
