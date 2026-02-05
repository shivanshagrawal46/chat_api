const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const UnifiedPayment = require('../models/UnifiedPayment');
const auth = require('../middleware/auth');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
let razorpay = null;
try {
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        console.log('✅ Razorpay initialized for Unified Payments');
    }
} catch (error) {
    console.error('Razorpay initialization error:', error);
}

// ==================== POOJA ORDER PAYMENTS ====================

// Create Pooja Order Payment
router.post('/pooja/create', auth, async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(500).json({ error: 'Payment service not configured' });
        }
        
        const { title, amount, poojaId } = req.body;
        
        if (!title || !amount) {
            return res.status(400).json({ error: 'Title and amount are required' });
        }
        
        if (amount <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0' });
        }
        
        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100), // Convert to paise
            currency: 'INR',
            receipt: `pj_${req.user._id.toString().slice(-8)}_${Date.now().toString().slice(-8)}`,
            notes: {
                userId: req.user._id.toString(),
                type: 'pooja_order',
                poojaTitle: title
            }
        });
        
        // Create payment record
        const payment = new UnifiedPayment({
            user: req.user._id,
            type: 'pooja_order',
            amount: amount,
            status: 'pending',
            razorpayOrderId: order.id,
            details: {
                poojaTitle: title,
                poojaId: poojaId || null
            },
            description: `Pooja Order: ${title}`
        });
        await payment.save();
        
        res.json({
            success: true,
            orderId: order.id,
            amount: amount,
            currency: 'INR',
            paymentId: payment._id,
            poojaTitle: title
        });
    } catch (error) {
        console.error('Error creating pooja payment:', error);
        res.status(400).json({ error: error.message });
    }
});

// Verify Pooja Payment
router.post('/pooja/verify', auth, async (req, res) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
        
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({ error: 'Missing payment verification fields' });
        }
        
        // Verify signature
        const body = razorpayOrderId + '|' + razorpayPaymentId;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');
        
        if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }
        
        // Update payment
        const payment = await UnifiedPayment.findOneAndUpdate(
            { razorpayOrderId, user: req.user._id, type: 'pooja_order' },
            {
                status: 'paid',
                razorpayPaymentId,
                razorpaySignature,
                paidAt: new Date()
            },
            { new: true }
        );
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        res.json({
            success: true,
            message: 'Pooja payment verified successfully',
            payment: {
                _id: payment._id,
                poojaTitle: payment.details.poojaTitle,
                amount: payment.amount,
                status: payment.status,
                paidAt: payment.paidAt
            }
        });
    } catch (error) {
        console.error('Error verifying pooja payment:', error);
        res.status(400).json({ error: error.message });
    }
});

// ==================== SHOP ORDER PAYMENTS ====================

// Create Shop Order Payment
router.post('/shop/create', auth, async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(500).json({ error: 'Payment service not configured' });
        }
        
        const { orderId, amount, orderItems } = req.body;
        
        if (!orderId || !amount) {
            return res.status(400).json({ error: 'Order ID and amount are required' });
        }
        
        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100),
            currency: 'INR',
            receipt: `sh_${req.user._id.toString().slice(-8)}_${Date.now().toString().slice(-8)}`,
            notes: {
                userId: req.user._id.toString(),
                type: 'shop_order',
                orderId: orderId
            }
        });
        
        // Create payment record
        const payment = new UnifiedPayment({
            user: req.user._id,
            type: 'shop_order',
            amount: amount,
            status: 'pending',
            razorpayOrderId: order.id,
            details: {
                orderId: orderId,
                orderItems: typeof orderItems === 'string' ? orderItems : JSON.stringify(orderItems)
            },
            description: `Shop Order: ${orderId}`
        });
        await payment.save();
        
        res.json({
            success: true,
            orderId: order.id,
            amount: amount,
            currency: 'INR',
            paymentId: payment._id,
            shopOrderId: orderId
        });
    } catch (error) {
        console.error('Error creating shop payment:', error);
        res.status(400).json({ error: error.message });
    }
});

// Verify Shop Payment
router.post('/shop/verify', auth, async (req, res) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
        
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({ error: 'Missing payment verification fields' });
        }
        
        // Verify signature
        const body = razorpayOrderId + '|' + razorpayPaymentId;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');
        
        if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }
        
        // Update payment
        const payment = await UnifiedPayment.findOneAndUpdate(
            { razorpayOrderId, user: req.user._id, type: 'shop_order' },
            {
                status: 'paid',
                razorpayPaymentId,
                razorpaySignature,
                paidAt: new Date()
            },
            { new: true }
        );
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        res.json({
            success: true,
            message: 'Shop payment verified successfully',
            payment: {
                _id: payment._id,
                orderId: payment.details.orderId,
                amount: payment.amount,
                status: payment.status,
                paidAt: payment.paidAt
            }
        });
    } catch (error) {
        console.error('Error verifying shop payment:', error);
        res.status(400).json({ error: error.message });
    }
});

// ==================== ASTROLOGER CHAT PAYMENTS ====================

// Create Astrologer Chat Payment
router.post('/astrologer/create', auth, async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(500).json({ error: 'Payment service not configured' });
        }
        
        const { astrologerId, amount, duration } = req.body;
        
        if (!astrologerId || !amount) {
            return res.status(400).json({ error: 'Astrologer ID and amount are required' });
        }
        
        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100),
            currency: 'INR',
            receipt: `as_${req.user._id.toString().slice(-8)}_${Date.now().toString().slice(-8)}`,
            notes: {
                userId: req.user._id.toString(),
                type: 'astrologer_chat',
                astrologerId: astrologerId
            }
        });
        
        // Create payment record
        const payment = new UnifiedPayment({
            user: req.user._id,
            type: 'astrologer_chat',
            amount: amount,
            status: 'pending',
            razorpayOrderId: order.id,
            details: {
                astrologerId: astrologerId,
                chatDuration: duration || null
            },
            description: `Astrologer Chat Session`
        });
        await payment.save();
        
        res.json({
            success: true,
            orderId: order.id,
            amount: amount,
            currency: 'INR',
            paymentId: payment._id
        });
    } catch (error) {
        console.error('Error creating astrologer payment:', error);
        res.status(400).json({ error: error.message });
    }
});

// Verify Astrologer Payment
router.post('/astrologer/verify', auth, async (req, res) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
        
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({ error: 'Missing payment verification fields' });
        }
        
        // Verify signature
        const body = razorpayOrderId + '|' + razorpayPaymentId;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');
        
        if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }
        
        // Update payment
        const payment = await UnifiedPayment.findOneAndUpdate(
            { razorpayOrderId, user: req.user._id, type: 'astrologer_chat' },
            {
                status: 'paid',
                razorpayPaymentId,
                razorpaySignature,
                paidAt: new Date()
            },
            { new: true }
        );
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        res.json({
            success: true,
            message: 'Astrologer chat payment verified successfully',
            payment: {
                _id: payment._id,
                astrologerId: payment.details.astrologerId,
                amount: payment.amount,
                status: payment.status,
                paidAt: payment.paidAt
            }
        });
    } catch (error) {
        console.error('Error verifying astrologer payment:', error);
        res.status(400).json({ error: error.message });
    }
});

// ==================== USER PAYMENT HISTORY ====================

// Get my payment history
router.get('/my-payments', auth, async (req, res) => {
    try {
        const { type, status, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Build query
        const query = { user: req.user._id };
        if (type) query.type = type;
        if (status) query.status = status;
        
        const [payments, total] = await Promise.all([
            UnifiedPayment.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            UnifiedPayment.countDocuments(query)
        ]);
        
        // Calculate totals by type
        const totals = await UnifiedPayment.aggregate([
            { $match: { user: req.user._id, status: 'paid' } },
            { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);
        
        const totalsByType = {};
        totals.forEach(t => {
            totalsByType[t._id] = { total: t.total, count: t.count };
        });
        
        res.json({
            success: true,
            payments,
            totals: totalsByType,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total
            }
        });
    } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get payment summary
router.get('/my-summary', auth, async (req, res) => {
    try {
        const summary = await UnifiedPayment.aggregate([
            { $match: { user: req.user._id, status: 'paid' } },
            {
                $group: {
                    _id: '$type',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                    lastPayment: { $max: '$paidAt' }
                }
            }
        ]);
        
        const totalSpent = summary.reduce((acc, s) => acc + s.totalAmount, 0);
        
        res.json({
            success: true,
            summary,
            totalSpent,
            breakdown: {
                ai_chat: summary.find(s => s._id === 'ai_chat') || { totalAmount: 0, count: 0 },
                astrologer_chat: summary.find(s => s._id === 'astrologer_chat') || { totalAmount: 0, count: 0 },
                pooja_order: summary.find(s => s._id === 'pooja_order') || { totalAmount: 0, count: 0 },
                shop_order: summary.find(s => s._id === 'shop_order') || { totalAmount: 0, count: 0 }
            }
        });
    } catch (error) {
        console.error('Error fetching payment summary:', error);
        res.status(400).json({ error: error.message });
    }
});

// ==================== ADMIN ENDPOINTS ====================

// Admin: Get all payments
router.get('/admin/all', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { type, status, userId, page = 1, limit = 50, startDate, endDate } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Build query
        const query = {};
        if (type) query.type = type;
        if (status) query.status = status;
        if (userId) query.user = userId;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }
        
        const [payments, total] = await Promise.all([
            UnifiedPayment.find(query)
                .populate('user', 'firstName lastName email phone')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            UnifiedPayment.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            payments,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total
            }
        });
    } catch (error) {
        console.error('Error fetching all payments:', error);
        res.status(400).json({ error: error.message });
    }
});

// Admin: Get payment statistics
router.get('/admin/stats', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { startDate, endDate } = req.query;
        
        // Build date filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.paidAt = {};
            if (startDate) dateFilter.paidAt.$gte = new Date(startDate);
            if (endDate) dateFilter.paidAt.$lte = new Date(endDate);
        }
        
        // Get stats by type
        const statsByType = await UnifiedPayment.aggregate([
            { $match: { status: 'paid', ...dateFilter } },
            {
                $group: {
                    _id: '$type',
                    totalRevenue: { $sum: '$amount' },
                    totalTransactions: { $sum: 1 },
                    avgAmount: { $avg: '$amount' }
                }
            }
        ]);
        
        // Get daily revenue (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const dailyRevenue = await UnifiedPayment.aggregate([
            { 
                $match: { 
                    status: 'paid', 
                    paidAt: { $gte: thirtyDaysAgo } 
                } 
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } },
                    revenue: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        // Total stats
        const totalStats = await UnifiedPayment.aggregate([
            { $match: { status: 'paid' } },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$amount' },
                    totalTransactions: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$user' }
                }
            }
        ]);
        
        res.json({
            success: true,
            byType: statsByType,
            dailyRevenue,
            overall: totalStats[0] ? {
                totalRevenue: totalStats[0].totalRevenue,
                totalTransactions: totalStats[0].totalTransactions,
                uniqueUsers: totalStats[0].uniqueUsers.length
            } : {
                totalRevenue: 0,
                totalTransactions: 0,
                uniqueUsers: 0
            }
        });
    } catch (error) {
        console.error('Error fetching payment stats:', error);
        res.status(400).json({ error: error.message });
    }
});

// Admin: Get user's payment history
router.get('/admin/user/:userId', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { userId } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        const [payments, summary] = await Promise.all([
            UnifiedPayment.find({ user: userId })
                .sort({ createdAt: -1 })
                .lean(),
            UnifiedPayment.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(userId), status: 'paid' } },
                {
                    $group: {
                        _id: '$type',
                        total: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);
        
        res.json({
            success: true,
            payments,
            summary,
            totalSpent: summary.reduce((acc, s) => acc + s.total, 0)
        });
    } catch (error) {
        console.error('Error fetching user payments:', error);
        res.status(400).json({ error: error.message });
    }
});

// Admin: Get payments by type
router.get('/admin/by-type/:type', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { type } = req.params;
        const validTypes = ['ai_chat', 'astrologer_chat', 'pooja_order', 'shop_order'];
        
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid payment type' });
        }
        
        const { page = 1, limit = 50, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const query = { type };
        if (status) query.status = status;
        
        const [payments, total, stats] = await Promise.all([
            UnifiedPayment.find(query)
                .populate('user', 'firstName lastName email phone')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            UnifiedPayment.countDocuments(query),
            UnifiedPayment.aggregate([
                { $match: { type, status: 'paid' } },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: '$amount' },
                        totalTransactions: { $sum: 1 }
                    }
                }
            ])
        ]);
        
        res.json({
            success: true,
            type,
            payments,
            stats: stats[0] || { totalRevenue: 0, totalTransactions: 0 },
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total
            }
        });
    } catch (error) {
        console.error('Error fetching payments by type:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
