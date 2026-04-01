const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    location: {
        type: String,
        required: true,
    },
    description: {
        type: String,
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // The designated branch manager or primary contact
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
    },
}, { timestamps: true });

module.exports = mongoose.model('Branch', branchSchema);
