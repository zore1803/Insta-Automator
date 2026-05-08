import { logger } from "../lib/logger.js";
import { db, configTable } from "@workspace/db";

// ─── Pexels Photo Search ──────────────────────────────────────────────────────
async function searchPexels(query: string, apiKey: string): Promise<string | null> {
  const orientation = "portrait";
  const page = Math.floor(Math.random() * 3) + 1; // randomize page for variety
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&page=${page}&orientation=${orientation}&size=large`,
    { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { photos?: Array<{ src: { large2x: string; large: string } }> };
  const photos = data.photos || [];
  if (photos.length === 0) return null;
  const pick = photos[Math.floor(Math.random() * photos.length)];
  return pick?.src?.large2x || pick?.src?.large || null;
}

// ─── Unsplash Search ──────────────────────────────────────────────────────────
async function searchUnsplash(query: string, accessKey: string): Promise<string | null> {
  const page = Math.floor(Math.random() * 3) + 1;
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=15&page=${page}&orientation=portrait`,
    { headers: { Authorization: `Client-ID ${accessKey}` }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: Array<{ urls: { regular: string; full: string } }> };
  const results = data.results || [];
  if (results.length === 0) return null;
  const pick = results[Math.floor(Math.random() * results.length)];
  return pick?.urls?.full || pick?.urls?.regular || null;
}

// ─── Serper Image Search ──────────────────────────────────────────────────────
async function searchSerper(query: string, apiKey: string): Promise<string | null> {
  const res = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: `${query} high resolution photography -ai -illustration`, num: 10 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { images?: Array<{ imageUrl: string; width?: number; height?: number }> };
  const imgs = (data.images || []).filter(
    (i) => i.imageUrl && !i.imageUrl.includes("data:") && (i.height ?? 0) >= (i.width ?? 0),
  );
  const pool = imgs.length > 0 ? imgs : data.images || [];
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]?.imageUrl || null;
}

// ─── Diverse Flux AI Generation ───────────────────────────────────────────────
// Different artistic styles to prevent repetitive AI images
const FLUX_STYLE_MODIFIERS = [
  "award-winning photography, 8K ultra HD, cinematic lighting, golden hour, shallow depth of field",
  "editorial fashion photography, high contrast, dramatic shadows, professional studio lighting",
  "documentary street photography, candid moment, natural light, authentic emotion",
  "luxury lifestyle photography, aspirational, warm tones, soft bokeh, premium feel",
  "dark moody photography, neon accents, urban nighttime, dramatic atmosphere",
  "bright minimalist photography, clean white space, natural daylight, modern aesthetic",
  "vibrant travel photography, rich saturated colors, adventure feel, cinematic wide angle",
  "intimate portrait photography, soft diffused light, emotional connection, film grain",
  "high-energy sports photography, motion blur, dynamic composition, powerful stance",
  "architectural photography, geometric patterns, bold lines, contemporary design",
  "nature photography, lush green, sunbeams, serene morning mist, peaceful",
  "business editorial photography, confident subject, modern office, power pose",
];

const FLUX_COLOR_PALETTES = [
  "warm golden tones",
  "cool blue steel palette",
  "vibrant tropical colors",
  "muted earth tones",
  "high contrast black and white with one accent color",
  "pastel sunset gradient",
  "deep emerald and gold luxury palette",
  "crisp white and navy editorial",
];

function buildFluxUrl(prompt: string, width = 1080, height = 1350): string {
  const now = new Date();
  // Use current timestamp for truly unique seeds every generation
  const uniqueSeed = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 99999);

  const styleIdx = uniqueSeed % FLUX_STYLE_MODIFIERS.length;
  const colorIdx = (uniqueSeed + 3) % FLUX_COLOR_PALETTES.length;
  const style = FLUX_STYLE_MODIFIERS[styleIdx];
  const palette = FLUX_COLOR_PALETTES[colorIdx];

  const enhanced = `${prompt}, ${style}, ${palette}, Instagram-worthy composition, no watermarks, no text overlays, no logos`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced)}?model=flux&width=${width}&height=${height}&nologo=true&seed=${uniqueSeed}&enhance=true&nologo=true`;
}

// ─── DALL-E 3 Generation ──────────────────────────────────────────────────────
async function generateDallE(prompt: string, apiKey: string): Promise<string | null> {
  try {
    const styleModifiers = FLUX_STYLE_MODIFIERS[Math.floor(Math.random() * FLUX_STYLE_MODIFIERS.length)];
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `${prompt}. ${styleModifiers}. Photorealistic, cinematic quality, Instagram-worthy, no text, no watermarks, no logos.`,
        n: 1,
        size: "1024x1024",
        quality: "hd",
        style: Math.random() > 0.5 ? "vivid" : "natural",
      }),
      signal: AbortSignal.timeout(30000),
    });
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
    // Diversify the search query to get different images each time
    const randomQualifiers = ["candid", "portrait", "lifestyle", "editorial", "authentic"][
      Math.floor(Math.random() * 5)
    ];
    let finalQuery = searchQuery || prompt;
    if (captionSubject) finalQuery = `${captionSubject} ${randomQualifiers} ${finalQuery}`;
    logger.info({ finalQuery }, "Searching for real photo");

    // 1. Pexels
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
        const startIndex = Math.floor(Math.random() * 5) * 2 + 1;
        const res = await fetch(
          `https://www.googleapis.com/customsearch/v1?key=${gKey}&cx=${gCx}&q=${encodeURIComponent(finalQuery + " portrait photography")}&searchType=image&num=10&imgSize=large&start=${startIndex}`,
        );
        const data = (await res.json()) as { items?: Array<{ link: string }> };
        const items = data.items || [];
        if (items.length > 0) {
          const url = items[Math.floor(Math.random() * items.length)]?.link;
          if (url) { logger.info("Image: Google CSE"); return url; }
        }
      } catch {}
    }

    logger.warn("All search providers failed, falling back to AI image");
  }

  // ── AI Image Generation ────────────────────────────────────────────────────
  // 1. DALL-E 3 (if key available)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const url = await generateDallE(prompt, openaiKey);
    if (url) { logger.info("Image: DALL-E 3"); return url; }
  }

  // 2. Pollinations Flux (free, with unique seed per call)
  const fluxUrl = buildFluxUrl(prompt);
  logger.info({ seed: fluxUrl.match(/seed=(\d+)/)?.[1] }, "Image: Pollinations Flux");
  return fluxUrl;
}
