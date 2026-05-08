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

router.get("/posts", async (req, res) => {
  const query = ListPostsQueryParams.parse(req.query);

  const conditions: any[] = [];
  if (query.status) {
    conditions.push(eq(postsTable.status, query.status));
  }

  const whereClause = (conditions.length > 0 ? and(...conditions) : undefined) as any;

  const [posts, totalResult] = await Promise.all([
    db
      .select()
      .from(postsTable)
      .where(whereClause)
      .orderBy(desc(postsTable.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(postsTable).where(whereClause),
  ]);

  res.json({
    posts: posts.map(serializePost),
    total: totalResult[0]?.count ?? 0,
  });
});

router.get("/posts/today", async (req, res) => {
  const posts = await db
    .select()
    .from(postsTable)
    .where(
      and(
        ne(postsTable.status, "posted"),
        ne(postsTable.status, "rejected"),
      ),
    )
    .orderBy(desc(postsTable.createdAt));

  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json({
    posts: posts.map(serializePost),
    total: posts.length,
  });
});

router.post("/posts/generate", async (req, res) => {
  const { type = "image", imageSource } = req.body;
  const config = await getConfig();
  req.log.info({ niche: config.niche, type }, "Generating content");

  try {
    const { generateInstagramContent } = await import("../services/claudeService.js");
    const { generatePostImage } = await import("../services/imageService.js");
    const { generateReelVideo } = await import("../services/videoService.js");

    const content = await generateInstagramContent(config.niche, config.language, type);

    if (!content.caption || !content.imagePrompt) {
      req.log.error({ content }, "AI returned invalid content structure");
      res.status(500).json({ error: "AI failed to generate valid content. Please try again." });
      return;
    }

    let smartSearchQuery = content.searchQuery || content.imagePrompt;
    const subject = content.captionSubject;
    if (subject) {
      smartSearchQuery = `${subject} latest candid action photo`;
    }

    let imageUrl: string;
    let videoUrl: string | null = null;
    let mediaUrls: string[] = [];

    if (type === "reels") {
      const reelData = await generateReelVideo(content.imagePrompt, imageSource);
      imageUrl = reelData.imageUrl;
      videoUrl = reelData.videoUrl;
    } else if (type === "carousel") {
      const prompts = content.carouselPrompts || [content.imagePrompt];
      const queries = content.carouselQueries || [smartSearchQuery];
      for (let i = 0; i < Math.min(prompts.length, 10); i++) {
        const url = await generatePostImage(prompts[i], queries[i] || smartSearchQuery, imageSource, subject);
        mediaUrls.push(url);
      }
      imageUrl = mediaUrls[0] || "";
    } else {
      imageUrl = await generatePostImage(content.imagePrompt, smartSearchQuery, imageSource, subject);
    }

    const scheduledFor = getNextScheduleTime(config);

    const [post] = await db
      .insert(postsTable)
      .values({
        caption: content.caption || "No caption generated",
        hashtags: content.hashtags || "",
        imageUrl,
        videoUrl: videoUrl || undefined,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
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

router.get("/posts/:id", async (req, res) => {
  const { id } = GetPostParams.parse(req.params);
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, id) as any);

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  res.json(serializePost(post));
});

router.patch("/posts/:id", async (req, res) => {
  const { id } = UpdatePostParams.parse(req.params);
  const body = UpdatePostBody.parse(req.body);

  const [post] = await db
    .update(postsTable)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(postsTable.id, id) as any)
    .returning();

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  res.json(serializePost(post));
});

router.post("/posts/:id/approve", async (req, res) => {
  const { id } = ApprovePostParams.parse(req.params);

  const [post] = await db
    .update(postsTable)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(postsTable.id, id) as any)
    .returning();

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  res.json(serializePost(post));
});

router.post("/posts/:id/reject", async (req, res) => {
  const { id } = RejectPostParams.parse(req.params);

  const [post] = await db
    .update(postsTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(postsTable.id, id) as any)
    .returning();

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  res.json(serializePost(post));
});

router.post("/posts/:id/retry", async (req, res) => {
  const { id } = RetryPostParams.parse(req.params);

  const [existing] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, id) as any);

  if (!existing) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  if (existing.status !== "failed") {
    res.status(400).json({ error: `Post must be in failed state to retry (current: ${existing.status})` });
    return;
  }

  const [reset] = await db
    .update(postsTable)
    .set({ status: "approved", publishError: null, instagramPostId: null, updatedAt: new Date() })
    .where(eq(postsTable.id, id) as any)
    .returning();

  if (!reset) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const baseUrl = `${protocol}://${host}`;

  try {
    await publishPost(id, baseUrl);

    const [updated] = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, id) as any);

    res.json(serializePost(updated!));
  } catch (err: any) {
    const [failed] = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, id) as any);

    const post = failed ? serializePost(failed) : undefined;

    if (err instanceof PublishError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      res.status(status).json({ error: err.message, post });
      return;
    }

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

    const [updated] = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, id) as any);

    if (!updated) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    res.json(serializePost(updated));
  } catch (err: any) {
    if (err instanceof PublishError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Failed to publish post");
    res.status(500).json({ error: err.message || "Failed to publish post" });
  }
});

async function getConfig() {
  const [config] = await db.select().from(configTable).limit(1);
  if (!config) {
    return {
      niche: "fitness",
      morningPostTime: "09:00",
      afternoonPostTime: "12:00",
      eveningPostTime: "15:00",
      nightPostTime: "18:00",
      lateNightPostTime: "21:00",
      midnightPostTime: "00:00",
      language: "English",
      autoApprove: false,
      instagramAccountId: "",
      metaAccessToken: "",
    };
  }
  return config;
}

function getNextScheduleTime(config: {
  morningPostTime: string;
  afternoonPostTime: string;
  eveningPostTime: string;
  nightPostTime: string;
  lateNightPostTime: string;
  midnightPostTime: string;
}): Date {
  const now = new Date();
  const times = [
    config.morningPostTime,
    config.afternoonPostTime,
    config.eveningPostTime,
    config.nightPostTime,
    config.lateNightPostTime,
    config.midnightPostTime,
  ].map((t) => (t || "00:00").split(":").map(Number));

  const timesToday = times
    .map(([h, m]) => {
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    })
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
