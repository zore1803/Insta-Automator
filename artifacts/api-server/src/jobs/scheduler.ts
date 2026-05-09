import { db, postsTable, configTable, eq, and, lte, sql, desc } from "@workspace/db";
import { generateInstagramContent } from "../services/claudeService.js";
import { generatePostImage } from "../services/imageService.js";
import { generateReelVideo } from "../services/videoService.js";
import { publishPost, PublishError } from "../services/publishService.js";
import { getOneTrendingTopic } from "../services/trendingService.js";
import { logger } from "../lib/logger.js";

const CLAIM_SENTINEL = "__publishing__";
const STALE_CLAIM_MINUTES = 10;

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

// Smart content mix: carousel (saves), reels (reach), image (engagement)
function getSmartContentType(): "image" | "carousel" | "reels" {
  const rand = Math.random();
  if (rand < 0.40) return "carousel"; // 40% — highest save rate
  if (rand < 0.70) return "reels";    // 30% — highest reach
  return "image";                     // 30% — consistent baseline
}

function isLiveEventNiche(niche: string): boolean {
  return /\b(ipl|cricket|match|score|t20|odi|test match|sports?|football|league|tournament|cup|icc|game day|bcci|wicket|batting|bowling)\b/i.test(niche);
}

function buildImageSearchQuery(niche: string, subject: string): string {
  const suffix = isLiveEventNiche(niche) ? "cricket match real photo India" : "real photo India";
  return `${niche} ${subject} ${suffix}`.trim();
}

function normalizeLegacyNiche(niche: string): string {
  const value = niche.toLowerCase();
  return value === "fitness" || value.includes("tamil nadu business") ? "India Instagram trends" : niche;
}

function ensureMinSlides(prompts: string[], queries: string[], defaultQuery: string, subject: string, min: number) {
  const p = [...prompts];
  const q = [...queries];
  const fillers = [
    `Wide establishing photo of ${subject}`,
    `Close-up documentary photo related to ${subject}`,
    `Crowd or people affected by ${subject}`,
    `Context/background photo for ${subject}`,
    `Resolution or current state of ${subject}`,
  ];
  while (p.length < min) { p.push(fillers[p.length] || `${subject} news photo`); q.push(defaultQuery); }
  return { prompts: p, queries: q };
}

async function generateScheduledContent(): Promise<void> {
  const [config] = await db.select().from(configTable).limit(1);
  if (!config) return;

  const type = getSmartContentType();
  const activeNiche = normalizeLegacyNiche(config.niche);
  const trending = await getOneTrendingTopic(activeNiche);
  logger.info({ topic: trending.title, type }, "Scheduler: generating content for trending topic");

  try {
    const recentCaptions = await getRecentCaptions();
    const content = await generateInstagramContent(activeNiche, config.language, type, trending, { recentCaptions });
    const effectiveSource = config.imageSource || "ai";
    const subject = `${activeNiche}: ${content.captionSubject || trending.title}`;
    const smartQuery = buildImageSearchQuery(activeNiche, content.captionSubject || trending.title);

    let imageUrl = "";
    let videoUrl: string | undefined;
    let mediaUrls: string[] = [];

    if (type === "reels") {
      // Fix: pass niche as 2nd arg, imageSource as 3rd arg (was passing imageSource as niche before!)
      const reel = await generateReelVideo(content.imagePrompt, activeNiche, effectiveSource, subject);
      imageUrl = reel.imageUrl;
      videoUrl = reel.videoUrl;
    } else if (type === "carousel") {
      const raw = content.carouselPrompts || [];
      const rawQ = content.carouselQueries || [];
      const padded = ensureMinSlides(raw, rawQ, smartQuery, subject, 5);

      for (let i = 0; i < Math.min(padded.prompts.length, 10); i++) {
        const url = await generatePostImage(
          padded.prompts[i],
          padded.queries[i] || smartQuery,
          effectiveSource,
          subject,
        ).catch(() => "");
        if (url) mediaUrls.push(url);
      }
      // Guarantee min 2 slides
      if (mediaUrls.length === 1) mediaUrls.push(mediaUrls[0]);
      imageUrl = mediaUrls[0] || "";
    } else {
      imageUrl = await generatePostImage(content.imagePrompt, smartQuery, effectiveSource, subject);
    }

    if (!imageUrl) {
      throw new Error("No usable image was generated or found for scheduled content.");
    }

    const status = config.autoApprove ? "approved" : "pending";

    await db.insert(postsTable).values({
      caption: content.caption,
      hashtags: content.hashtags,
      imageUrl,
      videoUrl: videoUrl || undefined,
      mediaUrls: mediaUrls.length >= 2 ? mediaUrls : undefined,
      mediaType: type,
      imagePrompt: content.imagePrompt,
      status,
      scheduledFor: new Date(),
    });

    logger.info({ type, status, topic: trending.title }, "Scheduler: content queued");
  } catch (err) {
    logger.error({ err }, "Scheduler: content generation failed");
  }
}

async function getRecentCaptions(): Promise<string[]> {
  const rows = await db
    .select({ caption: postsTable.caption })
    .from(postsTable)
    .orderBy(desc(postsTable.createdAt))
    .limit(8);
  return rows.map((row) => row.caption).filter(Boolean);
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
    logger.warn({ count: stale.length }, "Scheduler: released stale publish claims");
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

// ── Auto token refresh — runs every 50 days ──────────────────────────────────
let lastTokenRefresh = 0;
const TOKEN_REFRESH_INTERVAL_MS = 50 * 24 * 60 * 60 * 1000; // 50 days

async function autoRefreshToken(): Promise<void> {
  if (Date.now() - lastTokenRefresh < TOKEN_REFRESH_INTERVAL_MS) return;

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return;

  const [config] = await db.select().from(configTable).limit(1);
  if (!config?.metaAccessToken) return;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${config.metaAccessToken}`,
    );
    const data = (await res.json()) as { access_token?: string };
    if (data.access_token) {
      await db.update(configTable).set({ metaAccessToken: data.access_token, updatedAt: new Date() });
      lastTokenRefresh = Date.now();
      logger.info("Scheduler: auto-refreshed Meta access token");
    }
  } catch (err) {
    logger.warn({ err }, "Scheduler: auto token refresh failed");
  }
}

export function startScheduler(): void {
  logger.info("Scheduler: auto-pilot started — checking every 60s");

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
        logger.info("Scheduler: posting time hit — generating trending content");
        await generateScheduledContent();
      }

      await recoverStaleClaims();
      await publishApprovedPosts();
      await autoRefreshToken();
    } catch (err) {
      logger.error({ err }, "Scheduler: tick error");
    }
  }, 60_000);
}
