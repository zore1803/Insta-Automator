import { Router } from "express";
import { db, postsTable, configTable, eq, desc, and, gte, lte, count, sql, ne, asc } from "../../lib/db/src/index.ts";
import {
  ListPostsQueryParams,
  GetPostParams,
  UpdatePostParams,
  UpdatePostBody,
  PublishPostParams,
  ApprovePostParams,
  RejectPostParams,
  GeneratePostResponse,
} from "../../lib/api-zod/src/index.ts";
import { generateInstagramContent } from "../services/claudeService.js";
import { generatePostImage } from "../services/dalleService.js";
import { generateReelVideo } from "../services/videoService.js";
import { publishToInstagram } from "../services/instagramService.js";

const router = Router();

router.get("/posts", async (req, res) => {
  const query = ListPostsQueryParams.parse(req.query);

  const conditions = [];
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
        ne(postsTable.status, "rejected")
      )
    )
    .orderBy(desc(postsTable.createdAt));

  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json({
    posts: posts.map(serializePost),
    total: posts.length
  });
});

router.post("/posts/generate", async (req, res) => {
  const { type = "image" } = req.body;
  const config = await getConfig();
  req.log.info({ niche: config.niche, type }, "Generating content");

  const content = await generateInstagramContent(config.niche, config.language, type);
  
  req.log.info({ content }, "AI content generated");

  // Validate content to prevent DB errors
  if (!content.caption || !content.imagePrompt) {
    req.log.error({ content }, "AI returned invalid content structure");
    throw new Error("AI failed to generate a valid caption or prompt. Please try again.");
  }

  // Build a precise search query from the caption itself
  // Extract the main subject: use captionSubject if available, otherwise pull the first proper noun phrase from the caption
  let smartSearchQuery = content.searchQuery;
  const subject = content.captionSubject;
  if (subject) {
    // Use the subject directly as the primary search term
    smartSearchQuery = `${subject} latest candid action photo`;
    req.log.info({ subject, smartSearchQuery }, "Using captionSubject for image search");
  } else {
    // Fallback: extract the first capitalized multi-word phrase from the caption (likely a name/team)
    const nameMatch = content.caption.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    if (nameMatch) {
      smartSearchQuery = `${nameMatch[0]} latest candid action photo`;
      req.log.info({ extracted: nameMatch[0], smartSearchQuery }, "Extracted subject from caption for image search");
    }
  }

  let imageUrl: string;
  let videoUrl: string | null = null;
  let mediaUrls: string[] = [];

  if (type === "reels") {
    req.log.info("Generating Reel video");
    const reelData = await generateReelVideo(content.imagePrompt, req.body.imageSource);
    imageUrl = reelData.imageUrl;
    videoUrl = reelData.videoUrl;
  } else if (type === "carousel") {
    req.log.info("Generating Carousel images");
    const prompts = content.carouselPrompts || [content.imagePrompt];
    const queries = content.carouselQueries || [smartSearchQuery];
    
    for (let i = 0; i < Math.min(prompts.length, 10); i++) {
      const url = await generatePostImage(prompts[i], queries[i] || smartSearchQuery, req.body.imageSource, subject);
      mediaUrls.push(url);
    }
    imageUrl = mediaUrls[0] || ""; // Cover image
  } else {
    req.log.info({ smartSearchQuery, imageSource: req.body.imageSource }, "Triggering image generation with smart query");
    imageUrl = await generatePostImage(content.imagePrompt, smartSearchQuery, req.body.imageSource, subject);
    req.log.info({ imageUrl }, "Image generation service returned");
  }

  const scheduledFor = getNextScheduleTime(config);

  const [post] = await db
    .insert(postsTable)
    .values({
      caption: content.caption || "No caption generated",
      hashtags: content.hashtags || "",
      imageUrl,
      videoUrl,
      mediaUrls,
      mediaType: type,
      imagePrompt: content.imagePrompt,
      status: config.autoApprove ? "approved" : "pending",
      scheduledFor,
    })
    .returning();

  res.json(serializePost(post));
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

router.post("/posts/:id/publish", async (req, res) => {
  const { id } = PublishPostParams.parse(req.params);

  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, id) as any);

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  if (post.status !== "approved") {
    res.status(400).json({ error: "Post must be approved before publishing" });
    return;
  }

  const config = await getConfig();

  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const absoluteImageUrl = post.imageUrl.startsWith("http") 
    ? post.imageUrl 
    : `${protocol}://${host}${post.imageUrl}`;

  const absoluteVideoUrl = post.videoUrl?.startsWith("http")
    ? post.videoUrl
    : post.videoUrl ? `${protocol}://${host}${post.videoUrl}` : undefined;

  const absoluteMediaUrls = post.mediaUrls?.map(url => 
    url.startsWith("http") ? url : `${protocol}://${host}${url}`
  );

  const result = await publishToInstagram(
    absoluteImageUrl,
    post.caption,
    post.hashtags,
    config.instagramAccountId,
    config.metaAccessToken,
    post.mediaType as "image" | "reels" | "carousel",
    absoluteVideoUrl,
    absoluteMediaUrls || undefined
  );

  const [updated] = await db
    .update(postsTable)
    .set({
      status: "posted",
      postedAt: new Date(),
      instagramPostId: result.instagramPostId,
      updatedAt: new Date(),
    })
    .where(eq(postsTable.id, id) as any)
    .returning();

  res.json(serializePost(updated));
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

  const timesToday = times.map(([h, m]) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }).sort((a, b) => a.getTime() - b.getTime());

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
    scheduledFor: post.scheduledFor?.toISOString(),
    postedAt: post.postedAt?.toISOString() ?? null,
    instagramPostId: post.instagramPostId ?? null,
    createdAt: post.createdAt?.toISOString(),
    updatedAt: post.updatedAt?.toISOString(),
  };
}

export default router;
