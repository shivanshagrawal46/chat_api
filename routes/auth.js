const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const { OAuth2Client } = require('google-auth-library');
const WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID || '54116343950-vq0kf8eiq6eikv8oig50j8eld54oou1q.apps.googleusercontent.com';
const ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID || 'rzp_test_aE4kYli12TObHZ'; // Replace with your actual Android client ID if needed
const client = new OAuth2Client();

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password, confirmPassword } = req.body;
        if (!firstName || !lastName || !email || !phone || !password || !confirmPassword) {
            return res.status(400).json({ error: 'All fields are required.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match.' });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered.' });
        }
        const user = new User({ firstName, lastName, email, phone, password });
        await user.save();
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({
            token,
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) {
            throw new Error('Invalid login credentials');
        }
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Google login (new robust version)
router.post('/google', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ error: 'No ID token provided' });

        // Accept both web and android client IDs
        const ticket = await client.verifyIdToken({
            idToken,
            audience: [WEB_CLIENT_ID, ANDROID_CLIENT_ID]
        });
        const payload = ticket.getPayload();

        // Prevent admin from logging in via Google
        if (payload.email === 'bhupendrapandey29@gmail.com') {
            return res.status(403).json({ error: 'Admin cannot login with Google. Please use email and password login.' });
        }

        // Find or create user
        let user = await User.findOne({ email: payload.email });
        if (!user) {
            user = new User({
                firstName: payload.given_name || '',
                lastName: payload.family_name || '',
                email: payload.email,
                googleId: payload.sub,
                picture: payload.picture || '',
                phone: ''
            });
            await user.save();
            // Notify admins about new user
            if (req.app.get('io')) {
                req.app.get('io').emit('new_user', {
                    _id: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    phone: user.phone,
                    isAdmin: user.isAdmin,
                    createdAt: user.createdAt
                });
            }
        } else if (!user.googleId) {
            user.googleId = payload.sub;
            await user.save();
        }

        // Issue JWT for your app
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({
            token,
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                picture: user.picture,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        console.error('Google login error:', error);
        res.status(400).json({ error: 'Failed to authenticate with Google', details: error.message });
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    res.json(req.user);
});

// Refresh token
router.post('/refresh-token', auth, async (req, res) => {
    try {
        // Generate new token
        const newToken = jwt.sign({ userId: req.user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            token: newToken,
            user: {
                _id: req.user._id,
                firstName: req.user.firstName,
                lastName: req.user.lastName,
                email: req.user.email,
                phone: req.user.phone,
                isAdmin: req.user.isAdmin
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get all users (admin only)
router.get('/users', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const users = await User.find({ isAdmin: false })
            .select('-password -googleId')
            .sort({ createdAt: -1 });
        res.json({ users });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Delete user account
router.delete('/delete-account', auth, async (req, res) => {
    try {
        // Find and delete all messages associated with the user
        await Message.deleteMany({
            $or: [
                { sender: req.user._id },
                { receiver: req.user._id }
            ]
        });

        // Delete the user account
        await User.findByIdAndDelete(req.user._id);

        res.json({ message: 'Account and associated data deleted successfully' });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

module.exports = router; 