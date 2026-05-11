const { initDatabase } = require('../src/database/init');
const db = initDatabase();

async function test() {
  try {
    const familyId = '6bfa0b00-2920-440a-b6d8-e45fde501129';
    let query = `
      SELECT t.*, c.name as child_name, c.color as child_color,
      r.affects_allowance, r.bonus_amount, r.discount_amount, r.apply_discount_if_late
      FROM tasks t 
      JOIN children c ON t.child_id = c.id 
      LEFT JOIN task_allowance_rules r ON t.id = r.task_id
      WHERE t.family_id = ?
      ORDER BY t.created_at DESC
    `;
    const rows = await db.prepare(query).all(familyId);
    console.log('Success!', rows.length, 'rows');
  } catch (err) {
    console.error('FAILED:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    process.exit();
  }
}

test();
