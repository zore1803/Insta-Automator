import { logger } from "../lib/logger.js";

export interface GeneratedContent {
  caption: string;
  hashtags: string;
  imagePrompt: string;
  searchQuery: string;
  captionSubject?: string;
  carouselPrompts?: string[];
  carouselQueries?: string[];
  carouselSlides?: string[];
}

// ── Trending topics — updated for May 2026 / Tamil Nadu context ──────────────
function getTrendingContext(): string {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
  const month = now.getMonth(); // 0-indexed

  const trendingTopics = [
    "Tamil Nadu Local Body Elections 2025 — civic engagement, voting awareness, democracy",
    "IPL 2025 — cricket fever, Chennai Super Kings, match day energy",
    "Tamil New Year 2025 — Puthandu celebration, family, tradition, new beginnings",
    "Summer heat wave in Tamil Nadu — tips, cool drinks, AC, beat the heat content",
    "Tamil cinema blockbuster season — movies, entertainment, fan moments",
    "Kanyakumari tourism surge — travel, weekend getaway, south India beauty",
    "Tamil Nadu startup ecosystem — tech entrepreneurs, Chennai startup culture",
    "Dravidian politics history — MGR, Jayalalithaa legacy content going viral",
    "Marina Beach sunrise aesthetic — Chennai lifestyle, early morning walkers",
    "Coimbatore textile industry boom — business, manufacturing, Made in India",
  ];

  // Pick 2 trending topics based on day/hour for variety
  const idx1 = (now.getDate() + hour) % trendingTopics.length;
  const idx2 = (now.getDate() + hour + 3) % trendingTopics.length;
  const selected = [trendingTopics[idx1], trendingTopics[idx2]];

  // Time of day context
  const timeContext =
    hour < 7 ? "early morning motivation (5-7 AM crowd)"
    : hour < 10 ? "morning commute / first coffee scroll"
    : hour < 13 ? "mid-morning productivity / work break"
    : hour < 15 ? "post-lunch siesta scroll"
    : hour < 18 ? "afternoon motivation / 3 PM slump"
    : hour < 20 ? "evening wind-down / commute home"
    : hour < 22 ? "prime time Instagram (8-10 PM, HIGHEST engagement)"
    : "late night inspirational scroll";

  // Monthly seasonal context
  const seasonalContext =
    month >= 3 && month <= 5 ? "Summer 2025 — heat, vacations, school holidays in TN"
    : month >= 6 && month <= 8 ? "Monsoon season Tamil Nadu"
    : month >= 9 && month <= 11 ? "Festival season — Diwali, Dussehra, harvest"
    : "Winter / New Year energy";

  return `
TRENDING NOW (inject naturally into content — DO NOT ignore these):
- ${selected[0]}
- ${selected[1]}

TODAY: ${dayOfWeek}, ${now.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
TIME CONTEXT: ${timeContext}
SEASONAL: ${seasonalContext}
`;
}

// ── Viral hooks — 40 unique opening lines for maximum variety ────────────────
const CAPTION_HOOKS = [
  // Tamil Nadu specific
  "தமிழகத்தில் இப்போது இந்த ஒரு விஷயம் மட்டும் பேசப்படுகிறது —",
  "Chennai-la இந்த secret யாரும் சொல்ல மாட்டாங்க 👀",
  "TN election result-க்கு முன்னாடி இதை தெரிஞ்சுக்கோ:",
  // Universal viral hooks
  "Nobody talks about this, but",
  "I studied 100 millionaires and found one thing:",
  "The #1 thing separating rich from poor is NOT money.",
  "Most people waste the best years of their life doing this:",
  "Billionaires wake up at 4 AM to do THIS — not hustle:",
  "Your bank account is a reflection of your identity.",
  "Stop trading time for money. Here's what works instead:",
  "The silent millionaire formula (screenshot this) 📸",
  "Rich people think differently. Here's the proof:",
  "I went from ₹0 to 6 figures by doing ONE thing:",
  "The truth about passive income nobody tells you:",
  "What 1% of earners know that 99% don't:",
  "This skill is worth more than any degree right now:",
  "3 AM thought: what if you invested the time you waste?",
  "If you're reading this, you're already in the top 10%.",
  "Hard truth: your comfort zone is your biggest enemy.",
  "The game changed. Here's what's working in 2025:",
  "People who retire early all have THIS in common:",
  "Stop asking for permission. Start asking for outcomes.",
  "Reminder: you're one decision away from a different life.",
  "This is what financial freedom actually looks like 👇",
  "The most underrated investment in 2025:",
  "Why 95% of people stay broke (it's not what you think):",
  "Chennai to the world — this entrepreneur did it:",
  "Every successful Tamil entrepreneur knows this secret:",
  "The morning habit that changed everything for me:",
  "If I had to start over today with ₹500, here's what I'd do:",
  "What I wish someone told me at 22:",
  "Real talk: debt doesn't make you poor — mindset does.",
  "This is why most people never build real wealth:",
  "The compounding effect nobody teaches you in school:",
  "Small daily habits that make millionaires in 5 years:",
  "How the Tamil entrepreneur mindset wins globally:",
  "Your Instagram feed reflects your income level. Change it.",
  "2025 reality check — are you building or just consuming?",
  "The difference between your dreams and results is ACTION.",
  "They don't want you to know this wealth secret:",
];

// ── Content variety seeds (prevents same output) ──────────────────────────────
const CONTENT_ANGLES = [
  "motivational wealth mindset",
  "entrepreneur success story format",
  "myth vs reality comparison",
  "step-by-step actionable tips",
  "shocking statistics + takeaway",
  "personal story + lesson",
  "day in the life of a successful person",
  "common mistakes to avoid",
  "trending topic reaction + insight",
  "local Tamil Nadu success angle",
  "IPL cricket + business metaphor",
  "summer productivity tips",
  "election season civic + business angle",
  "young entrepreneur Tamil Nadu story",
  "global trend + local application",
];

const IMAGE_STYLES = [
  "golden hour cinematic",
  "moody dark luxury",
  "bright airy minimalist",
  "vibrant street photography",
  "dramatic chiaroscuro lighting",
  "soft pastel aesthetic",
  "high contrast black and white",
  "neon cyberpunk urban",
  "warm vintage film grain",
  "clean corporate editorial",
  "tropical vibrant colors",
  "misty morning fog aesthetic",
];

function formatCaption(raw: string): string {
  if (!raw) return "";
  let c = raw.replace(/\\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return c;
}

function buildPrompt(niche: string, language: string, type: string): string {
  const now = new Date();
  // Use time + seconds as seed to guarantee different content every call
  const seed = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const randomHook = CAPTION_HOOKS[seed % CAPTION_HOOKS.length];
  const contentAngle = CONTENT_ANGLES[seed % CONTENT_ANGLES.length];
  const imageStyle = IMAGE_STYLES[seed % IMAGE_STYLES.length];

  const isCarousel = type === "carousel";
  const isReel = type === "reels";
  const trendingContext = getTrendingContext();

  const languageInstructions =
    language?.toLowerCase().includes("tamil")
      ? "Write caption in Tamil (தமிழ்) with some English keywords for searchability. Use Tamil script."
      : language?.toLowerCase().includes("tanglish") || language?.toLowerCase().includes("tamil english")
      ? "Write caption in Tanglish (Tamil + English mix) — the way Chennai youth speak."
      : `Write caption in ${language || "English"}.`;

  return `You are a viral Instagram content creator. Your account niche: "${niche}".

${trendingContext}

CONTENT ANGLE FOR THIS POST: ${contentAngle}
IMAGE VISUAL STYLE: ${imageStyle}
LANGUAGE: ${languageInstructions}
FORMAT: ${type.toUpperCase()}
CREATIVITY SEED: ${seed} (use this to create a unique post, NOT the same as previous posts)

VIRAL CAPTION FORMULA:
1. HOOK — Use this EXACT opening line: "${randomHook}"
2. VALUE — 2-3 short, punchy lines with REAL insight (specific numbers, facts, or story beats)
3. RELATABILITY — 1 line connecting to the audience's dream OR current trending event
4. CTA — ONE of: "Save this 📌", "Share with someone who needs this 🔁", "Comment YES if you agree 👇", "Tag your business partner 🤝"
5. NO brand tag needed (just end with CTA)

HASHTAG RULES:
- 3 mega tags (1M+ posts): must include at least one Tamil Nadu specific tag
- 4 large tags (100K-1M): niche specific
- 4 medium tags (10K-100K): trending + niche mix
- 2 local tags: #TamilNadu #Chennai OR #Coimbatore etc
Total: 13 hashtags MAX

IMAGE/VIDEO REQUIREMENTS:
- Style: ${imageStyle}
- Format: ${isReel ? "vertical 9:16, motion, dynamic, cinematic" : "square 1:1, editorial, high impact"}
- NO text overlay, NO watermarks
- Subject must be UNIQUE and SPECIFIC (not generic "successful person")
${isCarousel ? `
CAROUSEL (5 slides):
- Slide 1: Bold hook title
- Slides 2-4: One specific tip per slide with data/story
- Slide 5: Strong CTA + follow prompt` : ""}

CRITICAL: Make this post COMPLETELY DIFFERENT from a generic wealth motivation post. Reference the trending context naturally. Be SPECIFIC.

Respond with VALID JSON ONLY — no markdown, no explanation:
{
  "caption": "Full caption with emojis, line breaks as \\n",
  "hashtags": "#tag1 #tag2 #TamilNadu",
  "imagePrompt": "${imageStyle} ${isReel ? "9:16 vertical cinematic" : "1:1 editorial"} photo: [VERY specific scene description]",
  "searchQuery": "5-word specific photo search query",
  "captionSubject": "specific main subject for image search"${isCarousel ? `,
  "carouselPrompts": ["slide 1 visual", "slide 2 visual", "slide 3 visual", "slide 4 visual", "slide 5 visual"],
  "carouselQueries": ["search 1", "search 2", "search 3", "search 4", "search 5"],
  "carouselSlides": ["Hook title", "Tip 1 text", "Tip 2 text", "Tip 3 text", "Save & Follow 🔖"]` : ""}
}`;
}

export async function generateInstagramContent(
  niche: string,
  language: string,
  type: "image" | "reels" | "carousel" = "image",
): Promise<GeneratedContent> {
  const prompt = buildPrompt(niche, language, type);

  // OpenAI GPT-4o (if key present)
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
              content: "You are an expert Instagram content strategist for Tamil Nadu audience. Respond ONLY with valid JSON, no markdown.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.95,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 429 || res.status === 402) {
        const body = (await res.json()) as any;
        logger.warn({ status: res.status, code: body?.error?.code }, "OpenAI quota — using free fallback");
      } else if (res.ok) {
        const data = (await res.json()) as any;
        const parsed = JSON.parse(data.choices[0].message.content) as GeneratedContent;
        parsed.caption = formatCaption(parsed.caption);
        logger.info({ model: "gpt-4o", type }, "Generated content");
        return parsed;
      } else {
        logger.warn({ status: res.status }, "OpenAI non-OK — using free fallback");
      }
    } catch (err) {
      logger.warn({ err }, "OpenAI request failed — using free fallback");
    }
  }

  // Pollinations free fallback
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
        parsed.caption = formatCaption(parsed.caption);
        logger.info({ model: "pollinations", type }, "Generated content");
        return parsed;
      }
    }
  } catch (err) {
    logger.warn({ err }, "Pollinations failed");
  }

  // Hard fallback — TN-specific
  const now = new Date();
  const seed = now.getHours() * 60 + now.getMinutes();
  const hooks = CAPTION_HOOKS.filter(h => !h.includes("தமிழ")); // English fallbacks
  const fallbackHook = hooks[seed % hooks.length];
  const trendContext = getTrendingContext();

  return {
    caption: `${fallbackHook}\n\nThose who succeed in Tamil Nadu's competitive market understand one thing:\nStart before you're ready. Refine as you grow.\n\n💡 Every rupee you invest in your skills today returns 10x.\n\nTag someone who needs to hear this 👇`,
    hashtags: "#TamilNadu #Chennai #Entrepreneur #SuccessMindset #BusinessTips #StartupIndia #TamilEntrepreneur #Motivation #WealthMindset #FinancialFreedom #IndianEntrepreneur #Coimbatore #MoneyMindset",
    imagePrompt: `Cinematic editorial photo of a confident young Tamil entrepreneur in modern Chennai office, city skyline view, ${IMAGE_STYLES[seed % IMAGE_STYLES.length]} lighting, aspirational lifestyle, 4K quality`,
    searchQuery: "young entrepreneur Chennai office success",
    captionSubject: "successful entrepreneur Chennai Tamil Nadu",
  };
}
