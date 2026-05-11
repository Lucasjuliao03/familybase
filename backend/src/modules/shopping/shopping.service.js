const { v4: uuidv4 } = require('uuid');

const getShoppingList = async (db, family_id) => {
  const items = await db.prepare(`
    SELECT s.*, 
           r.name as registered_by_name, 
           b.name as bought_by_name
    FROM shopping_list s
    JOIN users r ON s.registered_by = r.id
    LEFT JOIN users b ON s.bought_by = b.id
    WHERE s.family_id = ?
    ORDER BY s.is_bought ASC, s.is_urgent DESC, s.created_at DESC
  `).all(family_id);

  return {
    pending: items.filter(i => !i.is_bought),
    history: items.filter(i => i.is_bought)
  };
};

const addItem = async (db, family_id, user_id, name, is_urgent = false, establishment = null, quantity = null, description = null) => {
  const id = uuidv4();
  await db.prepare(`
    INSERT INTO shopping_list (id, family_id, name, is_urgent, registered_by, establishment, quantity, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, family_id, name, !!is_urgent, user_id, establishment, quantity, description);

  return await db.prepare(`
    SELECT s.*, r.name as registered_by_name
    FROM shopping_list s
    JOIN users r ON s.registered_by = r.id
    WHERE s.id = ?
  `).get(id);
};

const editItem = async (db, family_id, id, name, is_urgent = false, establishment = null, quantity = null, description = null, price = 0) => {
  const info = await db.prepare(`
    UPDATE shopping_list
    SET name = ?, is_urgent = ?, establishment = ?, quantity = ?, description = ?, price = ?
    WHERE id = ? AND family_id = ?
  `).run(name, !!is_urgent, establishment, quantity, description, price || 0, id, family_id);

  if (info.changes === 0) {
    throw new Error('Item not found');
  }

  return await db.prepare(`
    SELECT s.*, r.name as registered_by_name, b.name as bought_by_name
    FROM shopping_list s
    JOIN users r ON s.registered_by = r.id
    LEFT JOIN users b ON s.bought_by = b.id
    WHERE s.id = ?
  `).get(id);
};

const markAsBought = async (db, family_id, id, user_id, price = 0) => {
  const info = await db.prepare(`
    UPDATE shopping_list
    SET is_bought = TRUE, bought_by = ?, bought_at = CURRENT_TIMESTAMP, price = ?
    WHERE id = ? AND family_id = ? AND is_bought = FALSE
  `).run(user_id, price || 0, id, family_id);

  if (info.changes === 0) {
    throw new Error('Item not found or already bought');
  }

  return await db.prepare(`
    SELECT s.*, r.name as registered_by_name, b.name as bought_by_name
    FROM shopping_list s
    JOIN users r ON s.registered_by = r.id
    LEFT JOIN users b ON s.bought_by = b.id
    WHERE s.id = ?
  `).get(id);
};

const unmarkAsBought = async (db, family_id, id) => {
  const info = await db.prepare(`
    UPDATE shopping_list
    SET is_bought = FALSE, bought_by = NULL, bought_at = NULL, price = 0
    WHERE id = ? AND family_id = ? AND is_bought = TRUE
  `).run(id, family_id);

  if (info.changes === 0) {
    throw new Error('Item not found or not bought');
  }

  return await db.prepare(`
    SELECT s.*, r.name as registered_by_name
    FROM shopping_list s
    JOIN users r ON s.registered_by = r.id
    WHERE s.id = ?
  `).get(id);
};



const deleteItem = async (db, family_id, id) => {
  const info = await db.prepare(`
    DELETE FROM shopping_list
    WHERE id = ? AND family_id = ?
  `).run(id, family_id);

  if (info.changes === 0) {
    throw new Error('Item not found');
  }
};

module.exports = {
  getShoppingList,
  addItem,
  editItem,
  markAsBought,
  unmarkAsBought,
  deleteItem
};
