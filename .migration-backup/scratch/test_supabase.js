import { supabase } from "../lib/supabase/src/index.js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

async function test() {
  console.log("Testing Supabase Storage...");
  const BUCKET_NAME = "post-images";
  
  const { data: buckets, error: bError } = await supabase.storage.listBuckets();
  if (bError) {
    console.error("Failed to list buckets:", bError);
    return;
  }
  console.log("Buckets:", buckets.map(b => b.name));

  const content = Buffer.from("test connection");
  const filename = `test-${Date.now()}.txt`;
  
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filename, content, { contentType: "text/plain" });

  if (error) {
    console.error("Upload failed:", error);
  } else {
    console.log("Upload success:", data);
    const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filename);
    console.log("Public URL:", publicUrl);
  }
}

test().catch(console.error);
