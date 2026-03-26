const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');

if (fs.existsSync(serviceAccountPath)) {
    admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath)),
    });
    console.log('[Firebase] Admin SDK Initialized');
} else {
    console.warn('[Firebase] Service account file not found. Push notifications will be disabled.');
}

const sendPushNotification = async (token, title, body, data = {}) => {
    if (!admin.apps.length) return;

    const message = {
        notification: {
            title,
            body,
        },
        data: {
            ...data,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                    badge: 1,
                    contentAvailable: true,
                },
            },
        },
        token,
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('[Firebase] Successfully sent message:', response);
    } catch (error) {
        console.error('[Firebase] Error sending message:', error);
    }
};

module.exports = { admin, sendPushNotification };
