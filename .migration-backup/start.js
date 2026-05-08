import { config } from "dotenv";
import { spawn } from "child_process";
import { resolve } from "path";

// Load .env from root
config({ path: resolve(import.meta.dirname, ".env") });

console.log("✅ Environment loaded");
console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? "SET" : "MISSING"}`);
console.log(`   PORT: ${process.env.PORT}`);
console.log(`   API_PORT: ${process.env.API_PORT}`);

// Start API server
const api = spawn("tsx", ["api/index.ts"], {
  cwd: resolve(import.meta.dirname),
  env: process.env,
  stdio: "inherit",
  shell: true,
});

// Start frontend dev server
const frontend = spawn("npx", ["vite", "--host", "0.0.0.0"], {
  cwd: resolve(import.meta.dirname),
  env: process.env,
  stdio: "inherit",
  shell: true,
});

process.on("SIGINT", () => {
  api.kill();
  frontend.kill();
  process.exit(0);
});

api.on("exit", (code) => {
  console.log(`API server exited with code ${code}`);
});

frontend.on("exit", (code) => {
  console.log(`Frontend exited with code ${code}`);
});
