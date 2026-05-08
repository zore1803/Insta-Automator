import { logger } from "../lib/logger.js";

export interface TrendingTopic {
  title: string;
  searchQuery: string;
  imageQuery: string;
  hashtags: string[];
  contentAngle: string;
  region: string;
}

// Cache so we don't spam APIs
let cachedTopics: TrendingTopic[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

// ── Curated viral Indian topics — May 2026 ────────────────────────────────────
// These rotate based on time to keep content fresh and different every post
const CURATED_VIRAL_TOPICS: TrendingTopic[] = [
  {
    title: "Maharashtra-Bihar Conflict",
    searchQuery: "Maharashtra Bihar people conflict protest Maharashtra 2025",
    imageQuery: "Maharashtra Bihar protest crowd Mumbai rally 2025 news",
    hashtags: ["#Maharashtra", "#Mumbai", "#BiharVsMaharashtra", "#MaharashtraNews", "#Controversy"],
    contentAngle: "Marathi-Bihar political and cultural tensions — who's right, what actually happened",
    region: "Maharashtra",
  },
  {
    title: "IPL 2025 Cricket",
    searchQuery: "IPL 2025 cricket match India stadium",
    imageQuery: "IPL 2025 cricket stadium crowd celebration India",
    hashtags: ["#IPL2025", "#Cricket", "#IPL", "#IndianCricket", "#T20"],
    contentAngle: "IPL 2025 — business lessons from cricket teams that keep winning",
    region: "India",
  },
  {
    title: "Tamil Nadu Elections",
    searchQuery: "Tamil Nadu local body elections 2025 vote campaign",
    imageQuery: "Tamil Nadu election campaign rally voting booth 2025",
    hashtags: ["#TamilNadu", "#TNElections", "#Elections2025", "#Democracy", "#Vote"],
    contentAngle: "Tamil Nadu election season — what voters need to know and why your vote matters",
    region: "Tamil Nadu",
  },
  {
    title: "Mumbai Real Estate Boom",
    searchQuery: "Mumbai real estate property prices 2025 luxury apartments",
    imageQuery: "Mumbai skyline luxury apartments construction 2025",
    hashtags: ["#Mumbai", "#RealEstate", "#MumbaiProperty", "#Investment", "#Maharashtra"],
    contentAngle: "Mumbai property prices hitting all-time highs — where to invest in 2025",
    region: "Maharashtra",
  },
  {
    title: "Startup India Funding 2025",
    searchQuery: "India startup funding 2025 unicorn entrepreneur",
    imageQuery: "Indian startup entrepreneur office pitch funding 2025",
    hashtags: ["#StartupIndia", "#IndianStartup", "#Entrepreneur", "#Funding", "#Innovation"],
    contentAngle: "Indian startups raising record funding in 2025 — the sectors that are exploding",
    region: "India",
  },
  {
    title: "India vs Pakistan Cricket",
    searchQuery: "India Pakistan cricket match 2025 rivalry",
    imageQuery: "India Pakistan cricket match fans stadium atmosphere 2025",
    hashtags: ["#INDvsPAK", "#Cricket", "#IndiaVsPakistan", "#WorldCup", "#CricketFever"],
    contentAngle: "When cricket becomes more than a game — the India-Pakistan rivalry explained",
    region: "India",
  },
  {
    title: "Maharashtra Language Politics",
    searchQuery: "Marathi language controversy Maharashtra politics 2025",
    imageQuery: "Mumbai Marathi language protest Maha Vikas Aghadi 2025",
    hashtags: ["#Marathi", "#Maharashtra", "#MumbaiPolitics", "#MarathiManoos", "#LanguageRights"],
    contentAngle: "The Marathi vs Hindi debate heating up in Mumbai — facts, opinions, truth",
    region: "Maharashtra",
  },
  {
    title: "Indian Youth Unemployment",
    searchQuery: "India youth unemployment jobs 2025 graduates",
    imageQuery: "Indian youth job seekers graduation unemployment 2025",
    hashtags: ["#IndianYouth", "#Unemployment", "#Jobs2025", "#CareerIndia", "#Opportunity"],
    contentAngle: "India has 65% youth population — but are there enough jobs? The hard truth",
    region: "India",
  },
  {
    title: "Bollywood Controversy",
    searchQuery: "Bollywood latest controversy actor 2025",
    imageQuery: "Bollywood actor celebrity Mumbai industry news 2025",
    hashtags: ["#Bollywood", "#BollywoodNews", "#Controversy", "#EntertainmentNews", "#Mumbai"],
    contentAngle: "Bollywood drama that broke the internet this week — what actually happened",
    region: "India",
  },
  {
    title: "Pune IT Boom",
    searchQuery: "Pune IT sector technology jobs growth 2025",
    imageQuery: "Pune IT park technology company office startup 2025",
    hashtags: ["#Pune", "#PuneIT", "#TechJobs", "#SoftwareEngineer", "#Maharashtra"],
    contentAngle: "Pune is quietly becoming India's tech capital — why companies are choosing it over Bangalore",
    region: "Maharashtra",
  },
  {
    title: "India Digital Payments",
    searchQuery: "India UPI digital payments 2025 record",
    imageQuery: "India UPI payment QR code digital transaction 2025",
    hashtags: ["#UPI", "#DigitalIndia", "#Fintech", "#Payments", "#IndiaGrowth"],
    contentAngle: "India processes more digital payments than entire Europe — here's what that means",
    region: "India",
  },
  {
    title: "Inflation Food Prices India",
    searchQuery: "India inflation food prices vegetables 2025",
    imageQuery: "India vegetable market inflation prices 2025 crowd",
    hashtags: ["#Inflation", "#FoodPrices", "#India", "#Economy", "#CostOfLiving"],
    contentAngle: "Tomatoes at ₹80/kg again — inflation hits middle class hardest in 2025",
    region: "India",
  },
];

// ── Try fetching live trending from Serper ─────────────────────────────────────
async function fetchLiveTrending(): Promise<TrendingTopic[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) return [];

  try {
    const searches = [
      "Maharashtra Bihar controversy 2025",
      "India trending news today viral",
      "instagram viral india today",
    ];

    const results: TrendingTopic[] = [];

    for (const q of searches) {
      const res = await fetch("https://google.serper.dev/news", {
        method: "POST",
        headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q, gl: "in", num: 5 }),
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) continue;

      const data = (await res.json()) as {
        news?: Array<{ title: string; snippet?: string; source?: string }>;
      };

      for (const item of data.news?.slice(0, 2) || []) {
        if (!item.title) continue;
        const words = item.title.split(" ").slice(0, 5).join(" ");
        results.push({
          title: item.title.slice(0, 80),
          searchQuery: `${words} India 2025 news photo`,
          imageQuery: `${words} India real photo news`,
          hashtags: ["#India", "#Trending", "#News", "#Viral"],
          contentAngle: item.snippet || item.title,
          region: "India",
        });
      }
    }

    return results;
  } catch (err) {
    logger.warn({ err }, "Live trending fetch failed");
    return [];
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function getTrendingTopics(count = 3): Promise<TrendingTopic[]> {
  // Return cached if fresh
  if (cachedTopics && Date.now() - cacheTime < CACHE_TTL_MS) {
    const shuffled = [...cachedTopics].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  // Try live trending first
  const live = await fetchLiveTrending();

  // Combine live + curated
  const combined = [...live, ...CURATED_VIRAL_TOPICS];

  cachedTopics = combined;
  cacheTime = Date.now();

  logger.info({ count: combined.length, live: live.length }, "Trending topics loaded");

  // Return a time-seeded mix so every call gets different topics
  const seed = Math.floor(Date.now() / (10 * 60 * 1000)); // changes every 10 min
  const rotated = combined.slice(seed % combined.length).concat(combined.slice(0, seed % combined.length));
  return rotated.slice(0, count);
}

export async function getOneTrendingTopic(): Promise<TrendingTopic> {
  const topics = await getTrendingTopics(5);
  const idx = Math.floor(Date.now() / (15 * 60 * 1000)) % topics.length;
  return topics[idx];
}
