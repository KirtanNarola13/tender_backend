const { Project } = require('../models/Project');

// @desc    Create a new project
// @route   POST /api/projects
// @access  Private/Admin

const { Product } = require('../models/Inventory');
const Task = require('../models/Task');
const StockLog = require('../models/StockLog');

// @desc    Create a new project (Site) & Auto-generate Tasks
// @route   POST /api/projects
// @access  Private/Admin
exports.createProject = async (req, res) => {
    try {
        const { name, client, location, description, assignedLeader, products, startDate, deadline, category } = req.body;
        console.log(req.body);
        // 1. Create Project
        const project = await Project.create({
            name,
            client,
            location,
            category,
            description,
            assignedLeader,
            products, // [{ product, plannedQuantity }]
            startDate,
            deadline,
            createdBy: req.user._id,
            status: 'planning'
        });

        // 2. Auto-generate Tasks for each Product
        if (products && products.length > 0) {
            for (const item of products) {
                const productDef = await Product.findById(item.product);

                // STOCK DEDUCTION LOGIC
                if (productDef) {
                    const requestedQty = Number(item.plannedQuantity);
                    if ((productDef.totalStock || 0) < requestedQty) {
                        throw new Error(`Insufficient stock for ${productDef.name}. Requested: ${requestedQty}, Available: ${productDef.totalStock}`);
                    }

                    let remainingToDeduct = requestedQty;
                    // Deduct from warehouses (Greedy strategy)
                    if (productDef.stock && productDef.stock.length > 0) {
                        for (let s of productDef.stock) {
                            if (remainingToDeduct <= 0) break;
                            if (s.quantity > 0) {
                                const take = Math.min(s.quantity, remainingToDeduct);
                                s.quantity -= take;
                                remainingToDeduct -= take;

                                // Log the deduction
                                await StockLog.create({
                                    product: productDef._id,
                                    warehouse: s.warehouse,
                                    action: 'OUT',
                                    quantity: -take,
                                    reason: `Allocated to Project: ${project.name}`,
                                    referenceProject: project._id,
                                    performedBy: req.user._id
                                });
                            }
                        }

                        // Recalculate total
                        productDef.totalStock = productDef.stock.reduce((acc, s) => acc + s.quantity, 0);
                        await productDef.save();
                    } else {
                        // Edge case: totalStock > 0 but stock array empty? Should not happen if logic consistent.
                        // If strict, throw error or just decrement totalStock if allowing loose tracking.
                        // enforcing structure:
                        throw new Error(`Corrupt stock data for ${productDef.name}`);
                    }
                }

                if (productDef && productDef.steps && productDef.steps.length > 0) {

                    // Sort steps by sequence
                    const sortedSteps = productDef.steps.sort((a, b) => a.sequence - b.sequence);

                    // Create a task for EACH step
                    for (let i = 0; i < sortedSteps.length; i++) {
                        const step = sortedSteps[i];

                        await Task.create({
                            project: project._id,
                            product: productDef._id,
                            stepName: step.title,
                            sequence: step.sequence,
                            description: step.description,
                            requiredPhotos: step.requiredPhotos,
                            // All steps are now pending by default (no sequential locking)
                            status: 'pending',
                            assignedTo: assignedLeader, 
                            assignedBy: req.user._id
                        });
                    }
                }
            }
        }

        res.status(201).json(project);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get all projects
// @route   GET /api/projects
// @access  Private
exports.getProjects = async (req, res) => {
    try {
        const projects = await Project.find({}).populate('createdBy', 'name').populate('assignedLeader', 'name');
        res.json(projects);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get project by ID
// @route   GET /api/projects/:id
// @access  Private
exports.getProjectById = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id)
            .populate('products.product', 'name images steps')
            .populate('assignedLeader', 'name');
        if (project) {
            res.json(project);
        } else {
            res.status(404).json({ message: 'Project not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update project (full edit — all fields)
// @route   PUT /api/projects/:id
// @access  Private/Admin
exports.updateProject = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const {
            name, client, location, category, description,
            startDate, deadline, status,
            assignedLeader, products, completionLetter
        } = req.body;

        // Apply only provided fields (safe partial update)
        if (name        !== undefined) project.name        = name;
        if (client      !== undefined) project.client      = client;
        if (location    !== undefined) project.location    = location;
        if (category    !== undefined) project.category    = category;
        if (description !== undefined) project.description = description;
        if (startDate   !== undefined) project.startDate   = startDate || undefined;
        if (deadline    !== undefined) project.deadline    = deadline  || undefined;
        if (status      !== undefined) project.status      = status;
        if (completionLetter !== undefined) project.completionLetter = completionLetter;

        // Leader change — also reassign pending/in-progress tasks
        if (assignedLeader !== undefined) {
            project.assignedLeader = assignedLeader || undefined;
            if (assignedLeader) {
                await Task.updateMany(
                    { project: project._id, status: { $nin: ['completed', 'verified'] } },
                    { assignedTo: assignedLeader }
                );
            }
        }

        // Products update (only if sent)
        if (products !== undefined) {
            project.products = products;
        }

        await project.save();
        res.json(project);
    } catch (error) {
        console.error('updateProject error:', error.message);
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private/Admin
exports.deleteProject = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Cascade delete associated tasks
        await Task.deleteMany({ project: project._id });
        
        await project.deleteOne();
        res.json({ message: 'Project removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
