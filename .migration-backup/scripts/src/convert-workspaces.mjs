import * as fs from 'fs';
import * as path from 'path';

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
        if (ver.startsWith('workspace:')) {
          pkgData[section][dep] = '*';
          changed = true;
        }
      }
    }
  }
  
  if (changed) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkgData, null, 2) + '\n');
    console.log(`Updated workspace references in ${pkgPath}`);
  }
}
