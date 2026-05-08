import sharp from "sharp";
import { Buffer } from "buffer";

async function test() {
  console.log("Testing sharp...");
  try {
    const buf = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .png()
    .toBuffer();
    console.log("Sharp success, buffer size:", buf.length);
  } catch (err) {
    console.error("Sharp failed:", err);
  }
}

test();
