const WorkOrder = require('../models/WorkOrder');
const { Project } = require('../models/Project');

// @desc    Create a new Work Order
// @route   POST /api/workorders
// @access  Private/Admin
exports.createWorkOrder = async (req, res) => {
    try {
        const { workOrderNumber, description, categories } = req.body;

        const numericWON = Number(workOrderNumber);
        if (isNaN(numericWON)) {
            return res.status(400).json({ message: "Work Order Number must be a valid number." });
        }

        const existingWON = await WorkOrder.findOne({ workOrderNumber: numericWON });
        if (existingWON) {
            return res.status(400).json({ message: `Work Order Number "${workOrderNumber}" already exists.` });
        }

        const workOrder = await WorkOrder.create({
            workOrderNumber,
            description,
            categories: categories || [], // { name: String, projects: [ID] }
            createdBy: req.user._id
        });

        res.status(201).json(workOrder);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get all Work Orders
// @route   GET /api/workorders
// @access  Private
exports.getWorkOrders = async (req, res) => {
    try {
        const workOrders = await WorkOrder.find({})
            .populate('categories.projects')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });

        res.json(workOrders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Work Order by ID
// @route   GET /api/workorders/:id
// @access  Private
exports.getWorkOrderById = async (req, res) => {
    try {
        const workOrder = await WorkOrder.findById(req.params.id)
            .populate('categories.projects')
            .populate('createdBy', 'name');

        if (workOrder) {
            res.json(workOrder);
        } else {
            res.status(404).json({ message: 'Work Order not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update Work Order
// @route   PUT /api/workorders/:id
// @access  Private/Admin
exports.updateWorkOrder = async (req, res) => {
    try {
        const { workOrderNumber, description, categories } = req.body;
        const workOrder = await WorkOrder.findById(req.params.id);

        if (!workOrder) {
            return res.status(404).json({ message: 'Work Order not found' });
        }

        // Handle WON uniqueness
        if (workOrderNumber !== undefined && Number(workOrderNumber) !== workOrder.workOrderNumber) {
            const numericWON = Number(workOrderNumber);
            if (isNaN(numericWON)) {
                return res.status(400).json({ message: "Work Order Number must be a valid number." });
            }

            const existingWON = await WorkOrder.findOne({ 
                workOrderNumber: numericWON,
                _id: { $ne: workOrder._id }
            });
            if (existingWON) {
                return res.status(400).json({ message: `Work Order Number "${workOrderNumber}" already exists.` });
            }
            workOrder.workOrderNumber = numericWON;
        }

        if (description !== undefined) workOrder.description = description;
        if (categories !== undefined) workOrder.categories = categories;

        const updatedWorkOrder = await workOrder.save();
        res.json(updatedWorkOrder);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete Work Order
// @route   DELETE /api/workorders/:id
// @access  Private/Admin
exports.deleteWorkOrder = async (req, res) => {
    try {
        const workOrder = await WorkOrder.findById(req.params.id);
        if (!workOrder) {
            return res.status(404).json({ message: 'Work Order not found' });
        }

        await workOrder.deleteOne();
        res.json({ message: 'Work Order removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
