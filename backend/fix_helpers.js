const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Encontra todas as declarações de função: function nomeDaFuncao(args) { ... }
  // Usa um regex simples e iterativo para verificar se tem await no corpo sem estar dentro de outra função (simplificado)
  const functionRegex = /function\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{/g;
  let newContent = content;

  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    const funcName = match[1];
    // Se a função não tiver 'async ' antes dela, vamos checar se ela usa await
    const prefix = content.substring(Math.max(0, match.index - 10), match.index);
    if (!prefix.includes('async')) {
      // Find the end of the block
      let braceCount = 1;
      let i = match.index + match[0].length;
      while (i < content.length && braceCount > 0) {
        if (content[i] === '{') braceCount++;
        else if (content[i] === '}') braceCount--;
        i++;
      }
      const body = content.substring(match.index, i);
      // Se tiver await no corpo (rudimentar, mas serve)
      if (body.includes('await ')) {
        const replaceRegex = new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{`);
        newContent = newContent.replace(replaceRegex, `async function ${funcName}` + body.substring(body.indexOf('('), body.indexOf('{') + 1));
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Fixed helpers in:', filePath);
  }
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
console.log('Done fixing helpers!');
