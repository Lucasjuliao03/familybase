import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Defina DATABASE_URL (pooler Supabase, senha URL-encoded).');
  process.exit(1);
}

const defaultFiles = [
  'supabase.sql',
  'supabase_backend_tables.sql',
  'supabase_missing_tables.sql',
  'supabase_baas_complete_fix.sql',
  'supabase_strict_rls.sql',
  'supabase_health_module.sql',
  'supabase_health_baas_patch.sql',
  'supabase_advanced_modules.sql',
  'supabase_family_location.sql',
  'supabase_grades_settings.sql',
  'supabase_members_patch.sql',
  'supabase/stripe_billing.sql',
  'supabase_register_family.sql',
  ...fs
    .readdirSync(path.join(root, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join('supabase', 'migrations', f)),
];

const files = process.argv.slice(2).length ? process.argv.slice(2) : defaultFiles;

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runFile(relPath) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`SKIP (missing): ${relPath}`);
    return;
  }
  const sql = fs.readFileSync(fullPath, 'utf8');
  if (!sql.trim()) {
    console.warn(`SKIP (empty): ${relPath}`);
    return;
  }
  console.log(`Applying: ${relPath}`);
  await client.query(sql);
  console.log(`OK: ${relPath}`);
}

async function main() {
  await client.connect();
  console.log('Connected to Supabase Postgres');
  for (const relPath of files) {
    try {
      await runFile(relPath);
    } catch (err) {
      console.error(`FAILED: ${relPath}`);
      console.error(err.message);
      process.exitCode = 1;
      break;
    }
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
