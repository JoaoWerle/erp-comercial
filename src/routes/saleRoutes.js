const express = require('express');
const router = express.Router();
const SaleController = require('../controllers/SaleController');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, (req, res) => SaleController.create(req, res));
router.post('/:id/cancel', verifyToken, (req, res) => SaleController.cancel(req, res));

module.exports = router;
