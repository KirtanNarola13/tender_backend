const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

exports.register = async (req, res) => {
    const { name, email, password, role } = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const user = await User.create({
            name,
            email,
            password,
            role: role || 'employee',
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id),
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            console.log('Login failed: User not found:', email);
            return res.status(401).json({ message: 'User not found. Please check your email.' });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            console.log('Login failed: Incorrect password for:', email);
            return res.status(401).json({ message: 'Incorrect password. Please try again.' });
        }

        if (user.isBlocked) {
            return res.status(403).json({ message: 'Your account has been blocked. Please contact administrator.' });
        }

        // Check if admin is trying to login from mobile
        const clientType = req.headers['x-client-type'];
        if (user.role === 'admin' && clientType === 'mobile') {
            console.log('Admin login blocked from mobile:', email);
            return res.status(403).json({ 
                message: 'Use admin login for login admin user' 
            });
        }

        console.log('Login success for:', email);
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getMe = async (req, res) => {
    res.status(200).json(req.user);
};
