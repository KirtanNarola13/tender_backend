const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
    name: { type: String, required: true },
    location: String,
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    sku: { type: String, unique: true },
    category: String,
    description: String,
    images: [{ type: String }], // Array of image URLs
    steps: [{
        title: { type: String, required: true },
        description: String,
        sequence: { type: Number, required: true }, // 1, 2, 3...
        requiredPhotos: [{ type: String, enum: ['before', 'after'], default: 'after' }]
    }],
    // Inventory Tracking
    stock: [{
        warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
        quantity: { type: Number, default: 0 }
    }],
    totalStock: { type: Number, default: 0 }
}, { timestamps: true });

// Pre-save hook to calculate totalStock? 
// For now, handle in controller.

exports.Warehouse = mongoose.model('Warehouse', warehouseSchema);
exports.Product = mongoose.model('Product', productSchema);
