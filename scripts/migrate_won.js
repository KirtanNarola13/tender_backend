const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const WorkOrder = require('../models/WorkOrder');
const { Project } = require('../models/Project');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const wos = await WorkOrder.find({});
        if (wos.length === 0) {
            console.log('No Work Orders found');
            return;
        }

        const targetWON = wos[0]; 
        console.log(`Target WON: ${targetWON.workOrderNumber} (_id: ${targetWON._id})`);

        const projects = await Project.find({ workOrder: { $exists: false } });
        console.log(`Found ${projects.length} unmapped projects`);

        for (const project of projects) {
            const catName = project.category || 'Other';
            
            // 1. Ensure category exists in WON
            let match = targetWON.categories.find(c => c.name === catName);
            if (!match) {
                console.log(`Creating missing category "${catName}" in WON...`);
                targetWON.categories.push({ name: catName, projects: [] });
                match = targetWON.categories[targetWON.categories.length - 1];
            }
            
            // 2. Link project to WON
            project.workOrder = targetWON._id;
            project.workOrderCategory = catName;
            await project.save();
            
            // 3. Add project ID to WON's category list
            if (!match.projects.includes(project._id)) {
                match.projects.push(project._id);
            }
            console.log(`Mapped project "${project.name}" to WON Category "${catName}"`);
        }

        await targetWON.save();
        console.log('Migration complete');
    } catch (error) {
        console.error(error);
    } finally {
        mongoose.connection.close();
    }
}

migrate();
