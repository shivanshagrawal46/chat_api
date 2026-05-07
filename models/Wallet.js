const mongoose = require('mongoose');

// One wallet per user. Balance is stored in rupees (number, allows decimals if ever needed).
// Mutations on `balance` MUST be done via atomic $inc with a balance precondition
// to avoid race conditions during concurrent per-minute deductions.
const walletSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    totalRecharged: {
        type: Number,
        default: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'INR'
    },
    lastTransactionAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

walletSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Helper: get-or-create wallet for a user
walletSchema.statics.findOrCreate = async function (userId) {
    let wallet = await this.findOne({ user: userId });
    if (!wallet) {
        wallet = await this.create({ user: userId, balance: 0 });
    }
    return wallet;
};

module.exports = mongoose.model('Wallet', walletSchema);
