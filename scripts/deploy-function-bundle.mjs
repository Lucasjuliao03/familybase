import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fnRoot = path.join(root, 'supabase', 'functions');

const fnName = process.argv[2];
if (!fnName) {
  console.error('Usage: node deploy-function-bundle.mjs <function-name>');
  process.exit(1);
}

const shared = ['cors.ts', 'supabaseAdmin.ts', 'stripeClient.ts', 'stripeFamilySync.ts', 'mercadopago.ts'];
const files = [];

files.push({
  name: 'index.ts',
  content: fs.readFileSync(path.join(fnRoot, fnName, 'index.ts'), 'utf8'),
});

for (const s of shared) {
  const p = path.join(fnRoot, '_shared', s);
  if (fs.existsSync(p)) {
    files.push({
      name: `_shared/${s}`,
      content: fs.readFileSync(p, 'utf8'),
    });
  }
}

// Rewrite imports ../_shared/ -> ./_shared/ for bundled layout
const bundled = files.map((f) => ({
  name: f.name,
  content: f.content.replaceAll('../_shared/', './_shared/'),
}));

console.log(JSON.stringify(bundled));
