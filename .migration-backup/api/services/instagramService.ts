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
  mediaUrls?: string[]
): Promise<InstagramPostResult> {
  if (!instagramAccountId || !metaAccessToken) {
    throw new Error(
      "Instagram Account ID and Meta Access Token are required. Configure them in Settings."
    );
  }

  const fullCaption = `${caption}\n\n${hashtags}`;

  let containerId: string;

  if (mediaType === "carousel") {
    if (!mediaUrls || mediaUrls.length < 2) {
      throw new Error("Carousel requires at least 2 media items.");
    }

    logger.info({ count: mediaUrls.length }, "Creating carousel items");
    const childrenIds: string[] = [];

    for (const url of mediaUrls) {
      const itemRes = await fetch(
        `https://graph.facebook.com/v21.0/${instagramAccountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: url,
            is_carousel_item: true,
            access_token: metaAccessToken,
          }),
        }
      );
      if (!itemRes.ok) {
        throw new Error(`Failed to create carousel item: ${await itemRes.text()}`);
      }
      const itemData = await itemRes.json();
      childrenIds.push(itemData.id);
    }

    logger.info({ childrenIds }, "Creating carousel container");
    const carouselRes = await fetch(
      `https://graph.facebook.com/v21.0/${instagramAccountId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          caption: fullCaption,
          children: childrenIds,
          access_token: metaAccessToken,
        }),
      }
    );
    if (!carouselRes.ok) {
      throw new Error(`Failed to create carousel container: ${await carouselRes.text()}`);
    }
    const carouselData = await carouselRes.json();
    containerId = carouselData.id;
  } else {
    logger.info({ imageUrl, videoUrl, mediaType }, "Creating Instagram media container");

    const body: any = {
      caption: fullCaption,
      access_token: metaAccessToken,
    };

    if (mediaType === "reels") {
      if (!videoUrl) {
        logger.warn({ imageUrl }, "Reels requested but videoUrl is missing, falling back to IMAGE");
        body.image_url = `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}cachebuster=${Date.now()}`;
      } else {
        body.media_type = "REELS";
        body.video_url = videoUrl;
      }
    } else {
      body.image_url = `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}cachebuster=${Date.now()}`;
    }

    const containerRes = await fetch(
      `https://graph.facebook.com/v21.0/${instagramAccountId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!containerRes.ok) {
      const errorBody = await containerRes.text();
      throw new Error(
        `Failed to create Instagram media container: ${containerRes.status} - ${errorBody}`
      );
    }

    const containerData = (await containerRes.json()) as { id: string };
    containerId = containerData.id;

    // For Reels, we MUST wait for processing to finish
    if (mediaType === "reels") {
      logger.info({ containerId }, "Waiting for Reels processing...");
      let status = "IN_PROGRESS";
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes max

      while (status !== "FINISHED" && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10s
        const statusRes = await fetch(
          `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${metaAccessToken}`
        );
        const statusData = (await statusRes.json()) as { status_code: string };
        status = statusData.status_code;
        logger.info({ containerId, status, attempt: attempts + 1 }, "Reels processing status");

        if (status === "ERROR") {
          throw new Error("Instagram failed to process the video Reel.");
        }
        attempts++;
      }

      if (status !== "FINISHED") {
        throw new Error("Timed out waiting for Reels processing.");
      }
    }
  }

  logger.info({ containerId }, "Publishing Instagram media container");

  const publishRes = await fetch(
    `https://graph.facebook.com/v21.0/${instagramAccountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: metaAccessToken,
      }),
    }
  );

  if (!publishRes.ok) {
    const errorBody = await publishRes.text();
    throw new Error(
      `Failed to publish Instagram post: ${publishRes.status} - ${errorBody}`
    );
  }
  const publishData = (await publishRes.json()) as { id: string };
  return { instagramPostId: publishData.id };
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;

  const res = await fetch(url);
  const data = (await res.json()) as any;

  if (data.error) {
    throw new Error(`Meta Token Exchange Error: ${data.error.message}`);
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}
