import { logger } from "../lib/logger.js";
import { db, configTable } from "@workspace/db";
import { generatePostImage } from "./imageService.js";

// ─── Trending Royalty-Free Audio Tracks ───────────────────────────────────────
// High-energy tracks that match luxury/motivation content
const VIRAL_AUDIO_TRACKS = [
  { name: "Inspiring Corporate", url: "https://cdn.pixabay.com/audio/2024/02/15/audio_fec24f2f00.mp3" },
  { name: "Motivational Energy", url: "https://cdn.pixabay.com/audio/2023/10/25/audio_9ec1e27a6d.mp3" },
  { name: "Luxury Ambient", url: "https://cdn.pixabay.com/audio/2024/01/08/audio_b1e9f5abc1.mp3" },
  { name: "Success Anthem", url: "https://cdn.pixabay.com/audio/2023/09/05/audio_8ddcaf6e1d.mp3" },
  { name: "Upbeat Drive", url: "https://cdn.pixabay.com/audio/2024/03/11/audio_2d6a7b5c3f.mp3" },
];

// ─── Pexels Stock Video Search ────────────────────────────────────────────────
interface PexelsVideo {
  id: number;
  duration: number;
  video_files: Array<{ link: string; quality: string; width: number; height: number }>;
  image: string;
}

async function searchPexelsVideo(query: string, apiKey: string): Promise<{ videoUrl: string; coverUrl: string } | null> {
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&min_duration=12&max_duration=25&orientation=portrait`,
      { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { videos?: PexelsVideo[] };
    const videos = (data.videos || []).filter((v) => v.duration >= 12 && v.duration <= 25);
    if (videos.length === 0) return null;

    const pick = videos[Math.floor(Math.random() * Math.min(videos.length, 5))];
    // Prefer HD portrait video
    const file = pick.video_files
      .filter((f) => f.height > f.width) // portrait
      .sort((a, b) => b.width - a.width)[0] || pick.video_files[0];

    return file ? { videoUrl: file.link, coverUrl: pick.image } : null;
  } catch (err) {
    logger.warn({ err }, "Pexels video search failed");
    return null;
  }
}

// ─── Pixabay Stock Video Search ───────────────────────────────────────────────
async function searchPixabayVideo(query: string, apiKey: string): Promise<{ videoUrl: string; coverUrl: string } | null> {
  try {
    const res = await fetch(
      `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&min_duration=12&max_duration=25&per_page=10`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      hits?: Array<{
        videos: { medium: { url: string; width: number; height: number } };
        userImageURL: string;
        duration: number;
      }>;
    };
    const hits = (data.hits || []).filter((h) => h.duration >= 12 && h.duration <= 25);
    if (hits.length === 0) return null;
    const pick = hits[Math.floor(Math.random() * Math.min(hits.length, 5))];
    return { videoUrl: pick.videos.medium.url, coverUrl: pick.userImageURL };
  } catch (err) {
    logger.warn({ err }, "Pixabay video search failed");
    return null;
  }
}

// ─── Curated Fallback Videos (royalty-free, always work) ─────────────────────
const CURATED_VIDEOS = [
  // Luxury/wealth themed royalty-free videos from Pixabay
  { videoUrl: "https://cdn.pixabay.com/video/2022/10/21/135540-762984163_large.mp4", coverUrl: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?w=640" },
  { videoUrl: "https://cdn.pixabay.com/video/2021/11/23/99975-648982842_large.mp4", coverUrl: "https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?w=640" },
  { videoUrl: "https://cdn.pixabay.com/video/2023/07/17/171490-845698652_large.mp4", coverUrl: "https://images.pexels.com/photos/3760069/pexels-photo-3760069.jpeg?w=640" },
  { videoUrl: "https://cdn.pixabay.com/video/2024/01/22/197680-907614855_large.mp4", coverUrl: "https://images.pexels.com/photos/1181290/pexels-photo-1181290.jpeg?w=640" },
  { videoUrl: "https://cdn.pixabay.com/video/2022/05/12/117173-709459127_large.mp4", coverUrl: "https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?w=640" },
];

// ─── Build niche-relevant video search queries ────────────────────────────────
function buildVideoQuery(niche: string, imagePrompt: string, subject?: string): string {
  const source = `${subject || ""} ${imagePrompt} ${niche}`
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stopWords = new Set([
    "real", "photo", "video", "style", "authentic", "vertical", "cinematic", "instagram",
    "reel", "prompt", "people", "scene", "image", "with", "and", "the", "for", "from",
  ]);
  const keywords = source
    .split(" ")
    .filter((word) => word.length > 2 && !stopWords.has(word.toLowerCase()))
    .slice(0, 8);

  if (keywords.length >= 3) return `${keywords.join(" ")} vertical documentary`;
  return `${niche} ${subject || imagePrompt} vertical reel footage`.slice(0, 120);
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateReelVideo(
  prompt: string,
  niche: string,
  imageSourceOverride?: string,
  subject?: string,
): Promise<{ imageUrl: string; videoUrl: string; audioTrack?: string }> {
  const searchQuery = buildVideoQuery(niche, prompt, subject);
  logger.info({ searchQuery }, "Searching for reel video");

  // Pick a random viral audio track
  const audioTrack = VIRAL_AUDIO_TRACKS[Math.floor(Math.random() * VIRAL_AUDIO_TRACKS.length)];
  logger.info({ audioTrack: audioTrack.name }, "Selected audio track");

  // 1. Try Pexels Videos (best quality)
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey) {
    const result = await searchPexelsVideo(searchQuery, pexelsKey);
    if (result) {
      logger.info("Reel: Pexels stock video");
      return { videoUrl: result.videoUrl, imageUrl: result.coverUrl, audioTrack: audioTrack.url };
    }
  }

  // 2. Try Pixabay Videos
  const pixabayKey = process.env.PIXABAY_API_KEY;
  if (pixabayKey) {
    const result = await searchPixabayVideo(searchQuery, pixabayKey);
    if (result) {
      logger.info("Reel: Pixabay stock video");
      return { videoUrl: result.videoUrl, imageUrl: result.coverUrl, audioTrack: audioTrack.url };
    }
  }

  // 3. Curated fallback videos (always reliable)
  const fallback = CURATED_VIDEOS[Math.floor(Math.random() * CURATED_VIDEOS.length)];
  logger.info("Reel: curated fallback video");

  // Get a matching AI cover image
  const [config] = await db.select().from(configTable).limit(1);
  const coverImage = await generatePostImage(
    prompt,
    searchQuery,
    imageSourceOverride || config?.imageSource,
    undefined,
  ).catch(() => fallback.coverUrl);

  return { videoUrl: fallback.videoUrl, imageUrl: coverImage, audioTrack: audioTrack.url };
}
