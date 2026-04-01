const express = require('express');
const router = express.Router();
const { getBranches, createBranch, updateBranch, deleteBranch } = require('../controllers/branchController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
    .get(protect, getBranches)
    .post(protect, authorize('admin'), createBranch);

router.route('/:id')
    .put(protect, authorize('admin'), updateBranch)
    .delete(protect, authorize('admin'), deleteBranch);

module.exports = router;
