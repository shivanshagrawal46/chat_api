const express = require('express');
const router = express.Router();
const ChatMeta = require('../models/ChatMeta');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Payment = require('../models/Payment');

// Middleware to authenticate user via JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// GET /api/chatmeta?admin=...&user=...
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { admin, user } = req.query;
        if (!admin || !user) return res.status(400).json({ error: 'admin and user are required' });
        const meta = await ChatMeta.findOne({ admin, user });
        if (!meta) return res.json({ isFrozen: false, freezeAmount: null });
        res.json({ isFrozen: meta.isFrozen, freezeAmount: meta.freezeAmount });
    } catch (err) {
        console.error('Error fetching chat meta:', err);
        res.status(500).json({ error: 'Failed to fetch chat meta' });
    }
});

// POST /api/chatmeta/freeze
// Body: { admin, user, isFrozen, freezeAmount }
router.post('/freeze', authenticateToken, async (req, res) => {
    try {
        const { admin, user, isFrozen, freezeAmount } = req.body;
        if (!admin || !user || typeof isFrozen !== 'boolean') {
            return res.status(400).json({ error: 'admin, user, and isFrozen are required' });
        }
        const actingUser = await User.findById(req.user.userId);
        // Admin can always freeze/unfreeze
        if (actingUser && actingUser.isAdmin) {
            const update = {
                isFrozen,
                freezeAmount: isFrozen ? freezeAmount : null,
                frozenBy: actingUser._id,
                updatedAt: new Date()
            };
            const meta = await ChatMeta.findOneAndUpdate(
                { admin, user },
                { $set: update },
                { upsert: true, new: true }
            );
            return res.json({ success: true, meta });
        }
        // User can only unfreeze their own chat if they have a recent successful payment
        if (!isFrozen && actingUser && actingUser._id.toString() === user) {
            // Find a recent successful payment for this user
            const recentPaid = await Payment.findOne({
                user,
                status: 'paid',
                // Optionally, you can add more checks here (e.g., for a specific receipt or time window)
            }).sort({ createdAt: -1 });
            if (!recentPaid) {
                return res.status(403).json({ error: 'No recent successful payment found. Cannot unfreeze.' });
            }
            const update = {
                isFrozen: false,
                freezeAmount: null,
                frozenBy: actingUser._id,
                updatedAt: new Date()
            };
            const meta = await ChatMeta.findOneAndUpdate(
                { admin, user },
                { $set: update },
                { upsert: true, new: true }
            );
            return res.json({ success: true, meta });
        }
        // Otherwise forbidden
        return res.status(403).json({ error: 'Only admin or user with successful payment can unfreeze chat' });
    } catch (err) {
        console.error('Error freezing/unfreezing chat:', err);
        res.status(500).json({ error: 'Failed to update chat freeze state' });
    }
});

module.exports = router; 