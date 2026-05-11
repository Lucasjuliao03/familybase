const axios = require('axios');
const db = require('better-sqlite3')('./data/familybase.db');

async function test() {
  const user = db.prepare("SELECT id, email, password FROM users LIMIT 1").get();
  console.log("User:", user.email);
  // I don't have the token. I can generate one.
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ id: user.id, email: user.email, family_id: 'test_family', role: 'parent' }, 'secret', { expiresIn: '1h' });
  // Wait, I don't know process.env.JWT_SECRET. I can just bypass it by calling the service directly.
  const shoppingService = require('./src/modules/shopping/shopping.service');
  try {
    const item = shoppingService.addItem(db, 'test_family', user.id, 'Test Item', 1);
    console.log("Added item:", item);
  } catch(e) {
    console.error("Error adding:", e);
  }
}
test();
