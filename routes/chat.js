const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Send a message
router.post('/send', auth, async (req, res) => {
    try {
        const { receiverId, content } = req.body;
        
        // Input validation
        if (!receiverId || !content) {
            return res.status(400).json({ error: 'Receiver ID and content are required' });
        }
        
        if (typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ error: 'Content must be a non-empty string' });
        }
        
        if (content.length > 1000) {
            return res.status(400).json({ error: 'Message content too long (max 1000 characters)' });
        }
        
        // Check if receiver exists
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({ error: 'Receiver not found' });
        }
        
        // Prevent sending message to self
        if (receiverId === req.user._id.toString()) {
            return res.status(400).json({ error: 'Cannot send message to yourself' });
        }
        
        const message = new Message({
            sender: req.user._id,
            receiver: receiverId,
            content: content.trim()
        });
        await message.save();
        res.status(201).json(message);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get messages between current user and another user
router.get('/messages/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Validate userId format
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid user ID format' });
        }
        
        // Check if user exists
        const otherUser = await User.findById(userId);
        if (!otherUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Prevent accessing messages with self
        if (userId === req.user._id.toString()) {
            return res.status(400).json({ error: 'Cannot access messages with yourself' });
        }
        
        const messages = await Message.find({
            $or: [
                { sender: req.user._id, receiver: userId },
                { sender: userId, receiver: req.user._id }
            ]
        }).sort({ createdAt: 1 });
        res.json({ messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get all users who have chatted with admin
router.get('/users', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            // If not admin, only return admin user
            const admin = await User.findOne({ isAdmin: true }).select('-password -googleId');
            return res.json(admin ? [admin] : []);
        }

        // If admin, return all users who have sent or received messages
        const messageUserIds = await Message.distinct('sender', {
            $or: [{ sender: req.user._id }, { receiver: req.user._id }]
        });
        
        const receiverUserIds = await Message.distinct('receiver', {
            $or: [{ sender: req.user._id }, { receiver: req.user._id }]
        });

        // Combine and remove duplicates
        const allUserIds = [...new Set([...messageUserIds, ...receiverUserIds])];
        
        // Remove admin's own ID
        const otherUserIds = allUserIds.filter(id => id.toString() !== req.user._id.toString());

        const users = await User.find({
            _id: { $in: otherUserIds }
        }).select('-password -googleId').sort({ createdAt: -1 });

        res.json(users);
    } catch (error) {
        console.error('Error fetching chat users:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router; 