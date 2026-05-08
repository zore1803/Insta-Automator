import { Router } from "express";
import { db, configTable, postsTable, eq, desc, and, gte } from "@workspace/db";

const router = Router();

// ── Instagram Insights for a published post ───────────────────────────────────
router.get("/analytics/post/:igPostId", async (req, res) => {
  const { igPostId } = req.params;
  const [config] = await db.select().from(configTable).limit(1);

  if (!config?.metaAccessToken || !config?.instagramAccountId) {
    res.status(400).json({ error: "Instagram not connected." });
    return;
  }

  try {
    const metrics = "impressions,reach,likes_count,comments_count,saved,shares";
    const url = `https://graph.facebook.com/v21.0/${igPostId}/insights?metric=${metrics}&access_token=${config.metaAccessToken}`;
    const igRes = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!igRes.ok) {
      const err = await igRes.text();
      res.status(400).json({ error: `Instagram API error: ${err}` });
      return;
    }

    const data = (await igRes.json()) as { data?: Array<{ name: string; values: Array<{ value: number }> }> };

    const insights: Record<string, number> = {};
    for (const metric of data.data || []) {
      insights[metric.name] = metric.values?.[0]?.value ?? 0;
    }

    res.json({ postId: igPostId, insights });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Account-level stats from Instagram ───────────────────────────────────────
router.get("/analytics/account", async (req, res) => {
  const [config] = await db.select().from(configTable).limit(1);

  if (!config?.metaAccessToken || !config?.instagramAccountId) {
    res.status(400).json({ error: "Instagram not connected." });
    return;
  }

  try {
    const fieldsUrl = `https://graph.facebook.com/v21.0/${config.instagramAccountId}?fields=followers_count,media_count,profile_picture_url,username,name&access_token=${config.metaAccessToken}`;
    const igRes = await fetch(fieldsUrl, { signal: AbortSignal.timeout(8000) });

    if (!igRes.ok) {
      const errText = await igRes.text();
      res.status(400).json({ error: `Instagram API: ${errText}` });
      return;
    }

    const profile = (await igRes.json()) as {
      followers_count?: number;
      media_count?: number;
      profile_picture_url?: string;
      username?: string;
      name?: string;
    };

    // Get recent media performance
    const mediaUrl = `https://graph.facebook.com/v21.0/${config.instagramAccountId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,media_url,thumbnail_url&limit=12&access_token=${config.metaAccessToken}`;
    const mediaRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(8000) });
    const mediaData = mediaRes.ok ? ((await mediaRes.json()) as { data?: any[] }) : { data: [] };

    res.json({
      profile,
      recentMedia: (mediaData.data || []).map((m: any) => ({
        id: m.id,
        mediaType: m.media_type,
        timestamp: m.timestamp,
        likeCount: m.like_count ?? 0,
        commentsCount: m.comments_count ?? 0,
        caption: m.caption?.slice(0, 100),
        thumbnailUrl: m.thumbnail_url || m.media_url,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Bulk fetch insights for all our posted posts ──────────────────────────────
router.get("/analytics/posts-insights", async (req, res) => {
  const [config] = await db.select().from(configTable).limit(1);

  if (!config?.metaAccessToken) {
    res.json({ posts: [] });
    return;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const postedPosts = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.status, "posted"), gte(postsTable.postedAt!, thirtyDaysAgo)))
    .orderBy(desc(postsTable.postedAt))
    .limit(20);

  const results = [];
  for (const post of postedPosts) {
    if (!post.instagramPostId || post.instagramPostId === "__publishing__") continue;
    try {
      const url = `https://graph.facebook.com/v21.0/${post.instagramPostId}?fields=like_count,comments_count,media_url,timestamp&access_token=${config.metaAccessToken}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const d = (await r.json()) as any;
        results.push({
          postId: post.id,
          instagramPostId: post.instagramPostId,
          caption: post.caption?.slice(0, 80),
          mediaType: post.mediaType,
          postedAt: post.postedAt,
          likeCount: d.like_count ?? 0,
          commentsCount: d.comments_count ?? 0,
          thumbnailUrl: d.media_url ?? post.imageUrl,
        });
      }
    } catch {}
  }

  res.json({ posts: results });
});

// ── Get trending topics ───────────────────────────────────────────────────────
router.get("/analytics/trending", async (_req, res) => {
  try {
    const { getTrendingTopics } = await import("../services/trendingService.js");
    const topics = await getTrendingTopics(6);
    res.json({ topics });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
