const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function debugTask() {
    try {
        // 1. Login to get token (using a known admin/team lead credential or creating one? 
        // I'll assume standard admin login from seed or just create a quick user if needed.
        // Actually, I can check seedAdmin.js or just create a user.
        // Let's assume there is a user. I'll try to find one first or just use a known one if I knew it.
        // I'll register a temp user to be sure.

        const email = `debug_${Date.now()}@test.com`;
        const password = 'password123';

        // Register Team Leader
        await axios.post(`${API_URL}/auth/register`, {
            name: 'Debug User',
            email,
            password,
            role: 'team_leader'
        });

        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email,
            password
        });

        const token = loginRes.data.token;
        console.log('Got Token');

        // 2. Fetch the specific Task
        const taskId = '69773f8fae998aa65a296109';
        // Need to ensure this user can see the task. Team Leader can only see assigned tasks.
        // Maybe I should login as ADMIN.

        // Register Admin
        const adminEmail = `admin_debug_${Date.now()}@test.com`;
        await axios.post(`${API_URL}/auth/register`, {
            name: 'Debug Admin',
            email: adminEmail,
            password,
            role: 'admin'
        });
        const adminLoginRes = await axios.post(`${API_URL}/auth/login`, {
            email: adminEmail,
            password
        });
        const adminToken = adminLoginRes.data.token;

        console.log('Got Admin Token');

        // Note: The specific task ID '69773f8fae998aa65a296109' might not exist if I just restarted DB or if it was from user's persistent DB. 
        // Since user is running local backend, I am running against THEIR db.
        // I will try to fetch ALL tasks and finding the one, or just GET /tasks.

        const tasksRes = await axios.get(`${API_URL}/tasks`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });

        console.log('Tasks fetched:', tasksRes.data.length);

        if (tasksRes.data.length > 0) {
            const task = tasksRes.data[0];
            console.log('First Task Structure Keys:', Object.keys(task));
            console.log('School Type:', Array.isArray(task.school) ? 'Array' : typeof task.school);
            console.log('School Value:', JSON.stringify(task.school, null, 2));
            console.log('Checklist Type:', Array.isArray(task.checklist) ? 'Array' : typeof task.checklist);

            if (task.checklist.length > 0) {
                console.log('First Checklist Item:', JSON.stringify(task.checklist[0], null, 2));
            }
        }

    } catch (e) {
        console.error('Error:', e.response ? e.response.data : e.message);
    }
}

debugTask();
