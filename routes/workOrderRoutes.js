const express = require('express');
const router = express.Router();
const {
    createWorkOrder,
    getWorkOrders,
    getWorkOrderById,
    updateWorkOrder,
    deleteWorkOrder
} = require('../controllers/workOrderController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, authorize('admin', 'superadmin'), createWorkOrder)
    .get(protect, getWorkOrders);

router.route('/:id')
    .get(protect, getWorkOrderById)
    .put(protect, authorize('admin', 'superadmin'), updateWorkOrder)
    .delete(protect, authorize('admin', 'superadmin'), deleteWorkOrder);

module.exports = router;
