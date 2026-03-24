const User = require('../models/User');

exports.updateFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) {
            return res.status(400).json({ message: 'FCM Token is required' });
        }

        await User.findByIdAndUpdate(req.user.id, { fcmToken });
        
        console.log(`[FCM] Token updated for user: ${req.user.email}`);
        res.status(200).json({ message: 'FCM Token updated successfully' });
    } catch (error) {
        console.error(`[FCM Error] ${error.message}`);
        res.status(500).json({ message: error.message });
    }
};
