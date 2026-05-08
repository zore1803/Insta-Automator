import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirs = [
  'C:/ROHIT/Projects/Content Automater/Content-Automator/lib',
  'C:/ROHIT/Projects/Content Automater/Content-Automator/scripts',
  'C:/ROHIT/Projects/Content Automater/Content-Automator/artifacts/api-server/src'
];

function walk(dir, callback) {
  if (dir.includes('node_modules') || dir.includes('.git')) return;
  fs.readdirSync(dir).forEach(file => {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      walk(filepath, callback);
    } else if (filepath.endsWith('.ts') && !filepath.endsWith('.d.ts')) {
      callback(filepath);
    }
  });
}

rootDirs.forEach(rootDir => {
  if (!fs.existsSync(rootDir)) return;
  walk(rootDir, filepath => {
    let content = fs.readFileSync(filepath, 'utf8');
    let changed = false;

    // Replace relative imports without extensions
    const regex = /(import|export)\s+([\s\S]*?)\s+from\s+['"](\.\.?\/[^'"]*?)['"]/g;
    
    content = content.replace(regex, (match, type, members, relPath) => {
      if (!relPath.endsWith('.js') && !relPath.endsWith('.json') && !relPath.endsWith('.css')) {
        const fullPath = path.resolve(path.dirname(filepath), relPath);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
           changed = true;
           return `${type} ${members} from "${relPath}/index.js"`;
        } else {
           changed = true;
           return `${type} ${members} from "${relPath}.js"`;
        }
      }
      return match;
    });

    if (changed) {
      console.log(`Fixed: ${filepath}`);
      fs.writeFileSync(filepath, content);
    }
  });
});
