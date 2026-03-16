const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Task = require('../models/Task');

async function unlockAll() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tender_system');
        console.log('Connected to MongoDB');

        const result = await Task.updateMany(
            { status: 'locked' },
            { $set: { status: 'pending' } }
        );

        console.log(`✅ Successfully unlocked ${result.modifiedCount} tasks.`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

unlockAll();
