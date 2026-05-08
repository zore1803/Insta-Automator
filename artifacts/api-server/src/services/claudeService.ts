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

// Proven viral Instagram caption formulas
const CAPTION_HOOKS = [
  "Nobody talks about this, but",
  "I studied 100 millionaires and found",
  "The #1 thing separating rich from poor",
  "Most people ignore this wealth principle",
  "Billionaires do this every morning —",
  "Your bank account reflects your mindset.",
  "Stop trading time for money. Start",
  "The silent millionaire formula:",
  "Rich people think differently. Here's proof:",
  "I went from broke to 6 figures by doing this:",
  "The truth about passive income nobody tells you:",
  "What 1% of earners know that 99% don't:",
];

function formatCaption(raw: string): string {
  if (!raw) return "";
  let c = raw.replace(/\\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!c.includes("@loqit.ai")) {
    c += "\n\n📲 Follow for daily wealth insights → @loqit.ai";
  }
  return c;
}

function buildPrompt(niche: string, language: string, type: string): string {
  const randomHook = CAPTION_HOOKS[Math.floor(Math.random() * CAPTION_HOOKS.length)];
  const isCarousel = type === "carousel";
  const isReel = type === "reels";

  return `You are a viral Instagram content strategist for @loqit.ai. Your account is about: "${niche}".

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
Content format: ${type.toUpperCase()}
Language: ${language}

VIRAL CAPTION FORMULA (proven to get saves & shares):
1. HOOK (1 punchy line that stops the scroll — use this opening: "${randomHook}")  
2. VALUE (2-3 short lines with the actual insight — real, specific, useful)
3. RELATABILITY (1 line connecting to the audience's dream/struggle)
4. CTA ("Save this post 📌" or "Share with someone who needs this" or "Comment YES if you agree")
5. Signature: "📲 Follow for daily wealth insights → @loqit.ai"

HASHTAG STRATEGY (mix of big + niche):
- 3 mega tags (1M+ posts): #motivation #success #mindset
- 4 large tags (100K-1M): specific to topic
- 4 medium tags (10K-100K): very niche specific  
- 2 brand: #LoqitAI #WealthMindset
Total: 13 hashtags max

IMAGE/VIDEO requirements:
- For AI: cinematic, 4K quality, ${isReel ? "vertical 9:16 ratio, motion blur, dynamic" : "square 1:1, editorial style, high contrast"}
- Style: luxury, aspirational, clean composition
- NO text on image (we add it in caption)

${isCarousel ? `CAROUSEL (5 slides):
Slide 1: Title/Hook slide 
Slides 2-4: Value slides (one tip per slide)
Slide 5: CTA slide` : ""}

Respond with VALID JSON ONLY (no markdown):
{
  "caption": "Full caption with emojis and line breaks using \\n",
  "hashtags": "#tag1 #tag2 #LoqitAI",
  "imagePrompt": "${isReel ? "Cinematic 9:16 vertical video-style" : "Cinematic 1:1 editorial"} photo: [specific scene]",
  "searchQuery": "5-word real photo search query",
  "captionSubject": "main subject for image search"${isCarousel ? `,
  "carouselPrompts": ["slide1 prompt", "slide2 prompt", "slide3 prompt", "slide4 prompt", "slide5 prompt"],
  "carouselQueries": ["search query 1", "search query 2", "search query 3", "search query 4", "search query 5"],
  "carouselSlides": ["Slide 1 title text", "Slide 2 tip text", "Slide 3 tip text", "Slide 4 tip text", "Save this 🔖"]` : ""}
}`;
}

export async function generateInstagramContent(
  niche: string,
  language: string,
  type: "image" | "reels" | "carousel" = "image",
): Promise<GeneratedContent> {
  const prompt = buildPrompt(niche, language, type);

  // OpenAI GPT-4o (if key present and has credits)
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
              content: "You are an expert Instagram content strategist. Respond ONLY with valid JSON, no markdown, no explanation.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.85,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(20000),
      });
      // 429 = quota/rate-limit, 402 = billing — skip to free fallback
      if (res.status === 429 || res.status === 402) {
        const body = (await res.json()) as any;
        logger.warn({ status: res.status, code: body?.error?.code }, "OpenAI quota/billing — using free fallback");
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

  // Pollinations free fallback (Mistral/OpenAI via proxy)
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

  // Hard fallback
  const niches: Record<string, any> = {
    default: {
      caption: `Nobody talks about this, but the biggest wealth secret is starting before you're ready.\n\nWhile others wait for the "perfect moment," the 1% understand: every day you delay costs you compound growth.\n\n💡 Start today. Refine tomorrow. Profit forever.\n\nTag someone who needs to hear this. 👇\n\n📲 Follow for daily wealth insights → @loqit.ai`,
      hashtags: "#WealthMindset #FinancialFreedom #Motivation #Success #Entrepreneur #MoneyTips #PassiveIncome #RichMindset #BusinessGrowth #WealthBuilding #LoqitAI #DailyMotivation #SuccessMindset",
      imagePrompt: `Cinematic editorial photo of a successful entrepreneur at sunrise overlooking a city skyline, luxury penthouse balcony, golden hour lighting, aspirational lifestyle, 4K quality`,
      searchQuery: "luxury entrepreneur morning city skyline",
      captionSubject: "successful entrepreneur",
    },
  };
  const fb = niches.default;
  return {
    caption: fb.caption,
    hashtags: fb.hashtags,
    imagePrompt: fb.imagePrompt,
    searchQuery: fb.searchQuery,
    captionSubject: fb.captionSubject,
  };
}
