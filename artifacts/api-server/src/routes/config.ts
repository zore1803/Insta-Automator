import { Router } from "express";
import { db, configTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const ExchangeTokenBody = z.object({
  shortLivedToken: z.string().min(10),
  appId: z.string().optional(),
  appSecret: z.string().optional(),
});

const UpdateConfigBody = z.object({
  niche: z.string().optional(),
  morningPostTime: z.string().optional(),
  afternoonPostTime: z.string().optional(),
  eveningPostTime: z.string().optional(),
  nightPostTime: z.string().optional(),
  lateNightPostTime: z.string().optional(),
  midnightPostTime: z.string().optional(),
  language: z.string().optional(),
  autoApprove: z.boolean().optional(),
  instagramAccountId: z.string().optional(),
  metaAccessToken: z.string().optional(),
  imageSource: z.enum(["ai", "search"]).optional(),
});

function isLegacyDefaultNiche(niche: string): boolean {
  const value = niche.toLowerCase();
  return value === "fitness" || value.includes("tamil nadu business");
}

async function exchangeAndSave(
  shortLivedToken: string,
  appId: string,
  appSecret: string,
  log: { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void },
): Promise<{ instagramAccountId?: string; pageName: string }> {
  const exchangeRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`,
  );
  const exchangeData = (await exchangeRes.json()) as { access_token?: string; error?: { message: string } };

  if (!exchangeRes.ok || !exchangeData.access_token) {
    throw new Error(`Token exchange failed: ${exchangeData.error?.message ?? "Unknown error"}`);
  }

  const longLivedToken = exchangeData.access_token;
  log.info("Long-lived user token obtained");

  const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`);
  const pagesData = (await pagesRes.json()) as {
    data?: Array<{ id: string; name: string; access_token: string }>;
    error?: { message: string };
  };

  if (!pagesData.data || pagesData.data.length === 0) {
    throw new Error("No Facebook Pages found associated with this account.");
  }

  const targetPage = pagesData.data[0];
  const pageToken = targetPage.access_token;
  const pageId = targetPage.id;
  const pageName = targetPage.name;

  let instagramAccountId: string | undefined;
  const igRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${pageToken}`,
  );
  const igData = (await igRes.json()) as { instagram_business_account?: { id: string } };
  instagramAccountId = igData.instagram_business_account?.id;

  if (!instagramAccountId && pagesData.data.length > 1) {
    for (const page of pagesData.data) {
      if (page.id === pageId) continue;
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`,
      );
      const data = (await res.json()) as { instagram_business_account?: { id: string } };
      if (data.instagram_business_account?.id) {
        instagramAccountId = data.instagram_business_account.id;
        break;
      }
    }
  }

  if (!instagramAccountId) {
    throw new Error(`Connected to page '${pageName}', but no Instagram Business Account was found linked to it.`);
  }

  const updateValues: Partial<typeof configTable.$inferInsert> = {
    metaAccessToken: pageToken,
    updatedAt: new Date(),
    ...(instagramAccountId ? { instagramAccountId } : {}),
  };

  const [existing] = await db.select().from(configTable).limit(1);
  if (!existing) {
    await db.insert(configTable).values({
      niche: "India Instagram trends",
      morningPostTime: "08:00",
      afternoonPostTime: "12:00",
      eveningPostTime: "16:00",
      nightPostTime: "20:00",
      lateNightPostTime: "21:00",
      midnightPostTime: "22:00",
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

// ─── Direct Credentials Save ──────────────────────────────────────────────────
// Allows user to paste Instagram Account ID + Access Token directly
router.post("/config/save-credentials", async (req, res) => {
  const body = z
    .object({
      instagramAccountId: z.string().min(5),
      accessToken: z.string().min(10),
    })
    .safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: "Both instagramAccountId and accessToken are required." });
    return;
  }

  const { instagramAccountId, accessToken } = body.data;

  // Verify the token works by calling the IG Graph API
  let tokenInfo: { tokenType: string; expiresIn?: number } = { tokenType: "unknown" };
  try {
    const debugRes = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${accessToken}`,
    );
    const debugData = (await debugRes.json()) as {
      data?: { type: string; expires_at?: number; is_valid?: boolean; error?: { message: string } };
    };
    if (debugData?.data?.is_valid === false) {
      res.status(400).json({ error: `Token is invalid: ${debugData.data?.error?.message || "Unknown error"}` });
      return;
    }
    if (debugData?.data) {
      const expiresAt = debugData.data.expires_at;
      tokenInfo = {
        tokenType: debugData.data.type || "unknown",
        expiresIn: expiresAt && expiresAt > 0 ? Math.round((expiresAt * 1000 - Date.now()) / (1000 * 60 * 60 * 24)) : undefined,
      };
    }
  } catch (err) {
    // If debug call fails, still save (token might be a system token)
    req.log.warn({ err }, "Token debug failed — saving anyway");
  }

  const [existing] = await db.select().from(configTable).limit(1);
  if (!existing) {
    await db.insert(configTable).values({
      niche: "India Instagram trends",
      morningPostTime: "08:00",
      afternoonPostTime: "12:00",
      eveningPostTime: "16:00",
      nightPostTime: "20:00",
      lateNightPostTime: "21:00",
      midnightPostTime: "22:00",
      language: "English",
      autoApprove: false,
      instagramAccountId,
      metaAccessToken: accessToken,
    });
  } else {
    await db.update(configTable).set({ instagramAccountId, metaAccessToken: accessToken, updatedAt: new Date() });
  }

  req.log.info({ instagramAccountId, tokenType: tokenInfo.tokenType }, "Credentials saved directly");

  res.json({
    success: true,
    message: tokenInfo.expiresIn
      ? `Connected! Token expires in ~${tokenInfo.expiresIn} days.`
      : "Credentials saved successfully. Ready to post!",
    instagramAccountId,
    tokenType: tokenInfo.tokenType,
    expiresInDays: tokenInfo.expiresIn ?? null,
  });
});

// ─── Token Refresh (extend long-lived token) ──────────────────────────────────
router.post("/config/refresh-token", async (req, res) => {
  const appId = process.env["META_APP_ID"];
  const appSecret = process.env["META_APP_SECRET"];

  const [config] = await db.select().from(configTable).limit(1);
  if (!config?.metaAccessToken) {
    res.status(400).json({ error: "No token configured. Connect your account first." });
    return;
  }

  if (!appId || !appSecret) {
    // Try to debug the existing token lifespan
    try {
      const debugRes = await fetch(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${config.metaAccessToken}&access_token=${config.metaAccessToken}`,
      );
      const debugData = (await debugRes.json()) as {
        data?: { type: string; expires_at?: number; is_valid?: boolean };
      };
      const expiresAt = debugData?.data?.expires_at;
      const daysLeft = expiresAt && expiresAt > 0
        ? Math.round((expiresAt * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      res.json({
        success: false,
        message: "META_APP_SECRET not configured — cannot refresh. Add META_APP_SECRET to Secrets to enable refresh.",
        tokenIsValid: debugData?.data?.is_valid ?? null,
        expiresInDays: daysLeft,
        tokenType: debugData?.data?.type ?? null,
      });
    } catch {
      res.json({
        success: false,
        message: "META_APP_SECRET not configured — cannot refresh. Add it to Secrets to enable refresh.",
      });
    }
    return;
  }

  try {
    // Exchange current token for new long-lived token (extends ~60 days)
    const exchangeRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${config.metaAccessToken}`,
    );
    const exchangeData = (await exchangeRes.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message: string };
    };

    if (!exchangeRes.ok || !exchangeData.access_token) {
      res.status(400).json({
        success: false,
        error: `Refresh failed: ${exchangeData.error?.message ?? "Unknown error"}`,
      });
      return;
    }

    const newToken = exchangeData.access_token;
    const expiresInSec = exchangeData.expires_in;
    const expiresInDays = expiresInSec ? Math.round(expiresInSec / 86400) : 60;

    await db.update(configTable).set({ metaAccessToken: newToken, updatedAt: new Date() });

    req.log.info({ expiresInDays }, "Token refreshed successfully");
    res.json({
      success: true,
      message: `Token refreshed! New token valid for ~${expiresInDays} days.`,
      expiresInDays,
    });
  } catch (err) {
    req.log.error({ err }, "Token refresh failed");
    res.status(500).json({ success: false, error: `Refresh failed: ${String(err)}` });
  }
});

// ─── Token Debug (check expiry/validity) ─────────────────────────────────────
router.get("/config/token-status", async (req, res) => {
  const [config] = await db.select().from(configTable).limit(1);
  if (!config?.metaAccessToken) {
    res.json({ hasToken: false, isValid: false, message: "No token configured." });
    return;
  }

  try {
    const debugRes = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${config.metaAccessToken}&access_token=${config.metaAccessToken}`,
    );
    const debugData = (await debugRes.json()) as {
      data?: { type: string; expires_at?: number; is_valid?: boolean; app_id?: string };
      error?: { message: string };
    };

    const expiresAt = debugData?.data?.expires_at;
    const isNeverExpires = expiresAt === 0 || expiresAt === undefined;
    const daysLeft = !isNeverExpires && expiresAt
      ? Math.round((expiresAt * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    res.json({
      hasToken: true,
      isValid: debugData?.data?.is_valid ?? false,
      tokenType: debugData?.data?.type ?? "unknown",
      expiresInDays: daysLeft,
      neverExpires: isNeverExpires,
      message: debugData?.data?.is_valid === false
        ? "Token is expired or invalid — please reconnect."
        : isNeverExpires
        ? "Page token — never expires as long as your Facebook account is active."
        : daysLeft !== null && daysLeft < 7
        ? `Warning: Token expires in ${daysLeft} days. Please refresh now!`
        : daysLeft !== null
        ? `Token valid for ${daysLeft} more days.`
        : "Token appears valid.",
    });
  } catch (err) {
    res.json({
      hasToken: true,
      isValid: null,
      message: "Could not verify token status.",
      error: String(err),
    });
  }
});

router.get("/config/exchange-token-simple", async (req, res) => {
  const shortLivedToken = req.query.token as string;
  if (!shortLivedToken) {
    res.status(400).send("Usage: ?token=YOUR_SHORT_LIVED_TOKEN");
    return;
  }

  const appId = process.env["META_APP_ID"];
  const appSecret = process.env["META_APP_SECRET"];

  if (!appId || !appSecret) {
    res.status(400).send("App credentials (META_APP_ID/META_APP_SECRET) are missing");
    return;
  }

  try {
    const { instagramAccountId, pageName } = await exchangeAndSave(shortLivedToken, appId, appSecret, req.log);
    res.send(`<h1>Success!</h1><p>Connected to <b>${pageName}</b>.</p>`);
  } catch (err) {
    res.status(400).send(`<h1>Failed</h1><p>${err}</p>`);
  }
});

router.post("/config/exchange-token", async (req, res) => {
  const parsed = ExchangeTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const appId = parsed.data.appId ?? process.env["META_APP_ID"];
  const appSecret = parsed.data.appSecret ?? process.env["META_APP_SECRET"];

  if (!appId || !appSecret) {
    res.status(400).json({ error: "App credentials not configured" });
    return;
  }

  try {
    const { instagramAccountId, pageName } = await exchangeAndSave(
      parsed.data.shortLivedToken,
      appId,
      appSecret,
      req.log,
    );
    res.json({
      success: true,
      message: `Token exchanged via '${pageName}'.`,
      instagramAccountId: instagramAccountId ?? null,
      tokenType: "permanent_page_token",
    });
  } catch (err) {
    req.log.error({ err }, "Token exchange failed");
    res.status(400).json({ error: "Token exchange failed", details: String(err) });
  }
});

router.post("/config/meta-login", async (req, res) => {
  const body = z.object({ accessToken: z.string().min(10) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "accessToken is required" });
    return;
  }

  const appId = process.env["META_APP_ID"];
  const appSecret = process.env["META_APP_SECRET"];

  if (!appId || !appSecret) {
    await db.update(configTable).set({ metaAccessToken: body.data.accessToken, updatedAt: new Date() });
    res.json({
      success: true,
      message: "Access token saved. Configure META_APP_SECRET for a permanent token.",
      instagramAccountId: null,
      tokenType: "short_lived",
    });
    return;
  }

  try {
    const { instagramAccountId, pageName } = await exchangeAndSave(body.data.accessToken, appId, appSecret, req.log);
    res.json({
      success: true,
      message: `Connected to '${pageName}'!`,
      instagramAccountId: instagramAccountId ?? null,
      tokenType: "permanent_page_token",
    });
  } catch (err) {
    req.log.error({ err }, "Meta login exchange failed");
    await db.update(configTable).set({ metaAccessToken: body.data.accessToken, updatedAt: new Date() });
    res.json({
      success: true,
      message: `Token saved (short-lived — exchange failed). Will work for ~1 hour.`,
      instagramAccountId: null,
      tokenType: "short_lived_fallback",
    });
  }
});

router.post("/config/disconnect-meta", async (req, res) => {
  const [existing] = await db.select().from(configTable).limit(1);
  if (!existing) {
    res.json({ success: true, message: "Already disconnected." });
    return;
  }
  await db.update(configTable).set({ metaAccessToken: "", instagramAccountId: "", updatedAt: new Date() });
  res.json({ success: true, message: "Disconnected from Meta/Instagram." });
});

router.get("/config", async (req, res) => {
  let [config] = await db.select().from(configTable).limit(1);

  if (!config) {
    [config] = await db
      .insert(configTable)
      .values({
        niche: "India Instagram trends",
        morningPostTime: "08:00",
        afternoonPostTime: "12:00",
        eveningPostTime: "16:00",
        nightPostTime: "20:00",
        lateNightPostTime: "21:00",
        midnightPostTime: "22:00",
        language: "English",
        autoApprove: false,
        instagramAccountId: "",
        metaAccessToken: "",
        imageSource: "search",
      })
      .returning();
  } else if (isLegacyDefaultNiche(config.niche)) {
    [config] = await db
      .update(configTable)
      .set({ niche: "India Instagram trends", imageSource: "search", updatedAt: new Date() })
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
      .values({
        ...body,
        niche: body.niche || "India Instagram trends",
        morningPostTime: body.morningPostTime || "08:00",
        afternoonPostTime: body.afternoonPostTime || "12:00",
        eveningPostTime: body.eveningPostTime || "16:00",
        nightPostTime: body.nightPostTime || "20:00",
        lateNightPostTime: body.lateNightPostTime || "21:00",
        midnightPostTime: body.midnightPostTime || "22:00",
        language: body.language || "English",
        autoApprove: body.autoApprove ?? false,
        instagramAccountId: body.instagramAccountId || "",
        metaAccessToken: body.metaAccessToken || "",
        imageSource: body.imageSource || "search",
      })
      .returning();
  } else {
    [config] = await db
      .update(configTable)
      .set({ ...body, updatedAt: new Date() })
      .returning();
  }

  req.log.info({ body }, "Updated configuration");
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

router.get("/config/ai-provider", (_req, res) => {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  res.json({
    textModel: hasOpenAI ? "gpt-4o" : "pollinations",
    imageModel: hasOpenAI ? "dall-e-3" : "pollinations-flux",
    openaiConfigured: hasOpenAI,
  });
});

export default router;
