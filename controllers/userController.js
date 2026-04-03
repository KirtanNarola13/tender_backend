const User = require('../models/User');

// @desc    Create a new user (Admin only)
// @route   POST /api/users
// @access  Private/Admin
exports.createUser = async (req, res) => {
    const { name, email, password, role, assignedManager, branches } = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const user = await User.create({
            name,
            email,
            password,
            role,
            assignedManager: role === 'employee' ? assignedManager : undefined,
            branches: branches || [],
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                assignedManager: user.assignedManager,
                branches: user.branches,
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}).populate('assignedManager', 'name email');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// @desc    Get all employees (admin sees all, filtered by query)
// @route   GET /api/users/employees
// @access  Private (Admin & Team Leader)
exports.getEmployees = async (req, res) => {
    try {
        const users = await User.find({ role: 'employee' }).select('_id name email role');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Team leader creates employee (auto-assigned to themselves)
// @route   POST /api/users/my-employees
// @access  Private/Team Leader
exports.createUserByTeamLeader = async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: 'User already exists with this email' });

        const user = await User.create({
            name,
            email,
            password,
            role: 'employee',
            assignedManager: req.user._id,
        });

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            assignedManager: user.assignedManager,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Team leader gets their own employees only
// @route   GET /api/users/my-employees
// @access  Private/Team Leader
exports.getMyEmployees = async (req, res) => {
    try {
        const users = await User.find({ role: 'employee', assignedManager: req.user._id })
            .select('_id name email role createdAt');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// @desc    Team leader updates one of their own employees
// @route   PUT /api/users/my-employees/:id
// @access  Private/Team Leader
exports.updateMyEmployee = async (req, res) => {
    try {
        const employee = await User.findOne({ _id: req.params.id, assignedManager: req.user._id });
        if (!employee) return res.status(404).json({ message: 'Employee not found in your team' });

        const { name, email, password } = req.body;
        if (name) employee.name = name;
        if (email) employee.email = email;
        if (password) employee.password = password;

        const updated = await employee.save();
        res.json({ _id: updated._id, name: updated.name, email: updated.email, role: updated.role });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update user

// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (user) {
            user.name = req.body.name || user.name;
            user.email = req.body.email || user.email;
            user.role = req.body.role || user.role;

            if (req.body.assignedManager !== undefined) {
                user.assignedManager = req.body.role === 'employee' ? req.body.assignedManager : undefined;
            }

            if (req.body.branches !== undefined) {
                user.branches = req.body.branches;
            }

            if (req.body.password) {
                user.password = req.body.password;
            }

            const updatedUser = await user.save();

            res.json({
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                assignedManager: updatedUser.assignedManager,
                branches: updatedUser.branches,
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.log(error, "error")
        res.status(500).json({ message: error.message });
    }
};

// @desc    Toggle Block/Unblock user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Security Check: Team Leaders can only block their own employees
        if (req.user.role === 'team_leader') {
            if (user.role !== 'employee' || user.assignedManager?.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'You can only manage users in your own team' });
            }
        }

        // Toggle blocked status instead of deleting
        user.isBlocked = !user.isBlocked;
        await user.save();

        res.json({ 
            message: user.isBlocked ? 'User account has been blocked' : 'User account has been unblocked',
            isBlocked: user.isBlocked 
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
