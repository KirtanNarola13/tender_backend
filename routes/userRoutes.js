const express = require('express');
const router = express.Router();
const { createUser, getAllUsers } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, authorize('admin'), createUser)
    .get(protect, authorize('admin'), getAllUsers);

router.route('/:id')
    .put(protect, authorize('admin'), require('../controllers/userController').updateUser)
    .delete(protect, authorize('admin'), require('../controllers/userController').deleteUser);

router.get('/employees', protect, authorize('admin', 'team_leader'), require('../controllers/userController').getEmployees);

module.exports = router;
