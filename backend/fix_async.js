const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix req.await db.prepare -> await req.db.prepare
  content = content.replace(/req\.await\s+db\.prepare/g, 'await req.db.prepare');
  
  // Also check for user.await db.prepare or similar just in case, though it's usually req.db
  content = content.replace(/([a-zA-Z0-9_]+)\.await\s+db\.prepare/g, 'await $1.db.prepare');

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
console.log('Fixed req.await db.prepare errors!');
