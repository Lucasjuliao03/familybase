require('dotenv').config();
const { initDatabase } = require('../src/database/init');

async function checkSchema() {
  const db = initDatabase();
  console.log('Checking columns of "public.users" table...');

  try {
    const res = await db.prepare(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND table_schema = 'public'
    `).all();
    
    console.log('Columns in "public.users":');
    res.forEach(c => console.log(` - ${c.column_name} (${c.data_type})`));

  } catch (err) {
    console.error('❌ Failed to check schema:', err);
  } finally {
    process.exit(0);
  }
}

checkSchema();
