import { db, postsTable, configTable, eq, and, lte, sql } from "@workspace/db";
import { generateInstagramContent } from "../services/claudeService.js";
import { generatePostImage } from "../services/imageService.js";
import { generateReelVideo } from "../services/videoService.js";
import { publishPost, PublishError } from "../services/publishService.js";
import { logger } from "../lib/logger.js";

const CLAIM_SENTINEL = "__publishing__";
const STALE_CLAIM_MINUTES = 10;

// ─── Best Instagram Posting Times (research-backed for maximum reach) ──────────
// Based on global Instagram engagement data:
// 6 AM  → Early risers / motivation seekers (first scroll of the day)
// 9 AM  → Morning commute / work startup  
// 12 PM → Lunch break (highest mid-day engagement)
// 15:00 → Afternoon slump (people need motivation)
// 18:00 → After work scroll (commute home)
// 21:00 → Prime time — HIGHEST overall engagement on Instagram

function parseTime(t: string): { h: number; m: number } {
  const [h, m] = (t || "00:00").split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

function isNow(timeStr: string, toleranceMinutes = 1): boolean {
  if (!timeStr) return false;
  const now = new Date();
  const { h, m } = parseTime(timeStr);
  const diff = Math.abs(now.getHours() * 60 + now.getMinutes() - (h * 60 + m));
  return diff <= toleranceMinutes;
}

// Smart content mix for maximum algorithm performance:
// Carousel: highest saves → algorithm boost → explore page
// Reel: highest reach potential → new followers
// Post: consistent engagement → trust signals
function getSmartContentType(): "image" | "carousel" | "reels" {
  const rand = Math.random();
  if (rand < 0.40) return "carousel"; // 40% — highest save rate
  if (rand < 0.70) return "reels";    // 30% — highest reach
  return "image";                     // 30% — consistent baseline
}

async function generateScheduledContent(): Promise<void> {
  const [config] = await db.select().from(configTable).limit(1);
  if (!config) return;

  const type = getSmartContentType();
  logger.info({ niche: config.niche, type }, "Scheduler: generating content");

  try {
    const content = await generateInstagramContent(config.niche, config.language, type);

    let imageUrl = "";
    let videoUrl: string | undefined;
    let mediaUrls: string[] = [];

    if (type === "reels") {
      const reel = await generateReelVideo(content.imagePrompt, config.niche, config.imageSource || undefined);
      imageUrl = reel.imageUrl;
      videoUrl = reel.videoUrl;
    } else if (type === "carousel") {
      const prompts = content.carouselPrompts || [content.imagePrompt, content.imagePrompt, content.imagePrompt];
      const queries = content.carouselQueries || [content.searchQuery];
      for (let i = 0; i < Math.min(prompts.length, 10); i++) {
        const url = await generatePostImage(
          prompts[i],
          queries[i] || content.searchQuery || "",
          config.imageSource || undefined,
          content.captionSubject,
        ).catch(() => "");
        if (url) mediaUrls.push(url);
      }
      imageUrl = mediaUrls[0] || "";
    } else {
      imageUrl = await generatePostImage(
        content.imagePrompt,
        content.searchQuery || "",
        config.imageSource || undefined,
        content.captionSubject,
      );
    }

    // Auto-approve search images (they're real photos = safe to post)
    // AI images go to pending for human review
    const status = config.imageSource === "search" || config.autoApprove ? "approved" : "pending";

    await db.insert(postsTable).values({
      caption: content.caption,
      hashtags: content.hashtags,
      imageUrl,
      videoUrl: videoUrl || undefined,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      mediaType: type,
      imagePrompt: content.imagePrompt,
      status,
      scheduledFor: new Date(),
    });

    logger.info({ type, status }, "Scheduler: content queued");
  } catch (err) {
    logger.error({ err }, "Scheduler: content generation failed");
  }
}

async function recoverStaleClaims(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000);
  const stale = await db
    .update(postsTable)
    .set({ instagramPostId: null, updatedAt: new Date() })
    .where(
      and(
        eq(postsTable.status, "approved"),
        sql`${postsTable.instagramPostId} = ${CLAIM_SENTINEL}`,
        lte(postsTable.updatedAt, cutoff),
      ),
    )
    .returning({ id: postsTable.id });

  if (stale.length > 0) {
    logger.warn(
      { count: stale.length, ids: stale.map((r) => r.id) },
      "Scheduler: released stale publish claims (process likely crashed mid-publish)",
    );
  }
}

async function publishApprovedPosts(): Promise<void> {
  const [config] = await db.select().from(configTable).limit(1);
  if (!config?.instagramAccountId || !config?.metaAccessToken) return;

  const due = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(and(eq(postsTable.status, "approved"), lte(postsTable.scheduledFor, new Date())));

  if (!due.length) return;
  logger.info({ count: due.length }, "Scheduler: publishing approved posts");

  // Provide a base URL so any relative media URLs can be resolved to absolute
  // before being sent to Instagram. Fall back to the Replit dev domain if set.
  const baseUrl =
    process.env.PUBLIC_API_BASE_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");

  for (const { id } of due) {
    try {
      const result = await publishPost(id, baseUrl);
      logger.info({ postId: id, igId: result.instagramPostId }, "Scheduler: published to Instagram");
    } catch (err) {
      if (err instanceof PublishError && err.code === "ALREADY_CLAIMED") {
        logger.warn({ postId: id }, "Scheduler: post already claimed — skipping");
      } else {
        logger.error({ err, postId: id }, "Scheduler: publish failed");
      }
    }
  }
}

export function startScheduler(): void {
  logger.info("Scheduler: auto-pilot started — checking every 60s for optimal posting times");

  setInterval(async () => {
    try {
      const [config] = await db.select().from(configTable).limit(1);
      if (!config) return;

      const isPostingTime =
        isNow(config.morningPostTime) ||
        isNow(config.afternoonPostTime) ||
        isNow(config.eveningPostTime) ||
        isNow(config.nightPostTime) ||
        isNow(config.lateNightPostTime) ||
        isNow(config.midnightPostTime);

      if (isPostingTime) {
        logger.info("Scheduler: optimal posting time hit — generating content");
        await generateScheduledContent();
      }

      await recoverStaleClaims();
      await publishApprovedPosts();
    } catch (err) {
      logger.error({ err }, "Scheduler: tick error");
    }
  }, 60_000);
}
