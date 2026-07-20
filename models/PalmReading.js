const mongoose = require('mongoose');

// One reading log per user. IMPORTANT: the uploaded hand image is NEVER stored
// — it is streamed straight to the AI and discarded. Only the AI's text reply
// and the user's optional text note are persisted here.
const palmMessageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'ai'],
        required: true
    },
    content: {
        type: String,
        required: true,
        maxlength: 12000
    },
    isFree: {
        type: Boolean,
        default: false
    },
    hand: {
        type: String,
        default: null // 'left' | 'right' | null
    },
    amountCharged: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const palmReadingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // one reading log per user
    },
    messages: [palmMessageSchema],
    totalReadings: {
        type: Number,
        default: 0
    },
    // Count of free readings consumed (first N are free — see route constant).
    freeReadingsUsed: {
        type: Number,
        default: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

palmReadingSchema.pre('save', function (next) {
    this.lastActivity = new Date();
    next();
});

palmReadingSchema.index({ lastActivity: -1 });

module.exports = mongoose.model('PalmReading', palmReadingSchema);
