const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const Task = require('../models/Task');

async function checkTasks() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tender_system');
        console.log('Connected to MongoDB');

        const submittedCount = await Task.countDocuments({ status: 'submitted' });
        const completedCount = await Task.countDocuments({ status: 'completed' });
        const pendingCount = await Task.countDocuments({ status: 'pending' });
        const verifiedCount = await Task.countDocuments({ status: 'verified' });

        console.log('Task Status Summary:');
        console.log('- Submitted:', submittedCount);
        console.log('- Completed:', completedCount);
        console.log('- Pending:', pendingCount);
        console.log('- Verified:', verifiedCount);

        const samples = await Task.find({ status: { $in: ['submitted', 'completed'] } }).limit(5).select('stepName status photos');
        console.log('\nSample Tasks (Submitted/Completed):', JSON.stringify(samples, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkTasks();
