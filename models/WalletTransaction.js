const mongoose = require('mongoose');

// Append-only ledger of every wallet credit/debit.
// Positive amount => credit (recharge / refund). Negative amount => debit (chat charge).
const walletTransactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['recharge', 'astro_chat', 'ai_chat', 'shop_order', 'refund', 'adjustment'],
        required: true,
        index: true
    },
    // Positive for credits, negative for debits
    amount: {
        type: Number,
        required: true
    },
    // Wallet balance immediately after this transaction was applied
    balanceAfter: {
        type: Number,
        required: true
    },
    // Razorpay linkage (only for recharges)
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
    // For per-minute astro chat deductions
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AstrologerChatSession',
        default: null,
        index: true
    },
    astrologerKey: {
        type: String,
        default: null
    },
    // For AI chat
    aiQuestionPaymentRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UnifiedPayment',
        default: null
    },
    description: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['success', 'pending', 'failed'],
        default: 'success'
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
