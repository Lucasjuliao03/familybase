const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Convert express handlers to async if they contain db.prepare
  // Matches: router.get('/path', authMiddleware, (req, res) => {
  content = content.replace(/(\([^)]*\)\s*=>\s*\{)([\s\S]*?\})/g, (match, p1, p2) => {
    if (p2.includes('db.prepare') && !p1.includes('async')) {
      return 'async ' + match;
    }
    return match;
  });

  // Also match: function(req, res) {
  content = content.replace(/(function\s*\([^)]*\)\s*\{)([\s\S]*?\})/g, (match, p1, p2) => {
    if (p2.includes('db.prepare') && !p1.includes('async')) {
      return 'async ' + match;
    }
    return match;
  });

  // 2. Add 'await' to db.prepare(...).get|all|run
  // We'll use a regex that handles newlines inside prepare(...) by non-greedy matching until ).get
  content = content.replace(/db\.prepare\(([\s\S]*?)\)\.get\(/g, 'await db.prepare($1).get(');
  content = content.replace(/db\.prepare\(([\s\S]*?)\)\.all\(/g, 'await db.prepare($1).all(');
  content = content.replace(/db\.prepare\(([\s\S]*?)\)\.run\(/g, 'await db.prepare($1).run(');

  // Fix cases where it already had await (await await db.prepare)
  content = content.replace(/await\s+await\s+db\.prepare/g, 'await db.prepare');

  // Fix assignments: const stmt = db.prepare(...)
  // Wait, our grep search showed very few "const stmt". It was mostly .get/.all/.run chained.

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Refactored:', filePath);
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
processFile(path.join(__dirname, 'src', 'server.js'));
// We might also need to process middleware/auth.js etc
processFile(path.join(__dirname, 'src', 'middleware', 'auth.js'));
if (fs.existsSync(path.join(__dirname, 'src', 'middleware', 'permissions.js'))) {
  processFile(path.join(__dirname, 'src', 'middleware', 'permissions.js'));
}
if (fs.existsSync(path.join(__dirname, 'src', 'middleware', 'familyModule.js'))) {
  processFile(path.join(__dirname, 'src', 'middleware', 'familyModule.js'));
}
if (fs.existsSync(path.join(__dirname, 'src', 'lib', 'familyModuleService.js'))) {
  processFile(path.join(__dirname, 'src', 'lib', 'familyModuleService.js'));
}
if (fs.existsSync(path.join(__dirname, 'src', 'cron', 'taskGenerator.js'))) {
  processFile(path.join(__dirname, 'src', 'cron', 'taskGenerator.js'));
}

console.log('Done!');
