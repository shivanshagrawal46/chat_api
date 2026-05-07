const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const auth = require('../middleware/auth');

// Razorpay singleton (mirrors the pattern used in routes/unified-payment.js)
let razorpay = null;
try {
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        console.log('✅ Razorpay initialized for Wallet');
    }
} catch (error) {
    console.error('Razorpay initialization error (wallet):', error);
}

const MIN_RECHARGE = 10;       // ₹10 minimum (matches typical Indian payment platforms)
const MAX_RECHARGE = 100000;   // ₹1,00,000 cap to prevent runaway rounding mistakes

// ==================== WALLET BALANCE ====================

// GET /api/wallet/balance — current balance + lifetime totals
router.get('/balance', auth, async (req, res) => {
    try {
        const wallet = await Wallet.findOrCreate(req.user._id);
        res.json({
            success: true,
            balance: wallet.balance,
            currency: wallet.currency,
            totalRecharged: wallet.totalRecharged,
            totalSpent: wallet.totalSpent,
            lastTransactionAt: wallet.lastTransactionAt
        });
    } catch (error) {
        console.error('Error fetching wallet balance:', error);
        res.status(500).json({ error: 'Failed to fetch wallet balance' });
    }
});

// ==================== RECHARGE ====================

// POST /api/wallet/recharge/create-order
// Body: { amount: number }
// Creates a Razorpay order. The wallet is NOT credited yet — that happens on /verify.
router.post('/recharge/create-order', auth, async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(503).json({ error: 'Payment service not configured' });
        }

        const { amount } = req.body;
        const numAmount = Number(amount);

        if (!numAmount || isNaN(numAmount) || numAmount < MIN_RECHARGE) {
            return res.status(400).json({ error: `Minimum recharge is ₹${MIN_RECHARGE}` });
        }
        if (numAmount > MAX_RECHARGE) {
            return res.status(400).json({ error: `Maximum recharge is ₹${MAX_RECHARGE}` });
        }

        const order = await razorpay.orders.create({
            amount: Math.round(numAmount * 100), // paise
            currency: 'INR',
            receipt: `wlt_${req.user._id.toString().slice(-8)}_${Date.now().toString().slice(-8)}`,
            notes: {
                userId: req.user._id.toString(),
                type: 'wallet_recharge'
            }
        });

        // Pre-record a pending transaction so we have an audit trail even if
        // the user abandons checkout. balanceAfter is the CURRENT balance
        // (no change yet) — it'll be overwritten on verify.
        const wallet = await Wallet.findOrCreate(req.user._id);
        await WalletTransaction.create({
            user: req.user._id,
            type: 'recharge',
            amount: numAmount,
            balanceAfter: wallet.balance,
            razorpayOrderId: order.id,
            description: `Wallet recharge of ₹${numAmount}`,
            status: 'pending'
        });

        res.json({
            success: true,
            orderId: order.id,
            amount: numAmount,
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error creating wallet recharge order:', error);
        res.status(500).json({ error: 'Failed to create recharge order' });
    }
});

// POST /api/wallet/recharge/verify
// Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature }
// Verifies the signature, atomically credits the wallet, and updates the
// pending ledger row to `success`. Idempotent: a second call with the same
// order id returns the same wallet state without double-crediting.
router.post('/recharge/verify', auth, async (req, res) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({ error: 'Missing payment verification fields' });
        }

        // 1. Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');
        if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        // 2. Find the pending transaction we created at order time
        const txn = await WalletTransaction.findOne({
            user: req.user._id,
            razorpayOrderId,
            type: 'recharge'
        });
        if (!txn) {
            return res.status(404).json({ error: 'Transaction record not found' });
        }

        // 3. Idempotency: if already credited, return current state
        if (txn.status === 'success') {
            const wallet = await Wallet.findOrCreate(req.user._id);
            return res.json({
                success: true,
                alreadyCredited: true,
                balance: wallet.balance,
                amount: txn.amount
            });
        }

        // 4. Atomically credit the wallet
        const wallet = await Wallet.findOneAndUpdate(
            { user: req.user._id },
            {
                $inc: { balance: txn.amount, totalRecharged: txn.amount },
                $set: { lastTransactionAt: new Date(), updatedAt: new Date() }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // 5. Mark the ledger row as success
        txn.status = 'success';
        txn.razorpayPaymentId = razorpayPaymentId;
        txn.razorpaySignature = razorpaySignature;
        txn.balanceAfter = wallet.balance;
        await txn.save();

        // 6. Notify user via socket if connected (so the in-app balance refreshes
        // even while a chat is happening).
        const io = req.app.get('io');
        if (io) {
            io.to(req.user._id.toString()).emit('wallet_updated', {
                balance: wallet.balance,
                lastTransaction: {
                    type: 'recharge',
                    amount: txn.amount,
                    createdAt: txn.createdAt
                }
            });
        }

        res.json({
            success: true,
            message: 'Wallet recharged successfully',
            balance: wallet.balance,
            amount: txn.amount,
            transactionId: txn._id
        });
    } catch (error) {
        console.error('Error verifying wallet recharge:', error);
        res.status(500).json({ error: 'Failed to verify recharge' });
    }
});

// ==================== TRANSACTIONS ====================

// GET /api/wallet/transactions?type=recharge|astro_chat|ai_chat&page=1&limit=20
router.get('/transactions', auth, async (req, res) => {
    try {
        const { type, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

        const query = { user: req.user._id, status: 'success' };
        if (type) query.type = type;

        const [transactions, total] = await Promise.all([
            WalletTransaction.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit, 10))
                .lean(),
            WalletTransaction.countDocuments(query)
        ]);

        res.json({
            success: true,
            transactions,
            pagination: {
                current: parseInt(page, 10),
                pages: Math.ceil(total / parseInt(limit, 10)),
                total
            }
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// ==================== ADMIN ====================

// Admin: get any user's wallet (for support / refunds)
router.get('/admin/user/:userId', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const wallet = await Wallet.findOne({ user: req.params.userId }).lean();
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }
        const recentTxns = await WalletTransaction.find({ user: req.params.userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        res.json({ success: true, wallet, recentTransactions: recentTxns });
    } catch (error) {
        console.error('Error fetching user wallet (admin):', error);
        res.status(500).json({ error: 'Failed to fetch wallet' });
    }
});

// Admin: manual adjustment (credit or debit), e.g. for refunds or promo credit.
// Body: { userId, amount (negative = debit), reason }
router.post('/admin/adjust', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { userId, amount, reason } = req.body;
        const numAmount = Number(amount);
        if (!userId || !numAmount || isNaN(numAmount)) {
            return res.status(400).json({ error: 'userId and non-zero amount required' });
        }

        const wallet = await Wallet.findOrCreate(userId);
        // Prevent negative balance on debits
        if (numAmount < 0 && wallet.balance + numAmount < 0) {
            return res.status(400).json({ error: 'Insufficient balance for debit' });
        }

        const updated = await Wallet.findOneAndUpdate(
            { user: userId },
            {
                $inc: {
                    balance: numAmount,
                    [numAmount > 0 ? 'totalRecharged' : 'totalSpent']: Math.abs(numAmount)
                },
                $set: { lastTransactionAt: new Date(), updatedAt: new Date() }
            },
            { new: true }
        );

        await WalletTransaction.create({
            user: userId,
            type: 'adjustment',
            amount: numAmount,
            balanceAfter: updated.balance,
            description: reason || `Admin adjustment by ${req.user.firstName}`,
            status: 'success'
        });

        const io = req.app.get('io');
        if (io) {
            io.to(userId.toString()).emit('wallet_updated', {
                balance: updated.balance,
                lastTransaction: { type: 'adjustment', amount: numAmount }
            });
        }

        res.json({ success: true, balance: updated.balance });
    } catch (error) {
        console.error('Error adjusting wallet:', error);
        res.status(500).json({ error: 'Failed to adjust wallet' });
    }
});

module.exports = router;
