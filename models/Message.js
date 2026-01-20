const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true,
        maxlength: 1000
    },
    isRead: {
        type: Boolean,
        default: false
    },
    isDelivered: {
        type: Boolean,
        default: false
    },
    readAt: {
        type: Date,
        default: null
    },
    deliveredAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add indexes for better query performance
messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, createdAt: -1 });

// CRITICAL PERFORMANCE INDEXES for new features
messageSchema.index({ receiver: 1, isRead: 1 }); // For unread count queries
messageSchema.index({ sender: 1, receiver: 1, isRead: 1 }); // For marking as read
messageSchema.index({ receiver: 1, sender: 1, createdAt: -1 }); // For conversation queries

module.exports = mongoose.model('Message', messageSchema); 