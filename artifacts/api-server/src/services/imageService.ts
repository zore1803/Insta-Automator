import { logger } from "../lib/logger.js";
import { db, configTable } from "@workspace/db";

function isUsableImageUrl(url: string): boolean {
  if (!url || url.startsWith("data:") || url.includes(".svg")) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const blockedHosts = [
      "lookaside.instagram.com",
      "lookaside.fbsbx.com",
      "facebook.com",
      "instagram.com",
      "pinterest.com",
    ];
    return !blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return false;
  }
}

async function isReachableImageUrl(url: string): Promise<boolean> {
  if (!isUsableImageUrl(url)) return false;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-4095" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok && res.status !== 206) return false;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/") || contentType.includes("svg")) return false;
    const buffer = await res.arrayBuffer();
    return buffer.byteLength > 512;
  } catch (err) {
    logger.warn({ err, url }, "Image URL validation failed");
    return false;
  }
}

async function verifiedImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  return await isReachableImageUrl(url) ? url : null;
}

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
  const imgs = (data.images || []).filter((i) => isUsableImageUrl(i.imageUrl));
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
  const imgs = (data.images || []).filter((i) => isUsableImageUrl(i.imageUrl));
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
  const items = (data.items || []).filter((item) => isUsableImageUrl(item.link));
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)]?.link || null;
}

// ─── Diverse Flux AI Generation ───────────────────────────────────────────────
async function fetchFreeSearchResults(query: string): Promise<Array<{ title?: string; url?: string; snippet?: string; engine?: string }>> {
  const baseUrl = process.env.FREE_SEARCH_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl) return [];

  const url = new URL(`${baseUrl}/api/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("engine", process.env.FREE_SEARCH_ENGINE || "default");
  url.searchParams.set("safe", "true");
  if (process.env.FREE_SEARCH_USE_PUPPETEER) {
    url.searchParams.set("usePuppeteer", process.env.FREE_SEARCH_USE_PUPPETEER);
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; snippet?: string; engine?: string }> };
  return (data.results || []).filter((item) => item.url);
}

function absoluteUrl(candidate: string, pageUrl: string): string | null {
  try {
    return new URL(candidate, pageUrl).toString();
  } catch {
    return null;
  }
}

function extractPreviewImages(html: string, pageUrl: string): string[] {
  const candidates: string[] = [];
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      const url = absoluteUrl(match[1], pageUrl);
      if (url && isUsableImageUrl(url)) candidates.push(url);
    }
  }

  return [...new Set(candidates)];
}

async function imageFromPagePreview(pageUrl: string): Promise<string | null> {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return null;
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    const html = await res.text();
    for (const candidate of extractPreviewImages(html.slice(0, 250_000), pageUrl)) {
      const verified = await verifiedImage(candidate);
      if (verified) return verified;
    }
    return null;
  } catch {
    return null;
  }
}

async function searchFreeSearchPreviewImage(query: string): Promise<string | null> {
  const results = await fetchFreeSearchResults(query).catch(() => []);
  for (const result of results.slice(0, 6)) {
    if (!result.url) continue;
    const url = await imageFromPagePreview(result.url);
    if (url) {
      logger.info({ source: "free-search", page: result.url, query }, "Image found from page preview");
      return url;
    }
  }
  return null;
}

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
      `${baseQuery} India ${new Date().getFullYear()} real photo`,
      `${baseQuery} news photograph`,
      baseQuery,
      searchQuery || prompt,
    ];

    logger.info({ baseQuery, effectiveSource }, "Searching for real news photo");

    for (const q of searchVariants.slice(0, 3)) {
      const url = await verifiedImage(await searchFreeSearchPreviewImage(q));
      if (url) return url;
    }

    const serperKey = process.env.SERPER_API_KEY;

    // 1. Serper news image search (best for current events)
    if (serperKey) {
      for (const q of searchVariants.slice(0, 2)) {
        const url = await verifiedImage(await searchSerperNews(q, serperKey).catch(() => null));
        if (url) { logger.info({ source: "Serper News", query: q }, "Image found"); return url; }
      }
      // 2. Serper broad search
      for (const q of searchVariants) {
        const url = await verifiedImage(await searchSerper(q, serperKey).catch(() => null));
        if (url) { logger.info({ source: "Serper", query: q }, "Image found"); return url; }
      }
    }

    // 3. Google Custom Search
    const gKey = process.env.GOOGLE_SEARCH_API_KEY;
    const gCx = process.env.GOOGLE_SEARCH_ENGINE_ID;
    if (gKey && gCx) {
      for (const q of searchVariants) {
        const url = await verifiedImage(await searchGoogle(q, gKey, gCx).catch(() => null));
        if (url) { logger.info({ source: "Google CSE", query: q }, "Image found"); return url; }
      }
    }

    // 4. Pexels (good for general topics)
    const pexelsKey = process.env.PEXELS_API_KEY;
    if (pexelsKey) {
      for (const q of [baseQuery, searchQuery]) {
        if (!q) continue;
        const url = await verifiedImage(await searchPexels(q, pexelsKey).catch(() => null));
        if (url) { logger.info({ source: "Pexels", query: q }, "Image found"); return url; }
      }
    }

    // 5. Unsplash
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    if (unsplashKey) {
      const url = await verifiedImage(await searchUnsplash(baseQuery, unsplashKey).catch(() => null));
      if (url) { logger.info({ source: "Unsplash" }, "Image found"); return url; }
    }

    // 6. If ALL real photo searches fail — log warning and fall through to AI
    logger.warn({ baseQuery }, "All real photo searches failed — generating AI image as fallback");
  }

  // ── AI Image Generation ────────────────────────────────────────────────────
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const url = await verifiedImage(await generateDallE(prompt, openaiKey));
    if (url) { logger.info("Image: DALL-E 3"); return url; }
  }

  // Pollinations Flux (free, unique seed every call)
  for (let attempt = 1; attempt <= 3; attempt++) {
    const fluxUrl = buildFluxUrl(prompt);
    if (await isReachableImageUrl(fluxUrl)) {
      logger.info({ seed: fluxUrl.match(/seed=(\d+)/)?.[1], attempt }, "Image: Pollinations Flux");
      return fluxUrl;
    }
  }

  throw new Error("AI image generation returned no usable image. Check OPENAI_API_KEY or image provider availability.");
}
