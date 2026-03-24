const express = require('express');
const router = express.Router();
const { updateFcmToken } = require('../controllers/fcmController');
const { protect } = require('../middleware/authMiddleware');

router.put('/fcm-token', protect, updateFcmToken);

module.exports = router;
