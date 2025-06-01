const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Send a message
router.post('/send', auth, async (req, res) => {
    try {
        const { receiverId, content } = req.body;
        const message = new Message({
            sender: req.user._id,
            receiver: receiverId,
            content
        });
        await message.save();
        res.status(201).json(message);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get messages between current user and another user
router.get('/messages/:userId', auth, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { sender: req.user._id, receiver: req.params.userId },
                { sender: req.params.userId, receiver: req.user._id }
            ]
        }).sort({ createdAt: 1 });
        res.json(messages);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get all users who have chatted with admin
router.get('/users', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            // If not admin, only return admin user
            const admin = await User.findOne({ isAdmin: true });
            return res.json([admin]);
        }

        // If admin, return all users who have sent or received messages
        const messages = await Message.find({
            $or: [{ sender: req.user._id }, { receiver: req.user._id }]
        }).distinct('sender receiver');

        const users = await User.find({
            _id: { $in: messages },
            _id: { $ne: req.user._id }
        });

        res.json(users);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router; 