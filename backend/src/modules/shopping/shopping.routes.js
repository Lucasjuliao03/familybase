const express = require('express');
const router = express.Router();
const shoppingController = require('./shopping.controller');
const authMiddleware = require('../../middleware/auth');
const { requireModule } = require('../../middleware/familyModule');

router.use(authMiddleware, requireModule('shopping'));

router.get('/', shoppingController.getShoppingList);
router.post('/', shoppingController.addItem);
router.put('/:id', shoppingController.editItem);
router.put('/:id/buy', shoppingController.markAsBought);
router.put('/:id/unbuy', shoppingController.unmarkAsBought);
router.delete('/:id', shoppingController.deleteItem);

module.exports = router;
