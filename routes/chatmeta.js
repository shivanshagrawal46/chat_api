const express = require('express');
const router = express.Router();
const ChatMeta = require('../models/ChatMeta');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

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
        // Only admin can freeze/unfreeze
        const actingUser = await User.findById(req.user.userId);
        if (!actingUser || !actingUser.isAdmin) {
            return res.status(403).json({ error: 'Only admin can freeze/unfreeze chat' });
        }
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
        res.json({ success: true, meta });
    } catch (err) {
        console.error('Error freezing/unfreezing chat:', err);
        res.status(500).json({ error: 'Failed to update chat freeze state' });
    }
});

module.exports = router; 