const Branch = require('../models/Branch');

// @desc    Get all branches
// @route   GET /api/branches
// @access  Private
exports.getBranches = async (req, res) => {
    try {
        const branches = await Branch.find({}).populate('manager', 'name email').sort({ name: 1 });
        res.json(branches);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new branch
// @route   POST /api/branches
// @access  Private/Admin
exports.createBranch = async (req, res) => {
    try {
        const { name, location, description, manager, status } = req.body;
        const branchExists = await Branch.findOne({ name: name.trim() });

        if (branchExists) {
            return res.status(400).json({ message: 'Branch already exists with this name' });
        }

        const branch = await Branch.create({
            name,
            location,
            description,
            manager: manager || undefined,
            status: status || 'active'
        });

        res.status(201).json(branch);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Update a branch
// @route   PUT /api/branches/:id
// @access  Private/Admin
exports.updateBranch = async (req, res) => {
    try {
        const branch = await Branch.findById(req.params.id);

        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        branch.name = req.body.name || branch.name;
        branch.location = req.body.location || branch.location;
        branch.description = req.body.description !== undefined ? req.body.description : branch.description;
        branch.manager = req.body.manager !== undefined ? req.body.manager : branch.manager;
        branch.status = req.body.status || branch.status;

        const updatedBranch = await branch.save();
        res.json(updatedBranch);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete a branch
// @route   DELETE /api/branches/:id
// @access  Private/Admin
exports.deleteBranch = async (req, res) => {
    try {
        const branch = await Branch.findById(req.params.id);

        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Optional: Check if projects/users exist in this branch before deletion
        // For now, simple delete.

        await branch.deleteOne();
        res.json({ message: 'Branch removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
