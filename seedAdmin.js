const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const seedAdmin = async () => {
    try {
        const adminExists = await User.findOne({ email: 'admin@tender.com' });
        if (adminExists) {
            console.log('Admin already exists');
            process.exit();
        }

        await User.create({
            name: 'Super Admin',
            email: 'admin@tender.com',
            password: 'password123',
            role: 'admin',
        });

        console.log('Admin user created');

        // Also seed a Team Leader for testing mobile app
        await User.create({
            name: 'Team Leader 1',
            email: 'leader@tender.com',
            password: 'password123',
            role: 'team_leader'
        });

        console.log('Team Leader user created');

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

seedAdmin();
