const Task = require('../models/Task');
const { Project } = require('../models/Project'); // Mongoose model
// Note: Project exports Project, School. But we consolidated.

// @desc    Get Tasks for User (Leader or Employee)
// @route   GET /api/tasks
// @access  Private
// @desc    Get Tasks for User (Leader or Employee)
// @route   GET /api/tasks
// @access  Private
exports.getTasks = async (req, res) => {
    try {
        let accessFilter = {};

        // 1. DETERMINE ACCESS RIGHTS
        if (req.user.role === 'employee') {
            accessFilter = {
                assignedTo: req.user._id,
                status: { $in: ['pending', 'in-progress', 'submitted', 'verified', 'completed'] } // Include all relevant statuses
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

        const tasks = await Task.find(finalFilter)
            .populate('project', 'name location')
            .populate('product', 'name images')
            .populate('assignedTo', 'name role')
            .sort({ project: 1, sequence: 1 });

        res.json(tasks);
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
        res.json(task);
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

        const allPhotosUploaded = required.every(type => task.photos && task.photos[type]);

        if (allPhotosUploaded) {
            // console.log('[DEBUG] All photos uploaded. Marking complete.');
            task.status = 'submitted';
            task.completedBy = req.user._id;
            task.completedAt = Date.now();

            // TRIGGER NEXT STEP
            try {
                // Force progress update (recalc %) - even if product isn't fully done
                await updateProjectProductStatus(task.project, task.product, 'in-progress');

                await unlockNextStep(task.project, task.product, task.sequence);
            } catch (err) {
                console.error('[ERROR] next step/progress update failed:', err);
                // Don't fail the request
            }
        } else {
            // console.log('[DEBUG] Not all photos uploaded. Setting in-progress.');
            task.status = 'in-progress';

            // Also mark Project Product as in-progress if not already
            try {
                await updateProjectProductStatus(task.project, task.product, 'in-progress');
            } catch (err) {
                console.error('[ERROR] updateProjectProductStatus failed:', err);
                // Don't fail request
            }
        }

        await task.save();
        // console.log('[DEBUG] Task saved successfully.');
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

        task.status = 'in-progress';
        if (!task.startedAt) {
            task.startedAt = Date.now();
        }

        await task.save();
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

        if (task.status === 'verified') {
            return res.status(400).json({ message: 'Task is already verified' });
        }

        if (task.status !== 'in-progress') {
            return res.status(400).json({ message: 'Task must be started before it can be submitted.' });
        }

        // Optional: Double check required photos
        const required = task.requiredPhotos || [];
        const allPhotosUploaded = required.every(type => task.photos && task.photos[type]);

        if (!allPhotosUploaded) {
            return res.status(400).json({ message: 'Cannot submit. Missing required photos.' });
        }

        task.status = 'submitted';
        task.completedBy = req.user._id;
        task.completedAt = Date.now();

        await task.save();

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

        const { status, rejectionReason } = req.body;

        if (status) {
            task.status = status;
        }

        if (status === 'in-progress' && rejectionReason) {
            // If rejected, maybe we want to store the reason?
            // Schema doesn't have rejectionReason, but we can add it or just log it.
            // For now, let's just change status back to 'in-progress' so they can re-upload.
            // Ideally add rejectionReason to Task model.
        }

        await task.save();

        // If verified, maybe update project progress?
        if (status === 'verified' || status === 'completed') {
            await updateProjectProductStatus(task.project, task.product, 'in-progress');
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
        // Only update status if it's not already completed
        if (prodEntry.status !== 'completed') {
            prodEntry.status = explicitStatus;
        }

        if (explicitStatus === 'completed') {
            prodEntry.completedQuantity = prodEntry.plannedQuantity;
        }

        // --- NEW LOGIC 1: Calculate Real-Time Progress (%) ---
        // Count total tasks for this project & product
        const totalTasks = await Task.countDocuments({ project: projectId, product: productId });
        const completedTasks = await Task.countDocuments({
            project: projectId,
            product: productId,
            status: 'completed'
        });

        if (totalTasks > 0) {
            prodEntry.progress = Math.round((completedTasks / totalTasks) * 100);
        } else {
            prodEntry.progress = explicitStatus === 'completed' ? 100 : 0;
        }
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
