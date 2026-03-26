const express = require('express');
const router = express.Router();

console.log('INV: Inventory Routes Loaded');

router.get('/test', (req, res) => res.json({ msg: 'Inventory Test OK' }));

const {
    createProduct,
    updateProduct,
    deleteProduct,
    getProducts,
    createWarehouse,
    getWarehouses,
    addStock,
    transferStock,
    getStockLogs,
} = require('../controllers/inventoryController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Stock Operations - Must be before generic routes
router.post('/stock/add', protect, authorize('admin'), addStock);
router.post('/stock/transfer', protect, authorize('admin'), transferStock);
router.get('/logs', protect, authorize('admin', 'admin_viewer'), getStockLogs);

router.route('/products')
    .get(protect, getProducts)
    .post(protect, authorize('admin', 'manager'), createProduct);

router.route('/products/:id')
    .put(protect, authorize('admin', 'manager'), updateProduct)
    .delete(protect, authorize('admin'), deleteProduct);

router.route('/warehouses')
    .get(protect, getWarehouses)
    .post(protect, authorize('admin'), createWarehouse);

module.exports = router;
