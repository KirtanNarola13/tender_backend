const mongoose = require('mongoose');

const stockLogSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    action: {
        type: String,
        enum: ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT'],
        required: true
    },
    quantity: { type: Number, required: true }, // Positive for add, negative for remove usually, or separate field
    previousStock: { type: Number },
    newStock: { type: Number },
    reason: { type: String }, // e.g., "Procurement", "Damaged", "Sent to Site A"
    referenceProject: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, // If sent to a site
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('StockLog', stockLogSchema);
