const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Notification = require('./models/Notification');
const User = require('./models/User');
const { Project } = require('./models/Project');

dotenv.config();

const checkNotifications = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const notifications = await Notification.find().populate('recipient', 'name role').sort({ createdAt: -1 }).limit(5);
        
        if (notifications.length === 0) {
            console.log('No notifications found in the database.');
        } else {
            console.log('Last 5 Notifications:');
            notifications.forEach(n => {
                console.log(`- To: ${n.recipient?.name} (${n.recipient?.role}), Title: ${n.title}, Created: ${n.createdAt}`);
            });
        }

        const projects = await Project.find().sort({ createdAt: -1 }).limit(1);
        if (projects.length > 0) {
            console.log('\nLatest Project:', projects[0].name, 'Assigned Leader ID:', projects[0].assignedLeader);
        }

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

checkNotifications();
