const mongoose = require('mongoose');

// Standard SOW Items:
// 1. Signage Boards
// 2. Pin-Up Boards
// 3. White Boards
// 4. Solar / Natural System
// 5. Plumbing Works
// 6. Multi Play Station
// 7. RCC Work
// 8. Flooring Work
// 9. Outdoor Gym



// A Task now represents a SINGLE STEP of a Product being deployed at a Project (Site).
const taskSchema = new mongoose.Schema({
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },

    // Step Details (Copied from Product Snapshot or Dynamic)
    stepName: { type: String, required: true }, // e.g., "Transport to Site"
    sequence: { type: Number, required: true }, // 1, 2, 3...
    description: String,

    // Status
    status: {
        type: String,
        enum: ['locked', 'pending', 'in-progress', 'submitted', 'completed', 'verified'],
        default: 'locked'
    },

    // Assignment
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Employee or Team Leader
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Leader who assigned it

    // Proof
    requiredPhotos: [{ type: String }], // ['before', 'after']
    photos: {
        before: String,
        after: String,
        // Any other dynamic keys
    },

    // Timestamps
    startedAt: Date,
    completedAt: Date,
    verifiedAt: Date,

    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String,
    submissionText: String,

}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
