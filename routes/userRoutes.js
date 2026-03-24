const express = require('express');
const router = express.Router();
const {
    createUser,
    getAllUsers,
    updateUser,
    deleteUser,
    getEmployees,
    createUserByTeamLeader,
    getMyEmployees,
    updateMyEmployee,
} = require('../controllers/userController');
const { updateFcmToken } = require('../controllers/fcmController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Admin: create & get all users
router.route('/')
    .post(protect, authorize('admin'), createUser)
    .get(protect, authorize('admin'), getAllUsers);

// Must be BEFORE /:id route to prevent Express treating 'employees' / 'my-employees' as an ID
router.get('/employees', protect, authorize('admin', 'team_leader'), getEmployees);

// Team leader: manage their own employees
router.route('/my-employees')
    .get(protect, authorize('team_leader', 'admin'), getMyEmployees)
    .post(protect, authorize('team_leader'), createUserByTeamLeader);

router.route('/my-employees/:id')
    .put(protect, authorize('team_leader'), updateMyEmployee)
    .delete(protect, authorize('team_leader'), deleteUser);


// FCM Token
router.put('/fcm-token', protect, updateFcmToken);

// Admin: update & delete any user
router.route('/:id')
    .put(protect, authorize('admin'), updateUser)
    .delete(protect, authorize('admin', 'team_leader'), deleteUser);

module.exports = router;

