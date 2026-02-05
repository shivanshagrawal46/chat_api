const mongoose = require('mongoose');

const kundliSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // One kundli per user
    },
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    dateOfBirth: {
        type: Date,
        required: true
    },
    timeOfBirth: {
        type: String, // Format: "HH:MM" (24-hour)
        required: true
    },
    placeOfBirth: {
        type: String,
        required: true,
        trim: true
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other'],
        required: true
    },
    // Optional: Store latitude/longitude for accurate calculations
    coordinates: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
kundliSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Index for faster queries
kundliSchema.index({ user: 1 });

module.exports = mongoose.model('Kundli', kundliSchema);
