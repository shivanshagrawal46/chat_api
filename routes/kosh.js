const express = require('express');
const router = express.Router();
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const UnifiedPayment = require('../models/UnifiedPayment');
const auth = require('../middleware/auth');

// POST /api/kosh-purchase
// Body: { amount, paymentMethod: 'wallet', contentId?, productName?/title?, email?, quantity?, orderId? }
//
// Buys a piece of Kosh (shop) content using the user's wallet. There is no
// standalone wallet-debit REST API, so this endpoint performs the actual
// deduction server-side using the SAME atomic conditional-debit pattern the
// astrologer-chat billing relies on:
//   findOneAndUpdate({ balance: { $gte: amount } }, { $inc: { balance: -amount } })
// This guarantees a purchase can never overdraw the wallet, even under
// concurrent requests. On success it records the purchase (so the content is
// marked owned for the email), writes a ledger row, and pushes a real-time
// deduction-confirmation to the user's app.
router.post('/', auth, async (req, res) => {
    try {
        const { amount, paymentMethod, contentId, productName, title, quantity, orderId } = req.body;
        const email = (req.body.email || req.user.email || '').trim().toLowerCase();
        const numAmount = Number(amount);
        const contentTitle = (productName || title || 'Kosh content').toString();

        // ---- Validation ----
        if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ error: 'A valid amount is required' });
        }
        // This endpoint only performs the wallet debit. Card/UPI (Razorpay)
        // purchases go through the existing shop-payment flow instead.
        if (paymentMethod !== 'wallet') {
            return res.status(400).json({
                error: "This endpoint only handles paymentMethod 'wallet'"
            });
        }

        // ---- Idempotency: don't charge twice for the same content ----
        if (contentId) {
            const owned = await UnifiedPayment.findOne({
                user: req.user._id,
                type: 'shop_order',
                status: 'paid',
                'details.contentId': String(contentId)
            }).lean();
            if (owned) {
                const wallet = await Wallet.findOrCreate(req.user._id);
                return res.json({
                    success: true,
                    alreadyOwned: true,
                    message: `You already own "${contentTitle}". No amount was deducted.`,
                    purchased: true,
                    contentId: String(contentId),
                    title: contentTitle,
                    email,
                    amount: 0,
                    balance: wallet.balance,
                    purchaseId: owned._id
                });
            }
        }

        // ---- Atomic conditional debit (same pattern as chat billing) ----
        const wallet = await Wallet.findOneAndUpdate(
            { user: req.user._id, balance: { $gte: numAmount } },
            {
                $inc: { balance: -numAmount, totalSpent: numAmount },
                $set: { lastTransactionAt: new Date(), updatedAt: new Date() }
            },
            { new: true }
        );

        if (!wallet) {
            // Either no wallet or insufficient balance.
            const current = await Wallet.findOrCreate(req.user._id);
            return res.status(402).json({
                error: 'Insufficient wallet balance',
                walletBalance: current.balance,
                amount: numAmount,
                shortfall: Math.max(0, numAmount - current.balance)
            });
        }

        // ---- Mark content purchased for this email ----
        const purchase = await UnifiedPayment.create({
            user: req.user._id,
            type: 'shop_order',
            amount: numAmount,
            status: 'paid',
            paidAt: new Date(),
            details: {
                orderId: orderId || `KOSH_${Date.now()}`,
                orderItems: JSON.stringify({
                    contentId: contentId ? String(contentId) : null,
                    title: contentTitle,
                    quantity: quantity || 1
                }),
                contentId: contentId ? String(contentId) : null,
                purchaseEmail: email,
                paymentMethod: 'wallet'
            },
            description: `Kosh purchase: ${contentTitle}${email ? ` (${email})` : ''}`
        });

        // ---- Ledger row (its description doubles as the confirmation) ----
        const confirmationMessage =
            `₹${numAmount} deducted from your wallet for "${contentTitle}". Remaining balance: ₹${wallet.balance}.`;
        await WalletTransaction.create({
            user: req.user._id,
            type: 'shop_order',
            amount: -numAmount,
            balanceAfter: wallet.balance,
            description: confirmationMessage,
            status: 'success'
        });

        // ---- Real-time deduction confirmation to the user's app ----
        const io = req.app.get('io');
        if (io) {
            const uid = req.user._id.toString();
            io.to(uid).emit('wallet_updated', {
                balance: wallet.balance,
                lastTransaction: {
                    type: 'shop_order',
                    amount: -numAmount,
                    description: confirmationMessage,
                    createdAt: new Date()
                }
            });
            io.to(uid).emit('kosh_purchase_confirmed', {
                purchaseId: purchase._id,
                contentId: contentId ? String(contentId) : null,
                title: contentTitle,
                email,
                amount: numAmount,
                balance: wallet.balance,
                message: confirmationMessage
            });
        }

        res.json({
            success: true,
            message: confirmationMessage,
            purchased: true,
            purchaseId: purchase._id,
            contentId: contentId ? String(contentId) : null,
            title: contentTitle,
            email,
            amount: numAmount,
            balance: wallet.balance
        });
    } catch (error) {
        console.error('Error processing kosh purchase:', error);
        res.status(500).json({ error: 'Failed to process purchase' });
    }
});

module.exports = router;
