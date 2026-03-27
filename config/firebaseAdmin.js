const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    }

    console.log('[Firebase] Admin SDK Initialized');
}
const sendPushNotification = async (token, title, body, data = {}) => {
    if (!admin.apps.length) return;

    const message = {
        notification: {
            title,
            body,
        },
        data: Object.keys(data).reduce((acc, key) => {
            acc[key] = String(data[key]);
            return acc;
        }, {}),
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
