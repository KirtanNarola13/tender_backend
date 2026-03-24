const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendPushNotification } = require('../config/firebaseAdmin');

// @desc    Get all notifications for logged-in user
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user._id })
            .populate('relatedProject', 'name')
            .populate('relatedTask', 'stepName')
            .sort({ createdAt: -1 });
            
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Mark a notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOne({ _id: req.params.id, recipient: req.user._id });
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        
        notification.isRead = true;
        await notification.save();
        res.json({ message: 'Notification marked as read', notification });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user._id, isRead: false },
            { $set: { isRead: true } }
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- HELPER FUNCTION TO CREATE NOTIFICATION ---
exports.createNotification = async ({ recipient, title, message, type, relatedProject = null, relatedTask = null }) => {
    try {
        console.log(`[DEBUG] createNotification called for recipient: ${recipient}, title: ${title}`);
        if (!recipient) {
            console.log(`[DEBUG] createNotification failed: No recipient provided`);
            return null;
        }
        
        const notification = await Notification.create({
            recipient,
            title,
            message,
            type,
            relatedProject,
            relatedTask
        });
        console.log(`[Notification Created]: ${title} for User ${recipient}`);

        // --- TRIGGER PUSH NOTIFICATION ---
        try {
            const user = await User.findById(recipient).select('fcmToken');
            if (user && user.fcmToken) {
                await sendPushNotification(user.fcmToken, title, message, {
                    type,
                    relatedProject: (relatedProject || '').toString(),
                    relatedTask: (relatedTask || '').toString()
                });
            } else {
                console.log(`[FCM] No token found for user: ${recipient}`);
            }
        } catch (pushError) {
            console.error(`[FCM Error] Failed to send push:`, pushError.message);
        }

        return notification;
    } catch (error) {
        console.error(`[Notification Error]: Failed to create notification:`, error.message);
        return null;
    }
};
