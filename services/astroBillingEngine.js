/**
 * Astrologer Chat Billing Engine
 * --------------------------------
 * Manages the lifecycle of paid astrologer chat sessions in memory:
 *   - Per-minute atomic deductions from the user's wallet
 *   - 30-second grace period when the wallet drops below the per-minute rate
 *   - Ring timeout (admin must accept within RING_TIMEOUT_MS)
 *   - Join timeout (both parties must enter the chat within JOIN_TIMEOUT_MS)
 *
 * Why a singleton in-memory map?
 *   Per-session timers are state we need only on the active node. If the
 *   server restarts, `recoverOrphanSessions()` runs at boot and finalizes
 *   any sessions that were left in `active` / `accepted` state — see the
 *   call site in index.js.
 *
 * Concurrency safety:
 *   The deduction is a single Mongo `findOneAndUpdate` with a balance
 *   precondition (`balance: { $gte: ratePerMinute }`). This is atomic, so
 *   even if a user tries to start a second chat concurrently, only one
 *   debit can succeed per available rupee.
 */

const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const AstrologerChatSession = require('../models/AstrologerChatSession');

// In-memory: sessionId (string) -> { timeoutId, graceTimeoutId, ringTimeoutId, joinTimeoutId }
const activeSessionTimers = new Map();

// Tunables (kept here so they can be tweaked centrally)
const MIN_MINUTES_TO_START = 5;          // wallet must have >= 5 * rate to start
const TICK_INTERVAL_MS = 60 * 1000;      // 60s per billing minute
const GRACE_PERIOD_MS = 30 * 1000;       // 30s to recharge before ending
const RING_TIMEOUT_MS = 60 * 1000;       // admin has 60s to accept the ring
const JOIN_TIMEOUT_MS = 60 * 1000;       // both parties must join within 60s of accept
const ADMIN_ROOM = 'admins';

// Set by index.js after Socket.IO server is constructed.
let ioRef = null;
function setIO(io) {
    ioRef = io;
}

function emitToUser(userId, event, payload) {
    if (!ioRef || !userId) return;
    ioRef.to(userId.toString()).emit(event, payload);
}

function emitToAdmins(event, payload) {
    if (!ioRef) return;
    ioRef.to(ADMIN_ROOM).emit(event, payload);
}

function emitToBoth(session, event, payload) {
    emitToUser(session.user, event, payload);
    emitToAdmins(event, payload);
}

// ==================== TIMER HOUSEKEEPING ====================

function getTimers(sessionId) {
    const id = sessionId.toString();
    if (!activeSessionTimers.has(id)) {
        activeSessionTimers.set(id, {});
    }
    return activeSessionTimers.get(id);
}

function clearAllTimers(sessionId) {
    const id = sessionId.toString();
    const t = activeSessionTimers.get(id);
    if (!t) return;
    if (t.timeoutId) clearTimeout(t.timeoutId);
    if (t.graceTimeoutId) clearTimeout(t.graceTimeoutId);
    if (t.ringTimeoutId) clearTimeout(t.ringTimeoutId);
    if (t.joinTimeoutId) clearTimeout(t.joinTimeoutId);
    activeSessionTimers.delete(id);
}

// ==================== RING / JOIN TIMEOUTS ====================

/**
 * Called right after a session is created in `ringing` state. If admin
 * doesn't accept within RING_TIMEOUT_MS, the session is auto-cancelled.
 */
function armRingTimeout(sessionId) {
    const t = getTimers(sessionId);
    if (t.ringTimeoutId) clearTimeout(t.ringTimeoutId);
    t.ringTimeoutId = setTimeout(async () => {
        try {
            // Atomic: only cancel if STILL ringing. If an admin accepted in the
            // same tick, the transition already moved it to `accepted` and this
            // is a no-op — so we can never cancel a session that was just
            // accepted/activated.
            await cancelIfStatus(sessionId, 'ringing', 'admin_did_not_answer');
        } catch (err) {
            console.error('Ring timeout error:', err);
        }
    }, RING_TIMEOUT_MS);
}

function clearRingTimeout(sessionId) {
    const t = activeSessionTimers.get(sessionId.toString());
    if (t && t.ringTimeoutId) {
        clearTimeout(t.ringTimeoutId);
        t.ringTimeoutId = null;
    }
}

/**
 * Called when admin accepts. If both parties haven't joined within
 * JOIN_TIMEOUT_MS, the session is cancelled.
 */
function armJoinTimeout(sessionId) {
    const t = getTimers(sessionId);
    if (t.joinTimeoutId) clearTimeout(t.joinTimeoutId);
    t.joinTimeoutId = setTimeout(async () => {
        try {
            const s = await AstrologerChatSession.findById(sessionId);
            if (s && s.status === 'accepted') {
                const reason = !s.userJoined ? 'user_did_not_join' : 'admin_did_not_answer';
                // Atomic: only cancel if STILL accepted. If both joined and the
                // session activated in the same tick, this won't match and the
                // live (now active) session is preserved.
                await cancelIfStatus(sessionId, 'accepted', reason);
            }
        } catch (err) {
            console.error('Join timeout error:', err);
        }
    }, JOIN_TIMEOUT_MS);
}

function clearJoinTimeout(sessionId) {
    const t = activeSessionTimers.get(sessionId.toString());
    if (t && t.joinTimeoutId) {
        clearTimeout(t.joinTimeoutId);
        t.joinTimeoutId = null;
    }
}

// ==================== BILLING ====================

/**
 * Activate a session: marks it active, charges the first minute immediately,
 * and schedules subsequent ticks every 60s. Idempotent — safe to call twice.
 */
async function activateAndStartBilling(sessionId) {
    // Atomic accepted -> active transition. Both join events can arrive at
    // virtually the same instant; only ONE caller wins this conditional update,
    // so the first minute is charged exactly once and `astro_chat_started` is
    // emitted exactly once.
    const session = await AstrologerChatSession.findOneAndUpdate(
        { _id: sessionId, status: 'accepted' },
        { $set: { status: 'active', startedAt: new Date(), updatedAt: new Date() } },
        { new: true }
    );

    if (!session) {
        // We didn't win the transition. Either it's already active (the other
        // join won) or it's no longer joinable. If active without a scheduled
        // tick, make sure billing keeps ticking — but never charge here.
        const existing = await AstrologerChatSession.findById(sessionId);
        if (existing && existing.status === 'active' &&
            !activeSessionTimers.get(sessionId.toString())?.timeoutId) {
            scheduleNextTick(sessionId);
        }
        return existing;
    }

    clearJoinTimeout(sessionId);

    emitToBoth(session, 'astro_chat_started', {
        sessionId: session._id,
        astrologerKey: session.astrologerKey,
        astrologerName: session.astrologerName,
        ratePerMinute: session.ratePerMinute,
        startedAt: session.startedAt
    });

    // Charge the first minute immediately
    await chargeMinute(sessionId);
    return session;
}

/**
 * Single billing tick: try to deduct ratePerMinute from the user's wallet.
 * On success: log the transaction and schedule the next tick.
 * On failure: enter the 30s grace period.
 */
async function chargeMinute(sessionId) {
    const session = await AstrologerChatSession.findById(sessionId);
    if (!session || session.status !== 'active') {
        clearAllTimers(sessionId);
        return;
    }

    // Atomic conditional debit
    const wallet = await Wallet.findOneAndUpdate(
        { user: session.user, balance: { $gte: session.ratePerMinute } },
        {
            $inc: {
                balance: -session.ratePerMinute,
                totalSpent: session.ratePerMinute
            },
            $set: { lastTransactionAt: new Date(), updatedAt: new Date() }
        },
        { new: true }
    );

    if (wallet) {
        // Charge succeeded
        session.minutesBilled += 1;
        session.totalCharged += session.ratePerMinute;
        session.durationSeconds += 60;
        session.lastBilledAt = new Date();
        session.inGracePeriod = false;
        await session.save();

        await WalletTransaction.create({
            user: session.user,
            type: 'astro_chat',
            amount: -session.ratePerMinute,
            balanceAfter: wallet.balance,
            sessionId: session._id,
            astrologerKey: session.astrologerKey,
            description: `${session.astrologerName} chat — minute ${session.minutesBilled}`
        });

        const remainingMinutes = Math.floor(wallet.balance / session.ratePerMinute);

        emitToBoth(session, 'astro_billing_tick', {
            sessionId: session._id,
            astrologerKey: session.astrologerKey,
            ratePerMinute: session.ratePerMinute,
            minutesBilled: session.minutesBilled,
            totalCharged: session.totalCharged,
            durationSeconds: session.durationSeconds,
            walletBalance: wallet.balance,
            remainingMinutes
        });

        emitToUser(session.user, 'wallet_updated', {
            balance: wallet.balance,
            lastTransaction: {
                type: 'astro_chat',
                amount: -session.ratePerMinute,
                sessionId: session._id
            }
        });

        // Pre-emptive low-balance warning when we can't afford the next minute
        if (wallet.balance < session.ratePerMinute) {
            emitToUser(session.user, 'astro_low_balance_warning', {
                sessionId: session._id,
                walletBalance: wallet.balance,
                ratePerMinute: session.ratePerMinute,
                graceSeconds: GRACE_PERIOD_MS / 1000,
                isGracePeriod: false,
                message: 'Your wallet is running low. Recharge now to continue.'
            });
        }

        scheduleNextTick(sessionId);
    } else {
        // Insufficient balance — start grace period
        await beginGracePeriod(sessionId);
    }
}

function scheduleNextTick(sessionId) {
    const t = getTimers(sessionId);
    if (t.timeoutId) clearTimeout(t.timeoutId);
    t.timeoutId = setTimeout(() => {
        chargeMinute(sessionId).catch(err => {
            console.error('chargeMinute error:', err);
        });
    }, TICK_INTERVAL_MS);
}

async function beginGracePeriod(sessionId) {
    const session = await AstrologerChatSession.findById(sessionId);
    if (!session || session.status !== 'active') return;

    session.inGracePeriod = true;
    await session.save();

    emitToUser(session.user, 'astro_low_balance_warning', {
        sessionId: session._id,
        walletBalance: 0,
        ratePerMinute: session.ratePerMinute,
        graceSeconds: GRACE_PERIOD_MS / 1000,
        isGracePeriod: true,
        message: `Insufficient balance. Recharge within ${GRACE_PERIOD_MS / 1000}s or chat will end.`
    });
    emitToAdmins('astro_grace_started', {
        sessionId: session._id,
        astrologerKey: session.astrologerKey,
        userId: session.user
    });

    const t = getTimers(sessionId);
    if (t.graceTimeoutId) clearTimeout(t.graceTimeoutId);
    t.graceTimeoutId = setTimeout(async () => {
        try {
            // One last attempt to deduct
            const retryWallet = await Wallet.findOneAndUpdate(
                { user: session.user, balance: { $gte: session.ratePerMinute } },
                {
                    $inc: {
                        balance: -session.ratePerMinute,
                        totalSpent: session.ratePerMinute
                    },
                    $set: { lastTransactionAt: new Date() }
                },
                { new: true }
            );

            const fresh = await AstrologerChatSession.findById(sessionId);
            if (!fresh || fresh.status !== 'active') {
                clearAllTimers(sessionId);
                return;
            }

            if (retryWallet) {
                // User recharged in time
                fresh.minutesBilled += 1;
                fresh.totalCharged += fresh.ratePerMinute;
                fresh.durationSeconds += 60;
                fresh.lastBilledAt = new Date();
                fresh.inGracePeriod = false;
                await fresh.save();

                await WalletTransaction.create({
                    user: fresh.user,
                    type: 'astro_chat',
                    amount: -fresh.ratePerMinute,
                    balanceAfter: retryWallet.balance,
                    sessionId: fresh._id,
                    astrologerKey: fresh.astrologerKey,
                    description: `${fresh.astrologerName} chat — minute ${fresh.minutesBilled} (after grace recharge)`
                });

                emitToBoth(fresh, 'astro_billing_tick', {
                    sessionId: fresh._id,
                    astrologerKey: fresh.astrologerKey,
                    ratePerMinute: fresh.ratePerMinute,
                    minutesBilled: fresh.minutesBilled,
                    totalCharged: fresh.totalCharged,
                    durationSeconds: fresh.durationSeconds,
                    walletBalance: retryWallet.balance,
                    remainingMinutes: Math.floor(retryWallet.balance / fresh.ratePerMinute),
                    rechargedDuringGrace: true
                });
                emitToUser(fresh.user, 'wallet_updated', { balance: retryWallet.balance });

                scheduleNextTick(sessionId);
            } else {
                // Still broke — end the session
                await endSession(sessionId, 'low_balance');
            }
        } catch (err) {
            console.error('Grace timeout error:', err);
            await endSession(sessionId, 'low_balance').catch(() => {});
        }
    }, GRACE_PERIOD_MS);
}

// ==================== END SESSION ====================

/**
 * Cleanly ends a session and clears all its timers.
 * Idempotent — calling on an already-ended session is a no-op.
 */
async function endSession(sessionId, reason = 'user_ended') {
    clearAllTimers(sessionId);

    const current = await AstrologerChatSession.findById(sessionId);
    if (!current) return null;
    if (['ended', 'cancelled'].includes(current.status)) return current;

    // Sessions that never reached `active` are cancelled (no charge); active
    // sessions become `ended` with the duration and totals already recorded.
    const newStatus = (current.status === 'active') ? 'ended' : 'cancelled';

    // Atomic transition guarded against an already-terminal state, so two
    // concurrent enders (user taps End + admin taps End + a timeout firing)
    // can't both emit `astro_chat_ended` or clobber each other's fields.
    const session = await AstrologerChatSession.findOneAndUpdate(
        { _id: sessionId, status: { $nin: ['ended', 'cancelled'] } },
        { $set: { status: newStatus, endedAt: new Date(), endReason: reason, updatedAt: new Date() } },
        { new: true }
    );
    if (!session) {
        // Someone else terminated it first — don't re-emit.
        return await AstrologerChatSession.findById(sessionId);
    }

    const payload = {
        sessionId: session._id,
        astrologerKey: session.astrologerKey,
        astrologerName: session.astrologerName,
        userId: session.user,
        status: session.status,
        endReason: reason,
        durationSeconds: session.durationSeconds,
        minutesBilled: session.minutesBilled,
        totalCharged: session.totalCharged,
        endedAt: session.endedAt
    };
    emitToBoth(session, 'astro_chat_ended', payload);

    return session;
}

/**
 * Atomically cancel a session ONLY if it is still in `expectedStatus`. Used by
 * the ring/join timeouts so a session that was accepted or activated in the
 * same instant the timer fires is never wrongly cancelled. No-op (returns null)
 * if the status already moved on.
 */
async function cancelIfStatus(sessionId, expectedStatus, reason) {
    const session = await AstrologerChatSession.findOneAndUpdate(
        { _id: sessionId, status: expectedStatus },
        { $set: { status: 'cancelled', endedAt: new Date(), endReason: reason, updatedAt: new Date() } },
        { new: true }
    );
    if (!session) return null;

    clearAllTimers(sessionId);
    emitToBoth(session, 'astro_chat_ended', {
        sessionId: session._id,
        astrologerKey: session.astrologerKey,
        astrologerName: session.astrologerName,
        userId: session.user,
        status: session.status,
        endReason: reason,
        durationSeconds: session.durationSeconds,
        minutesBilled: session.minutesBilled,
        totalCharged: session.totalCharged,
        endedAt: session.endedAt
    });
    return session;
}

// ==================== STARTUP RECOVERY ====================

/**
 * On server boot, mark any sessions that were left mid-flight as ended with
 * reason `server_restart`. We don't try to "resume" them — that's bad UX
 * because the user has no idea the server died. Cleaner to end and let them
 * start a new session.
 */
async function recoverOrphanSessions() {
    try {
        const orphans = await AstrologerChatSession.find({
            status: { $in: ['ringing', 'accepted', 'active'] }
        });
        for (const s of orphans) {
            s.endedAt = new Date();
            s.endReason = 'server_restart';
            s.status = (s.status === 'active') ? 'ended' : 'cancelled';
            await s.save();
        }
        if (orphans.length > 0) {
            console.log(`🧹 Recovered ${orphans.length} orphan astrologer session(s) on boot`);
        }
        return orphans.length;
    } catch (err) {
        console.error('Failed to recover orphan sessions:', err);
        return 0;
    }
}

module.exports = {
    setIO,
    activateAndStartBilling,
    endSession,
    armRingTimeout,
    clearRingTimeout,
    armJoinTimeout,
    clearJoinTimeout,
    recoverOrphanSessions,
    activeSessionTimers,
    emitToUser,
    emitToAdmins,
    // constants
    MIN_MINUTES_TO_START,
    TICK_INTERVAL_MS,
    GRACE_PERIOD_MS,
    RING_TIMEOUT_MS,
    JOIN_TIMEOUT_MS,
    ADMIN_ROOM
};
