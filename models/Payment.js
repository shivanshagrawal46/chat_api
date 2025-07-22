const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    orderId: { type: String, required: true },
    paymentId: { type: String },
    status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
    receipt: { type: String },
    notes: { type: Object },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema); 