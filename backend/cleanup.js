const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/router\.getasync\s*\(/g, 'router.get(');
  content = content.replace(/router\.postasync\s*\(/g, 'router.post(');
  content = content.replace(/router\.putasync\s*\(/g, 'router.put(');
  content = content.replace(/router\.deleteasync\s*\(/g, 'router.delete(');

  fs.writeFileSync(filePath, content, 'utf8');
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.js')) {
      processFile(fullPath);
    }
  }
}

walkDir(path.join(__dirname, 'src', 'modules'));
console.log('Cleaned up regex errors!');
