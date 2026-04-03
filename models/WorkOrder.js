const mongoose = require('mongoose');

const workOrderSchema = new mongoose.Schema({
    workOrderNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String
    },
    categories: [{
        name: { type: String, required: true },
        projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }]
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('WorkOrder', workOrderSchema);
