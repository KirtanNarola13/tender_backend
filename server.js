const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db');

// Load config
dotenv.config();

// Connect DB
connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
    origin: ["http://localhost:5173", "https://tender-admin-sooty.vercel.app", "https://tender-admin.reliablesolution.in", "https://tender-admin.reliablesolution.in/"],
    withCredentials: true,
}));
app.use(helmet({
    crossOriginResourcePolicy: false,
}));

// Request Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Routes
app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/projects', require('./routes/projectRoutes'));
app.use('/api/schools', require('./routes/schoolRoutes'));
// Debugging Inventory Route Loading
const inventoryRoutes = require('./routes/inventoryRoutes');
console.log('Server: Loading Inventory Routes...');
app.use('/api/inventory', inventoryRoutes);

app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(`[Error] ${err.message}`);
    console.error(err.stack);

    // Default to 500 if status code not set
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
