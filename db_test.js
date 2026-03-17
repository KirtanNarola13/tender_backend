const mongoose = require('mongoose');
const Task = require('./models/Task');
const { Project } = require('./models/Project');
const { Product } = require('./models/Inventory');
const User = require('./models/User');
require('dotenv').config();

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tender');
        console.log("Connected to DB");

        const projects = await Project.find().select('name');
        console.log(`Found ${projects.length} projects`);

        const projectStats = await Promise.all(projects.map(async (project) => {
            const projectTasks = await Task.find({ project: project._id }).select('status');
            const total = projectTasks.length;
            const completed = projectTasks.filter(t => t.status === 'completed' || t.status === 'verified').length;
            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
            return {
                name: project.name,
                progress: progress,
                totalTasks: total
            };
        }));

        console.log("Project Stats:", JSON.stringify(projectStats, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

runTest();
