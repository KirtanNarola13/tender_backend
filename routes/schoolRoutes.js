const express = require('express');
const router = express.Router();
const { createSchool, getSchools } = require('../controllers/schoolController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
    .get(protect, getSchools)
    .post(protect, authorize('admin', 'manager'), createSchool);

module.exports = router;
