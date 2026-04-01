const express = require('express');
const router = express.Router();
const {
    createPurchaseOrder,
    getPOs,
    getPOById,
    updatePOStatus,
    getPOsByProduct,
    updatePurchaseOrder
} = require('../controllers/poController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, authorize('admin', 'manager'), createPurchaseOrder)
    .get(protect, getPOs);

router.route('/:id')
    .get(protect, getPOById)
    .put(protect, authorize('admin', 'manager'), updatePurchaseOrder);

router.route('/:id/status')
    .patch(protect, authorize('admin', 'manager'), updatePOStatus);

router.route('/product/:productId')
    .get(protect, getPOsByProduct);

module.exports = router;
