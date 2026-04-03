const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const connectDB = require('./config/db');

dotenv.config();

const addAdmin = async () => {
    try {
        await connectDB();

        const email = 'admin@gmail.com';
        const password = '1234';

        const adminExists = await User.findOne({ email });
        if (adminExists) {
            console.log(`Admin with email ${email} already exists`);
            process.exit();
        }

        await User.create({
            name: 'Admin User',
            email: email,
            password: password,
            role: 'admin',
        });

        console.log(`Admin user created successfully with email: ${email}`);
        process.exit();
    } catch (error) {
        console.error('Error creating admin user:', error);
        process.exit(1);
    }
};

addAdmin();
