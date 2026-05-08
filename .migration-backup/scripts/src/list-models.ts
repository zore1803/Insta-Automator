import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

async function listAllModels() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return;
  
  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    // We can't easily list models with this client library, but we can try common names.
    // I'll try 'gemini-1.5-flash' again but maybe with a different approach.
    // Actually, I'll try to use the REST API directly to see what's happening.
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

listAllModels();
