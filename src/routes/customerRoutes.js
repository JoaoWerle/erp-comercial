const Router = require('router');
const CustomerController = require('../controllers/CustomerController');
const { verifyToken } = require('../middleware/auth');

const router = Router();

router.use(verifyToken);

router.get('/', (req, res) => CustomerController.list(req, res));
router.post('/', (req, res) => CustomerController.create(req, res));
router.put('/:id', (req, res) => CustomerController.update(req, res));
router.get('/search', (req, res) => CustomerController.search(req, res));

module.exports = router;
