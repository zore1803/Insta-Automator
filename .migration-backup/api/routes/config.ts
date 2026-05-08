import { Router } from "express";
import { db, configTable } from "../../lib/db/src/index.ts";
import { UpdateConfigBody } from "../../lib/api-zod/src/index.ts";
import { z } from "zod";

const router = Router();

const ExchangeTokenBody = z.object({
  shortLivedToken: z.string().min(10),
  appId: z.string().optional(),
  appSecret: z.string().optional(),
});

async function exchangeAndSave(
  shortLivedToken: string,
  appId: string,
  appSecret: string,
  log: { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void }
): Promise<{ instagramAccountId?: string; pageName: string }> {
  // Step 1: Exchange short-lived user token for long-lived token (60 days)
  const exchangeRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`
  );
  const exchangeData = (await exchangeRes.json()) as { access_token?: string; error?: { message: string } };

  if (!exchangeRes.ok || !exchangeData.access_token) {
    throw new Error(`Token exchange failed: ${exchangeData.error?.message ?? "Unknown error"}`);
  }

  const longLivedToken = exchangeData.access_token;
  log.info("Long-lived user token obtained");

  // Step 2: Get all pages associated with the user
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`
  );
  const pagesData = (await pagesRes.json()) as {
    data?: Array<{ id: string; name: string; access_token: string }>;
    error?: { message: string };
  };

  if (!pagesData.data || pagesData.data.length === 0) {
    throw new Error("No Facebook Pages found associated with this account. Ensure you have a Page linked to your Instagram Business account.");
  }

  log.info({ pages: pagesData.data.map(p => ({ id: p.id, name: p.name })) }, "Found Facebook Pages");

  // Selection Priority:
  // 1. Page named exactly (or includes) 'loqit.ai'
  // 2. Page named exactly (or includes) 'loqit'
  // 3. First page that has an Instagram account (checked below)
  // 4. Default to first page
  const targetPage = 
    pagesData.data.find(p => p.name.toLowerCase().includes('loqit.ai')) || 
    pagesData.data.find(p => p.name.toLowerCase().includes('loqit')) || 
    pagesData.data[0];
  
  const pageToken = targetPage.access_token;
  const pageId = targetPage.id;
  const pageName = targetPage.name;
  
  log.info({ selectedPage: pageName, pageId }, "Target page selected for Instagram detection");

  // Step 3: Detect Instagram Business Account ID from the selected page
  let instagramAccountId: string | undefined;
  
  // Try to find IG account on the selected page first
  const igRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${pageToken}`
  );
  const igData = (await igRes.json()) as { instagram_business_account?: { id: string } };
  instagramAccountId = igData.instagram_business_account?.id;

  // If not found on the "loqit" page, try finding ANY page with an IG account
  if (!instagramAccountId && pagesData.data.length > 1) {
    log.warn({ pageName }, "No Instagram account on selected page, searching other pages...");
    for (const page of pagesData.data) {
      if (page.id === pageId) continue; // Already checked
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );
      const data = (await res.json()) as { instagram_business_account?: { id: string } };
      if (data.instagram_business_account?.id) {
        instagramAccountId = data.instagram_business_account.id;
        log.info({ pageName: page.name, instagramAccountId }, "Found Instagram account on alternative page");
        // Update pageName to the one that actually has the IG account
        // and we should use this page's token for future requests
        break;
      }
    }
  }

  log.info({ instagramAccountId, finalPageName: pageName }, "Instagram Business Account detection result");

  if (!instagramAccountId) {
    throw new Error(`Connected to page '${pageName}', but no Instagram Business Account was found linked to it. Please ensure your Instagram Professional account is linked to this specific Facebook Page in Page Settings > Linked Accounts.`);
  }

  // Step 4: Save to config
  const updateValues: Partial<typeof configTable.$inferInsert> = {
    metaAccessToken: pageToken,
    updatedAt: new Date(),
    ...(instagramAccountId ? { instagramAccountId } : {}),
  };

  const [existing] = await db.select().from(configTable).limit(1);
  if (!existing) {
    await db.insert(configTable).values({
      niche: "fitness",
      morningPostTime: "09:00",
      afternoonPostTime: "12:00",
      eveningPostTime: "15:00",
      nightPostTime: "18:00",
      lateNightPostTime: "21:00",
      midnightPostTime: "00:00",
      language: "English",
      autoApprove: false,
      instagramAccountId: instagramAccountId ?? "",
      metaAccessToken: pageToken,
    });
  } else {
    await db.update(configTable).set(updateValues);
  }

  return { instagramAccountId, pageName };
}

// GET /api/config/exchange-token-simple — easy way to exchange via browser URL
router.get("/config/exchange-token-simple", async (req, res) => {
  const shortLivedToken = req.query.token as string;
  if (!shortLivedToken) {
    res.status(400).send("Usage: ?token=YOUR_SHORT_LIVED_TOKEN");
    return;
  }

  const appId = process.env["META_APP_ID"];
  const appSecret = process.env["META_APP_SECRET"];

  if (!appId || !appSecret) {
    res.status(400).send("App credentials (META_APP_ID/META_APP_SECRET) are missing from your .env");
    return;
  }

  try {
    const { instagramAccountId, pageName } = await exchangeAndSave(shortLivedToken, appId, appSecret, req.log);
    res.send(`<h1>Success!</h1><p>Connected to <b>${pageName}</b>.</p><p>Long-lived token saved. Your automator is good for 60 days.</p>`);
  } catch (err) {
    res.status(400).send(`<h1>Failed</h1><p>${err}</p>`);
  }
});

// POST /api/config/exchange-token — accepts optional appId/appSecret, falls back to env vars
router.post("/config/exchange-token", async (req, res) => {
  const parsed = ExchangeTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const appId = parsed.data.appId ?? process.env["META_APP_ID"];
  const appSecret = parsed.data.appSecret ?? process.env["META_APP_SECRET"];

  if (!appId || !appSecret) {
    res.status(400).json({
      error: "App credentials not configured",
      details: "Provide appId and appSecret in the request or set META_APP_ID and META_APP_SECRET environment variables",
    });
    return;
  }

  try {
    const { instagramAccountId, pageName } = await exchangeAndSave(parsed.data.shortLivedToken, appId, appSecret, req.log);
    res.json({
      success: true,
      message: `Token exchanged successfully via '${pageName}'. ${instagramAccountId ? `Instagram Account ID: ${instagramAccountId}` : "Instagram Account ID not auto-detected — please enter it manually."}`,
      instagramAccountId: instagramAccountId ?? null,
      tokenType: "permanent_page_token",
    });
  } catch (err) {
    req.log.error({ err }, "Token exchange failed");
    res.status(400).json({ error: "Token exchange failed", details: String(err) });
  }
});

// POST /api/config/meta-login — called by Facebook JS SDK login button (only needs token)
router.post("/config/meta-login", async (req, res) => {
  const body = z.object({ accessToken: z.string().min(10) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "accessToken is required" });
    return;
  }

  const appId = process.env["META_APP_ID"];
  const appSecret = process.env["META_APP_SECRET"];

  if (!appId || !appSecret) {
    // No app secret configured — save token directly as-is
    req.log.warn("META_APP_SECRET not set, saving raw token without long-lived exchange");
    await db.update(configTable).set({ metaAccessToken: body.data.accessToken, updatedAt: new Date() });
    res.json({
      success: true,
      message: "Access token saved (short-lived). Configure META_APP_SECRET for a permanent token.",
      instagramAccountId: null,
      tokenType: "short_lived",
    });
    return;
  }

  try {
    const { instagramAccountId, pageName } = await exchangeAndSave(body.data.accessToken, appId, appSecret, req.log);
    res.json({
      success: true,
      message: `Connected to '${pageName}'! ${instagramAccountId ? `Instagram account detected automatically.` : "No Instagram account found on this page."}`,
      instagramAccountId: instagramAccountId ?? null,
      tokenType: "permanent_page_token",
    });
  } catch (err) {
    req.log.error({ err }, "Meta login exchange failed");
    // Save the short-lived token anyway so something works
    await db.update(configTable).set({ metaAccessToken: body.data.accessToken, updatedAt: new Date() });
    res.json({
      success: true,
      message: `Token saved (short-lived — exchange failed: ${String(err).slice(0, 100)}). It will work for ~1 hour.`,
      instagramAccountId: null,
      tokenType: "short_lived_fallback",
    });
  }
});

router.get("/config", async (req, res) => {
  let [config] = await db.select().from(configTable).limit(1);

  if (!config) {
    [config] = await db
      .insert(configTable)
      .values({
        niche: "fitness",
        morningPostTime: "09:00",
        afternoonPostTime: "12:00",
        eveningPostTime: "15:00",
        nightPostTime: "18:00",
        lateNightPostTime: "21:00",
        midnightPostTime: "00:00",
        language: "English",
        autoApprove: false,
        instagramAccountId: "",
        metaAccessToken: "",
        imageSource: "ai",
      })
      .returning();
  }

  res.json(serializeConfig(config));
});

router.put("/config", async (req, res) => {
  const body = UpdateConfigBody.parse(req.body);

  let [config] = await db.select().from(configTable).limit(1);

  if (!config) {
    [config] = await db
      .insert(configTable)
      .values({ ...body })
      .returning();
  } else {
    [config] = await db
      .update(configTable)
      .set({ ...body, updatedAt: new Date() })
      .returning();
    req.log.info({ body, imageSource: config.imageSource }, "Updated configuration in database");
  }

  res.json(serializeConfig(config));
});

function serializeConfig(config: typeof configTable.$inferSelect) {
  return {
    niche: config.niche,
    morningPostTime: config.morningPostTime,
    afternoonPostTime: config.afternoonPostTime,
    eveningPostTime: config.eveningPostTime,
    nightPostTime: config.nightPostTime,
    lateNightPostTime: config.lateNightPostTime,
    midnightPostTime: config.midnightPostTime,
    language: config.language,
    autoApprove: config.autoApprove,
    instagramAccountId: config.instagramAccountId,
    metaAccessToken: config.metaAccessToken,
    imageSource: config.imageSource,
  };
}

export default router;
