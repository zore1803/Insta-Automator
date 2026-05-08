import OpenAI from "openai";

const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";

if (!apiKey) {
  throw new Error(
    "OpenAI API Key must be set (AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY).",
  );
}

export const openai = new OpenAI({
  apiKey,
  baseURL,
});
