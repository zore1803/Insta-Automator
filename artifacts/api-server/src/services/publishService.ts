import { db, postsTable, configTable, eq, and, sql } from "@workspace/db";
import { publishToInstagram } from "./instagramService.js";
import { logger } from "../lib/logger.js";

export interface PublishResult {
  instagramPostId: string;
}

export type PublishErrorCode = "NOT_FOUND" | "NOT_APPROVED" | "NO_CREDENTIALS" | "ALREADY_CLAIMED";

export class PublishError extends Error {
  constructor(
    message: string,
    public readonly postId: number,
    public readonly code: PublishErrorCode,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

const CLAIM_SENTINEL = "__publishing__";

function toAbsoluteUrl(url: string, baseUrl: string): string {
  return url.startsWith("http") ? url : `${baseUrl}${url}`;
}

export async function publishPost(postId: number, baseUrl?: string): Promise<PublishResult> {
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, postId));

  if (!post) {
    throw new PublishError(`Post ${postId} not found`, postId, "NOT_FOUND");
  }

  if (post.status !== "approved") {
    throw new PublishError(
      `Post ${postId} must be approved before publishing (current status: ${post.status})`,
      postId,
      "NOT_APPROVED",
    );
  }

  const [config] = await db.select().from(configTable).limit(1);

  if (!config?.instagramAccountId || !config?.metaAccessToken) {
    throw new PublishError(
      "Instagram Account ID and Meta Access Token are required. Configure them in Settings.",
      postId,
      "NO_CREDENTIALS",
    );
  }

  // Atomic claim: set instagramPostId to a sentinel value only if the post is
  // still approved AND has not been claimed yet (instagramPostId IS NULL).
  // If 0 rows are returned, another concurrent call already claimed this post.
  const [claimed] = await db
    .update(postsTable)
    .set({ instagramPostId: CLAIM_SENTINEL, updatedAt: new Date() })
    .where(
      and(
        eq(postsTable.id, postId),
        eq(postsTable.status, "approved"),
        sql`${postsTable.instagramPostId} IS NULL`,
      ),
    )
    .returning({ id: postsTable.id });

  if (!claimed) {
    logger.warn(
      { postId },
      "publishPost: post already claimed by another publish call — skipping",
    );
    throw new PublishError(
      `Post ${postId} is already being published or was already posted`,
      postId,
      "ALREADY_CLAIMED",
    );
  }

  // Normalize relative media URLs to absolute so Instagram can fetch them.
  // All current generators produce absolute external URLs, but guard here in
  // case local/relative URLs are ever stored.
  const base = baseUrl ?? "";
  const imageUrl = toAbsoluteUrl(post.imageUrl, base);
  const videoUrl = post.videoUrl ? toAbsoluteUrl(post.videoUrl, base) : undefined;
  const mediaUrls = post.mediaUrls?.map((u) => toAbsoluteUrl(u, base));

  try {
    const result = await publishToInstagram(
      imageUrl,
      post.caption,
      post.hashtags,
      config.instagramAccountId,
      config.metaAccessToken,
      (post.mediaType as "image" | "reels" | "carousel") || "image",
      videoUrl,
      mediaUrls || undefined,
    );

    await db
      .update(postsTable)
      .set({
        status: "posted",
        postedAt: new Date(),
        instagramPostId: result.instagramPostId,
        publishError: null,
        updatedAt: new Date(),
      })
      .where(eq(postsTable.id, postId));

    logger.info(
      { postId, instagramPostId: result.instagramPostId },
      "Post published to Instagram",
    );

    return result;
  } catch (err: any) {
    const errorMessage = err?.message || "Unknown error occurred while publishing";

    // Mark post as failed and store the error reason
    await db
      .update(postsTable)
      .set({
        status: "failed",
        instagramPostId: null,
        publishError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(postsTable.id, postId))
      .catch((updateErr) =>
        logger.error({ updateErr, postId }, "publishPost: failed to mark post as failed"),
      );

    logger.error({ err, postId }, "publishPost: failed to publish to Instagram");

    throw err;
  }
}
