const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/ProductController');
const { verifyToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

router.get('/', verifyToken, (req, res) => ProductController.list(req, res));
router.get('/:id/variants', verifyToken, (req, res) => ProductController.getVariants(req, res));
router.post('/', verifyToken, upload.single('image'), (req, res) => ProductController.create(req, res));
router.put('/:id', verifyToken, upload.single('image'), (req, res) => ProductController.update(req, res));
router.delete('/:id', verifyToken, (req, res) => ProductController.delete(req, res));

module.exports = router;
