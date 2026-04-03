const Task = require('../models/Task');
const mongoose = require('mongoose');
const { Project } = require('../models/Project'); // Mongoose model
const { createNotification } = require('./notificationController');

// @desc    Get Tasks for User (Leader or Employee)
// @route   GET /api/tasks
// @access  Private
// @desc    Get Tasks for User (Leader or Employee)
// @route   GET /api/tasks
// @access  Private
exports.getTasks = async (req, res) => {
    try {
        let accessFilter = {};
        console.log(`[DEBUG] getTasks called for user: ${req.user._id}, role: ${req.user.role}`);

        // 1. DETERMINE ACCESS RIGHTS
        if (req.user.role === 'employee') {
            accessFilter = {
                assignedTo: req.user._id
            };
        } else if (req.user.role === 'team_leader') {
            // Find projects where this user is the leader
            const projects = await Project.find({ assignedLeader: req.user._id }).select('_id');
            const projectIds = projects.map(p => p._id);

            if (projectIds.length > 0) {
                accessFilter = {
                    $or: [
                        { assignedTo: req.user._id },
                        { project: { $in: projectIds } }
                    ]
                };
            } else {
                accessFilter = { assignedTo: req.user._id };
            }
        } else {
            // Admin sees everything by default
        }

        // 2. APPLY USER FILTERS (Query Params)
        let queryFilter = {};
        if (req.query.projectId) queryFilter.project = req.query.projectId;
        if (req.query.productId) queryFilter.product = req.query.productId;
        if (req.query.assignedTo) queryFilter.assignedTo = req.query.assignedTo;
        if (req.query.status) {
            if (req.query.status.includes(',')) {
                queryFilter.status = { $in: req.query.status.split(',') };
            } else {
                queryFilter.status = req.query.status;
            }
        }

        // 3. COMBINE FILTERS
        // If accessFilter is empty (Admin), just use queryFilter.
        // If queryFilter is empty, just use accessFilter.
        // Otherwise, AND them.

        let finalFilter = {};
        const hasAccessFilter = Object.keys(accessFilter).length > 0;
        const hasQueryFilter = Object.keys(queryFilter).length > 0;

        if (hasAccessFilter && hasQueryFilter) {
            finalFilter = { $and: [accessFilter, queryFilter] };
        } else if (hasAccessFilter) {
            finalFilter = accessFilter;
        } else if (hasQueryFilter) {
            finalFilter = queryFilter;
        }

        console.log(`[DEBUG] finalFilter:`, JSON.stringify(finalFilter));
        const tasks = await Task.find(finalFilter)
            .populate({
                path: 'project',
                select: 'name client description location startDate deadline category branch workOrder workOrderCategory status',
                populate: {
                    path: 'workOrder',
                    select: 'workOrderNumber'
                }
            })
            .populate('product', 'name images')
            .populate('assignedTo', 'name role email')
            .populate('completedBy', 'name role email')
            .sort({ updatedAt: -1 });

        console.log(`[DEBUG] Found ${tasks.length} tasks for filter`);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Single Task by ID
// @route   GET /api/tasks/:id
// @access  Private
exports.getTaskById = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate({
                path: 'project',
                select: 'name client description location startDate deadline category branch workOrder workOrderCategory status',
                populate: {
                    path: 'workOrder',
                    select: 'workOrderNumber'
                }
            })
            .populate('product', 'name images')
            .populate('assignedTo', 'name role email')
            .populate('completedBy', 'name role email');

        if (!task) return res.status(404).json({ message: 'Task not found' });

        res.json(task);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Assign Task to Employee
// @route   PUT /api/tasks/:id/assign
// @access  Private (Leader/Admin)
exports.assignTask = async (req, res) => {
    try {
        const { employeeId } = req.body;
        const task = await Task.findById(req.params.id);

        if (!task) return res.status(404).json({ message: 'Task not found' });

        task.assignedTo = employeeId;
        task.assignedBy = req.user._id;
        task.status = 'pending';

        await task.save();

        await createNotification({
            recipient: employeeId,
            title: 'New Task Assigned',
            message: `You have been assigned the task: ${task.stepName}`,
            type: 'task_assigned',
            relatedProject: task.project,
            relatedTask: task._id
        });

        res.json(task);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Bulk Assign Tasks to Employee (Project, Product, or List)
// @route   POST /api/tasks/assign-bulk
// @access  Private (Leader/Admin)
exports.assignBulk = async (req, res) => {
    try {
        const { employeeId, projectId, productId, taskIds } = req.body;
        
        let filter = {};
        if (taskIds && taskIds.length > 0) {
            filter = { _id: { $in: taskIds } };
        } else if (projectId && productId) {
            filter = { project: projectId, product: productId };
        } else if (projectId) {
            filter = { project: projectId };
        } else {
            return res.status(400).json({ message: 'Missing assignment target (project, product, or tasks)' });
        }

        const result = await Task.updateMany(
            filter,
            {
                $set: {
                    assignedTo: employeeId,
                    assignedBy: req.user._id,
                    status: 'pending'
                }
            }
        );

        if (result.modifiedCount > 0 && employeeId) {
            await createNotification({
                recipient: employeeId,
                title: 'New Tasks Assigned',
                message: `You have been bulk assigned ${result.modifiedCount} tasks.`,
                type: 'task_assigned',
                relatedProject: projectId || null
            });
        }

        res.json({
            message: `Successfully assigned ${result.modifiedCount} tasks`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Upload Photo & Complete Task Step
// @route   POST /api/tasks/:id/upload
// @access  Private
exports.uploadPhoto = async (req, res) => {
    try {
        // console.log(`[DEBUG] Received Upload Request:`, req.body);
        const { photoType, photoUrl } = req.body;

        const task = await Task.findById(req.params.id);
        if (!task) {
            console.error(`[ERROR] Task not found: ${req.params.id}`);
            return res.status(404).json({ message: 'Task not found' });
        }

        // console.log(`[DEBUG] Task Found: ${task._id}, Status: ${task.status}`);

        if (task.status === 'verified') {
            return res.status(400).json({ message: 'Task is already verified' });
        }

        if (task.status === 'locked') {
            return res.status(400).json({ message: 'Task is locked. Complete previous steps first.' });
        }

        // Initialize photos object if missing (using Mongoose Mixed type safety)
        if (!task.photos) {
            task.photos = {};
        }

        // Update photo
        task.photos[photoType] = photoUrl;

        // IMPORTANT: Tell Mongoose that 'photos' field is modified since it's a Mixed type or nested object
        task.markModified('photos');

        // Check completion
        const required = task.requiredPhotos || [];
        // console.log(`[DEBUG] Required Photos: ${required}, Current Photos:`, task.photos);

        // Simply mark as in-progress once a photo is uploaded
        task.status = 'in-progress';

        // Update Project Product as in-progress if not already
        try {
            const project = await Project.findById(task.project);
            if (project && project.startDate && new Date(project.startDate) > new Date()) {
                return res.status(403).json({ 
                    message: `Project has not started yet. (Start Date: ${new Date(project.startDate).toLocaleDateString()})` 
                });
            }
            await updateProjectProductStatus(task.project, task.product, 'in-progress');
        } catch (err) {
            console.error('[ERROR] updateProjectProductStatus failed:', err);
        }

        await task.save();
        res.json(task);

    } catch (error) {
        console.error('[CRITICAL ERROR] uploadPhoto crash:', error);
        res.status(500).json({
            message: 'Server error during upload',
            error: error.message,
            stack: error.stack
        });
    }
};

// @desc    Start Task (Record start time)
// @route   POST /api/tasks/:id/start
// @access  Private (Assigned Employee/Leader)
exports.startTask = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        // Access logic:
        // 1. If assigned, only assigned person (or leader/admin) can start.
        // 2. If UNASSIGNED, any authenticated user can "take" and start it.
        const isAssigned = !!task.assignedTo;
        const isAssignedToMe = isAssigned && task.assignedTo.toString() === req.user._id.toString();
        const isAdminOrLeader = req.user.role === 'admin' || req.user.role === 'team_leader';

        if (isAssigned && !isAssignedToMe && !isAdminOrLeader) {
            return res.status(403).json({ message: 'Task is already assigned to someone else' });
        }

        // If unassigned, assign it to the person starting it
        if (!isAssigned) {
            task.assignedTo = req.user._id;
            task.assignedBy = req.user._id; // System self-assignment
        }

        if (task.status !== 'pending' && task.status !== 'in-progress') {
            return res.status(400).json({ message: `Cannot start task with status: ${task.status}` });
        }

        // Check Project Start Date
        const project = await Project.findById(task.project);
        if (project && project.startDate && new Date(project.startDate) > new Date()) {
            return res.status(403).json({ 
                message: `Project has not started yet. (Start Date: ${new Date(project.startDate).toLocaleDateString()})` 
            });
        }

        task.status = 'in-progress';
        if (!task.startedAt) {
            task.startedAt = Date.now();
        }

        await task.save();
        await updateProjectProductStatus(task.project, task.product, 'in-progress');
        res.json(task);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Explicitly Submit/Complete a Task
// @route   POST /api/tasks/:id/submit
// @access  Private
exports.submitTask = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        if (task.status !== 'in-progress' && task.status !== 'pending') {
            return res.status(400).json({ message: 'Task must be in progress or pending to be submitted.' });
        }

        // Optional: Double check required photos
        const required = task.requiredPhotos || [];
        const allPhotosUploaded = required.every(type => task.photos && task.photos[type]);

        if (!allPhotosUploaded) {
            return res.status(400).json({ message: 'Cannot submit. Missing required photos.' });
        }

        const { submissionText } = req.body;

        task.status = 'submitted';
        task.completedBy = req.user._id;
        task.completedAt = Date.now();
        if (submissionText) task.submissionText = submissionText;

        await task.save();
        await updateProjectProductStatus(task.project, task.product, 'in-progress');

        if (task.assignedBy) {
            await createNotification({
                recipient: task.assignedBy,
                title: 'Task Submitted for Review',
                message: `Task "${task.stepName}" has been submitted for review by ${req.user.name}.`,
                type: 'task_submitted',
                relatedProject: task.project,
                relatedTask: task._id
            });
        }

        res.json(task);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update Task (Admin/Verifier overriding status)
// @route   PUT /api/tasks/:id
// @access  Private (Admin/Verify Team)
exports.updateTask = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        // Access Control for Team Leaders
        if (req.user.role === 'team_leader') {
            const project = await Project.findById(task.project);
            if (!project || project.assignedLeader.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'Not authorized to verify tasks for this project' });
            }
        }

        const { status, rejectionReason } = req.body;

        if (status) {
            // Map 'verified' status from frontend to 'completed' in DB
            task.status = status === 'verified' ? 'completed' : status;
        }

        if (status === 'in-progress' && rejectionReason) {
            task.rejectionReason = rejectionReason;
            if (task.assignedTo) {
                await createNotification({
                    recipient: task.assignedTo,
                    title: 'Task Rejected',
                    message: `Your task "${task.stepName}" was rejected. Reason: ${rejectionReason}`,
                    type: 'task_rejected',
                    relatedProject: task.project,
                    relatedTask: task._id
                });
            }
        }

        if (status === 'verified') {
            task.verifiedAt = Date.now();
            task.verifiedBy = req.user._id;
            task.rejectionReason = ""; // Clear reason on approval
            if (task.assignedTo) {
                await createNotification({
                    recipient: task.assignedTo,
                    title: 'Task Approved',
                    message: `Your task "${task.stepName}" has been approved.`,
                    type: 'task_approved',
                    relatedProject: task.project,
                    relatedTask: task._id
                });
            }
        }

        await task.save();

        // If approved (verified), update project progress and unlock next step
        if (status === 'verified' || task.status === 'completed') {
            await updateProjectProductStatus(task.project, task.product, 'in-progress');
            await unlockNextStep(task.project, task.product, task.sequence);
        }

        res.json(task);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Helper: Unlock Next Step
const unlockNextStep = async (projectId, productId, currentSequence) => {
    console.log(`🔓 [UNLOCKING] Checking next step for Project: ${projectId}, Product: ${productId}, After Seq: ${currentSequence}`);
    
    try {
        // Unlock ALL matching next steps (in case of duplicates)
        const result = await Task.updateMany(
            {
                project: projectId,
                product: productId,
                sequence: currentSequence + 1,
                status: 'locked'
            },
            {
                $set: { status: 'pending' }
            }
        );

        if (result.matchedCount > 0) {
            console.log(`✅ [UNLOCKING] Successfully unlocked ${result.modifiedCount} tasks for Sequence ${currentSequence + 1}`);
        } else {
            // Check if there even IS a next step
            const hasNext = await Task.exists({
                project: projectId,
                product: productId,
                sequence: currentSequence + 1
            });
            if (!hasNext) {
                console.log(`ℹ️ [UNLOCKING] No more steps found for this product. Reaching end of workflow.`);
                await updateProjectProductStatus(projectId, productId);
            } else {
                console.log(`⚠️ [UNLOCKING] Next step exists but was not in 'locked' status.`);
            }
        }
    } catch (error) {
        console.error(`❌ [UNLOCKING] Error during next step unlock:`, error);
    }
};

const updateProjectProductStatus = async (projectId, productId, explicitStatus = 'completed') => {
    // console.log(`[DEBUG] updateProjectProductStatus: projectId=${projectId}, productId=${productId}, status=${explicitStatus}`);

    if (!projectId) {
        console.error('[ERROR] updateProjectProductStatus: projectId is missing');
        return;
    }

    const project = await Project.findById(projectId);
    if (!project) {
        console.error(`[ERROR] updateProjectProductStatus: Project not found for ID ${projectId}`);
        return;
    }

    if (!project.products) {
        console.error('[ERROR] updateProjectProductStatus: Project has no products array');
        return;
    }

    const prodEntry = project.products.find(p => p.product && p.product.toString() === productId.toString());

    if (prodEntry) {
        // Only update status to 'completed' if all steps are verified
        // We'll calculate this below

        // --- NEW LOGIC 1: Calculate Real-Time Progress (%) ---
        // Count total tasks for this project & product
        const totalTasks = await Task.countDocuments({ 
            project: new mongoose.Types.ObjectId(projectId), 
            product: new mongoose.Types.ObjectId(productId) 
        });
        const completedTasks = await Task.countDocuments({
            project: new mongoose.Types.ObjectId(projectId),
            product: new mongoose.Types.ObjectId(productId),
            status: { $in: ['completed', 'verified'] }
        });

        if (totalTasks > 0) {
            prodEntry.progress = Math.round((completedTasks / totalTasks) * 100);
            
            // Automatically mark product as completed if all tasks are verified/completed
            if (completedTasks === totalTasks && totalTasks > 0) {
                prodEntry.status = 'completed';
                prodEntry.completedQuantity = prodEntry.plannedQuantity;
            } else if (completedTasks > 0) {
                // If work has started and at least one task is done, ensure status is in-progress
                if (prodEntry.status === 'pending') {
                    prodEntry.status = 'in-progress';
                }
            }
        } else {
            // No tasks? Use explicitStatus if provided
            if (explicitStatus === 'completed') {
                prodEntry.status = 'completed';
                prodEntry.progress = 100;
                prodEntry.completedQuantity = prodEntry.plannedQuantity;
            }
        }
        prodEntry.lastActivity = Date.now();
        // console.log(`[DEBUG] Calculated Progress: ${completedTasks}/${totalTasks} = ${prodEntry.progress}%`);

        // --- NEW LOGIC 2: Update overall PROJECT STATUS ---
        // Check if ANY product is in-progress (set Project to In-Progress)
        // Check if ALL products are completed (set Project to Completed)

        const allProductsCompleted = project.products.every(p => p.status === 'completed');
        const anyInProgress = project.products.some(p => p.status === 'in-progress' || p.status === 'completed');

        if (allProductsCompleted) {
            project.status = 'completed';
        } else if (anyInProgress && project.status === 'planning') {
            // If project was meant to be planning but work started, move to active
            project.status = 'active';
        }
        // If explicitly set to 'in-progress' via other means, we leave it.

        await project.save();
        // console.log(`[DEBUG] Project ${project.name} status updated to ${project.status}`);
    } else {
        console.error(`[ERROR] updateProjectProductStatus: Product ${productId} not found in Project ${projectId}`);
    }
};
