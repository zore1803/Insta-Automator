import { logger } from "../lib/logger.js";
import { getOneTrendingTopic, type TrendingTopic } from "./trendingService.js";

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

export interface GenerationContext {
  existingImagePrompt?: string;
  existingImageUrl?: string;
  existingCaption?: string;
  recentCaptions?: string[];
}

const FORMAT_RULES = {
  image: "Single feed post. Caption should be 120-190 words, sharp, specific, and easy to skim.",
  reels: "Instagram Reel. Caption should be 80-140 words and include a short spoken-hook idea plus a visual scene direction.",
  carousel: "Carousel. Caption should be 120-190 words, and provide exactly 5 slide titles plus 5 distinct image prompts.",
};

const CTA = [
  "What is your read on this?",
  "Would you use this angle or skip it?",
  "Which detail matters most here?",
  "What would you post from this?",
  "Does this feel like a real trend or noise?",
];

const WRITING_ANGLES = [
  "Open with the most concrete current detail, then explain why it is getting attention.",
  "Lead with a strong opinion, then support it with named specifics from the topic.",
  "Write like a sharp creator explaining what casual viewers are missing.",
  "Use a tight numbered breakdown with no generic motivational filler.",
  "Start with a provocative question that is directly about this topic.",
  "Write like a smart Indian creator speaking to an audience that scrolls fast.",
  "Tell it as a short observation: what happened, why people care, what to watch next.",
  "Give the reader one clear interpretation, not a vague lesson.",
];

const NICHE_GUIDANCE = [
  {
    pattern: /\b(cricket|ipl|t20|odi|test match|bcci|wicket|batting|bowling|sports?)\b/i,
    guidance: "Use match context, team names, player roles, score pressure, form, venue, selection calls, or tactical moments. Avoid generic motivation unless it is tied to the match.",
  },
  {
    pattern: /\b(business|startup|entrepreneur|finance|money|success|marketing|sales)\b/i,
    guidance: "Use business examples, founder decisions, market timing, customer behavior, revenue, margins, execution, local opportunity, or one practical action.",
  },
  {
    pattern: /\b(fitness|gym|workout|health|nutrition|bodybuilding|weight loss)\b/i,
    guidance: "Use training specifics, recovery, nutrition, form cues, routines, progress tracking, or common mistakes. Keep it practical and grounded.",
  },
  {
    pattern: /\b(food|recipe|restaurant|cooking|chef|street food)\b/i,
    guidance: "Use dish names, ingredients, texture, cooking method, place cues, taste notes, or a specific serving idea.",
  },
  {
    pattern: /\b(fashion|style|beauty|skincare|makeup|outfit)\b/i,
    guidance: "Use styling choices, occasions, fabrics, color combinations, product steps, skin concerns, or practical outfit/beauty decisions.",
  },
  {
    pattern: /\b(travel|tourism|hotel|destination|trip)\b/i,
    guidance: "Use place names, route details, timing, budget, local experience, weather, food stops, or hidden practical tips.",
  },
  {
    pattern: /\b(ai|tech|software|coding|developer|automation|saas)\b/i,
    guidance: "Use tools, workflows, prompts, product examples, automation steps, metrics, or a real before/after use case.",
  },
];

const DEFAULT_DISCOVERY_NICHE = "India Instagram trends";

function isBroadDiscoveryNiche(niche?: string): boolean {
  const value = (niche || "").toLowerCase().trim();
  if (!value) return true;
  if (value === "fitness") return true;
  if (/\b(india|indian)\b/.test(value) && /\b(instagram|viral|trend|trending|popular|reels?|content)\b/.test(value)) return true;
  if (value.includes("tamil nadu business")) return true;
  return false;
}

function nicheGuidance(niche: string): string {
  if (isBroadDiscoveryNiche(niche)) {
    return "Use the live search trend as the primary topic. Write for Indian Instagram audiences, with named details from the evidence, a clear original angle, and a publishable post that does not copy another creator's reel.";
  }
  return NICHE_GUIDANCE.find((item) => item.pattern.test(niche))?.guidance
    || "Use specific examples, named details, audience pain points, practical takeaways, and visuals that only make sense for this niche.";
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickSeeded<T>(items: T[], seed: number, offset = 0): T {
  return items[(seed + offset) % items.length];
}

function compactCaption(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
}

function languageInstruction(language: string): string {
  const lower = language.toLowerCase();
  if (lower.includes("hindi")) return "Write primarily in Hindi using Devanagari, with English hashtags.";
  if (lower.includes("marathi")) return "Write in Marathi using Devanagari, with English hashtags.";
  if (lower.includes("tamil")) return "Write in Tamil, with English hashtags.";
  if (lower.includes("tanglish")) return "Write in natural Tanglish, as Chennai youth speak online.";
  return "Write in clear English with an Indian creator-market tone.";
}

function mediaShape(type: string): string {
  if (type === "reels") return "vertical 9:16, motion-friendly scene, real footage style";
  if (type === "carousel") return "portrait 4:5, each slide visually different but same topic";
  return "portrait 4:5 or square 1:1, strong Instagram feed composition";
}

function isLiveEventNiche(niche: string): boolean {
  return /\b(ipl|cricket|match|score|t20|odi|test match|sports?|football|league|tournament|cup|icc|game day|bcci|wicket|batting|bowling)\b/i.test(niche);
}

function topicMatchesNiche(niche: string, trending: TrendingTopic): boolean {
  if (isBroadDiscoveryNiche(niche)) return true;
  const text = `${trending.title} ${trending.searchQuery} ${trending.imageQuery} ${trending.contentAngle} ${trending.hashtags.join(" ")}`;
  if (isLiveEventNiche(niche)) {
    return /\b(ipl|cricket|t20|odi|test|match|score|scorecard|wicket|batting|bowling|batsman|bowler|run chase|powerplay|death overs|playing xi|impact player|fantasy|dc|kkr|csk|mi|rcb|srh|gt|rr|pbks|lsg)\b/i.test(text);
  }
  return true;
}

function buildPrompt(
  niche: string,
  language: string,
  type: "image" | "reels" | "carousel",
  trending: TrendingTopic,
  context?: GenerationContext,
): string {
  const now = new Date();
  const discoveryMode = isBroadDiscoveryNiche(niche);
  const accountTopic = discoveryMode ? DEFAULT_DISCOVERY_NICHE : niche;
  const cta = CTA[Math.floor(Math.random() * CTA.length)];
  const angle = WRITING_ANGLES[Math.floor(Math.random() * WRITING_ANGLES.length)];
  const variationSeed = Math.floor(Math.random() * 99999);
  const visualContext = context?.existingImagePrompt
    ? `\nEXISTING VISUAL TO MATCH: ${context.existingImagePrompt}`
    : "";
  const captionsToAvoid = [
    context?.existingCaption,
    ...(context?.recentCaptions || []),
  ].filter(Boolean).map((caption) => `- ${compactCaption(caption!)}`).join("\n");
  const avoidCaptionContext = captionsToAvoid
    ? `\nRECENT/EXISTING CAPTIONS TO AVOID REPEATING:\n${captionsToAvoid}`
    : "";

  return `You are an expert Instagram strategist and caption writer.

CURRENT DATE: ${now.toISOString().slice(0, 10)}
UNIQUE VARIATION SEED: ${variationSeed}
ACCOUNT NICHE: ${niche}
NICHE-SPECIFIC WRITING GUIDANCE: ${nicheGuidance(niche)}
TRENDING HOOK/ANGLE: ${trending.title}
WHY THIS ANGLE: ${trending.contentAngle}
CONTENT TYPE: ${type}
FORMAT RULES: ${FORMAT_RULES[type]}
LANGUAGE: ${languageInstruction(language)}
WRITING ANGLE: ${angle}
VISUAL FORMAT: ${mediaShape(type)}${visualContext}${avoidCaptionContext}

CRITICAL RULES:
1. Primary topic: ${discoveryMode ? `the live India trend "${trending.title}" from the search evidence` : `the ACCOUNT NICHE "${accountTopic}"`}.
2. ${discoveryMode ? "Use viral reels and creator trends only as inspiration for an original post. Do not copy another creator's caption, watermark, video, or exact script." : `The TRENDING HOOK is only a creative angle or hook to make the "${accountTopic}" content feel fresh - it is NOT the main topic.`}
3. ${discoveryMode ? "Do not force sports. Choose the evidence-backed India trend as-is, whether it is entertainment, food, fashion, tech, finance, travel, sports, memes, or culture." : `If the trending hook is unrelated to "${accountTopic}", ignore it and create content purely about "${accountTopic}".`}
4. NEVER write about romance, love, dating, or relationships unless "${accountTopic}" explicitly says so.
5. NEVER output template placeholders like {TOPIC}, {NICHE}, {TONE}, {AUDIENCE} — always write the actual content.
6. The imagePrompt and searchQuery MUST visually represent ${discoveryMode ? `the live trend "${trending.title}" in India` : `"${accountTopic}"`} — use real, specific visuals.

7. Do not reuse the structure, opening line, examples, or CTA pattern from recent captions. The UNIQUE VARIATION SEED must change the angle and wording.

Caption requirements:
- First two lines must clearly state what this is about.
- Include 3-5 specific details, names, examples, places, creator-format cues, or practical takeaways directly tied to the topic.
- Use 4-6 short paragraphs or line breaks: hook, context, key details, why it matters, takeaway, CTA.
- Make the caption feel written for this exact trend, not a generic creator-growth template.
- Do not use bland phrases like "in today's fast-paced world", "game changer", "must watch", "level up", "unlock", "go viral", or "this is your sign".
- Do not write motivational filler. Every sentence must add a concrete observation, detail, or point of view.
- Do not combine two niches. If the saved account niche is specific, use that niche only. If discovery mode is active, use the selected India trend only.
- Do not say "web-discovered", "creator trend results", "content ideas", "Instagram niche", or similar meta phrases in the caption.
- Match the caption to the visual prompt so the post feels intentional.
- End with this CTA or a close variation: "${cta}"
- Keep emojis minimal.

Hashtag requirements:
- Max 13 hashtags.
- Must include niche-specific tags for "${niche}".

Image/video prompt requirements:
- Must visually represent "${niche}" — no generic or unrelated imagery.
- Realistic, authentic, non-stock-looking image or footage.
- No watermarks, logos, text overlays, screenshots, or obvious AI art.
- For reels, describe a scene that maps to real vertical footage related to "${niche}".

Respond with valid JSON only:
{
  "caption": "full caption with line breaks",
  "hashtags": "#tag1 #tag2",
  "imagePrompt": "specific realistic visual prompt of ${accountTopic}",
  "searchQuery": "specific image search query for ${accountTopic}",
  "captionSubject": "${trending.title}",
  "carouselPrompts": ["only for carousel: slide 1 visual", "slide 2 visual", "slide 3 visual", "slide 4 visual", "slide 5 visual"],
  "carouselQueries": ["only for carousel: query 1", "query 2", "query 3", "query 4", "query 5"],
  "carouselSlides": ["only for carousel: short slide title 1", "title 2", "title 3", "title 4", "title 5"]
}`;
}

function normalizeContent(content: GeneratedContent, trending: TrendingTopic, type: string, niche?: string): GeneratedContent {
  content.caption = content.caption?.trim() || "";
  content.hashtags = content.hashtags?.trim() || trending.hashtags.join(" ");
  content.imagePrompt = content.imagePrompt?.trim() || `Real vertical photo for ${niche || trending.title}, authentic people and setting`;
  content.searchQuery = content.searchQuery?.trim() || trending.imageQuery || trending.searchQuery;
  content.captionSubject = content.captionSubject || trending.title;
  content.trendingTopic = trending;

  // Safety net: if imagePrompt/searchQuery don't mention the niche at all, prepend it
  const nicheWord = (niche || "").split(/[\s,]+/)[0].toLowerCase();
  if (nicheWord && content.imagePrompt && !content.imagePrompt.toLowerCase().includes(nicheWord)) {
    content.imagePrompt = `${niche} — ${content.imagePrompt}`;
  }
  if (nicheWord && content.searchQuery && !content.searchQuery.toLowerCase().includes(nicheWord)) {
    content.searchQuery = `${niche} ${content.searchQuery}`;
  }

  if (type === "carousel") {
    const prompts = [...(content.carouselPrompts || [])];
    const queries = [...(content.carouselQueries || [])];
    const slides = [...(content.carouselSlides || [])];
    const defaults = [
      `Main visual for ${trending.title}, authentic vertical photo`,
      `Behind the scenes context for ${trending.title}`,
      `Practical example connected to ${trending.title}`,
      `Audience impact scene for ${trending.title}`,
      `Discussion or decision moment around ${trending.title}`,
    ];
    while (prompts.length < 5) prompts.push(defaults[prompts.length] || defaults[0]);
    while (queries.length < 5) queries.push(trending.imageQuery || trending.searchQuery);
    while (slides.length < 5) slides.push(["The Trend", "Why It Matters", "How To Use It", "What To Avoid", "Your Move"][slides.length]);
    content.carouselPrompts = prompts.slice(0, 5);
    content.carouselQueries = queries.slice(0, 5);
    content.carouselSlides = slides.slice(0, 5);
  }

  return content;
}

function hasUnfilledPlaceholders(content: GeneratedContent): boolean {
  const text = (content.caption || "") + (content.imagePrompt || "");
  return /\{[A-Z_]+\}/.test(text) || text.trim().length < 30;
}

function normalizeForSimilarity(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/#[a-z0-9_]+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
}

function isTooSimilarToRecent(content: GeneratedContent, context?: GenerationContext): boolean {
  const recent = [context?.existingCaption, ...(context?.recentCaptions || [])].filter(Boolean) as string[];
  if (!content.caption || !recent.length) return false;

  const currentWords = new Set(normalizeForSimilarity(content.caption));
  if (currentWords.size < 8) return true;

  return recent.some((caption) => {
    const previousWords = new Set(normalizeForSimilarity(caption));
    if (previousWords.size < 8) return false;
    let overlap = 0;
    for (const word of currentWords) {
      if (previousWords.has(word)) overlap++;
    }
    return overlap / Math.min(currentWords.size, previousWords.size) > 0.62;
  });
}

function buildFallbackContent(niche: string, trending: TrendingTopic, type: "image" | "reels" | "carousel"): GeneratedContent {
  const seed = hashString(`${niche}|${trending.title}|${type}|${Date.now()}|${Math.random()}`);

  if (isLiveEventNiche(niche)) {
    return {
      caption: `${trending.title}: latest IPL match insights\n\n${trending.contentAngle}\n\nStart with what the scorecard actually says: who created the pressure, which phase changed the match, and which player had the biggest impact beyond the headline number.\n\nThe key read is usually hidden in one phase: powerplay wickets, middle-over spin control, or death-over execution. That is where momentum shifts before the final result becomes obvious.\n\nFor fans, the useful takeaway is simple: connect the result to team balance, form, matchups, and the next selection question. That makes the post an insight, not just an update.\n\n${pickSeeded(CTA, seed)}`,
      hashtags: [...new Set(["#IPL", "#Cricket", "#T20", "#MatchResult", ...trending.hashtags])].slice(0, 13).join(" "),
      imagePrompt: `Authentic ${mediaShape(type)} visual for ${niche} - IPL cricket stadium, players in match warmup, crowd energy, realistic sports photography, no text overlay`,
      searchQuery: `${niche} IPL cricket match stadium players real photo`,
      captionSubject: trending.title,
    };
  }

  const openings = [
    `${niche}: ${trending.title}`,
    `A sharper ${niche} angle for today: ${trending.title}`,
    `What ${trending.title} means inside ${niche}`,
    `Use this ${niche} idea before it becomes old news`,
  ];
  const proofLines = [
    `Start with the visible trend context: who is talking about it, what format is spreading, and why Indian audiences are reacting now.`,
    `Call out the creator angle clearly: the hook, the visual moment, the relatable detail, and the reason people may save or share it.`,
    `Give the audience one practical read: what to notice, what to avoid copying directly, and how to make an original version.`,
    `Close with a simple takeaway that turns the trend into a useful, publishable post instead of a generic update.`,
  ];
  const closes = [
    "Save this angle for your next post.",
    "Comment the detail you would add.",
    "Share this with someone watching this niche closely.",
    "Follow for more niche-specific updates.",
  ];

  return {
    caption: `${pickSeeded(openings, seed)}\n\n${trending.contentAngle}\n\n${pickSeeded(proofLines, seed, 1)}\n\n${pickSeeded(proofLines, seed, 2)}\n\n${pickSeeded(closes, seed, 3)}`,
    hashtags: trending.hashtags.join(" "),
    imagePrompt: `Authentic ${mediaShape(type)} visual for ${isBroadDiscoveryNiche(niche) ? "India viral Instagram trend" : niche} - ${trending.title}, real setting, natural light, trend-specific details`,
    searchQuery: `${niche} ${trending.imageQuery || trending.searchQuery}`,
    captionSubject: trending.title,
  };
}

async function callOpenAI(prompt: string): Promise<GeneratedContent | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Return only valid JSON for Instagram content. Be specific and match caption to the visual." },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  return JSON.parse(data.choices[0].message.content) as GeneratedContent;
}

async function callPollinations(prompt: string): Promise<GeneratedContent | null> {
  const encoded = encodeURIComponent(prompt);
  const res = await fetch(`https://text.pollinations.ai/${encoded}?model=openai&jsonMode=true`, {
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) as GeneratedContent : null;
}

export async function generateInstagramContent(
  niche: string,
  language: string,
  type: "image" | "reels" | "carousel" = "image",
  forcedTopic?: TrendingTopic,
  context?: GenerationContext,
): Promise<GeneratedContent> {
  const candidateTopic = forcedTopic || await getOneTrendingTopic(niche);
  if (!topicMatchesNiche(niche, candidateTopic) && isLiveEventNiche(niche)) {
    throw new Error("Search returned an off-niche cricket topic. Please refresh trending topics and try again.");
  }
  const trending = candidateTopic;
  const prompt = buildPrompt(niche, language, type, trending, context);

  logger.info({ topic: trending.title, type, niche }, "Generating niche-matched Instagram content");

  try {
    const openai = await callOpenAI(prompt);
    if (openai?.caption && !hasUnfilledPlaceholders(openai) && !isTooSimilarToRecent(openai, context)) return normalizeContent(openai, trending, type, niche);
    if (openai?.caption) logger.warn({ caption: openai.caption.slice(0, 80) }, "OpenAI returned template placeholders — retrying with Pollinations");
  } catch (err) {
    logger.warn({ err }, "OpenAI content generation failed");
  }

  try {
    const pollinations = await callPollinations(prompt);
    if (pollinations?.caption && !hasUnfilledPlaceholders(pollinations) && !isTooSimilarToRecent(pollinations, context)) return normalizeContent(pollinations, trending, type, niche);
  } catch (err) {
    logger.warn({ err }, "Pollinations content generation failed");
  }

  return normalizeContent(buildFallbackContent(niche, trending, type), trending, type, niche);
}
