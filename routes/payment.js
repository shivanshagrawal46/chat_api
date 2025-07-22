const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const Payment = require('../models/Payment');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware to authenticate user via JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create Razorpay order
router.post('/create-order', authenticateToken, async (req, res) => {
    try {
        const { amount, currency, receipt, notes } = req.body;
        if (!amount) return res.status(400).json({ error: 'Amount is required' });
        const options = {
            amount: Math.round(amount * 100), // amount in paise
            currency: currency || 'INR',
            receipt: receipt || `rcpt_${Date.now()}`,
            notes: notes || {}
        };
        const order = await razorpay.orders.create(options);
        // Save order in DB with status 'created'
        const payment = new Payment({
            user: req.user.userId,
            amount,
            currency: options.currency,
            orderId: order.id,
            status: 'created',
            receipt: options.receipt,
            notes: options.notes
        });
        await payment.save();
        res.json({ orderId: order.id, amount: order.amount, currency: order.currency, receipt: order.receipt });
    } catch (err) {
        console.error('Error creating Razorpay order:', err);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Verify payment and update DB
router.post('/verify', authenticateToken, async (req, res) => {
    try {
        const { orderId, paymentId, status } = req.body;
        if (!orderId || !paymentId || !status) {
            return res.status(400).json({ error: 'orderId, paymentId, and status are required' });
        }
        const payment = await Payment.findOne({ orderId, user: req.user.userId });
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        payment.paymentId = paymentId;
        payment.status = status;
        await payment.save();
        res.json({ success: true });
    } catch (err) {
        console.error('Error verifying payment:', err);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

// Get all payments for a user
router.get('/user/:userId', authenticateToken, async (req, res) => {
    try {
        // Only allow user to see their own payments or admin to see any user's payments
        if (req.user.userId !== req.params.userId) {
            const user = await User.findById(req.user.userId);
            if (!user || !user.isAdmin) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }
        const payments = await Payment.find({ user: req.params.userId }).sort({ createdAt: -1 });
        res.json(payments);
    } catch (err) {
        console.error('Error fetching user payments:', err);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

module.exports = router; 