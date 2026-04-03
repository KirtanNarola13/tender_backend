const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    name: { type: String, required: true }, // Site Name
    client: { type: String, required: true },
    location: { type: String, required: true },
    description: String,

    category: {
        type: String,
        required: true,
        enum: ['Primary', 'Upper Primary', 'Secondary', 'Higher Secondary', 'Residential']
    },

    // Dates
    startDate: Date,
    deadline: Date,

    status: { type: String, enum: ['planning', 'active', 'completed', 'halted', 'on-hold'], default: 'planning' },

    assignedLeader: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Team Leader for the Site

    // Products being deployed at this Site
    products: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        plannedQuantity: { type: Number, required: true },
        // Tracks how many units are fully "Done" (all steps completed)
        completedQuantity: { type: Number, default: 0 },
        status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
        // Tracks granular step progress (0-100%)
        progress: { type: Number, default: 0 },
        lastActivity: { type: Date, default: Date.now }
    }],

    completionLetter: {
        url: String, // Cloudinary URL
        uploadedAt: Date
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    branch: { 
        type: String, 
        default: '' // Optional branch assignment
    },
    workOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOrder' },
    workOrderCategory: { type: String },
}, { timestamps: true });

// We might not need 'School' anymore if Project = Site. 
// But let's keep it for legacy or if multiple sites per project needed later. 
// For now, focusing on Project as the main unit.

exports.Project = mongoose.model('Project', projectSchema);

