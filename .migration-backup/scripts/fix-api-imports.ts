import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, '..');

const targets = [
  path.resolve(root, 'lib', 'api-client-react', 'src', 'generated'),
  path.resolve(root, 'lib', 'api-zod', 'src', 'generated')
];

function fixImports(dir: string) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      fixImports(filePath);
      continue;
    }

    if (!file.endsWith('.ts')) continue;

    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Fix imports starting with ./ or ../ and NOT ending with .js or .css or .json
    const newContent = content.replace(
      /from\s+(['"])(\.\.?\/[^'"]+)(['"])/g,
      (match, quote, importPath, endQuote) => {
        if (importPath.endsWith('.js') || importPath.endsWith('.css') || importPath.endsWith('.json')) {
          return match;
        }
        changed = true;
        return `from ${quote}${importPath}.js${endQuote}`;
      }
    );

    if (changed) {
      fs.writeFileSync(filePath, newContent);
      console.log(`Fixed imports in ${filePath}`);
    }
  }
}

for (const target of targets) {
  console.log(`Fixing imports in ${target}...`);
  fixImports(target);
}
