const { Pool } = require('pg');
require('dotenv').config();

let pool;

function initDatabase() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // If connecting to Supabase, sometimes SSL is required
      ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false
    });
    
    console.log('✅ PostgreSQL Connection Pool initialized');
  }

  // Wrapper para imitar a API do better-sqlite3 mas de forma assíncrona
  const dbWrapper = {
    prepare: (sql) => {
      // Converte parâmetros '?' do SQLite para '$1', '$2', etc. do Postgres
      let i = 1;
      const pgSql = sql.replace(/\?/g, () => `$${i++}`);
      
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

module.exports = { initDatabase };
