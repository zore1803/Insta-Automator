import { db, sql } from "@workspace/db";
import { logger } from "../lib/logger.js";

export interface TrendingTopic {
  title: string;
  searchQuery: string;
  imageQuery: string;
  hashtags: string[];
  contentAngle: string;
  region: string;
  source?: string;
  score?: number;
}

type SearchResult = { title: string; snippet?: string; source?: string; url?: string };

let cachedTopics: TrendingTopic[] | null = null;
let cacheTime = 0;
let cacheNiche = "";
const CACHE_TTL_MS = 30 * 60 * 1000;

const seedMarkets = ["India", "US", "global"];
const DEFAULT_DISCOVERY_NICHE = "India Instagram trends";
const HASHTAG_STOPWORDS = new Set([
  "instagram", "reels", "reel", "trend", "trends", "trending", "viral", "today", "weekly",
  "updated", "india", "indian", "content", "creator", "creators", "photos", "videos",
  "likes", "comments", "views", "famous", "best", "latest", "search", "result", "results",
  "watch", "short", "about", "looking", "your", "you", "for", "our", "with", "from",
  "this", "that", "what", "whats", "when", "where", "which", "discover", "resource",
  "edition", "april", "february", "january", "march", "may", "june", "july", "august",
  "september", "october", "november", "december", "songs", "audio", "elevate", "guide",
  "guides", "professional", "brands", "brand",
  "top", "use", "are", "will", "get", "these", "must", "till", "end", "people", "around",
  "should", "more", "latest", "2025", "2026", "500k", "17k", "1490",
  "and", "the", "why", "look", "detailed", "world", "watched", "defined", "year", "social",
  "global", "updates",
]);

function isBroadDiscoveryNiche(niche?: string): boolean {
  const value = (niche || "").toLowerCase().trim();
  if (!value) return true;
  if (value === "fitness") return true;
  if (/\b(india|indian)\b/.test(value) && /\b(instagram|viral|trend|trending|popular|reels?|content)\b/.test(value)) return true;
  if (value.includes("tamil nadu business")) return true;
  return false;
}

function isLiveEventNiche(niche: string): boolean {
  return /\b(ipl|cricket|match|score|t20|odi|test match|sports?|football|league|tournament|cup|icc|game day|bcci|wicket|batting|bowling)\b/i.test(niche);
}

function topicMatchesNiche(topic: TrendingTopic, niche?: string): boolean {
  if (isBroadDiscoveryNiche(niche)) return true;
  if (!niche) return true;
  const text = `${topic.title} ${topic.searchQuery} ${topic.imageQuery} ${topic.contentAngle} ${topic.hashtags.join(" ")}`.toLowerCase();

  if (isLiveEventNiche(niche)) {
    return /\b(ipl|cricket|t20|odi|test|match|score|scorecard|wicket|batting|bowling|batsman|bowler|run chase|powerplay|death overs|playing xi|impact player|fantasy|dc|kkr|csk|mi|rcb|srh|gt|rr|pbks|lsg)\b/i.test(text);
  }

  const nicheWords = niche.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
  if (nicheWords.length === 0) return true;
  return nicheWords.some((word) => text.includes(word));
}

function buildNicheQueries(niche: string): string[] {
  const year = new Date().getFullYear();
  if (isBroadDiscoveryNiche(niche)) {
    return [
      `India viral social media trend today entertainment sports creator ${year}`,
      `India trending today viral moment reels meme celebrity cricket business ${year}`,
      `Indian viral video today Instagram reels news`,
      `what is trending in India today social media creators`,
      `India viral reels news today current trend`,
    ];
  }
  if (niche && isLiveEventNiche(niche)) {
    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return [
      `latest completed IPL ${year} match result scorecard highlights ${today}`,
      `last IPL match result scorecard Cricbuzz ESPNcricinfo ${year}`,
      `IPL ${year} yesterday match result highlights top performers`,
      `IPL ${year} most recent match report scorecard analysis`,
      `${niche} latest IPL match result insights`,
    ];
  }
  return [
    `top Instagram creator niches ${year} India`,
    `popular Instagram reels niches today India creators`,
    `trending content ideas Instagram reels ${year}`,
    `viral creator niches business fitness fashion travel food AI India`,
  ];
}

function cleanTitle(input: string): string {
  return input
    .replace(/\s[-|:]\s.*$/g, "")
    .replace(/\b(20\d{2})\b/g, "")
    .replace(/\s*•\s*[\d.]+[KMB]?\s+(reels?|views?|likes?|comments?).*$/i, "")
    .replace(/\b(top|best)\s+\d+\b/ig, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function cleanSnippet(input?: string): string {
  return (input || "")
    .replace(/\s+/g, " ")
    .replace(/\b\d+\s+(likes?|comments?|shares?|views?)\b/ig, "")
    .replace(/\b(posts?|followers|following)\b/ig, "")
    .trim()
    .slice(0, 180);
}

function isUsableSearchResult(result: SearchResult): boolean {
  const title = cleanTitle(result.title);
  const text = `${title} ${result.snippet || ""}`.toLowerCase();
  if (title.length < 8) return false;
  if (/\b(top|best)\s+(instagram|reels?)\s+trends?\b/i.test(title)) return false;
  if (/^reels india trends?$/i.test(title)) return false;
  if (/\b(updated weekly|what'?s hot|go-to resource|songs to elevate|professional brands|trending hashtags|more followers|reels ideas|you should use|must watch till end|influencer marketing|working on short video|defined the year|year in review)\b/i.test(text)) return false;
  if (/\b(hashtag|hashtags|followers|follower growth|ideas will get you|viral reels of in india|guide|global trends)\b/i.test(title)) return false;
  if (/\b(sexual|exploitation|assault|harassment|alleging|allegation|unverified|scandal|controversy|crime|killed|war)\b/i.test(text)) return false;
  if (/^\d+\s+(likes?|comments?|shares?|views?)\b/i.test(title)) return false;
  if (/\b\d+\s+likes?,\s*\d+\s+comments?\b/i.test(text)) return false;
  if (/^(log in|sign up|explore|watch|reels?|photos?)$/i.test(title)) return false;
  if (/\b(instagram photos and videos|followers,\s*following|posts,\s*followers)\b/i.test(text)) return false;
  return true;
}

function hashtagsFromTitle(title: string, region = "India"): string[] {
  const words = title
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !HASHTAG_STOPWORDS.has(w.toLowerCase()))
    .slice(0, 5);
  const tags = words.map((w) => `#${w[0].toUpperCase()}${w.slice(1)}`);
  return [...new Set([...tags, `#${region.replace(/\s+/g, "")}`, "#IndiaTrends", "#TrendingNow"])].slice(0, 9);
}

function buildDetailedTopicTitle(result: SearchResult): string {
  const title = cleanTitle(result.title);
  const snippet = cleanSnippet(result.snippet);
  if (!snippet) return title;

  const sentence = snippet
    .split(/(?<=[.!?])\s+/)
    .find((part) => part.length >= 35 && !/\b(log in|sign up|followers|following)\b/i.test(part))
    || snippet;

  const detail = sentence
    .replace(/\b(click|tap|watch|read more)\b.*$/i, "")
    .trim()
    .slice(0, 105);

  if (!detail || title.toLowerCase().includes(detail.toLowerCase().slice(0, 30))) return title;
  return `${title} - ${detail}`.slice(0, 150);
}

async function ensureTrendingTable(): Promise<void> {
  try {
    await db.execute(sql`
      create table if not exists trending_niches (
        id serial primary key,
        title text not null,
        search_query text not null,
        image_query text not null,
        hashtags text not null default '',
        content_angle text not null default '',
        region text not null default 'global',
        source text not null default 'live',
        score integer not null default 0,
        cached_at timestamp not null default now()
      )
    `);
    await db.execute(sql`
      create unique index if not exists trending_niches_title_region_idx
      on trending_niches (title, region)
    `);
  } catch (err) {
    logger.warn({ err }, "Could not ensure trending_niches table");
  }
}

async function readCachedTopics(count: number): Promise<TrendingTopic[]> {
  try {
    await ensureTrendingTable();
    const result = await db.execute(sql`
      select title, search_query, image_query, hashtags, content_angle, region, source, score
      from trending_niches
      where cached_at > now() - interval '6 hours'
      order by score desc, cached_at desc
      limit ${count}
    `);
    const rows = ((result as any).rows ?? []) as Array<Record<string, any>>;
    return rows.map((row) => ({
      title: row.title,
      searchQuery: row.search_query,
      imageQuery: row.image_query,
      hashtags: String(row.hashtags || "").split(" ").filter(Boolean),
      contentAngle: row.content_angle,
      region: row.region,
      source: row.source,
      score: row.score,
    }));
  } catch (err) {
    logger.warn({ err }, "Could not read cached trending niches");
    return [];
  }
}

async function saveTopics(topics: TrendingTopic[]): Promise<void> {
  if (topics.length === 0) return;
  try {
    await ensureTrendingTable();
    for (const topic of topics) {
      await db.execute(sql`
        insert into trending_niches
          (title, search_query, image_query, hashtags, content_angle, region, source, score, cached_at)
        values
          (${topic.title}, ${topic.searchQuery}, ${topic.imageQuery}, ${topic.hashtags.join(" ")},
           ${topic.contentAngle}, ${topic.region}, ${topic.source || "live"}, ${topic.score || 50}, now())
        on conflict (title, region) do update set
          search_query = excluded.search_query,
          image_query = excluded.image_query,
          hashtags = excluded.hashtags,
          content_angle = excluded.content_angle,
          source = excluded.source,
          score = excluded.score,
          cached_at = now()
      `);
    }
  } catch (err) {
    logger.warn({ err }, "Could not save trending niches");
  }
}

async function fetchFreeSearchResults(query: string): Promise<SearchResult[]> {
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

  const data = (await res.json()) as {
    results?: Array<{ title?: string; snippet?: string; url?: string; engine?: string }>;
  };

  return (data.results || [])
    .filter((item) => item.title)
    .map((item) => ({
      title: String(item.title),
      snippet: item.snippet,
      source: item.engine ? `free-search:${item.engine}` : "free-search",
      url: item.url,
    }));
}

async function fetchSerperResults(query: string): Promise<SearchResult[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) return [];

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "in", num: 8 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    news?: Array<{ title: string; snippet?: string; source?: string }>;
    organic?: Array<{ title: string; snippet?: string; source?: string }>;
  };
  return [...(data.news || []), ...(data.organic || [])];
}

async function fetchSerperNewsResults(query: string): Promise<SearchResult[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) return [];

  const res = await fetch("https://google.serper.dev/news", {
    method: "POST",
    headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "in", num: 8 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    news?: Array<{ title: string; snippet?: string; source?: string; link?: string }>;
  };
  return (data.news || []).map((item) => ({
    title: item.title,
    snippet: item.snippet,
    source: item.source ? `news:${item.source}` : "news",
    url: item.link,
  }));
}

async function fetchLiveTrending(niche?: string): Promise<TrendingTopic[]> {
  const queries = buildNicheQueries(niche || "");

  const batches = await Promise.all(queries.map(async (query) => {
    const news = isBroadDiscoveryNiche(niche) ? await fetchSerperNewsResults(query).catch(() => []) : [];
    const freeSearch = await fetchFreeSearchResults(query).catch((err) => {
      logger.warn({ err, query }, "Free-search provider failed");
      return [];
    });
    const serper = await fetchSerperResults(query).catch(() => []);

    return [...news, ...freeSearch, ...serper];
  }));

  const rawResults = batches.flat();

  const usableResults = rawResults.filter(isUsableSearchResult);

  const extracted = (await extractNicheTopics(usableResults, niche)).filter((topic) => topicMatchesNiche(topic, niche));
  if (extracted.length > 0) return extracted;

  // For live event niches, raw results may contain match data — use them directly
  if (niche && isLiveEventNiche(niche)) {
    const sportsTopics = sportsResultsToTopics(usableResults).filter((topic) => topicMatchesNiche(topic, niche));
    if (sportsTopics.length > 0) return sportsTopics;
  }

  if (isBroadDiscoveryNiche(niche)) {
    const rawTopics = rawResultsToTopics(usableResults, niche).filter((topic) => topicMatchesNiche(topic, niche));
    if (rawTopics.length > 0) return rawTopics;
  }

  const snippetTopics = snippetsToTopics(usableResults, niche).filter((topic) => topicMatchesNiche(topic, niche));
  if (snippetTopics.length > 0) return snippetTopics;

  return rawResultsToTopics(usableResults, niche).filter((topic) => topicMatchesNiche(topic, niche));
}

async function extractNicheTopics(
  results: Array<{ title: string; snippet?: string; source?: string }>,
  niche?: string,
): Promise<TrendingTopic[]> {
  if (results.length === 0) return [];
  const evidence = results
    .slice(0, 14)
    .map((item, index) => `${index + 1}. ${item.title}: ${item.snippet || ""}`)
    .join("\n");
  const broadDiscovery = isBroadDiscoveryNiche(niche);
  const accountContext = broadDiscovery ? DEFAULT_DISCOVERY_NICHE : niche || "not specified";
  const nicheContext = broadDiscovery
    ? `\nDISCOVERY MODE: Find any currently popular India-facing Instagram/Reels content angle supported by the evidence. Do not force sports, business, or any fixed niche.`
    : `\nCRITICAL: The account niche is "${niche}". ALL extracted topics MUST be directly relevant to this niche. Do NOT return unrelated niches like romance, love, or dating unless that IS the account niche.`;
  const liveEventRules = niche && isLiveEventNiche(niche) ? `
LIVE SPORTS RULES:
- Use the web evidence to identify the most recently completed/latest IPL or cricket match.
- If the niche says "today", "latest", "last match", or contains old team names, prioritize the latest completed match from evidence, not hardcoded teams.
- Return concrete match-insight topics using actual teams, result/score, key performers, turning point, pitch/toss context, or scorecard evidence when visible.
- Do NOT return generic topics like playing XI, powerplay battle, or fantasy picks unless they are tied to the actual latest match found in evidence.
- Do NOT invent teams, scores, venues, or results that are not visible in the evidence.
` : "";
  const prompt = `Extract 12 current Instagram content niches or micro-niches from this web-search evidence.
Account niche: ${accountContext}${nicheContext}${liveEventRules}

Rules:
- Return actual content angles, trend formats, or micro-niches, not article headlines.
- In discovery mode, cover whatever is genuinely popular in India from the evidence: creators, entertainment, food, fashion, tech, finance, travel, sports, memes, festivals, or public moments.
- If account niche is sports/cricket/IPL, ALL topics must be cricket or IPL match specific with real player/team names if visible in evidence.
- Avoid politics, scandals, celebrity gossip, and unrelated content unless the account niche explicitly needs it.
- Each contentAngle must explain WHY this angle matters for the account niche specifically.
- Each item must have title, contentAngle, searchQuery, imageQuery, region, hashtags.

Evidence:
${evidence}

Return valid JSON only:
{"topics":[{"title":"", "contentAngle":"", "searchQuery":"", "imageQuery":"", "region":"India", "hashtags":["#Tag"]}]}`;

  const parsed = await callJsonModel(prompt).catch(() => null);
  const topics = Array.isArray(parsed?.topics) ? parsed.topics : [];
  return topics
    .filter((item: any) => item?.title && item?.contentAngle)
    .slice(0, 12)
    .map((item: any, index: number) => ({
      title: cleanTitle(String(item.title)),
      searchQuery: String(item.searchQuery || `${item.title} Instagram creator niche trend`),
      imageQuery: String(item.imageQuery || `${item.title} authentic vertical lifestyle photo`),
      hashtags: normalizeHashtags(Array.isArray(item.hashtags) ? item.hashtags : [], String(item.title), String(item.contentAngle || ""), String(item.region || "India")),
      contentAngle: String(item.contentAngle),
      region: String(item.region || "India"),
      source: "web-extracted",
      score: 100 - index * 4,
    }));
}

function normalizeHashtags(modelTags: string[], title: string, context = "", region = "India"): string[] {
  const cleanedModelTags = modelTags
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .map((tag) => tag.startsWith("#") ? tag : `#${tag}`)
    .filter((tag) => {
      const word = tag.replace(/^#/, "").toLowerCase();
      return word.length > 2 && !HASHTAG_STOPWORDS.has(word);
    });

  const generated = hashtagsFromTitle(`${title} ${context}`, region);
  return [...new Set([...cleanedModelTags, ...generated])].slice(0, 10);
}

async function callJsonModel(prompt: string): Promise<any | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(18000),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      return JSON.parse(data.choices[0].message.content);
    }
  }

  const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&jsonMode=true`, {
    signal: AbortSignal.timeout(22000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

function sportsResultsToTopics(results: Array<{ title: string; snippet?: string; source?: string }>): TrendingTopic[] {
  const seen = new Set<string>();
  const resultSignals = /\b(result|results|scorecard|highlights|match report|won|beat|defeated|by \d+ (runs|wickets)|full score|latest|yesterday)\b/i;
  const livePenalty = /\b(live|watch live|stream|prediction|preview|today match)\b/i;

  return results
    .map((item) => {
      const combined = `${item.title}. ${item.snippet || ""}`.replace(/\s+/g, " ").trim();
      const title = cleanTitle(item.title);
      let score = 50;
      if (/\b(result|results|scorecard|match report)\b/i.test(title)) score += 35;
      if (resultSignals.test(combined)) score += 30;
      if (/\b(vs|v|beat|defeated)\b/i.test(combined)) score += 15;
      if (/\b(won by|beat|defeated)\b/i.test(combined)) score += 25;
      if (/\b(ipl|indian premier league|tata ipl)\b/i.test(combined)) score += 15;
      if (/\bwatch\b/i.test(title) && !/\b(result|scorecard|won|beat|defeated)\b/i.test(combined)) score -= 35;
      if (livePenalty.test(combined) && !/\b(result|scorecard|highlights|won|beat|defeated)\b/i.test(combined)) score -= 25;
      return { title, combined, score };
    })
    .filter(({ title, combined }) => {
      const lower = `${title} ${combined}`.toLowerCase();
      if (seen.has(lower) || title.length < 8) return false;
      seen.add(lower);
      return /\b(ipl|indian premier league|tata ipl|cricket|match|scorecard|highlights|won|beat|defeated|vs)\b/i.test(combined);
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ title, combined, score }, index) => ({
      title,
      searchQuery: `${title} IPL cricket result scorecard highlights analysis`,
      imageQuery: `${title} IPL cricket match players stadium photo`,
      hashtags: [...new Set(["#IPL", "#Cricket", "#T20", "#MatchResult", ...hashtagsFromTitle(title)])].slice(0, 8),
      contentAngle: `${combined.slice(0, 360)} Use this search evidence to explain the latest completed IPL match, key performers, scorecard turning point, and what fans should take away.`,
      region: "India",
      source: "web-result",
      score: score - index,
    }));
}

function snippetsToTopics(results: Array<{ title: string; snippet?: string; source?: string }>, niche?: string): TrendingTopic[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const result of results) {
    const snippet = result.snippet || "";
    const parts = snippet
      .replace(/[•·]/g, ".")
      .split(/(?:^|\s)(?:\d+\.|[A-Z]\.)\s*/g)
      .flatMap((part) => part.split(/\s[;|]\s/g))
      .map((part) => cleanTitle(part.replace(/\s+The\s.*$/i, "")))
      .filter((part) => part.length >= 6 && part.length <= 48);
    for (const part of parts) {
      const title = part.replace(/\.$/, "").trim();
      const lower = title.toLowerCase();
      if (seen.has(lower)) continue;
      if (/(views|youtube|complete|right now|highly profitable|niche ideas|start businesses|want to know)/i.test(title)) continue;
      seen.add(lower);
      candidates.push(title);
    }
  }

  return candidates.slice(0, 12).map((title, index) => {
    const sports = !!niche && isLiveEventNiche(niche);
    return {
      title,
      searchQuery: sports ? `${title} IPL cricket match result scorecard highlights analysis` : `${title} Instagram reels niche trend creator content`,
      imageQuery: sports ? `${title} IPL cricket match players stadium photo` : `${title} authentic vertical lifestyle photo`,
      hashtags: sports ? [...new Set(["#IPL", "#Cricket", "#T20", "#MatchResult", ...hashtagsFromTitle(title)])].slice(0, 8) : hashtagsFromTitle(title),
      contentAngle: sports
        ? `Use current search evidence about ${title} to explain the latest IPL match result, key performers, turning point, and what fans should learn from the scorecard.`
        : `Trending topic: ${title}. Use this as a fresh content angle for your niche.`,
      region: seedMarkets[index % seedMarkets.length],
      source: "web-snippet",
      score: 80 - index * 2,
    };
  });
}

function rawResultsToTopics(results: SearchResult[], niche?: string): TrendingTopic[] {
  const seen = new Set<string>();
  return results
    .map((item) => ({ item, title: buildDetailedTopicTitle(item), shortTitle: cleanTitle(item.title) }))
    .filter(({ title }) => {
      const lower = title.toLowerCase();
      if (title.length < 8 || seen.has(lower)) return false;
      seen.add(lower);
      return !/(maga|scandal|controversy|revealed|breaking|war|crime|killed|likes?,\s*\d+\s*comments?)/i.test(title);
    })
    .slice(0, 12)
    .map(({ item, title, shortTitle }, index) => {
      const sports = !!niche && isLiveEventNiche(niche);
      const context = cleanSnippet(item.snippet);
      return {
        title,
        searchQuery: sports ? `${shortTitle} IPL cricket match result scorecard highlights analysis` : `${shortTitle} ${context} India Instagram reels trend`,
        imageQuery: sports ? `${shortTitle} IPL cricket match players stadium photo` : `${shortTitle} ${context} current India real photo`,
        hashtags: sports ? [...new Set(["#IPL", "#Cricket", "#T20", "#MatchResult", ...hashtagsFromTitle(shortTitle)])].slice(0, 8) : normalizeHashtags([], shortTitle, context, "India"),
        contentAngle: sports
          ? `Latest match evidence around ${shortTitle}. Build an insight post from the result, scorecard, key player impact, and turning point.`
          : context || `Use this current India-facing trend as a specific content angle, explaining why audiences are reacting and what original post can be made from it.`,
        region: item.source?.includes("free-search") ? "India" : seedMarkets[index % seedMarkets.length],
        source: item.source || "web",
        score: 60 - index,
      };
    });
}

export async function getTrendingTopics(count = 8, niche?: string): Promise<TrendingTopic[]> {
  const nicheKey = isBroadDiscoveryNiche(niche) ? DEFAULT_DISCOVERY_NICHE : niche || "";
  if (cachedTopics && Date.now() - cacheTime < CACHE_TTL_MS && cacheNiche === nicheKey) {
    return [...cachedTopics].slice(0, count);
  }

  const live = (await fetchLiveTrending(niche).catch((err) => {
    logger.warn({ err }, "Live trending niche fetch failed");
    return [];
  })).filter((topic) => topicMatchesNiche(topic, niche));
  if (live.length > 0) await saveTopics(live);

  const cached = live.length > 0 || (niche && isLiveEventNiche(niche))
    ? []
    : (await readCachedTopics(count)).filter((topic) => topicMatchesNiche(topic, niche));
  const combined = [...live, ...cached];

  cachedTopics = combined;
  cacheTime = Date.now();
  cacheNiche = nicheKey;
  logger.info({ count: combined.length, live: live.length, cached: cached.length }, "Trending niches loaded");

  return combined.slice(0, count);
}

const recentlyUsedTitles: string[] = [];

export async function getOneTrendingTopic(niche?: string): Promise<TrendingTopic> {
  const topics = await getTrendingTopics(10, niche);
  const fresh = topics.filter((t) => !recentlyUsedTitles.includes(t.title));
  const pool = fresh.length > 0 ? fresh : topics;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  if (!selected && niche && isLiveEventNiche(niche)) {
    throw new Error("No live cricket/IPL match data found from search. Try again after search results update.");
  }
  if (!selected) {
    throw new Error("No live India Instagram trends found from search. Check SERPER_API_KEY or Google Search keys, then try again.");
  }
  recentlyUsedTitles.push(selected.title);
  if (recentlyUsedTitles.length > 5) recentlyUsedTitles.shift();
  return selected;
}
