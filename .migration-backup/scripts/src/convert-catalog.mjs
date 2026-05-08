import * as fs from 'fs';
import * as path from 'path';
const workspaceYaml = fs.readFileSync('pnpm-workspace.yaml', 'utf8');

const catalog = {};
let inCatalog = false;
for (const line of workspaceYaml.split('\n')) {
  if (line.startsWith('catalog:')) {
    inCatalog = true;
    continue;
  }
  if (inCatalog && line.match(/^\s\s'/)) {
    const parts = line.trim().split(/:\s+/);
    if (parts.length === 2) {
      let key = parts[0].replace(/'/g, '');
      catalog[key] = parts[1];
    }
  } else if (inCatalog && line.match(/^\S/)) {
    inCatalog = false;
  } else if (inCatalog && line.match(/^\s\s\w/)) {
    const parts = line.trim().split(/:\s+/);
    if (parts.length === 2) {
      catalog[parts[0]] = parts[1];
    }
  }
}

console.log("Loaded catalog with", Object.keys(catalog).length, "entries");

// Find all package.json files
function findPackageJsons(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && !file.startsWith('.')) {
        findPackageJsons(filePath, fileList);
      }
    } else if (file === 'package.json') {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const packageJsons = findPackageJsons('.');

for (const pkgPath of packageJsons) {
  const pkgContent = fs.readFileSync(pkgPath, 'utf8');
  let pkgData;
  try {
    pkgData = JSON.parse(pkgContent);
  } catch (e) {
    continue;
  }
  
  let changed = false;
  
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (pkgData[section]) {
      for (const [dep, ver] of Object.entries(pkgData[section])) {
        if (ver === 'catalog:') {
          if (catalog[dep]) {
            pkgData[section][dep] = catalog[dep];
            changed = true;
          } else {
            console.warn(`WARNING: ${dep} is "catalog:" but not found in pnpm-workspace.yaml catalog! Using "latest".`);
            pkgData[section][dep] = "latest";
            changed = true;
          }
        }
      }
    }
  }
  
  if (changed) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkgData, null, 2) + '\n');
    console.log(`Updated ${pkgPath}`);
  }
}

console.log("Done converting catalog versions.");
