const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password, confirmPassword, publicKey } = req.body;
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
        const user = new User({ firstName, lastName, email, phone, password, publicKey });
        await user.save();
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.status(201).json({
            token,
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                isAdmin: user.isAdmin,
                publicKey: user.publicKey
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password, publicKey } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) {
            throw new Error('Invalid login credentials');
        }
        // Optionally update publicKey on login if provided
        if (publicKey) {
            user.publicKey = publicKey;
            await user.save();
        }
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({
            token,
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                isAdmin: user.isAdmin,
                publicKey: user.publicKey
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    res.json(req.user);
});

// Update public key (admin or user)
router.post('/publicKey', auth, async (req, res) => {
    try {
        const { publicKey, userId, isAdmin } = req.body;
        
        // If it's the admin user, update the public key
        if (isAdmin) {
            const admin = await User.findOne({ email: 'bhupendrapandey29@gmail.com' });
            if (admin) {
                admin.publicKey = publicKey;
                await admin.save();
                return res.status(200).json({ message: 'Admin public key updated successfully' });
            }
        }
        
        // For non-admin users, update their public key
        const user = await User.findById(userId);
        if (user) {
            user.publicKey = publicKey;
            await user.save();
            return res.status(200).json({ message: 'Public key updated successfully' });
        }
        
        return res.status(404).json({ message: 'User not found' });
    } catch (error) {
        console.error('Error updating public key:', error);
        return res.status(500).json({ message: 'Error updating public key' });
    }
});

// Get a user's public key by userId
router.get('/publicKey/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user || !user.publicKey) {
      return res.status(404).json({ message: 'Public key not found' });
    }
    return res.status(200).json({ publicKey: user.publicKey });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get userId by email
router.get('/userIdByEmail', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json({ userId: user._id });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/logout', async (req, res) => {
    try {
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 