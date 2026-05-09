import { Router } from "express";
import { db, postsTable, configTable, eq, desc, and, gte, lte, count, sql, ne, asc } from "@workspace/db";
import { publishPost, PublishError } from "../services/publishService.js";
import { z } from "zod";

const router = Router();

const ListPostsQueryParams = z.object({
  status: z.enum(["pending", "approved", "rejected", "posted", "failed"]).optional(),
  limit: z.coerce.number().default(50),
  offset: z.coerce.number().default(0),
});

const GetPostParams = z.object({ id: z.coerce.number() });
const UpdatePostParams = z.object({ id: z.coerce.number() });
const UpdatePostBody = z.object({
  caption: z.string().optional(),
  hashtags: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected", "posted", "failed"]).optional(),
});
const RetryPostParams = z.object({ id: z.coerce.number() });
const PublishPostParams = z.object({ id: z.coerce.number() });
const ApprovePostParams = z.object({ id: z.coerce.number() });
const RejectPostParams = z.object({ id: z.coerce.number() });

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

router.get("/posts", async (req, res) => {
  const query = ListPostsQueryParams.parse(req.query);
  const conditions: any[] = [];
  if (query.status) conditions.push(eq(postsTable.status, query.status));
  const whereClause = (conditions.length > 0 ? and(...conditions) : undefined) as any;

  const [posts, totalResult] = await Promise.all([
    db.select().from(postsTable).where(whereClause).orderBy(desc(postsTable.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(postsTable).where(whereClause),
  ]);

  res.json({ posts: posts.map(serializePost), total: totalResult[0]?.count ?? 0 });
});

router.get("/posts/today", async (req, res) => {
  const posts = await db
    .select()
    .from(postsTable)
    .where(and(ne(postsTable.status, "posted"), ne(postsTable.status, "rejected")))
    .orderBy(desc(postsTable.createdAt));

  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json({ posts: posts.map(serializePost), total: posts.length });
});

// ── Generate post ─────────────────────────────────────────────────────────────
router.post("/posts/generate", async (req, res) => {
  const { type = "image", imageSource, topicTitle } = req.body;
  const config = await getConfig();
  req.log.info({ niche: config.niche, type, topicTitle }, "Generating content");

  try {
    const { generateInstagramContent } = await import("../services/claudeService.js");
    const { generatePostImage } = await import("../services/imageService.js");
    const { generateReelVideo } = await import("../services/videoService.js");
    const { getTrendingTopics } = await import("../services/trendingService.js");

    // If a specific topic was requested, find it; otherwise let the service pick
    let forcedTopic;
    if (topicTitle) {
      const topics = await getTrendingTopics(20, config.niche);
      forcedTopic = topics.find((t) => t.title === topicTitle);
    }

    const recentCaptions = await getRecentCaptions();
    const content = await generateInstagramContent(config.niche, config.language, type, forcedTopic, { recentCaptions });

    if (!content.caption || !content.imagePrompt) {
      req.log.error({ content }, "AI returned invalid content structure");
      res.status(500).json({ error: "AI failed to generate valid content. Please try again." });
      return;
    }

    // Anchor image search to the account niche to prevent off-niche images
    const trending = content.trendingTopic;
    const subject = `${config.niche}: ${content.captionSubject || trending?.title || ""}`;
    const smartImageQuery = buildImageSearchQuery(config.niche, content.captionSubject || trending?.title || "");

    // Determine effective image source — body overrides config
    const effectiveImageSource = imageSource || config.imageSource || "ai";

    let imageUrl: string;
    let videoUrl: string | null = null;
    let mediaUrls: string[] = [];

    if (type === "reels") {
      const reelData = await generateReelVideo(content.imagePrompt, config.niche, effectiveImageSource, subject);
      imageUrl = reelData.imageUrl;
      videoUrl = reelData.videoUrl;
    } else if (type === "carousel") {
      // Ensure at least 5 prompts (Instagram requires min 2, we aim for 5)
      const rawPrompts = content.carouselPrompts || [];
      const rawQueries = content.carouselQueries || [];

      // Fill to 5 if needed
      const padded = ensureMinSlides(rawPrompts, rawQueries, smartImageQuery, subject || "", 5);

      for (let i = 0; i < Math.min(padded.prompts.length, 10); i++) {
        const url = await generatePostImage(
          padded.prompts[i],
          padded.queries[i] || smartImageQuery,
          effectiveImageSource,
          subject,
        ).catch(() => "");
        if (url) mediaUrls.push(url);
      }

      // Guarantee minimum 2 slides (Instagram requires it)
      if (mediaUrls.length < 2 && mediaUrls.length > 0) {
        mediaUrls.push(mediaUrls[0]);
      }

      imageUrl = mediaUrls[0] || "";
    } else {
      imageUrl = await generatePostImage(content.imagePrompt, smartImageQuery, effectiveImageSource, subject);
    }

    if (!imageUrl) {
      throw new Error("No usable image was generated or found. Check your image/search API keys and try again.");
    }

    const scheduledFor = getNextScheduleTime(config);

    const [post] = await db
      .insert(postsTable)
      .values({
        caption: content.caption,
        hashtags: content.hashtags || "",
        imageUrl,
        videoUrl: videoUrl || undefined,
        mediaUrls: mediaUrls.length >= 2 ? mediaUrls : undefined,
        mediaType: type,
        imagePrompt: content.imagePrompt,
        status: config.autoApprove ? "approved" : "pending",
        scheduledFor,
      })
      .returning();

    res.json(serializePost(post));
  } catch (err: any) {
    req.log.error({ err }, "Failed to generate post");
    res.status(500).json({ error: err.message || "Failed to generate post" });
  }
});

// ── Regenerate caption for existing post ──────────────────────────────────────
router.post("/posts/:id/regenerate-caption", async (req, res) => {
  const { id } = GetPostParams.parse(req.params);
  const config = await getConfig();

  const [existing] = await db.select().from(postsTable).where(eq(postsTable.id, id) as any);
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }

  try {
    const { generateInstagramContent } = await import("../services/claudeService.js");
    const recentCaptions = await getRecentCaptions(id);
    const content = await generateInstagramContent(config.niche, config.language, existing.mediaType as any, undefined, {
      existingImagePrompt: existing.imagePrompt,
      existingImageUrl: existing.imageUrl,
      existingCaption: existing.caption,
      recentCaptions,
    });

    const [updated] = await db
      .update(postsTable)
      .set({ caption: content.caption, hashtags: content.hashtags, updatedAt: new Date() })
      .where(eq(postsTable.id, id) as any)
      .returning();

    req.log.info({ id }, "Caption regenerated");
    res.json(serializePost(updated!));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to regenerate caption" });
  }
});

router.get("/posts/:id", async (req, res) => {
  const { id } = GetPostParams.parse(req.params);
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id) as any);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(serializePost(post));
});

router.patch("/posts/:id", async (req, res) => {
  const { id } = UpdatePostParams.parse(req.params);
  const body = UpdatePostBody.parse(req.body);
  const [post] = await db.update(postsTable).set({ ...body, updatedAt: new Date() }).where(eq(postsTable.id, id) as any).returning();
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(serializePost(post));
});

router.post("/posts/:id/approve", async (req, res) => {
  const { id } = ApprovePostParams.parse(req.params);
  const [post] = await db.update(postsTable).set({ status: "approved", updatedAt: new Date() }).where(eq(postsTable.id, id) as any).returning();
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(serializePost(post));
});

router.post("/posts/:id/reject", async (req, res) => {
  const { id } = RejectPostParams.parse(req.params);
  const [post] = await db.update(postsTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(postsTable.id, id) as any).returning();
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(serializePost(post));
});

router.post("/posts/:id/retry", async (req, res) => {
  const { id } = RetryPostParams.parse(req.params);
  const [existing] = await db.select().from(postsTable).where(eq(postsTable.id, id) as any);
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  if (existing.status !== "failed") { res.status(400).json({ error: `Post must be in failed state (current: ${existing.status})` }); return; }

  const [reset] = await db.update(postsTable).set({ status: "approved", publishError: null, instagramPostId: null, updatedAt: new Date() }).where(eq(postsTable.id, id) as any).returning();
  if (!reset) { res.status(404).json({ error: "Post not found" }); return; }

  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const baseUrl = `${protocol}://${host}`;

  try {
    await publishPost(id, baseUrl);
    const [updated] = await db.select().from(postsTable).where(eq(postsTable.id, id) as any);
    res.json(serializePost(updated!));
  } catch (err: any) {
    const [failed] = await db.select().from(postsTable).where(eq(postsTable.id, id) as any);
    const post = failed ? serializePost(failed) : undefined;
    if (err instanceof PublishError) { res.status(err.code === "NOT_FOUND" ? 404 : 400).json({ error: err.message, post }); return; }
    req.log.error({ err }, "Failed to retry post");
    res.status(500).json({ error: err.message || "Failed to publish post", post });
  }
});

router.post("/posts/:id/publish", async (req, res) => {
  const { id } = PublishPostParams.parse(req.params);
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const baseUrl = `${protocol}://${host}`;

  try {
    await publishPost(id, baseUrl);
    const [updated] = await db.select().from(postsTable).where(eq(postsTable.id, id) as any);
    if (!updated) { res.status(404).json({ error: "Post not found" }); return; }
    res.json(serializePost(updated));
  } catch (err: any) {
    if (err instanceof PublishError) { res.status(err.code === "NOT_FOUND" ? 404 : 400).json({ error: err.message }); return; }
    req.log.error({ err }, "Failed to publish post");
    res.status(500).json({ error: err.message || "Failed to publish post" });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function ensureMinSlides(
  prompts: string[],
  queries: string[],
  defaultQuery: string,
  subject: string,
  min: number,
): { prompts: string[]; queries: string[] } {
  const p = [...prompts];
  const q = [...queries];
  const subjects = [
    `Wide establishing shot of ${subject} — crowd, scene, location`,
    `Close-up detail photo related to ${subject} — human impact visible`,
    `Context photo for ${subject} — background and setting`,
    `People affected by ${subject} — authentic moment`,
    `${subject} — resolution or current state photo`,
  ];
  while (p.length < min) {
    p.push(subjects[p.length] || `News photo of ${subject}`);
    q.push(defaultQuery);
  }
  return { prompts: p, queries: q };
}

async function getConfig() {
  const [config] = await db.select().from(configTable).limit(1);
  if (!config) {
    return {
      niche: "India Instagram trends",
      morningPostTime: "08:00",
      afternoonPostTime: "12:00",
      eveningPostTime: "16:00",
      nightPostTime: "20:00",
      lateNightPostTime: "21:00",
      midnightPostTime: "22:00",
      language: "English",
      autoApprove: false,
      instagramAccountId: "",
      metaAccessToken: "",
      imageSource: "search",
    };
  }
  return { ...config, niche: normalizeLegacyNiche(config.niche) };
}

async function getRecentCaptions(excludeId?: number): Promise<string[]> {
  const conditions = excludeId ? ne(postsTable.id, excludeId) : undefined;
  const rows = await db
    .select({ caption: postsTable.caption })
    .from(postsTable)
    .where(conditions as any)
    .orderBy(desc(postsTable.createdAt))
    .limit(8);
  return rows.map((row) => row.caption).filter(Boolean);
}

function getNextScheduleTime(config: {
  morningPostTime: string; afternoonPostTime: string; eveningPostTime: string;
  nightPostTime: string; lateNightPostTime: string; midnightPostTime: string;
}): Date {
  const now = new Date();
  const times = [
    config.morningPostTime, config.afternoonPostTime, config.eveningPostTime,
    config.nightPostTime, config.lateNightPostTime, config.midnightPostTime,
  ].map((t) => (t || "00:00").split(":").map(Number));

  const timesToday = times
    .map(([h, m]) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; })
    .sort((a, b) => a.getTime() - b.getTime());

  for (const time of timesToday) {
    if (now < time) return time;
  }
  const firstTomorrow = new Date(timesToday[0]);
  firstTomorrow.setDate(firstTomorrow.getDate() + 1);
  return firstTomorrow;
}

function serializePost(post: typeof postsTable.$inferSelect) {
  return {
    id: post.id,
    caption: post.caption,
    hashtags: post.hashtags,
    imageUrl: post.imageUrl,
    videoUrl: post.videoUrl ?? null,
    mediaType: post.mediaType ?? "image",
    mediaUrls: post.mediaUrls ?? [],
    imagePrompt: post.imagePrompt,
    status: post.status,
    publishError: post.publishError ?? null,
    scheduledFor: post.scheduledFor?.toISOString(),
    postedAt: post.postedAt?.toISOString() ?? null,
    instagramPostId: post.instagramPostId ?? null,
    createdAt: post.createdAt?.toISOString(),
    updatedAt: post.updatedAt?.toISOString(),
  };
}

export default router;
