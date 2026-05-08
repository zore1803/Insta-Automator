import { spawn } from 'child_process';
import path from 'path';

import fs from 'fs';

const apiServerDir = path.join(import.meta.dirname, '..', '..', 'artifacts', 'api-server');
const frontendDir = path.join(import.meta.dirname, '..', '..', 'artifacts', 'instagram-tool');

// Parse .env manually
const envPath = path.join(import.meta.dirname, '..', '..', '.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
const parsedEnv = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    parsedEnv[match[1]] = match[2] ? match[2].trim() : '';
  }
});

const mergedEnv = { ...process.env, ...parsedEnv };

function runProcess(name, command, args, cwd) {
  console.log(`Starting ${name}...`);
  const proc = spawn(command, args, { cwd, shell: true, stdio: 'inherit', env: mergedEnv });
  
  proc.on('close', (code) => {
    console.log(`${name} exited with code ${code}`);
  });
  
  return proc;
}

runProcess('API Server', 'npm', ['run', 'dev'], apiServerDir);
runProcess('Frontend', 'npm', ['run', 'dev'], frontendDir);

console.log("Both servers started in parallel!");
