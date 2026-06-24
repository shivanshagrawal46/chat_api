const mongoose = require('mongoose');

// Virtual astrologer personas. Single admin handles all of them.
// `key` is the stable identifier used everywhere (messages, sessions, billing).
const astrologerSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        // `unique: true` already creates the index on this field. Adding
        // `index: true` would cause Mongoose's duplicate-index warning.
        unique: true,
        lowercase: true,
        trim: true
    },
    displayName: {
        type: String,
        required: true,
        trim: true
    },
    ratePerMinute: {
        type: Number,
        required: true,
        min: 0
    },
    // Free intro / discounted minutes for new users (future use; default 0 = no free time)
    freeMinutesForNewUsers: {
        type: Number,
        default: 0
    },
    avatar: {
        type: String,
        default: null
    },
    bio: {
        type: String,
        default: ''
    },
    specialities: {
        type: [String],
        default: []
    },
    languages: {
        type: [String],
        default: ['Hindi', 'English']
    },
    // Whether this astrologer is currently available for chat.
    // Toggled by admin online/offline status.
    isOnline: {
        type: Boolean,
        default: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    sortOrder: {
        type: Number,
        default: 0
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

astrologerSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Default seed data — used by index.js on startup if collection is empty.
astrologerSchema.statics.DEFAULT_SEED = [
    { key: 'bhupendra', displayName: 'Bhupendra', ratePerMinute: 50, sortOrder: 1, specialities: ['Vedic Astrology', 'Kundli Reading'] },
    { key: 'samta',     displayName: 'Samta',     ratePerMinute: 15, sortOrder: 2, specialities: ['Tarot', 'Love & Relationship'] },
    { key: 'rashmi',    displayName: 'Rashmi',    ratePerMinute: 15, sortOrder: 3, specialities: ['Numerology', 'Career'] },
    { key: 'smirita',   displayName: 'Smirita',   ratePerMinute: 15, sortOrder: 4, specialities: ['Vastu', 'Family'] },
    { key: 'rekha',     displayName: 'Rekha',     ratePerMinute: 15, sortOrder: 5, specialities: ['Palmistry', 'Marriage'] }
];

astrologerSchema.statics.seedDefaults = async function () {
    const count = await this.countDocuments();
    if (count > 0) return { seeded: false, count };

    await this.insertMany(this.DEFAULT_SEED);
    return { seeded: true, count: this.DEFAULT_SEED.length };
};

module.exports = mongoose.model('Astrologer', astrologerSchema);
