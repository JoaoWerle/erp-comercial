const Router = require('router');
const SellerController = require('../controllers/SellerController');
const { verifyToken } = require('../middleware/auth');

const router = Router();

router.use(verifyToken);

router.get('/', (req, res) => SellerController.list(req, res));
router.post('/', (req, res) => SellerController.create(req, res));
router.put('/:id', (req, res) => SellerController.update(req, res));
router.get('/active', (req, res) => SellerController.listActive(req, res));

module.exports = router;
