import { generateInstagramContent } from "../../artifacts/api-server/src/services/claudeService.js";
import { generatePostImage } from "../../artifacts/api-server/src/services/dalleService.js";

async function test() {
  console.log("🚀 Starting Test Generation (Gemini + DALL-E)...");
  
  try {
    console.log("📝 Step 1: Generating content with Gemini...");
    const content = await generateInstagramContent("Luxury Travel", "English");
    console.log("✅ Content Generated:");
    console.log(JSON.stringify(content, null, 2));

    console.log("\n🎨 Step 2: Generating image with DALL-E...");
    const imageUrl = await generatePostImage(content.imagePrompt);
    console.log("✅ Image Generated and saved at:", imageUrl);
    
    console.log("\n✨ Success! The automation engine is working perfectly.");
    console.log("Next: Go to the Settings page and connect your Meta account to enable posting.");
  } catch (err) {
    console.error("❌ Test failed:", err);
  } finally {
    process.exit(0);
  }
}

test();
