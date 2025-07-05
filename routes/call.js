const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Call = require('../models/Call');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Initiate a call
router.post('/initiate', auth, async (req, res) => {
    try {
        const { receiverId, type } = req.body;
        
        // Input validation
        if (!receiverId || !type) {
            return res.status(400).json({ error: 'Receiver ID and call type are required' });
        }
        
        if (!['voice', 'video'].includes(type)) {
            return res.status(400).json({ error: 'Call type must be either "voice" or "video"' });
        }
        
        // Validate receiverId format
        if (!mongoose.Types.ObjectId.isValid(receiverId)) {
            return res.status(400).json({ error: 'Invalid receiver ID format' });
        }
        
        // Check if receiver exists
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({ error: 'Receiver not found' });
        }
        
        // Prevent calling self
        if (receiverId === req.user._id.toString()) {
            return res.status(400).json({ error: 'Cannot call yourself' });
        }

        // Create new call session
        const call = new Call({
            caller: req.user._id,
            receiver: receiverId,
            type
        });

        await call.save();
        res.status(201).json(call);
    } catch (error) {
        console.error('Error initiating call:', error);
        res.status(400).json({ error: error.message });
    }
});

// Accept a call
router.post('/accept/:callId', auth, async (req, res) => {
    try {
        const { callId } = req.params;
        
        // Validate callId format
        if (!mongoose.Types.ObjectId.isValid(callId)) {
            return res.status(400).json({ error: 'Invalid call ID format' });
        }
        
        const call = await Call.findById(callId);
        
        if (!call) {
            return res.status(404).json({ error: 'Call not found' });
        }

        if (call.receiver.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized to accept this call' });
        }
        
        if (call.status !== 'pending') {
            return res.status(400).json({ error: 'Call is not in pending status' });
        }

        call.status = 'accepted';
        await call.save();
        res.json(call);
    } catch (error) {
        console.error('Error accepting call:', error);
        res.status(400).json({ error: error.message });
    }
});

// Reject a call
router.post('/reject/:callId', auth, async (req, res) => {
    try {
        const call = await Call.findById(req.params.callId);
        
        if (!call) {
            return res.status(404).json({ error: 'Call not found' });
        }

        if (call.receiver.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized to reject this call' });
        }

        call.status = 'rejected';
        call.endTime = new Date();
        await call.save();
        res.json(call);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// End a call
router.post('/end/:callId', auth, async (req, res) => {
    try {
        const call = await Call.findById(req.params.callId);
        
        if (!call) {
            return res.status(404).json({ error: 'Call not found' });
        }

        if (call.caller.toString() !== req.user._id.toString() && 
            call.receiver.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized to end this call' });
        }

        call.status = 'ended';
        call.endTime = new Date();
        await call.save();
        res.json(call);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get call history
router.get('/history', auth, async (req, res) => {
    try {
        const calls = await Call.find({
            $or: [
                { caller: req.user._id },
                { receiver: req.user._id }
            ]
        })
        .sort({ createdAt: -1 })
        .populate('caller', 'name email')
        .populate('receiver', 'name email');
        
        res.json(calls);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router; 