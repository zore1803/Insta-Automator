import { logger } from "../lib/logger.js";
import { db, configTable } from "@workspace/db";

// ─── Serper News Image Search (primary for real photos) ──────────────────────
async function searchSerperNews(query: string, apiKey: string): Promise<string | null> {
  // Try news images first (most relevant for current events)
  const res = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      q: query,
      gl: "in",
      num: 10,
      tbs: "qdr:m", // past month
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    images?: Array<{ imageUrl: string; title?: string; width?: number; height?: number }>;
  };
  const imgs = (data.images || []).filter(
    (i) => i.imageUrl && !i.imageUrl.includes("data:") && !i.imageUrl.includes(".svg"),
  );
  if (imgs.length === 0) return null;
  // Pick randomly from top 5 for variety
  return imgs[Math.floor(Math.random() * Math.min(imgs.length, 5))]?.imageUrl || null;
}

// ─── Serper Broad Image Search ────────────────────────────────────────────────
async function searchSerper(query: string, apiKey: string): Promise<string | null> {
  const res = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "in", num: 10 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    images?: Array<{ imageUrl: string; width?: number; height?: number }>;
  };
  const imgs = (data.images || []).filter(
    (i) => i.imageUrl && !i.imageUrl.includes("data:") && !i.imageUrl.includes(".svg"),
  );
  if (imgs.length === 0) return null;
  return imgs[Math.floor(Math.random() * Math.min(imgs.length, 5))]?.imageUrl || null;
}

// ─── Pexels Photo Search ──────────────────────────────────────────────────────
async function searchPexels(query: string, apiKey: string): Promise<string | null> {
  const page = Math.floor(Math.random() * 3) + 1;
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&page=${page}&orientation=portrait&size=large`,
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

// ─── Google Custom Search ─────────────────────────────────────────────────────
async function searchGoogle(query: string, apiKey: string, cx: string): Promise<string | null> {
  const startIndex = Math.floor(Math.random() * 5) * 2 + 1;
  const res = await fetch(
    `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query + " news photo India")}&searchType=image&num=10&imgSize=large&start=${startIndex}&gl=in`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: Array<{ link: string }> };
  const items = data.items || [];
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)]?.link || null;
}

// ─── Diverse Flux AI Generation ───────────────────────────────────────────────
const FLUX_STYLES = [
  "award-winning photojournalism, documentary photography, authentic, real people",
  "editorial news photography, dramatic lighting, powerful composition",
  "cinematic documentary style, golden hour, deep colors, storytelling",
  "street photography, candid moment, natural light, unposed",
  "portrait photography, emotional, human connection, shallow depth of field",
  "aerial photography, bird's eye view, dramatic scale, landscape",
  "news photography style, real moment, crowd, authentic scene",
  "reportage photography, authentic, in-the-moment capture",
];

function buildFluxUrl(prompt: string, width = 1080, height = 1350): string {
  const uniqueSeed = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 99999);
  const style = FLUX_STYLES[uniqueSeed % FLUX_STYLES.length];
  const enhanced = `${prompt}, ${style}, no watermarks, no text overlays, no logos, photorealistic`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced)}?model=flux&width=${width}&height=${height}&nologo=true&seed=${uniqueSeed}&enhance=true`;
}

// ─── DALL-E 3 ──────────────────────────────────────────────────────────────
async function generateDallE(prompt: string, apiKey: string): Promise<string | null> {
  try {
    const style = FLUX_STYLES[Math.floor(Math.random() * FLUX_STYLES.length)];
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `${prompt}. ${style}. Photorealistic, cinematic, no text, no watermarks.`,
        n: 1,
        size: "1024x1024",
        quality: "hd",
        style: Math.random() > 0.5 ? "vivid" : "natural",
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429 || res.status === 402) return null;
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
  // Use override first, then config, default to "ai"
  const effectiveSource = imageSourceOverride || config?.imageSource || "ai";
  const useSearch = effectiveSource === "search";

  if (useSearch) {
    // Build a specific, news-relevant search query
    const baseQuery = captionSubject || searchQuery || prompt;

    // Try multiple search query variants for best results
    const searchVariants = [
      `${baseQuery} India 2025 real photo`,
      `${baseQuery} news photograph`,
      baseQuery,
      searchQuery || prompt,
    ];

    logger.info({ baseQuery, effectiveSource }, "Searching for real news photo");

    const serperKey = process.env.SERPER_API_KEY;

    // 1. Serper news image search (best for current events)
    if (serperKey) {
      for (const q of searchVariants.slice(0, 2)) {
        const url = await searchSerperNews(q, serperKey).catch(() => null);
        if (url) { logger.info({ source: "Serper News", query: q }, "Image found"); return url; }
      }
      // 2. Serper broad search
      for (const q of searchVariants) {
        const url = await searchSerper(q, serperKey).catch(() => null);
        if (url) { logger.info({ source: "Serper", query: q }, "Image found"); return url; }
      }
    }

    // 3. Google Custom Search
    const gKey = process.env.GOOGLE_SEARCH_API_KEY;
    const gCx = process.env.GOOGLE_SEARCH_ENGINE_ID;
    if (gKey && gCx) {
      for (const q of searchVariants) {
        const url = await searchGoogle(q, gKey, gCx).catch(() => null);
        if (url) { logger.info({ source: "Google CSE", query: q }, "Image found"); return url; }
      }
    }

    // 4. Pexels (good for general topics)
    const pexelsKey = process.env.PEXELS_API_KEY;
    if (pexelsKey) {
      for (const q of [baseQuery, searchQuery]) {
        if (!q) continue;
        const url = await searchPexels(q, pexelsKey).catch(() => null);
        if (url) { logger.info({ source: "Pexels", query: q }, "Image found"); return url; }
      }
    }

    // 5. Unsplash
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    if (unsplashKey) {
      const url = await searchUnsplash(baseQuery, unsplashKey).catch(() => null);
      if (url) { logger.info({ source: "Unsplash" }, "Image found"); return url; }
    }

    // 6. If ALL real photo searches fail — log warning and fall through to AI
    logger.warn({ baseQuery }, "All real photo searches failed — generating AI image as fallback");
  }

  // ── AI Image Generation ────────────────────────────────────────────────────
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const url = await generateDallE(prompt, openaiKey);
    if (url) { logger.info("Image: DALL-E 3"); return url; }
  }

  // Pollinations Flux (free, unique seed every call)
  const fluxUrl = buildFluxUrl(prompt);
  logger.info({ seed: fluxUrl.match(/seed=(\d+)/)?.[1] }, "Image: Pollinations Flux");
  return fluxUrl;
}
