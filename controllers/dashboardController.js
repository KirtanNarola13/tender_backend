const Task = require('../models/Task');
const { Project } = require('../models/Project');
const { Product } = require('../models/Inventory');
const User = require('../models/User');

// @desc    Get Global Dashboard Stats
// @route   GET /api/dashboard/stats
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
    try {
        const totalProjects = await Project.countDocuments();

        const tasks = await Task.find().select('status');
        const totalTasks = tasks.length;
        const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in-progress').length;
        const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'verified').length;

        // Count employees (users with role 'employee')
        const totalEmployees = await User.countDocuments({ role: 'employee' });

        // Count team leaders
        const totalTeamLeaders = await User.countDocuments({ role: 'team_leader' });

        // Inventory Stats (Top 10 products by stock for graph)
        const inventoryStats = await Product.find().select('name totalStock').limit(10).sort({ totalStock: -1 });

        // Project Progress Stats
        const projects = await Project.find().select('name');
        const projectStats = await Promise.all(projects.map(async (project) => {
            const projectTasks = await Task.find({ project: project._id }).select('status');
            const total = projectTasks.length;
            const completed = projectTasks.filter(t => t.status === 'completed' || t.status === 'verified').length;
            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
            return {
                name: project.name,
                progress: progress,
                totalTasks: total,
                completedTasks: completed
            };
        }));

        // Sort by Progress (Descending)
        projectStats.sort((a, b) => b.progress - a.progress);

        res.json({
            totalProjects,
            totalTasks,
            pendingTasks,
            completedTasks,
            totalEmployees,
            totalTeamLeaders,
            inventoryStats,
            projectStats
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Employee Performance Report
// @route   GET /api/dashboard/employee-performance
// @access  Private/Admin
exports.getEmployeePerformance = async (req, res) => {
    try {
        // Aggregate tasks by assignedTo
        // We want: Employee Name, Total Assigned, Completed, Pending, Completion Rate

        let query = { role: 'employee' };
        
        // If team leader, only show their own employees
        if (req.user.role === 'team_leader') {
            query.assignedManager = req.user._id;
        }

        const employees = await User.find(query).select('name email');

        const performanceData = await Promise.all(employees.map(async (emp) => {
            const totalAssigned = await Task.countDocuments({ assignedTo: emp._id });
            const completed = await Task.countDocuments({
                assignedTo: emp._id,
                status: { $in: ['completed', 'verified'] }
            });
            const pending = await Task.countDocuments({
                assignedTo: emp._id,
                status: { $in: ['pending', 'in-progress'] }
            });

            const completionRate = totalAssigned > 0
                ? Math.round((completed / totalAssigned) * 100)
                : 0;

            return {
                id: emp._id,
                name: emp.name,
                email: emp.email,
                totalAssigned,
                completed,
                pending,
                completionRate
            };
        }));

        // Sort by Completion Rate (Descending)
        performanceData.sort((a, b) => b.completionRate - a.completionRate);

        res.json(performanceData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
