const Task = require('../models/Task');
const { Project } = require('../models/Project');
const { Product } = require('../models/Inventory');
const User = require('../models/User');
const WorkOrder = require('../models/WorkOrder');

// @desc    Get Global Dashboard Stats
// @route   GET /api/dashboard/stats
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
    try {
        const { branch } = req.query;
        let projectQuery = {};
        let userQuery = {};
        let taskQuery = {};
        let workOrderQuery = {};

        if (branch && branch !== 'all') {
            projectQuery.branch = branch;
            userQuery.branches = branch;
            
            // For tasks and work orders, we filter by their project's branch
            const projectsInBranch = await Project.find({ branch }).select('_id');
            const projectIds = projectsInBranch.map(p => p._id);
            taskQuery.project = { $in: projectIds };
            workOrderQuery['categories.projects'] = { $in: projectIds };
        }

        const totalProjects = await Project.countDocuments(projectQuery);
        
        // Robust Work Order Count: Count unique work orders associated with projects in this branch
        let totalWorkOrders = 0;
        if (branch && branch !== 'all') {
            const uniqueWOs = await Project.distinct('workOrder', projectQuery);
            totalWorkOrders = uniqueWOs.filter(id => id != null).length;
        } else {
            totalWorkOrders = await WorkOrder.countDocuments({});
        }

        const tasksCountAll = await Task.countDocuments(taskQuery);
        const pendingTasks = await Task.countDocuments({ ...taskQuery, status: { $in: ['pending', 'in-progress'] } });
        const completedTasks = await Task.countDocuments({ ...taskQuery, status: { $in: ['completed', 'verified'] } });

        const totalEmployees = await User.countDocuments({ ...userQuery, role: 'employee' });
        const totalTeamLeaders = await User.countDocuments({ ...userQuery, role: 'team_leader' });

        // Inventory Stats (Top 10 products by stock for graph)
        const inventoryStats = await Product.find().select('name totalStock').limit(10).sort({ totalStock: -1 });

        // Project Progress Stats — use stored products[].progress for accuracy
        const projects = await Project.find(projectQuery).select('name products');
        const projectStats = await Promise.all(projects.map(async (project) => {
            const projectTasks = await Task.find({ project: project._id }).select('status');
            const total = projectTasks.length;
            const completed = projectTasks.filter(t => t.status === 'completed' || t.status === 'verified').length;

            // Use stored granular progress from products array for accurate progress
            const prods = project.products || [];
            const progress = prods.length > 0
                ? Math.round(prods.reduce((sum, p) => sum + (p.progress || 0), 0) / prods.length)
                : (total > 0 ? Math.round((completed / total) * 100) : 0);

            return {
                name: project.name,
                progress,
                totalTasks: total,
                completedTasks: completed
            };
        }));

        // Sort by Progress (Descending)
        projectStats.sort((a, b) => b.progress - a.progress);

        // Branch-wise Summary (Comparative View for Admin)
        // Fetch products so we can use stored progress values
        const allProjects = await Project.find({}).select('branch products name');
        const allUsers = await User.find({ role: 'team_leader' }).select('branches');
        
        const branchNames = [...new Set([
            ...allProjects.map(p => p.branch).filter(Boolean),
            ...allUsers.flatMap(u => u.branches || [])
        ])].sort();

        const branchSummary = branchNames.map((b) => {
            const bProjects = allProjects.filter(p => p.branch === b);
            const bLeaders = allUsers.filter(u => u.branches && u.branches.includes(b)).length;
            
            // Calculate avg progress using stored products[].progress per project
            let totalProg = 0;
            if (bProjects.length > 0) {
                const progs = bProjects.map((p) => {
                    const prods = p.products || [];
                    if (prods.length === 0) return 0;
                    return Math.round(
                        prods.reduce((sum, prod) => sum + (prod.progress || 0), 0) / prods.length
                    );
                });
                totalProg = Math.round(progs.reduce((acc, v) => acc + v, 0) / progs.length);
            }

            return {
                name: b,
                projectCount: bProjects.length,
                leaderCount: bLeaders,
                avgProgress: totalProg
            };
        });

        res.json({
            totalProjects,
            totalWorkOrders,
            totalTasks: tasksCountAll,
            pendingTasks,
            completedTasks,
            totalEmployees,
            totalTeamLeaders,
            inventoryStats,
            projectStats,
            branchSummary
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
                status: { $nin: ['completed', 'verified'] }
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
