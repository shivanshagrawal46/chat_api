const mongoose = require('mongoose');

// One row per astrologer-chat session. Status flow:
//   ringing  -> accepted -> active -> ended
//                                 \-> cancelled (if either side bails before active)
//
// Billing semantics (Astrotalk-style):
//   * Min balance to start = ratePerMinute * MIN_MINUTES (5)
//   * First minute is charged at the moment the session becomes active
//   * Subsequent minutes are charged every 60s thereafter
//   * If wallet < ratePerMinute on a tick, a 30s grace period starts
//     during which the user may recharge. If still insufficient, the
//     session ends with reason `low_balance`.
const astrologerChatSessionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    // The astrologer persona being talked to (one of the seeded keys)
    astrologerKey: {
        type: String,
        required: true,
        lowercase: true,
        index: true
    },
    // Snapshot of the astrologer's name + rate AT session-start so historical
    // records are immutable even if rates change later.
    astrologerName: {
        type: String,
        required: true
    },
    ratePerMinute: {
        type: Number,
        required: true,
        min: 0
    },
    minBalanceRequired: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['ringing', 'accepted', 'active', 'ended', 'cancelled'],
        default: 'ringing',
        index: true
    },
    endReason: {
        type: String,
        enum: [
            'user_ended',
            'admin_ended',
            'low_balance',
            'admin_did_not_answer',
            'user_did_not_join',
            'admin_rejected',
            'user_cancelled',
            'server_restart',
            'disconnected',
            'admin_disconnected',
            'admin_unreachable',
            null
        ],
        default: null
    },
    // Join tracking — billing only starts when both flags are true.
    userJoined: {
        type: Boolean,
        default: false
    },
    adminJoined: {
        type: Boolean,
        default: false
    },
    userJoinedAt: { type: Date, default: null },
    adminJoinedAt: { type: Date, default: null },

    // Billing
    startedAt: { type: Date, default: null },           // when status became 'active'
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },      // total seconds billed
    minutesBilled: { type: Number, default: 0 },        // how many full minutes deducted
    totalCharged: { type: Number, default: 0 },         // INR
    lastBilledAt: { type: Date, default: null },
    inGracePeriod: { type: Boolean, default: false },

    // Bookkeeping
    requestedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

astrologerChatSessionSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

astrologerChatSessionSchema.index({ user: 1, status: 1 });
astrologerChatSessionSchema.index({ astrologerKey: 1, status: 1 });
astrologerChatSessionSchema.index({ status: 1, createdAt: -1 });

// Hard guarantees enforced by the database, not just by the pre-checks in
// the request handler (which two concurrent taps can both pass):
//   * a user has at most ONE live session
//   * an astrologer persona has at most ONE live session
// `$in` inside partialFilterExpression needs MongoDB 6.0+. On older servers
// the index build logs an error and the app keeps the handler-level checks.
const LIVE_FILTER = { status: { $in: ['ringing', 'accepted', 'active'] } };
astrologerChatSessionSchema.index(
    { user: 1 },
    { unique: true, partialFilterExpression: LIVE_FILTER, name: 'one_live_session_per_user' }
);
astrologerChatSessionSchema.index(
    { astrologerKey: 1 },
    { unique: true, partialFilterExpression: LIVE_FILTER, name: 'one_live_session_per_astrologer' }
);

module.exports = mongoose.model('AstrologerChatSession', astrologerChatSessionSchema);
