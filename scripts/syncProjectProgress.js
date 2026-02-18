const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { Project } = require('../models/Project');
const Task = require('../models/Task');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const syncProgress = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tender-management');
        console.log('MongoDB Connected');

        const projects = await Project.find();
        console.log(`Found ${projects.length} projects. Syncing progress...`);

        for (const project of projects) {
            let modified = false;

            if (!project.products) continue;

            for (const p of project.products) {
                const totalTasks = await Task.countDocuments({ project: project._id, product: p.product });
                const completedTasks = await Task.countDocuments({
                    project: project._id,
                    product: p.product,
                    status: 'completed'
                });

                let newProgress = 0;
                if (totalTasks > 0) {
                    newProgress = Math.round((completedTasks / totalTasks) * 100);
                } else {
                    newProgress = p.status === 'completed' ? 100 : 0;
                }

                if (p.progress !== newProgress) {
                    console.log(`[UPDATE] Project "${project.name}" Product ${p.product}: ${p.progress}% -> ${newProgress}%`);
                    p.progress = newProgress;

                    // Also auto-fix status if 100%
                    if (newProgress === 100 && p.status !== 'completed') {
                        p.status = 'completed';
                        p.completedQuantity = p.plannedQuantity;
                    }
                    modified = true;
                }
            }

            if (modified) {
                // Re-evaluate Project Status
                const allProductsCompleted = project.products.every(p => p.status === 'completed');
                const anyInProgress = project.products.some(p => p.status === 'in-progress' || p.status === 'completed');

                if (allProductsCompleted) {
                    project.status = 'completed';
                } else if (anyInProgress && project.status === 'planning') {
                    project.status = 'active';
                }

                await project.save();
                console.log(`Saved Project "${project.name}"`);
            }
        }

        console.log('Sync Complete.');

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
};

syncProgress();
