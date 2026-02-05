const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Kundli = require('../models/Kundli');
const auth = require('../middleware/auth');

// Create or Update Kundli
router.post('/save', auth, async (req, res) => {
    try {
        const { fullName, dateOfBirth, timeOfBirth, placeOfBirth, gender, latitude, longitude } = req.body;
        
        // Validation
        if (!fullName || !dateOfBirth || !timeOfBirth || !placeOfBirth || !gender) {
            return res.status(400).json({ 
                error: 'All fields are required: fullName, dateOfBirth, timeOfBirth, placeOfBirth, gender' 
            });
        }
        
        // Validate gender
        if (!['male', 'female', 'other'].includes(gender.toLowerCase())) {
            return res.status(400).json({ error: 'Gender must be male, female, or other' });
        }
        
        // Validate time format (HH:MM)
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(timeOfBirth)) {
            return res.status(400).json({ error: 'Time must be in HH:MM format (24-hour)' });
        }
        
        // Validate date
        const dob = new Date(dateOfBirth);
        if (isNaN(dob.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
        }
        
        // Check if kundli exists for this user
        let kundli = await Kundli.findOne({ user: req.user._id });
        
        if (kundli) {
            // Update existing
            kundli.fullName = fullName.trim();
            kundli.dateOfBirth = dob;
            kundli.timeOfBirth = timeOfBirth;
            kundli.placeOfBirth = placeOfBirth.trim();
            kundli.gender = gender.toLowerCase();
            if (latitude) kundli.coordinates.latitude = latitude;
            if (longitude) kundli.coordinates.longitude = longitude;
            await kundli.save();
            
            res.json({ 
                success: true, 
                message: 'Kundli updated successfully', 
                kundli 
            });
        } else {
            // Create new
            kundli = new Kundli({
                user: req.user._id,
                fullName: fullName.trim(),
                dateOfBirth: dob,
                timeOfBirth,
                placeOfBirth: placeOfBirth.trim(),
                gender: gender.toLowerCase(),
                coordinates: {
                    latitude: latitude || null,
                    longitude: longitude || null
                }
            });
            await kundli.save();
            
            res.status(201).json({ 
                success: true, 
                message: 'Kundli created successfully', 
                kundli 
            });
        }
    } catch (error) {
        console.error('Error saving kundli:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get user's Kundli
router.get('/my-kundli', auth, async (req, res) => {
    try {
        const kundli = await Kundli.findOne({ user: req.user._id }).lean();
        
        if (!kundli) {
            return res.status(404).json({ 
                error: 'Kundli not found. Please save your birth details first.' 
            });
        }
        
        res.json({ success: true, kundli });
    } catch (error) {
        console.error('Error fetching kundli:', error);
        res.status(400).json({ error: error.message });
    }
});

// Check if user has Kundli
router.get('/check', auth, async (req, res) => {
    try {
        const exists = await Kundli.exists({ user: req.user._id });
        res.json({ hasKundli: !!exists });
    } catch (error) {
        console.error('Error checking kundli:', error);
        res.status(400).json({ error: error.message });
    }
});

// Admin: Get any user's Kundli
router.get('/user/:userId', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { userId } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        const kundli = await Kundli.findOne({ user: userId })
            .populate('user', 'firstName lastName email phone')
            .lean();
        
        if (!kundli) {
            return res.status(404).json({ error: 'Kundli not found for this user' });
        }
        
        res.json({ success: true, kundli });
    } catch (error) {
        console.error('Error fetching user kundli:', error);
        res.status(400).json({ error: error.message });
    }
});

// Admin: Get all Kundlis
router.get('/all', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const [kundlis, total] = await Promise.all([
            Kundli.find()
                .populate('user', 'firstName lastName email phone')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Kundli.countDocuments()
        ]);
        
        res.json({
            success: true,
            kundlis,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        console.error('Error fetching all kundlis:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
