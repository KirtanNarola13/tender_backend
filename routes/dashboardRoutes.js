const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware'); // Assuming these exist
const { getDashboardStats, getEmployeePerformance } = require('../controllers/dashboardController');

router.get('/stats', protect, authorize('admin', 'team_leader', 'admin_viewer'), getDashboardStats);
router.get('/employee-performance', protect, authorize('admin', 'team_leader', 'admin_viewer'), getEmployeePerformance);

module.exports = router;
