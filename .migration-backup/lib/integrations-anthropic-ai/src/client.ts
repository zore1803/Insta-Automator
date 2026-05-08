import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";

if (!apiKey) {
  throw new Error(
    "Anthropic API Key must be set (AI_INTEGRATIONS_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY).",
  );
}

export const anthropic = new Anthropic({
  apiKey,
  baseURL,
});
