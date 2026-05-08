import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

async function listModels() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
    return;
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    // There isn't a direct listModels in the client library that I recall easily without looking at docs, 
    // but I can try a very simple generate with 'gemini-pro'
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent("test");
    console.log("Gemini Pro works!");
  } catch (err) {
    console.error("Gemini Pro failed:", err);
  }
}

listModels();
