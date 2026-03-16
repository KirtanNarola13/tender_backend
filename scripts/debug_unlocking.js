const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Project = require('../models/Project');
const { Product } = require('../models/Inventory');
const Task = require('../models/Task');

async function debugUnlocking() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tender_system');
        console.log('Connected to MongoDB');

        // Check for ANY tasks that should be unlocked but are locked
        const tasks = await Task.find({}).populate('project', 'name').populate('product', 'name').sort({ sequence: 1 });
        
        console.log('Task Status Check:');
        tasks.forEach(t => {
            console.log(`[${t.project?.name || 'NA'}] ${t.product?.name || 'NA'} (Step ${t.sequence}: ${t.stepName}) -> Status: ${t.status}`);
        });

        const completedTasks = tasks.filter(t => ['submitted', 'completed', 'verified'].includes(t.status));
        
        let bugFound = false;
        for (const ct of completedTasks) {
            const next = await Task.findOne({
                project: ct.project?._id || ct.project,
                product: ct.product?._id || ct.product,
                sequence: ct.sequence + 1
            });
            if (next && next.status === 'locked') {
                console.log(`\n❌ BUG DETECTED: Task "${ct.stepName}" (seq ${ct.sequence}) is ${ct.status}, but next task "${next.stepName}" (seq ${next.sequence}) is STILL LOCKED.`);
                bugFound = true;
            }
        }

        if (!bugFound) {
            console.log('\n✅ No locked successor tasks found for completed tasks in the database.');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugUnlocking();
