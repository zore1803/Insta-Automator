import { db, configTable } from "../../lib/db/src/index.ts";
import "dotenv/config";

async function updateConfig() {
  console.log("Updating configuration in database...");
  
  const [existing] = await db.select().from(configTable).limit(1);
  
  const updateValues = {
    instagramAccountId: "1016941858178998",
    metaAccessToken: "EAAOCk2ozYHMBRX2U2v1coBhCFzZBKf1aOZBIPmM26fu7rVp7HzWddcy0FZCDWkCoOwaL4VHkyUDO5xc9oCgZCiIOpiUtHTx56NhHHdFg5DaCLlrKcVBtYsQOmWwxo7wPNZAUDT3p7UpMZA7TTfpX0UgfG8lks8r5sKTziK9EYaqST2S1DFW7YzBLYCZCrimEIZBOKozAgHM2ZAZBUvC2QhlXAImMUzYtHyte5KLqr5H4nySGLKAvDHRraUomohFKayOtxroL2yYImr78O0sjF2qbsBVgEx",
    updatedAt: new Date(),
  };

  if (!existing) {
    await db.insert(configTable).values({
      niche: "fitness",
      morningPostTime: "09:00",
      eveningPostTime: "18:00",
      language: "English",
      autoApprove: false,
      ...updateValues,
    });
    console.log("Configuration created.");
  } else {
    await db.update(configTable).set(updateValues);
    console.log("Configuration updated.");
  }
  
  process.exit(0);
}

updateConfig().catch(err => {
  console.error("Failed to update configuration:", err);
  process.exit(1);
});
