require('dotenv').config();
const { initDatabase } = require('../src/database/init');

async function checkSchema() {
  const db = initDatabase();
  console.log('Checking columns of "users" table...');

  try {
    const res = await db.prepare(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `).all();
    
    console.log('Columns in "users":');
    res.forEach(c => console.log(` - ${c.column_name} (${c.data_type})`));

  } catch (err) {
    console.error('❌ Failed to check schema:', err);
  } finally {
    process.exit(0);
  }
}

checkSchema();
