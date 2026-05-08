import { logger } from "../lib/logger.js";
import { getTrendingTopics, getOneTrendingTopic, type TrendingTopic } from "./trendingService.js";

export interface GeneratedContent {
  caption: string;
  hashtags: string;
  imagePrompt: string;
  searchQuery: string;
  captionSubject?: string;
  carouselPrompts?: string[];
  carouselQueries?: string[];
  carouselSlides?: string[];
  trendingTopic?: TrendingTopic;
}

// ── 50 diverse viral hooks — informative and engaging, not framework templates ─
const HOOKS = [
  // Maharashtra/India specific
  "महाराष्ट्र में जो हो रहा है वो सब जानते हैं — पर कोई सच नहीं बोलता:",
  "Mumbai की सड़कों पर जो दिख रहा है वो असल India की picture है।",
  "Bihar vs Maharashtra — दोनों तरफ की बात सुनो पहले:",
  // English informative hooks
  "The story nobody is telling you about what's happening in India right now:",
  "I fact-checked this viral claim and the truth shocked even me:",
  "This happened 3 days ago and 90% of people still don't know:",
  "Thread: Everything you need to know about this in under 60 seconds —",
  "Here's what Indian media isn't covering about this:",
  "The real numbers behind this controversy (screenshot & share):",
  "One stat that changes how you see this entire situation:",
  "I spent 3 hours researching this so you don't have to:",
  "Stop sharing opinions — here are the actual facts:",
  "This is bigger than you think. Here's why it matters for YOU:",
  "The uncomfortable truth that nobody wants to say out loud:",
  "Breaking it down simply because it's more complex than it looks:",
  "Why this is the most important story in India this week:",
  "Both sides are wrong. Here's what's actually true:",
  "This directly affects your money, your future, your city:",
  "India is changing faster than we realize — here's the proof:",
  "The thing that will define the next 5 years of India is THIS:",
  // Business / wealth informative
  "3 decisions that separated rich from poor in India in the last decade:",
  "The business model that created 10 Indian billionaires in 5 years:",
  "Why Pune is beating Bangalore and nobody is talking about it:",
  "India's middle class is shrinking — here's the data to prove it:",
  "The ₹500 investment habit that built real wealth in India:",
  "What nobody tells you about starting a business in Maharashtra:",
  "This skill earns more than an engineering degree in India right now:",
  "India's GDP is growing but your salary isn't — here's why:",
  "The startup that rejected ₹10 crore funding and made ₹100 crore:",
  "Why 73% of Indian youth want to leave the country (it's not money):",
  // Cultural / social informative
  "This cultural clash is older than you think — the history matters:",
  "Language politics in India — the facts vs the propaganda:",
  "What Indian history books don't teach you about this conflict:",
  "The real reason behind the Maharashtra agitation nobody explains:",
  "How this local issue became a national debate overnight:",
  "The data on migration patterns that explain everything:",
  "Cricket taught India this one business lesson that MBA colleges don't:",
  "What voters in TN need to know before the election (the truth):",
  "IPL business model that prints ₹3,000 crore every season:",
  "The Bollywood story they tried to bury completely:",
  // Engagement hooks
  "I'm going to say something controversial — and I'll explain why:",
  "The question people are scared to ask publicly:",
  "Save this. You'll need it for the next argument:",
  "This needs to be said and nobody else is saying it:",
  "Opinion: We've been looking at this completely backwards.",
  "After reading 50 articles on this, my conclusion surprised me:",
  "This is not political — it's purely factual. Read before judging:",
  "Here's the full picture — not just what fits the agenda:",
  "What if I told you both sides are technically right?",
  "The nuance everyone is missing in this debate:",
];

// ── Image visual styles for variety ──────────────────────────────────────────
const IMAGE_STYLES = [
  "news photography style, candid, real, documentary",
  "editorial photo, high contrast, powerful composition",
  "photojournalism style, authentic, human emotion visible",
  "street photography, candid moment, natural light",
  "aerial view, establishing shot, wide perspective",
  "close-up portrait, emotion, storytelling face",
  "crowd photography, energy, real people",
  "protest/rally photography style, signboards, crowd",
];

function pickHook(seed: number): string {
  return HOOKS[seed % HOOKS.length];
}

function buildPrompt(niche: string, language: string, type: string, trending: TrendingTopic): string {
  const now = new Date();
  const seed = now.getHours() * 100 + now.getMinutes();
  const hook = pickHook(seed);
  const imageStyle = IMAGE_STYLES[seed % IMAGE_STYLES.length];
  const isCarousel = type === "carousel";
  const isReel = type === "reels";

  const dateStr = now.toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const langNote =
    language?.toLowerCase().includes("hindi")
      ? "Write caption primarily in Hindi (Devanagari). Mix some English for hashtags."
      : language?.toLowerCase().includes("marathi")
      ? "Write caption in Marathi (Devanagari). This is Maharashtra audience."
      : language?.toLowerCase().includes("tamil")
      ? "Write caption in Tamil (தமிழ்) with English hashtags."
      : language?.toLowerCase().includes("tanglish")
      ? "Write caption in Tanglish (Tamil + English mix as Chennai youth speak)."
      : "Write caption in English (Indian style, relatable to Indian audience).";

  return `You are a top Indian Instagram journalist and content creator. You create posts about REAL current events with GENUINE information — not motivational fluff.

TODAY: ${dateStr} at ${timeStr}

TRENDING TOPIC FOR THIS POST: "${trending.title}"
BACKGROUND: ${trending.contentAngle}
ACCOUNT NICHE: ${niche}

YOUR JOB: Create an Instagram ${type} post about the trending topic "${trending.title}" that:
1. Opens with this EXACT hook line: "${hook}"
2. Provides REAL, SPECIFIC information about "${trending.title}" — actual context, background, who's involved, why it matters, what happened
3. Includes at least ONE specific data point, date, or fact
4. Connects to how this affects the audience's daily life / money / future
5. Ends with a genuine CTA that encourages discussion ("What do you think? Comment below 👇" or "Agree or disagree? Tell us" etc.)

LANGUAGE: ${langNote}

CAPTION RULES:
- Be INFORMATIVE and SPECIFIC — give actual facts, not just vague statements
- Be CONVERSATIONAL — like a well-informed friend explaining the situation
- NO corporate/brand language — talk like a real person
- Use line breaks for readability
- 150-250 words for single post, 80-120 words per slide for carousel
- Emojis sparingly (max 3-4 total)

HASHTAG STRATEGY (13 max):
- 5 tags specific to "${trending.title}": ${trending.hashtags.join(" ")}
- 3 location tags (India/Maharashtra/Mumbai/Pune or relevant state)
- 3 topic tags (news, controversy, viral, etc.)
- 2 broad reach tags

IMAGE REQUIREMENTS:
- Style: ${imageStyle} (NOT stock photo look — must look real/documentary)
- Subject: real people, real places related to "${trending.title}"
- Format: ${isReel ? "vertical 9:16 cinematic documentary" : "square 1:1 or portrait 4:5"}
- NO watermarks, NO text overlays, NO AI-obvious art style
- MUST look like actual news photo or real captured moment

${isCarousel ? `CAROUSEL (5 slides — MUST have EXACTLY 5 different image prompts):
- Slide 1: Hook — the main topic headline visual
- Slide 2: Background / context visual
- Slide 3: Key fact or data point visual
- Slide 4: Impact on common people visual
- Slide 5: Call to action / your take visual` : ""}

Respond with VALID JSON ONLY — no markdown, no extra text:
{
  "caption": "Full caption with \\n for line breaks",
  "hashtags": "#tag1 #tag2 ...",
  "imagePrompt": "${imageStyle} photo: [VERY specific real scene from '${trending.title}']",
  "searchQuery": "${trending.imageQuery}",
  "captionSubject": "${trending.title}"${isCarousel ? `,
  "carouselPrompts": ["visual 1 for '${trending.title}'", "visual 2", "visual 3", "visual 4", "visual 5"],
  "carouselQueries": ["${trending.imageQuery}", "${trending.searchQuery}", "${trending.imageQuery}", "${trending.searchQuery}", "${trending.imageQuery}"],
  "carouselSlides": ["Slide 1 headline", "Slide 2 fact", "Slide 3 data", "Slide 4 impact", "Comment your opinion 💬"]` : ""}
}`;
}

export async function generateInstagramContent(
  niche: string,
  language: string,
  type: "image" | "reels" | "carousel" = "image",
  forcedTopic?: TrendingTopic,
): Promise<GeneratedContent> {
  const trending = forcedTopic || await getOneTrendingTopic();
  const prompt = buildPrompt(niche, language, type, trending);

  logger.info({ topic: trending.title, type }, "Generating content for trending topic");

  // OpenAI GPT-4o
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are an expert Indian social media content creator. Write genuine, informative content about real events. Respond ONLY with valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.9,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 429 || res.status === 402) {
        logger.warn({ status: res.status }, "OpenAI quota — falling back");
      } else if (res.ok) {
        const data = (await res.json()) as any;
        const parsed = JSON.parse(data.choices[0].message.content) as GeneratedContent;
        parsed.trendingTopic = trending;
        return ensureCarouselSlides(parsed, trending, type);
      }
    } catch (err) {
      logger.warn({ err }, "OpenAI failed — using Pollinations");
    }
  }

  // Pollinations fallback
  try {
    const encoded = encodeURIComponent(prompt);
    const res = await fetch(`https://text.pollinations.ai/${encoded}?model=openai&jsonMode=true`, {
      signal: AbortSignal.timeout(25000),
    });
    const text = await res.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as GeneratedContent;
      if (parsed.caption && parsed.hashtags) {
        parsed.trendingTopic = trending;
        logger.info({ topic: trending.title }, "Content generated via Pollinations");
        return ensureCarouselSlides(parsed, trending, type);
      }
    }
  } catch (err) {
    logger.warn({ err }, "Pollinations failed");
  }

  // Hard fallback
  return buildFallbackContent(trending, type);
}

// Ensure carousel always has at least 2 slides (Instagram minimum)
function ensureCarouselSlides(content: GeneratedContent, trending: TrendingTopic, type: string): GeneratedContent {
  if (type !== "carousel") return content;

  const minSlides = 5;
  const prompts = content.carouselPrompts || [];
  const queries = content.carouselQueries || [];
  const slides = content.carouselSlides || [];

  // Pad to at least minSlides
  const defaultPrompts = [
    `Documentary photo of ${trending.title} — main scene, crowd, real people`,
    `News photography of ${trending.title} — background context, location establishing shot`,
    `Close-up photo related to ${trending.title} — human emotion, affected people`,
    `Wide shot showing impact of ${trending.title} — scale, magnitude`,
    `Quote card style graphic for ${trending.title} — call to action slide`,
  ];

  while (prompts.length < minSlides) {
    prompts.push(defaultPrompts[prompts.length] || defaultPrompts[0]);
  }
  while (queries.length < minSlides) {
    queries.push(trending.imageQuery);
  }
  while (slides.length < minSlides) {
    slides.push(`Slide ${slides.length + 1}: ${trending.title}`);
  }

  content.carouselPrompts = prompts.slice(0, 10);
  content.carouselQueries = queries.slice(0, 10);
  content.carouselSlides = slides.slice(0, 10);
  return content;
}

function buildFallbackContent(trending: TrendingTopic, type: string): GeneratedContent {
  const base: GeneratedContent = {
    caption: `${HOOKS[0]}\n\n${trending.contentAngle}\n\nइस पर आपकी क्या राय है? Comment में बताओ 👇\n\nSave this to share with someone who needs context.`,
    hashtags: trending.hashtags.join(" ") + " #India #Trending #ViralNews #IndiaNews",
    imagePrompt: `Documentary style news photography: ${trending.imageQuery}, real people, authentic moment, photojournalism`,
    searchQuery: trending.imageQuery,
    captionSubject: trending.title,
    trendingTopic: trending,
  };

  if (type === "carousel") {
    base.carouselPrompts = [
      `News photo of ${trending.title} — establishing wide shot`,
      `Background context photo for ${trending.title} — historical perspective`,
      `Key people affected by ${trending.title} — human impact photo`,
      `Data visualization or protest sign related to ${trending.title}`,
      `Resolution or future outlook photo for ${trending.title}`,
    ];
    base.carouselQueries = Array(5).fill(trending.imageQuery);
    base.carouselSlides = [
      trending.title,
      "The Background",
      "Key Facts",
      "Impact on You",
      "What Do You Think? 💬",
    ];
  }

  return base;
}
