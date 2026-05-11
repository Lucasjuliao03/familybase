require('dotenv').config();
const { initDatabase } = require('../src/database/init');

async function checkTriggers() {
  const db = initDatabase();
  console.log('Checking triggers in the database...');

  try {
    const res = await db.prepare(`
      SELECT trigger_name, event_manipulation, event_object_table, action_statement 
      FROM information_schema.triggers
    `).all();
    
    console.log('Triggers:');
    res.forEach(t => console.log(` - ${t.trigger_name} on ${t.event_object_table} (${t.event_manipulation}): ${t.action_statement}`));

  } catch (err) {
    console.error('❌ Failed to check triggers:', err);
  } finally {
    process.exit(0);
  }
}

checkTriggers();
