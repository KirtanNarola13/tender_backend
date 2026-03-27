const { sendPushNotification } = require('../config/firebaseAdmin');

const run = async () => {
    const token = process.argv[2];
    // Default IDs for testing if not provided
    const taskId = process.argv[3] || "67a36c843ce8099688755609";
    const projId = process.argv[4] || "67a36a993ce8099688755589";

    if (!token) {
        console.error('\x1b[31m%s\x1b[0m', '❌ Error: FCM Token is required.');
        console.log('\nUsage:');
        console.log('  node scripts/test_path_notification.js <FCM_TOKEN> [TASK_ID] [PROJ_ID]\n');
        console.log('Example:');
        console.log('  node scripts/test_path_notification.js "dV7xS..." "67a3..." "67a3..."\n');
        process.exit(1);
    }

    console.log('\n-------------------------------------------');
    console.log('🚀  Testing Path-Based Notification');
    console.log('-------------------------------------------');
    console.log(`📱 Token: ${token.substring(0, 20)}...`);
    console.log(`📝 Task:  ${taskId}`);
    console.log(`📁 Proj:  ${projId}`);
    console.log('-------------------------------------------\n');
    
    await sendPushNotification(
        token,
        '🚨 New Task Assigned (Manual Test)',
        'Click this notification to test the deep-linking navigation to the task screen.',
        {
            relatedTask: taskId,
            relatedProject: projId,
            type: 'task_assigned'
        }
    );

    console.log('\n✅  Notification request submitted to Firebase Admin SDK.');
    console.log('    Check your mobile device now.');
    process.exit(0);
};

run().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
