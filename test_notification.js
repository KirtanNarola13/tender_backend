const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { createNotification } = require('./controllers/notificationController');

dotenv.config();

const testNotify = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Get a user to send notification to
        const User = require('./models/User');
        const user = await User.findOne();
        
        if (!user) {
            console.log('No user found to notify.');
        } else {
            console.log(`Sending test notification to: ${user.name} (${user._id})`);
            const n = await createNotification({
                recipient: user._id,
                title: 'Test Notification',
                message: 'This is a manual test notification.',
                type: 'system_alert'
            });
            console.log('Result:', n ? 'Success' : 'Failed');
        }

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

testNotify();
