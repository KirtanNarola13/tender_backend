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
                await deductStock(item.product, item.plannedQuantity, project.name, project._id, req.user._id);
                await generateTasks(project._id, item.product, assignedLeader, req.user._id);
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
        const projects = await Project.find({})
            .populate('createdBy', 'name')
            .populate('assignedLeader', 'name')
            .sort({ updatedAt: -1 });

        // Enrich projects with real-time progress for each product
        const enrichedProjects = await Promise.all(projects.map(async (project) => {
            const projectObj = project.toObject();
            if (projectObj.products && projectObj.products.length > 0) {
                // Calculate real-time progress for each product in the project
                projectObj.products = await Promise.all(projectObj.products.map(async (prodEntry) => {
                    const totalTasks = await Task.countDocuments({ 
                        project: project._id, 
                        product: prodEntry.product 
                    });
                    const completedTasks = await Task.countDocuments({
                        project: project._id,
                        product: prodEntry.product,
                        status: { $in: ['completed', 'verified'] }
                    });

                    if (totalTasks > 0) {
                        prodEntry.progress = Math.round((completedTasks / totalTasks) * 100);
                    }
                    return prodEntry;
                }));

                // Sort products internally by lastActivity
                projectObj.products.sort((a, b) => {
                    const dateA = a.lastActivity || project.createdAt || new Date(0);
                    const dateB = b.lastActivity || project.createdAt || new Date(0);
                    return dateB - dateA;
                });
            }
            return projectObj;
        }));

        res.json(enrichedProjects);
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
            // Sort products by last activity (Latest first)
            if (project.products && project.products.length > 0) {
                project.products.sort((a, b) => {
                    const dateA = a.lastActivity || a._id.getTimestamp() || new Date(0);
                    const dateB = b.lastActivity || b._id.getTimestamp() || new Date(0);
                    return dateB - dateA;
                });
            }
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

        // Products update (sync stock and tasks)
        if (products !== undefined) {
            const oldProducts = project.products || [];
            const newProducts = products;

            // 1. Identify Removed Products
            for (const oldItem of oldProducts) {
                const stillExists = newProducts.find(n => n.product.toString() === oldItem.product.toString());
                if (!stillExists) {
                    console.log(`[SYNC] Removing product ${oldItem.product} from project ${project._id}`);
                    // Delete tasks
                    await Task.deleteMany({ project: project._id, product: oldItem.product });
                    // Restore stock
                    await restoreStock(oldItem.product, oldItem.plannedQuantity, project.name, project._id, req.user._id);
                }
            }

            // 2. Identify Added or Updated Products
            for (const newItem of newProducts) {
                const oldItem = oldProducts.find(o => o.product.toString() === newItem.product.toString());
                
                if (!oldItem) {
                    console.log(`[SYNC] Adding new product ${newItem.product} to project ${project._id}`);
                    // New product
                    await deductStock(newItem.product, newItem.plannedQuantity, project.name, project._id, req.user._id);
                    await generateTasks(project._id, newItem.product, project.assignedLeader, req.user._id);
                } else if (Number(newItem.plannedQuantity) !== Number(oldItem.plannedQuantity)) {
                    console.log(`[SYNC] Updating quantity for product ${newItem.product} in project ${project._id}`);
                    // Quantity changed
                    const diff = Number(newItem.plannedQuantity) - Number(oldItem.plannedQuantity);
                    if (diff > 0) {
                        await deductStock(newItem.product, diff, project.name, project._id, req.user._id);
                    } else if (diff < 0) {
                        await restoreStock(newItem.product, Math.abs(diff), project.name, project._id, req.user._id);
                    }
                }
            }

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

// --- HELPER FUNCTIONS ---

async function deductStock(productId, quantity, projectName, projectId, userId) {
    const productDef = await Product.findById(productId);
    if (!productDef) throw new Error(`Product not found: ${productId}`);

    const requestedQty = Number(quantity);
    if ((productDef.totalStock || 0) < requestedQty) {
        throw new Error(`Insufficient stock for ${productDef.name}. Requested: ${requestedQty}, Available: ${productDef.totalStock}`);
    }

    let remainingToDeduct = requestedQty;
    if (productDef.stock && productDef.stock.length > 0) {
        for (let s of productDef.stock) {
            if (remainingToDeduct <= 0) break;
            if (s.quantity > 0) {
                const take = Math.min(s.quantity, remainingToDeduct);
                s.quantity -= take;
                remainingToDeduct -= take;

                await StockLog.create({
                    product: productDef._id,
                    warehouse: s.warehouse,
                    action: 'OUT',
                    quantity: -take,
                    reason: `Allocated to Project Update: ${projectName}`,
                    referenceProject: projectId,
                    performedBy: userId
                });
            }
        }
        productDef.totalStock = productDef.stock.reduce((acc, s) => acc + s.quantity, 0);
        await productDef.save();
    } else {
        throw new Error(`Corrupt stock data for ${productDef.name}`);
    }
}

async function restoreStock(productId, quantity, projectName, projectId, userId) {
    const productDef = await Product.findById(productId);
    if (!productDef) return; // Or handle error

    const restoreQty = Number(quantity);
    
    // Simple restoration: put back into the first warehouse found, or handle more complex logic.
    // For simplicity, we add back to the first warehouse that has a record for this product.
    if (productDef.stock && productDef.stock.length > 0) {
        productDef.stock[0].quantity += restoreQty;
        
        await StockLog.create({
            product: productDef._id,
            warehouse: productDef.stock[0].warehouse,
            action: 'IN',
            quantity: restoreQty,
            reason: `Restored from Project Update/Removal: ${projectName}`,
            referenceProject: projectId,
            performedBy: userId
        });

        productDef.totalStock = productDef.stock.reduce((acc, s) => acc + s.quantity, 0);
        await productDef.save();
    }
}

async function generateTasks(projectId, productId, leaderId, userId) {
    const productDef = await Product.findById(productId);
    if (!productDef || !productDef.steps || productDef.steps.length === 0) return;

    const sortedSteps = productDef.steps.sort((a, b) => a.sequence - b.sequence);
    for (const step of sortedSteps) {
        // Avoid duplicate tasks if this helper is called multiple times (sanity check)
        const exists = await Task.exists({
            project: projectId,
            product: productId,
            stepName: step.title,
            sequence: step.sequence
        });

        if (!exists) {
            await Task.create({
                project: projectId,
                product: productId,
                stepName: step.title,
                sequence: step.sequence,
                description: step.description,
                requiredPhotos: step.requiredPhotos,
                status: 'pending',
                assignedTo: leaderId,
                assignedBy: userId
            });
        }
    }
}
