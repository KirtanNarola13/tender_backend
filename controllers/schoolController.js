const { School } = require('../models/Project');

// @desc    Create a new school (Assign to Project)
// @route   POST /api/schools
// @access  Private/Admin
exports.createSchool = async (req, res) => {
    try {
        const school = await School.create(req.body);
        res.status(201).json(school);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get all schools (Filter by project query ?projectId=...)
// @route   GET /api/schools
// @access  Private
exports.getSchools = async (req, res) => {
    try {
        const filter = {};
        if (req.query.projectId) {
            filter.project = req.query.projectId;
        }
        const schools = await School.find(filter)
            .populate('project', 'name')
            .populate('assignedManager', 'name');
        res.json(schools);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
