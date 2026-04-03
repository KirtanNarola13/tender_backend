const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const migrate = async () => {
    await connectDB();

    try {
        const Task = require('./models/Task');

        console.log('Finding locked tasks...');
        const result = await Task.updateMany(
            { status: 'locked' },
            { $set: { status: 'pending' } }
        );

        console.log(`Migration Complete!`);
        console.log(`Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
