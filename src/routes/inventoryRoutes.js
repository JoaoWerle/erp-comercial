const express = require('express');
const router = express.Router();
const InventoryController = require('../controllers/InventoryController');
const { verifyToken } = require('../middleware/auth');

router.post('/replenish', verifyToken, (req, res) => InventoryController.replenish(req, res));
router.post('/bulk-replenish', verifyToken, (req, res) => InventoryController.bulkReplenish(req, res));
router.get('/history/:productId', verifyToken, (req, res) => InventoryController.getHistory(req, res));

module.exports = router;
