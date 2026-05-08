import { db, postsTable, configTable, eq, and, lte } from "../../lib/db/src/index.ts";
import { generateInstagramContent } from "../services/claudeService.ts";
import { generatePostImage } from "../services/dalleService.ts";
import { publishToInstagram } from "../services/instagramService.ts";
import { logger } from "../lib/logger.js";

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(":").map(Number);
  return { hours: h, minutes: m };
}

function shouldRunNow(timeStr: string): boolean {
  const now = new Date();
  const { hours, minutes } = parseTime(timeStr);
  return now.getHours() === hours && now.getMinutes() === minutes;
}

/**
 * Content type rotation based on growth strategy:
 * 50% Single Image, 30% Carousel (future), 20% Reels (future)
 */
function getContentType(): "image" | "carousel" {
  const rand = Math.random();
  if (rand < 0.6) return "image";
  return "carousel";
}

async function generateScheduledContent() {
  const [config] = await db.select().from(configTable).limit(1);
  if (!config) return;

  logger.info({ niche: config.niche }, "Cron: generating scheduled content");

  try {
    const type = getContentType();
    const content = await generateInstagramContent(config.niche, config.language, type);
    
    let imageUrl = "";
    let mediaUrls: string[] = [];

    if (type === "carousel") {
      const prompts = content.carouselPrompts || [content.imagePrompt];
      const queries = content.carouselQueries || [content.searchQuery || ""];
      for (let i = 0; i < prompts.length; i++) {
        const url = await generatePostImage(prompts[i], queries[i], undefined, content.captionSubject);
        mediaUrls.push(url);
      }
      imageUrl = mediaUrls[0];
    } else {
      imageUrl = await generatePostImage(
        content.imagePrompt, 
        content.searchQuery || "", 
        undefined, 
        content.captionSubject
      );
    }

    const now = new Date();

    // USER RULE: Always auto-approve search images, never auto-approve AI images
    const isSearch = (config.imageSource === "search");
    const finalStatus = isSearch ? "approved" : "pending";

    await db.insert(postsTable).values({
      caption: content.caption,
      hashtags: content.hashtags,
      imageUrl,
      mediaUrls: type === "carousel" ? mediaUrls : null,
      mediaType: type,
      imagePrompt: content.imagePrompt,
      status: finalStatus,
      scheduledFor: now,
    });

    logger.info("Cron: content generated and queued for publishing");
  } catch (err) {
    logger.error({ err }, "Cron: failed to generate content");
  }
}

async function publishApprovedPosts() {
  const [config] = await db.select().from(configTable).limit(1);
  if (!config?.instagramAccountId || !config?.metaAccessToken) return;

  const now = new Date();

  const approvedPosts = await db
    .select()
    .from(postsTable)
    .where(
      and(
        eq(postsTable.status, "approved"),
        lte(postsTable.scheduledFor, now)
      )
    );

  for (const post of approvedPosts) {
    try {
      const fullCaption = `${post.caption}\n\n${post.hashtags}`;
      
      const result = await publishToInstagram(
        post.imageUrl,
        post.caption,
        post.hashtags,
        config.instagramAccountId,
        config.metaAccessToken,
        post.mediaType as any,
        post.videoUrl || undefined,
        post.mediaUrls || undefined
      );

      await db
        .update(postsTable)
        .set({
          status: "posted",
          postedAt: new Date(),
          instagramPostId: result.instagramPostId,
          updatedAt: new Date(),
        })
        .where(eq(postsTable.id, post.id));

      logger.info({ postId: post.id }, "Cron: post published to Instagram ✅");
    } catch (err) {
      logger.error({ err, postId: post.id }, "Cron: failed to publish post");
    }
  }
}

export function startScheduler() {
  logger.info("🚀 Starting auto-pilot scheduler (checking every minute)");
  logger.info("📅 Posting times: Morning (09:00), Afternoon (13:00), Evening (18:00) IST");

  setInterval(async () => {
    const [config] = await db.select().from(configTable).limit(1);
    if (!config) return;

    // Check if it's time to generate content
    // Growth plan: 9 AM, 1 PM, 6 PM (configurable via dashboard)
    const isGenerationTime =
      shouldRunNow(config.morningPostTime) ||
      shouldRunNow(config.afternoonPostTime || "13:00") ||
      shouldRunNow(config.eveningPostTime || "18:00") ||
      shouldRunNow(config.nightPostTime || "21:00") ||
      shouldRunNow(config.lateNightPostTime || "23:00") ||
      shouldRunNow(config.midnightPostTime || "03:00");

    if (isGenerationTime) {
      logger.info("⏰ It's posting time! Generating content...");
      await generateScheduledContent();
    }

    // Always check for approved posts to publish
    await publishApprovedPosts();
  }, 60 * 1000); // Check every minute
}
