const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
    poNumber: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    date: { 
        type: Date, 
        default: Date.now 
    },
    party: {
        name: { type: String, required: true },
        phone: String,
        address: String,
        email: String
    },
    warehouse: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Warehouse', 
        required: true 
    },
    items: [{
        product: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Product', 
            required: true 
        },
        productName: { 
            type: String, 
            required: true // Snapshot of product name for history safety
        },
        quantity: { 
            type: Number, 
            required: true 
        },
        receivedQuantity: {
            type: Number,
            default: 0
        },
        unitPrice: { 
            type: Number, 
            default: 0 
        },
        amount: { 
            type: Number, 
            default: 0 
        }
    }],
    totals: {
        totalQuantity: { type: Number, default: 0 },
        totalAmount: { type: Number, default: 0 }
    },
    deliveryStatus: {
        type: String,
        enum: ['ORDER_PLACED', 'ADVANCE', 'IN_PRODUCTION', 'TRANSIT', 'DELIVERED', 'INSTALLATION', 'COMPLETED', 'PARTIAL'],
        default: 'ORDER_PLACED'
    },
    statusTimeline: [{
        status: { type: String },
        expectedDate: { type: Date },
        actualDate: { type: Date },
        isCompleted: { type: Boolean, default: false },
        notes: { type: String }
    }],
    partialDeliveries: [{
        items: [{
            product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            quantity: Number
        }],
        deliveredAt: { type: Date, default: Date.now },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
    }
}, { timestamps: true });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
