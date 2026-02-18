const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Project = require('../models/Project');

dotenv.config({ path: '../.env' }); // Adjust path if needed

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tender-management');
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('Connection Error:', err);
        process.exit(1);
    }
};

const syncStatuses = async () => {
    await connectDB();

    const projects = await Project.find();
    console.log(`Found ${projects.length} projects. Checking statuses...`);

    for (const project of projects) {
        let shouldSave = false;

        // 1. Check Product Statuses
        const products = project.products || [];
        if (products.length === 0) continue;

        const allProductsCompleted = products.every(p => p.status === 'completed');
        const anyInProgress = products.some(p => p.status === 'in-progress' || p.status === 'completed');

        // Logic
        let calculatedStatus = 'planning'; // Default
        if (allProductsCompleted) {
            calculatedStatus = 'completed';
        } else if (anyInProgress) {
            calculatedStatus = 'in-progress';
        }

        // 2. Update if different
        if (project.status !== calculatedStatus) {
            console.log(`[FIX] Project "${project.name}": ${project.status} -> ${calculatedStatus}`);
            project.status = calculatedStatus;
            shouldSave = true;
        }

        if (shouldSave) {
            await project.save();
        }
    }

    console.log('Sync Complete.');
    process.exit();
};

syncStatuses();
