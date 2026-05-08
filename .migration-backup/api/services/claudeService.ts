import { openai } from "../../lib/integrations-openai-ai-server/src/index.ts";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface GeneratedContent {
  caption: string;
  hashtags: string;
  imagePrompt: string;
  searchQuery: string;
  captionSubject?: string;
  carouselPrompts?: string[];
  carouselQueries?: string[];
}

interface SearchResult {
  title: string;
  snippet: string;
}

// Deep web research: run multiple targeted searches and merge results
async function getWebFacts(niche: string): Promise<{ facts: string[]; rawResults: SearchResult[] }> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) return { facts: [], rawResults: [] };

  const year = new Date().getFullYear();
  const month = new Date().toLocaleString('en-US', { month: 'long' });

  const queries = [
    `${niche} latest news ${month} ${year}`,
    `${niche} ${year} stats records achievements`,
    `${niche} trending viral moment ${month} ${year}`
  ];

  let allFacts: string[] = [];
  let rawResults: SearchResult[] = [];

  for (const q of queries) {
    try {
      console.log(`[WebResearch] Searching: "${q}"`);
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q, num: 5 })
      });
      const data = await res.json();

      // Pull knowledge graph
      if (data.knowledgeGraph) {
        const kg = data.knowledgeGraph;
        if (kg.description) allFacts.push(kg.description);
        if (kg.attributes) {
          for (const [key, val] of Object.entries(kg.attributes)) {
            allFacts.push(`${key}: ${val}`);
          }
        }
      }

      // Pull answer box
      if (data.answerBox) {
        const answer = data.answerBox.answer || data.answerBox.snippet;
        if (answer) allFacts.push(answer);
      }

      // Pull organic results
      if (data.organic) {
        for (const item of data.organic) {
          allFacts.push(item.snippet);
          rawResults.push({ title: item.title, snippet: item.snippet });
        }
      }
    } catch (err) {
      console.warn(`[WebResearch] Failed for query "${q}":`, err);
    }
  }

  console.log(`[WebResearch] Collected ${allFacts.length} facts for "${niche}"`);
  return { facts: allFacts, rawResults };
}

// Pre-build a clean draft caption directly from search snippets
function buildDraftCaption(niche: string, facts: string[]): string {
  if (facts.length === 0) return "";
  
  // Clean each snippet: remove URLs, social media junk, and metadata
  const cleanedFacts = facts
    .filter(f => f.length > 30) // Only meaningful snippets
    .map(f => {
      return f
        .replace(/https?:\/\/\S+/g, '') // Remove URLs
        .replace(/\d+K?\s*likes?,?\s*\d+K?\s*comments?/gi, '') // Remove "143K likes, 316 comments"
        .replace(/\d+\.\d+k\s*\|\s*\d+:\d+\s*mins?/gi, '') // Remove "264.6k | 11:02 mins"
        .replace(/TEAM:.*$/gi, '') // Remove "TEAM: Chennai..."
        .replace(/\b(bit\.ly|t\.co|goo\.gl)\S*/g, '') // Remove short URLs
        .replace(/📱|🔗|👉/g, '') // Remove link emojis
        .replace(/\s{2,}/g, ' ') // Collapse whitespace
        .trim();
    })
    .filter(f => f.length > 20) // Re-filter after cleaning
    .slice(0, 4); // Top 4 facts
  
  return cleanedFacts.join("\n\n");
}

/**
 * Post-process caption to GUARANTEE structured formatting.
 * Runs AFTER every AI response to enforce line breaks no matter what the AI returns.
 */
function formatCaption(caption: string): string {
  if (!caption) return "";
  let formatted = caption;
  
  // 1. Convert literal \n to real newlines
  formatted = formatted.replace(/\\n/g, '\n');
  
  // 2. If there are barely any newlines, the AI wrote a paragraph — split it
  const lineCount = formatted.split('\n').filter(l => l.trim()).length;
  if (lineCount <= 2 && formatted.length > 200) {
    // Split on sentence endings (. ! ?) followed by a space
    formatted = formatted.replace(/([.!?])\s+/g, '$1\n\n');
  }
  
  // 3. Ensure double line breaks between sections (not single)
  formatted = formatted.replace(/\n{1}(?!\n)/g, '\n\n');
  // Collapse triple+ newlines to double
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  
  // 4. Ensure branding is present at the end
  if (!formatted.includes('Powered by @loqit.ai')) {
    formatted = formatted.trimEnd() + '\n\n📸 Powered by @loqit.ai';
  }
  
  return formatted.trim();
}

export async function generateInstagramContent(
  niche: string,
  language: string,
  type: "image" | "reels" | "carousel" = "image"
): Promise<GeneratedContent> {
  
  // Step 1: Get REAL facts from the web
  console.log(`[ContentGen] Starting deep web research for: "${niche}"...`);
  const { facts, rawResults } = await getWebFacts(niche);
  
  // Step 2: Pre-build a draft from real search snippets
  const draftCaption = buildDraftCaption(niche, facts);
  console.log(`[ContentGen] Draft caption from web (${draftCaption.length} chars): "${draftCaption.substring(0, 150)}..."`);

  const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const currentYear = new Date().getFullYear();

  const systemPrompt = `You are an Instagram caption writer for @loqit.ai — an AI-powered content automation brand. Today is ${todayDate}.

YOUR ONLY JOB: Rewrite the DRAFT CAPTION below into an engaging, well-structured Instagram post.

CONTENT PILLARS (vary your tone based on topic):
- News/Updates: Lead with the breaking fact, keep it punchy.
- Behind-the-Scenes: Show how AI created this content, be transparent.
- Educational: Teach something, use numbered tips.
- Engagement: Ask questions, spark debate.

FORMATTING RULES (CRITICAL):
1. Use LINE BREAKS between every thought. NEVER write a wall of text or a big paragraph.
2. Each fact/point should be on its OWN line.
3. Structure: Hook line → Key facts (1 per line) → Opinion/CTA → "📸 Powered by @loqit.ai"

TAGGING RULES:
1. Tag the REAL Instagram handles of any players, teams, or people mentioned.
2. Common handles: @mumbaiindians, @rohitsharma45, @virat.kohli, @suraborivs, @indiancricketteam, @iplt20, @delhicapitals, @chennaiipl, @rcbtweets, @kkriders, @maboritsharma45, @hardikpandya93, @mahi7781
3. If you don't know the exact handle, use @ followed by their common username.

FACT RULES:
1. Keep ALL facts, numbers, names, and dates from the draft EXACTLY as they are.
2. You MUST NOT add ANY new statistics not in the draft.
3. If the draft says "5 titles" write "5 titles". NOT 6, NOT 10.

STYLE:
- 2-4 emojis max, placed strategically (not after every line).
- End with a question that sparks debate or a strong CTA (e.g. "Drop your prediction 👇" or "Tag a fan who needs to see this 🔥").
- BANNED: "Step into", "Experience the", "Embark on", "Unleash", "Dive into"

Respond ONLY with valid JSON.
If this is a CAROUSEL, provide 3-5 distinct scenes.`;

  const isCarousel = type === "carousel";
  const carouselInstructions = isCarousel ? `
6. "carouselPrompts": An array of 3-5 distinct image prompts for a storytelling carousel.
7. "carouselQueries": An array of 3-5 distinct search queries for real photos for each slide.` : "";

  const userPrompt = `Topic: "${niche}"
Language: ${language}

DRAFT CAPTION (Rewrite this — keep ALL facts, add line breaks, tag real IG handles):
"""
${draftCaption || `Write a general engaging post about ${niche}. Do NOT cite any specific statistics or numbers since we have no verified data.`}
"""

INSTRUCTIONS:
1. "caption": Rewrite the draft into a STRUCTURED caption with LINE BREAKS between each point. Tag real Instagram handles. End with "📸 Powered by @loqit.ai". No character limit.
2. "hashtags": Use the TIERED HASHTAG STRATEGY (10-15 total):
   - 3-4 NICHE hashtags (e.g. #AIgenerated #AIcreator #ContentCreation)
   - 3-4 MEDIUM-VOLUME hashtags relevant to the topic
   - 2-3 HIGH-VOLUME hashtags (e.g. #AI #CreatorEconomy #Trending)
   - ALWAYS end with #LoqitAI as the LAST hashtag.
3. "imagePrompt": Describe a cinematic 9:16 vertical image of the main subject for the cover slide.
4. "searchQuery": 4-6 word query to find a REAL photo for the cover slide.
5. "captionSubject": The primary person/team/entity.
${carouselInstructions}

EXAMPLE OUTPUT FORMAT:
{
  "caption": "🏏 MI clinched a 6-wicket victory over LSG!\\n\\n@rohitsharma45's injury still looms large, but Quinton de Kock stepped up big.\\n\\nStandings: 9th in the IPL 2026 table.\\n\\nCan MI still make the playoffs? Drop your prediction 👇\\n\\n📸 Powered by @loqit.ai",
  "hashtags": "#MumbaiIndians #MI #IPL2026 #CricketNews #AIgenerated #ContentCreation #Trending #Cricket #LoqitAI",
  ...
}

JSON format: {"caption": "...", "hashtags": "...", "imagePrompt": "...", "searchQuery": "...", "captionSubject": "..." ${isCarousel ? ', "carouselPrompts": ["..."], "carouselQueries": ["..."]' : ''}}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // 1. Try Gemini Flash FIRST (free, fast, and less stubborn than Pro)
      const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY;
      if (geminiKey) {
        console.log("[ContentGen] Using Gemini 1.5 Flash (primary — fast & free)...");
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ 
          model: "gemini-1.5-flash"
        }, { apiVersion: "v1" } as any);
        
        const result = await model.generateContent([systemPrompt, userPrompt]);
        const text = result.response.text();
        // Manually extract JSON if the AI includes extra text
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as GeneratedContent;
        parsed.caption = formatCaption(parsed.caption);
        console.log(`[ContentGen] Gemini Flash success. Caption preview: "${parsed.caption?.substring(0, 100)}..."`);
        return parsed;
      }

      // 2. Try OpenAI GPT-4o as secondary
      try {
        console.log("[ContentGen] Trying GPT-4o (secondary)...");
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_object" }
        });
        const parsed = JSON.parse(response.choices[0].message.content || "{}") as GeneratedContent;
        parsed.caption = formatCaption(parsed.caption);
        console.log(`[ContentGen] GPT-4o caption preview: "${parsed.caption?.substring(0, 100)}..."`);
        return parsed;
      } catch (openaiErr) {
        console.warn("[ContentGen] GPT-4o failed:", openaiErr);
      }
    } catch (err) {
      console.warn("[ContentGen] Primary/Secondary failed, trying Groq:", err);
      
      try {
        // 3. Try Groq (Llama 3.1)
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) throw new Error("GROQ_API_KEY not set");

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" }
          })
        });

        if (!groqRes.ok) {
          const errorBody = await groqRes.text();
          throw new Error(`Groq API error: ${groqRes.status} - ${errorBody}`);
        }
        const groqData = await groqRes.json();
        const groqParsed = JSON.parse(groqData.choices[0].message.content || "{}") as GeneratedContent;
        groqParsed.caption = formatCaption(groqParsed.caption);
        return groqParsed;
      } catch (groqErr) {
        console.warn("[ContentGen] All AI failed, using Pollinations:", groqErr);
        
        // Final Fallback: Use the draft caption directly with minimal AI
        const simplePrompt = `Rewrite this as an Instagram caption. Keep ALL facts exactly. Add hashtags. Respond ONLY with JSON: {"caption": "rewritten caption", "hashtags": "#tags", "imagePrompt": "Cinematic vertical 9:16 of ${niche}", "searchQuery": "${niche} candid action photo", "captionSubject": "${niche}"}. Draft: ${draftCaption.substring(0, 500)}`;
        const encodedPrompt = encodeURIComponent(simplePrompt);
        const url = `https://text.pollinations.ai/${encodedPrompt}?model=openai&jsonMode=true`;
        
        const res = await fetch(url);
        const text = await res.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Final fallback failed");
        const fallbackParsed = JSON.parse(jsonMatch[0]) as GeneratedContent;
        fallbackParsed.caption = formatCaption(fallbackParsed.caption);
        return fallbackParsed;
      }
    }
  }

  throw new Error("Failed to generate content");
}
