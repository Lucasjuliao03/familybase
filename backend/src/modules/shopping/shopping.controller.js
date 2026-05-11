const shoppingService = require('./shopping.service');

const getShoppingList = async (req, res) => {
  try {
    const list = await shoppingService.getShoppingList(req.db, req.user.familyId);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const addItem = async (req, res) => {
  try {
    const { name, is_urgent, establishment, quantity, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const item = await shoppingService.addItem(req.db, req.user.familyId, req.user.id, name, is_urgent, establishment, quantity, description);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const editItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, is_urgent, establishment, quantity, description, price } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const item = await shoppingService.editItem(req.db, req.user.familyId, id, name, is_urgent, establishment, quantity, description, price);
    res.json(item);
  } catch (error) {
    if (error.message === 'Item not found') return res.status(404).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};

const markAsBought = async (req, res) => {
  try {
    const { id } = req.params;
    const { price } = req.body;
    const item = await shoppingService.markAsBought(req.db, req.user.familyId, id, req.user.id, price);
    res.json(item);
  } catch (error) {
    if (error.message === 'Item not found') return res.status(404).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};

const unmarkAsBought = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await shoppingService.unmarkAsBought(req.db, req.user.familyId, id);
    res.json(item);
  } catch (error) {
    if (error.message === 'Item not found') return res.status(404).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};

const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    await shoppingService.deleteItem(req.db, req.user.familyId, id);
    res.json({ success: true });
  } catch (error) {
    if (error.message === 'Item not found') return res.status(404).json({ error: error.message });
    res.status(500).json({ error: error.message });
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
