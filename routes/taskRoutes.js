const express = require('express');
const router = express.Router();
const { getTasks, assignTask, uploadPhoto, submitTask, startTask } = require('../controllers/taskController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
    .get(protect, getTasks);

// Start a task
router.route('/:id/start')
    .post(protect, startTask);

// Assign a task (Step) to an employee
router.route('/:id/assign')
    .put(protect, authorize('team_leader', 'admin'), assignTask);

// Upload photo & Auto-complete logic
router.route('/:id/upload')
    .post(protect, uploadPhoto);

// Submit Task (Explicit Completion)
router.route('/:id/submit')
    .post(protect, submitTask);

// General Update (Status change by Admin/Verifier)
router.route('/:id')
    .put(protect, authorize('admin', 'verify_team', 'team_leader'), require('../controllers/taskController').updateTask);

module.exports = router;
