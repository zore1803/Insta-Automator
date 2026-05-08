import { logger } from "../lib/logger.js";

export interface InstagramPostResult {
  instagramPostId: string;
}

export async function publishToInstagram(
  imageUrl: string,
  caption: string,
  hashtags: string,
  instagramAccountId: string,
  metaAccessToken: string,
  mediaType: "image" | "reels" | "carousel" = "image",
  videoUrl?: string,
  mediaUrls?: string[],
): Promise<InstagramPostResult> {
  if (!instagramAccountId || !metaAccessToken) {
    throw new Error("Instagram Account ID and Meta Access Token are required. Configure them in Settings.");
  }

  const fullCaption = `${caption}\n\n${hashtags}`;
  let containerId: string;

  if (mediaType === "carousel") {
    if (!mediaUrls || mediaUrls.length < 2) {
      throw new Error("Carousel requires at least 2 media items.");
    }

    const childrenIds: string[] = [];
    for (const url of mediaUrls) {
      const itemRes = await fetch(`https://graph.facebook.com/v21.0/${instagramAccountId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: metaAccessToken }),
      });
      if (!itemRes.ok) throw new Error(`Failed to create carousel item: ${await itemRes.text()}`);
      const itemData = (await itemRes.json()) as { id: string };
      childrenIds.push(itemData.id);
    }

    const carouselRes = await fetch(`https://graph.facebook.com/v21.0/${instagramAccountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "CAROUSEL",
        caption: fullCaption,
        children: childrenIds,
        access_token: metaAccessToken,
      }),
    });
    if (!carouselRes.ok) throw new Error(`Failed to create carousel: ${await carouselRes.text()}`);
    const carouselData = (await carouselRes.json()) as { id: string };
    containerId = carouselData.id;
  } else {
    const body: Record<string, string> = { caption: fullCaption, access_token: metaAccessToken };

    if (mediaType === "reels" && videoUrl) {
      body["media_type"] = "REELS";
      body["video_url"] = videoUrl;
    } else {
      body["image_url"] = imageUrl;
    }

    const mediaRes = await fetch(`https://graph.facebook.com/v21.0/${instagramAccountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!mediaRes.ok) throw new Error(`Failed to create media container: ${await mediaRes.text()}`);
    const mediaData = (await mediaRes.json()) as { id: string };
    containerId = mediaData.id;
  }

  // Publish the container
  const publishRes = await fetch(`https://graph.facebook.com/v21.0/${instagramAccountId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: metaAccessToken }),
  });

  if (!publishRes.ok) throw new Error(`Failed to publish: ${await publishRes.text()}`);
  const publishData = (await publishRes.json()) as { id: string };

  logger.info({ postId: publishData.id }, "Published to Instagram successfully");
  return { instagramPostId: publishData.id };
}
