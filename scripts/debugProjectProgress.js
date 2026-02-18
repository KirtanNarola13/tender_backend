const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { Project } = require('../models/Project');
const Task = require('../models/Task');

const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const debugProject = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tender-management');
        console.log('MongoDB Connected');

        // 1. Find the project
        const project = await Project.findOne({ name: 'Test Upload' });
        if (!project) {
            console.log('Project "Test Upload" not found.');
            process.exit();
        }

        console.log(`\n=== PROJECT: ${project.name} (${project._id}) ===`);
        console.log(`Status: ${project.status}`);

        // 2. Check Products
        console.log(`\n--- PRODUCTS (${project.products.length}) ---`);
        for (const p of project.products) {
            console.log(`Product ID: ${p.product}`);
            console.log(`  Status: ${p.status}`);
            console.log(`  Progress Field: ${p.progress}%`);
            console.log(`  Planned Qty: ${p.plannedQuantity}`);
            console.log(`  Completed Qty: ${p.completedQuantity}`);

            // 3. Check Tasks for this Product
            const totalTasks = await Task.countDocuments({ project: project._id, product: p.product });
            const completedTasks = await Task.countDocuments({ project: project._id, product: p.product, status: 'completed' });

            console.log(`  -> Tasks in DB: ${completedTasks} / ${totalTasks}`);

            if (totalTasks > 0) {
                const calc = Math.round((completedTasks / totalTasks) * 100);
                console.log(`  -> Calculated (JS side): ${calc}%`);
            } else {
                console.log(`  -> No tasks found for this product.`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
};

debugProject();
