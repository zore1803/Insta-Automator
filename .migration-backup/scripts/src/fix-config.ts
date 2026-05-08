import { db, configTable } from "@workspace/db";

async function fixNiche() {
  console.log("Fixing niche and post times in database...");
  const [existing] = await db.select().from(configTable).limit(1);
  
  const updateData = {
    niche: "AI News, Tech Trends, and Software Discoveries",
    morningPostTime: "09:00",
    afternoonPostTime: "12:00",
    eveningPostTime: "15:00",
    nightPostTime: "18:00",
    lateNightPostTime: "21:00",
    midnightPostTime: "00:00",
  };

  if (existing) {
    await db.update(configTable).set(updateData);
    console.log("Database updated successfully!");
  } else {
    await db.insert(configTable).values(updateData);
    console.log("Config created successfully!");
  }
  process.exit(0);
}

fixNiche().catch(err => {
  console.error(err);
  process.exit(1);
});
