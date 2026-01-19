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

// Get unread count for a specific chat room
router.get('/unread-count/:roomId', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        
        // Validate roomId format
        if (!mongoose.Types.ObjectId.isValid(roomId)) {
            return res.status(400).json({ error: 'Invalid room ID format' });
        }
        
        // Count unread messages sent by the other user to current user
        const unreadCount = await Message.countDocuments({
            sender: roomId,
            receiver: req.user._id,
            isRead: false
        });
        
        res.json({ unreadCount });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(400).json({ error: error.message });
    }
});

// Mark messages as read
router.post('/mark-as-read', auth, async (req, res) => {
    try {
        const { senderId } = req.body;
        
        if (!senderId) {
            return res.status(400).json({ error: 'Sender ID is required' });
        }
        
        // Validate senderId format
        if (!mongoose.Types.ObjectId.isValid(senderId)) {
            return res.status(400).json({ error: 'Invalid sender ID format' });
        }
        
        // Mark all unread messages from sender to current user as read
        const result = await Message.updateMany(
            {
                sender: senderId,
                receiver: req.user._id,
                isRead: false
            },
            {
                $set: {
                    isRead: true,
                    readAt: new Date()
                }
            }
        );
        
        // Emit socket event for message read
        const io = req.app.get('io');
        if (io) {
            io.to(senderId).emit('messages_read', {
                readBy: req.user._id.toString(),
                count: result.modifiedCount
            });
        }
        
        res.json({ 
            success: true, 
            markedCount: result.modifiedCount 
        });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get all conversations with unread counts
router.get('/conversations', auth, async (req, res) => {
    try {
        // Get all unique users who have chatted with current user
        const sentMessages = await Message.distinct('receiver', { sender: req.user._id });
        const receivedMessages = await Message.distinct('sender', { receiver: req.user._id });
        
        // Convert ObjectIds to strings and remove duplicates
        const allUserIds = [...new Set([
            ...sentMessages.map(id => id.toString()),
            ...receivedMessages.map(id => id.toString())
        ])];
        
        // Get user details and unread counts
        const conversations = await Promise.all(
            allUserIds.map(async (userId) => {
                const user = await User.findById(userId).select('-password -googleId');
                if (!user) return null;
                
                // Get unread count for this conversation
                const unreadCount = await Message.countDocuments({
                    sender: userId,
                    receiver: req.user._id,
                    isRead: false
                });
                
                // Get last message
                const lastMessage = await Message.findOne({
                    $or: [
                        { sender: req.user._id, receiver: userId },
                        { sender: userId, receiver: req.user._id }
                    ]
                }).sort({ createdAt: -1 });
                
                return {
                    user,
                    unreadCount,
                    lastMessage: lastMessage ? {
                        content: lastMessage.content,
                        createdAt: lastMessage.createdAt,
                        isRead: lastMessage.isRead,
                        sender: lastMessage.sender
                    } : null
                };
            })
        );
        
        // Filter out null values and sort by last message time
        const validConversations = conversations
            .filter(conv => conv !== null)
            .sort((a, b) => {
                const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0);
                const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0);
                return bTime - aTime;
            });
        
        res.json({ conversations: validConversations });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(400).json({ error: error.message });
    }
});

// Register/Update FCM token for push notifications
router.post('/register-fcm-token', auth, async (req, res) => {
    try {
        const { fcmToken } = req.body;
        
        if (!fcmToken) {
            return res.status(400).json({ error: 'FCM token is required' });
        }
        
        // Update user's FCM token
        await User.findByIdAndUpdate(req.user._id, {
            fcmToken: fcmToken
        });
        
        res.json({ 
            success: true, 
            message: 'FCM token registered successfully' 
        });
    } catch (error) {
        console.error('Error registering FCM token:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router; 