const mongoose = require('mongoose');

const unifiedPaymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Payment type
    type: {
        type: String,
        enum: ['ai_chat', 'astrologer_chat', 'pooja_order', 'shop_order'],
        required: true
    },
    // Amount in rupees
    amount: {
        type: Number,
        required: true
    },
    // Payment status
    status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    // Razorpay details
    razorpayOrderId: {
        type: String,
        default: null
    },
    razorpayPaymentId: {
        type: String,
        default: null
    },
    razorpaySignature: {
        type: String,
        default: null
    },
    // Type-specific details
    details: {
        // For AI Chat
        questionNumber: { type: Number, default: null },
        question: { type: String, default: null },           // Store the question asked
        questionAnswered: { type: Boolean, default: false }, // Track if AI responded successfully
        answerDelivered: { type: Boolean, default: false },  // Track if answer was sent to user
        retryCount: { type: Number, default: 0 },            // Number of retry attempts
        failureReason: { type: String, default: null },      // Why it failed (if any)
        answeredAt: { type: Date, default: null },           // When AI answered
        
        // For Astrologer Chat
        astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        chatDuration: { type: Number, default: null }, // in minutes
        
        // For Pooja Order
        poojaTitle: { type: String, default: null },
        poojaId: { type: String, default: null }, // External pooja ID if any
        
        // For Shop Order
        orderId: { type: String, default: null },
        orderItems: { type: String, default: null } // JSON string of items
    },
    // Description
    description: {
        type: String,
        default: ''
    },
    // Timestamps
    paidAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for faster queries
unifiedPaymentSchema.index({ user: 1, createdAt: -1 });
unifiedPaymentSchema.index({ type: 1, createdAt: -1 });
unifiedPaymentSchema.index({ status: 1 });
unifiedPaymentSchema.index({ razorpayOrderId: 1 });
unifiedPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('UnifiedPayment', unifiedPaymentSchema);
