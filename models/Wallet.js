const mongoose = require('mongoose');

// One wallet per user. Balance is stored in rupees (number, allows decimals if ever needed).
// Mutations on `balance` MUST be done via atomic $inc with a balance precondition
// to avoid race conditions during concurrent per-minute deductions.
const walletSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        // `unique: true` already creates an index on this field, so we
        // intentionally do NOT add `index: true` here — that would trigger
        // Mongoose's "Duplicate schema index on {user:1}" warning.
        unique: true
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

// Helper: get-or-create wallet for a user.
// Uses an atomic upsert so two concurrent callers (e.g. a fast reconnect)
// can never both succeed on `create()` and trigger a DuplicateKeyError.
// `$setOnInsert` ensures we only stamp default fields when the doc is brand
// new, never overwriting an existing balance.
walletSchema.statics.findOrCreate = async function (userId) {
    return this.findOneAndUpdate(
        { user: userId },
        {
            $setOnInsert: {
                user: userId,
                balance: 0,
                totalRecharged: 0,
                totalSpent: 0,
                currency: 'INR',
                createdAt: new Date()
            }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
};

module.exports = mongoose.model('Wallet', walletSchema);
