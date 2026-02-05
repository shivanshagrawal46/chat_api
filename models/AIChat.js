const mongoose = require('mongoose');

const aiMessageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'ai'],
        required: true
    },
    content: {
        type: String,
        required: true,
        maxlength: 2000
    },
    tokenCount: {
        type: Number,
        default: 0
    },
    isFreeQuestion: {
        type: Boolean,
        default: false
    },
    isAstrologyQuestion: {
        type: Boolean,
        default: true
    },
    paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UnifiedPayment',
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const aiChatSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // One chat session per user
    },
    kundli: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Kundli',
        required: true
    },
    messages: [aiMessageSchema],
    totalQuestions: {
        type: Number,
        default: 0
    },
    freeQuestionUsed: {
        type: Boolean,
        default: false
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

// Update last activity on save
aiChatSchema.pre('save', function(next) {
    this.lastActivity = new Date();
    next();
});

// Indexes for faster queries
aiChatSchema.index({ user: 1 });
aiChatSchema.index({ lastActivity: -1 });
aiChatSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AIChat', aiChatSchema);
