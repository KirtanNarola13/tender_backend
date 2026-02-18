const express = require('express');
const router = express.Router();
const { createProject, getProjects, getProjectById, updateProject, deleteProject } = require('../controllers/projectController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
    .get(protect, getProjects)
    .post(protect, authorize('admin'), createProject);

router.route('/:id')
    .get(protect, getProjectById)
    .put(protect, authorize('admin'), updateProject)
    .delete(protect, authorize('admin'), deleteProject);

module.exports = router;
