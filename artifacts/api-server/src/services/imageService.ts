import { logger } from "../lib/logger.js";
import { db, configTable } from "@workspace/db";

// ─── Pexels Photo Search ──────────────────────────────────────────────────────
async function searchPexels(query: string, apiKey: string): Promise<string | null> {
  const orientation = "portrait"; // 9:16 / 4:5 for Instagram
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=${orientation}&size=large`,
    { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { photos?: Array<{ src: { large2x: string; large: string } }> };
  const photos = data.photos || [];
  if (photos.length === 0) return null;
  const pick = photos[Math.floor(Math.random() * Math.min(photos.length, 5))];
  return pick?.src?.large2x || pick?.src?.large || null;
}

// ─── Unsplash Search ──────────────────────────────────────────────────────────
async function searchUnsplash(query: string, accessKey: string): Promise<string | null> {
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=portrait`,
    { headers: { Authorization: `Client-ID ${accessKey}` }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: Array<{ urls: { regular: string; full: string } }> };
  const results = data.results || [];
  if (results.length === 0) return null;
  const pick = results[Math.floor(Math.random() * Math.min(results.length, 5))];
  return pick?.urls?.full || pick?.urls?.regular || null;
}

// ─── Serper Image Search ──────────────────────────────────────────────────────
async function searchSerper(query: string, apiKey: string): Promise<string | null> {
  const res = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: `${query} high resolution photography -ai -illustration`, num: 8 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { images?: Array<{ imageUrl: string; width?: number; height?: number }> };
  const imgs = (data.images || []).filter(
    (i) => i.imageUrl && !i.imageUrl.includes("data:") && (i.height ?? 0) >= (i.width ?? 0), // portrait preferred
  );
  const pool = imgs.length > 0 ? imgs : data.images || [];
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * Math.min(pool.length, 5))]?.imageUrl || null;
}

// ─── Pollinations Flux AI Generation ──────────────────────────────────────────
function buildFluxUrl(prompt: string, width = 1080, height = 1350): string {
  // Enhance prompt for maximum visual quality
  const enhanced = `${prompt}, award-winning photography, 8K ultra HD, cinematic lighting, rich colors, shallow depth of field, professional editorial style, Instagram-worthy composition, no watermarks, no text`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced)}?model=flux&width=${width}&height=${height}&nologo=true&seed=${Math.floor(Math.random() * 9999999)}&enhance=true`;
}

// ─── DALL-E 3 Generation ──────────────────────────────────────────────────────
async function generateDallE(prompt: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `${prompt}. Photorealistic, cinematic quality, Instagram-worthy, no text, no watermarks.`,
        n: 1,
        size: "1024x1024",
        quality: "hd",
        style: "vivid",
      }),
      signal: AbortSignal.timeout(30000),
    });
    // 429 = quota / rate-limit, 402 = billing issue — skip silently
    if (res.status === 429 || res.status === 402) {
      logger.warn({ status: res.status }, "DALL-E quota/billing — skipping to Flux");
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ url: string }> };
    return data.data?.[0]?.url || null;
  } catch {
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generatePostImage(
  prompt: string,
  searchQuery: string,
  imageSourceOverride?: string,
  captionSubject?: string,
): Promise<string> {
  const [config] = await db.select().from(configTable).limit(1);
  const useSearch = (imageSourceOverride || config?.imageSource || "ai") === "search";

  if (useSearch) {
    let finalQuery = searchQuery || prompt;
    if (captionSubject) finalQuery = `${captionSubject} ${finalQuery}`;
    logger.info({ finalQuery }, "Searching for real photo");

    // 1. Pexels (best quality)
    const pexelsKey = process.env.PEXELS_API_KEY;
    if (pexelsKey) {
      const url = await searchPexels(finalQuery, pexelsKey).catch(() => null);
      if (url) { logger.info("Image: Pexels"); return url; }
    }

    // 2. Unsplash
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    if (unsplashKey) {
      const url = await searchUnsplash(finalQuery, unsplashKey).catch(() => null);
      if (url) { logger.info("Image: Unsplash"); return url; }
    }

    // 3. Serper
    const serperKey = process.env.SERPER_API_KEY;
    if (serperKey) {
      const url = await searchSerper(finalQuery, serperKey).catch(() => null);
      if (url) { logger.info("Image: Serper"); return url; }
    }

    // 4. Google Custom Search
    const gKey = process.env.GOOGLE_SEARCH_API_KEY;
    const gCx = process.env.GOOGLE_SEARCH_ENGINE_ID;
    if (gKey && gCx) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/customsearch/v1?key=${gKey}&cx=${gCx}&q=${encodeURIComponent(finalQuery + " portrait photography")}&searchType=image&num=10&imgSize=large`,
        );
        const data = (await res.json()) as { items?: Array<{ link: string }> };
        const items = data.items || [];
        if (items.length > 0) {
          const url = items[Math.floor(Math.random() * Math.min(items.length, 5))]?.link;
          if (url) { logger.info("Image: Google CSE"); return url; }
        }
      } catch {}
    }

    // Fall through to AI if search fails
    logger.warn("All search providers failed, falling back to AI image");
  }

  // ── AI Image Generation ────────────────────────────────────────────────────
  // 1. DALL-E 3 (if key available — best quality)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const url = await generateDallE(prompt, openaiKey);
    if (url) { logger.info("Image: DALL-E 3"); return url; }
  }

  // 2. Pollinations Flux (free, excellent quality)
  const fluxUrl = buildFluxUrl(prompt);
  logger.info("Image: Pollinations Flux");
  return fluxUrl;
}
