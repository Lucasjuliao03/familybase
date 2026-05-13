const { Pool } = require('pg');
require('dotenv').config();

let pool;

/**
 * Colunas tipadas como BOOLEAN no Postgres: evita "operator does not exist: boolean = integer"
 * em SQL herdado (ex.: col = 1).
 */
const PG_BOOLEAN_COLUMNS = new Set([
  'is_recurring',
  'is_active',
  'is_enabled',
  'is_premium',
  'default_enabled',
  'requires_approval',
  'visible_on_calendar',
  'generate_notification',
  'affects_allowance',
  'is_health_reminder',
  'must_change_password',
  'allow_accumulation',
  'allow_negative_balance',
  'require_parent_approval',
  'visible_to_child',
  'is_pinned',
  'requires_read_confirmation',
  'inactive',
  'stayed_home',
  'apply_discount_if_late',
  'is_urgent',
  'is_bought',
  'is_read',
]);

function normalizeBooleanLiteralEquals(sql) {
  let s = sql;
  for (const col of PG_BOOLEAN_COLUMNS) {
    const esc = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // t.col = 1  ou  col = 0
    s = s.replace(new RegExp(`(\\b(?:[\\w]+\\.)?${esc}\\s*=\\s*)1\\b`, 'gi'), '$1TRUE');
    s = s.replace(new RegExp(`(\\b(?:[\\w]+\\.)?${esc}\\s*=\\s*)0\\b`, 'gi'), '$1FALSE');
  }
  return s;
}

/**
 * SQL herdado de SQLite → PostgreSQL (pool Supabase).
 */
function sqliteToPgSql(sql) {
  if (!sql || typeof sql !== 'string') return sql;
  let s = sql;
  s = s.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
  s = s.replace(/datetime\("now"\)/gi, 'CURRENT_TIMESTAMP');
  s = normalizeBooleanLiteralEquals(s);

  if (/\bINSERT OR IGNORE INTO\s+task_occurrences\b/i.test(s)) {
    s = s.replace(/\bINSERT OR IGNORE INTO\s+task_occurrences\b/i, 'INSERT INTO task_occurrences');
    if (!/\bON CONFLICT\b/i.test(s)) {
      s = `${s.trim()} ON CONFLICT (task_id, child_id, occurrence_date) DO NOTHING`;
    }
  }

  if (/\bINSERT OR IGNORE INTO\s+earned_medals\b/i.test(s)) {
    s = s.replace(/\bINSERT OR IGNORE INTO\s+earned_medals\b/i, 'INSERT INTO earned_medals');
    if (!/\bON CONFLICT\b/i.test(s)) {
      s = `${s.trim()} ON CONFLICT (medal_id, child_id) DO NOTHING`;
    }
  }

  return s;
}

function initDatabase() {
  if (!pool) {
    const conn = process.env.DATABASE_URL || '';
    pool = new Pool({
      connectionString: conn || undefined,
      ssl: conn.includes('supabase') ? { rejectUnauthorized: false } : false,
    });

    console.log('✅ PostgreSQL Connection Pool initialized');
  }

  // Wrapper para imitar a API do better-sqlite3 mas de forma assíncrona
  const dbWrapper = {
    prepare: (sql) => {
      const adapted = sqliteToPgSql(sql);
      // Converte parâmetros '?' do SQLite para '$1', '$2', etc. do Postgres
      let i = 1;
      const pgSql = adapted.replace(/\?/g, () => `$${i++}`);
      
      return {
        get: async (...args) => {
          const params = Array.isArray(args[0]) ? args[0] : args;
          const res = await pool.query(pgSql, params);
          return res.rows.length ? res.rows[0] : undefined;
        },
        all: async (...args) => {
          const params = Array.isArray(args[0]) ? args[0] : args;
          const res = await pool.query(pgSql, params);
          return res.rows;
        },
        run: async (...args) => {
          const params = Array.isArray(args[0]) ? args[0] : args;
          const res = await pool.query(pgSql, params);
          return { changes: res.rowCount, lastInsertRowid: null }; // Postgres não retorna lastInsertRowid assim, mas a maioria das rotas usa UUIDs no app
        }
      };
    },
    exec: async (sql) => {
      await pool.query(sql);
    },
    // Método auxiliar direto
    query: (text, params) => pool.query(text, params)
  };

  return dbWrapper;
}

module.exports = { initDatabase, sqliteToPgSql, normalizeBooleanLiteralEquals };
