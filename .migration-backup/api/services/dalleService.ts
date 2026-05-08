import { generateImageBuffer } from "../../lib/integrations-openai-ai-server/src/image/index.ts";
import { supabase } from "../../lib/supabase/src/index.ts";
import { db, configTable } from "../../lib/db/src/index.ts";
import sharp from "sharp";

const BUCKET_NAME = "post-images";

async function searchGoogle(query: string, apiKey: string, cx: string): Promise<string | null> {
  const qualityQuery = `${query} 4k high resolution latest -ai -generated -midjourney -dalle -lexica -civitai -pollinations`;
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(qualityQuery)}&searchType=image&num=10`;
  const res = await fetch(url);
  const data = await res.json();
  const items = data.items || [];
  if (items.length === 0) return null;
  // Pick a RANDOM image from the results to avoid repeats
  const randomIndex = Math.floor(Math.random() * Math.min(items.length, 8));
  return items[randomIndex]?.link || items[0]?.link || null;
}

async function searchSerper(query: string, apiKey: string): Promise<string | null> {
  const url = "https://google.serper.dev/images";
  // Add quality keywords and filter out AI content aggressively
  const qualityQuery = query.toLowerCase().includes("4k") ? query : `${query} high resolution latest -ai -generated -midjourney -dalle -lexica -civitai -pollinations -"ai art"`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ 
      q: qualityQuery, 
      num: 5,
    })
  });
  const data = await res.json();
  
  // Pick the first one that looks like a full image URL (not a data URI or tiny thumbnail)
  const images = data.images || [];
  console.log(`[Serper Search] Found ${images.length} total images`);
  
  // Filter for decent quality images
  const goodImages = images.filter((img: any) => 
    img.imageUrl && 
    !img.imageUrl.includes("data:image") && 
    (img.width > 400 || img.height > 400)
  );
  
  // Pick a RANDOM image from the good ones to avoid repeats
  const pool = goodImages.length > 0 ? goodImages : images;
  if (pool.length === 0) {
    console.warn(`[Serper Search] No suitable images found for query: ${qualityQuery}`);
    return null;
  }
  const randomIndex = Math.floor(Math.random() * Math.min(pool.length, 8));
  const selectedUrl = pool[randomIndex]?.imageUrl || pool[0]?.imageUrl;
  return selectedUrl;
}

/**
 * Manually improves image quality using sharp
 */
async function improveImageQuality(inputBuffer: Buffer): Promise<Buffer> {
  try {
    console.log(`[Image Enhancement] Processing buffer of size: ${inputBuffer.length} bytes`);
    // Create an SVG watermark
    const watermark = Buffer.from(`
      <svg width="1080" height="1350">
        <style>
          .brand { fill: rgba(255, 255, 255, 0.4); font-size: 32px; font-family: sans-serif; font-weight: bold; }
        </style>
        <text x="1060" y="1330" text-anchor="end" class="brand">loqit.ai</text>
      </svg>
    `);

    const enhanced = await sharp(inputBuffer)
      .resize({
        width: 1080,
        height: 1350,
        fit: "cover",
        position: "center"
      })
      .modulate({
        brightness: 1.05,
        saturation: 1.1,
      })
      .sharpen({
        sigma: 1.5,
        m1: 0.5,
        m2: 20
      })
      .composite([{ input: watermark, blend: 'over' }])
      .jpeg({ quality: 90 })
      .toBuffer();
    console.log(`[Image Enhancement] Success. Enhanced size: ${enhanced.length} bytes`);
    return enhanced;
  } catch (err) {
    console.error("[Image Enhancement] CRITICAL ERROR:", err);
    return inputBuffer;
  }
}

export async function ensureBucket() {
  if (!supabase) return;

  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET_NAME);

  if (!exists) {
    console.log(`Creating Supabase bucket: ${BUCKET_NAME}`);
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 5242880, // 5MB
    });
    if (error) {
      console.error("Error creating bucket:", error.message);
    }
  }
}

export async function generatePostImage(
  prompt: string, 
  searchQuery: string, 
  imageSourceOverride?: string,
  captionSubject?: string
): Promise<string> {
  if (!supabase) {
    throw new Error("Supabase client not initialized. Check your credentials in .env");
  }

  await ensureBucket();

  const [config] = await db.select().from(configTable).limit(1);
  const useSearch = (imageSourceOverride || config?.imageSource) === "search";

  let buffer: Buffer;

  if (useSearch) {
    // Build a precise query that aligns with the caption subject
    let finalQuery = searchQuery || prompt;
    if (captionSubject && !finalQuery.toLowerCase().includes(captionSubject.toLowerCase())) {
      finalQuery = `${captionSubject} ${finalQuery}`;
    }
    console.log(`[Image Search] Searching for real image: ${finalQuery} (subject: ${captionSubject || "unknown"})`);
    
    const googleKey = process.env.GOOGLE_SEARCH_API_KEY;
    const googleCx = process.env.GOOGLE_SEARCH_ENGINE_ID;
    const serperKey = process.env.SERPER_API_KEY;

    let imageUrl: string | null = null;

    // 1. Try Serper.dev (Generally more reliable for images)
    if (serperKey) {
      try {
        console.log(`[Serper Search] Attempting Serper...`);
        imageUrl = await searchSerper(finalQuery, serperKey);
      } catch (err) {
        console.warn("[Serper Search] Failed:", err);
      }
    }

    // 2. Try Google Custom Search as fallback
    if (!imageUrl && googleKey && googleCx) {
      try {
        console.log(`[Google Search] Attempting Google Custom Search...`);
        imageUrl = await searchGoogle(finalQuery, googleKey, googleCx);
      } catch (err) {
        console.warn("[Google Search] Failed:", err);
      }
    }

    // 3. Last Resort: Retry with niche if query was too specific
    if (!imageUrl && config?.niche) {
      console.log(`[Image Search] Retrying with niche name: ${config.niche}`);
      if (serperKey) {
        imageUrl = await searchSerper(`${config.niche} latest photo`, serperKey).catch(() => null);
      }
      if (!imageUrl && googleKey && googleCx) {
        imageUrl = await searchGoogle(`${config.niche} latest photo`, googleKey, googleCx).catch(() => null);
      }
    }

    if (!imageUrl) {
      throw new Error(`Search failed: No images found on Serper or Google for "${finalQuery}". Please check your API keys or try a different niche.`);
    }

    console.log(`[Image Search] Fetching image bytes from: ${imageUrl}`);
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image from URL: ${imageUrl}. Status: ${imgRes.status}`);
    const arrayBuffer = await imgRes.arrayBuffer();
    console.log(`[Image Search] Received ${arrayBuffer.byteLength} bytes`);
    
    // Manual Enhancement
    buffer = await improveImageQuality(Buffer.from(arrayBuffer));
  } else {
    console.log(`[DALL-E 3] Generating image for: ${prompt}`);
    try {
      // Using OpenAI DALL-E 3 for premium quality
      buffer = await generateImageBuffer(prompt, "1024x1024");
    } catch (err) {
      console.warn("[ImageGen] DALL-E 3 failed, falling back to Pollinations (Flux Model - Free):", err);
      // Fallback to Pollinations using the high-quality FLUX model
      const encodedPrompt = encodeURIComponent(prompt);
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1000000)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Image fallback also failed");
      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }
  }
  
  const filename = `post-${Date.now()}.jpg`;

  console.log(`Uploading ${filename} to Supabase Storage...`);
  
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filename, buffer, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false
    });

  if (error) {
    throw new Error(`Supabase Storage upload error: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filename);

  console.log(`Successfully uploaded to Supabase: ${publicUrl}`);
  
  return publicUrl;
}
