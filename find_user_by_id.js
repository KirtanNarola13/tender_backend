const mongoose = require('mongoose');
const User = require('./models/User');
const dotenv = require('dotenv');

dotenv.config();

const findUser = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const id = '697a037e880d30aeec325bc5';
        const user = await User.findById(id);
        if (user) {
            console.log(`User ID: ${id}`);
            console.log(`Email: ${user.email}`);
            console.log(`Role: ${user.role}`);
        } else {
            console.log(`User not found: ${id}`);
        }
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

findUser();
