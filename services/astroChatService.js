/**
 * Astrologer-chat session service
 * -------------------------------
 * The "start a chat" and "accept a chat" flows are reachable both over
 * Socket.IO (index.js) and over REST (routes/astrologer-chat.js). They used
 * to be two hand-copied versions that had already drifted (the REST path
 * never rang the admin's phone). Both now call into here.
 *
 * Every function returns a plain result object instead of throwing on
 * business-rule failures:
 *   { ok: true,  ... }
 *   { ok: false, status: <http status>, code: <machine code>, error: <text>, ...extra }
 * so the socket layer can emit it and the REST layer can res.status(...) it.
 */

const Astrologer = require('../models/Astrologer');
const AstrologerChatSession = require('../models/AstrologerChatSession');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const billing = require('./astroBillingEngine');
const astroPush = require('./astroPush');

const LIVE = billing.LIVE_STATUSES;

const fail = (status, code, error, extra = {}) => ({ ok: false, status, code, error, ...extra });

/**
 * Is there any way to reach Guruji right now? Either an admin socket is
 * connected or an admin device has a push token we can ring.
 */
async function isAdminReachable() {
    if (billing.adminOnlineCount() > 0) return true;
    return !!(await User.exists({ isAdmin: true, fcmToken: { $ne: null } }));
}

/**
 * User asks to chat with an astrologer persona.
 * On success the session is `ringing`, the ring timeout is armed, every
 * admin socket has received `astro_chat_ringing`, every admin device has
 * been pushed, and the user's own room has received `astro_chat_ringing_placed`.
 */
async function requestChat({ userId, astrologerKey }) {
    if (!astrologerKey) return fail(400, 'ASTROLOGER_KEY_REQUIRED', 'astrologerKey is required');

    const astro = await Astrologer.findOne({ key: String(astrologerKey).toLowerCase(), isActive: true });
    if (!astro) return fail(404, 'ASTROLOGER_NOT_FOUND', 'Astrologer not found');
    if (!astro.isOnline) return fail(409, 'ASTROLOGER_OFFLINE', 'Astrologer is currently offline');

    // Nobody can answer → don't make the user stare at a ringing screen for
    // 60s. Tell them right away.
    if (!(await isAdminReachable())) {
        return fail(503, 'ADMIN_UNREACHABLE',
            `${astro.displayName} is currently unavailable. Please try again in a few minutes.`);
    }

    const existing = await AstrologerChatSession.findOne({ user: userId, status: { $in: LIVE } });
    if (existing) {
        return fail(409, 'USER_BUSY', 'You already have an in-progress chat session', { session: existing });
    }

    const astroBusy = await AstrologerChatSession.findOne({ astrologerKey: astro.key, status: { $in: LIVE } });
    if (astroBusy) {
        return fail(409, 'ASTROLOGER_BUSY',
            `${astro.displayName} is currently busy with another user. Please try again shortly.`);
    }

    const wallet = await Wallet.findOrCreate(userId);
    const minRequired = astro.ratePerMinute * billing.MIN_MINUTES_TO_START;
    if (wallet.balance < minRequired) {
        return fail(402, 'INSUFFICIENT_BALANCE', 'Insufficient wallet balance', {
            walletBalance: wallet.balance,
            ratePerMinute: astro.ratePerMinute,
            minBalanceRequired: minRequired,
            shortfall: minRequired - wallet.balance
        });
    }

    let session;
    try {
        session = await AstrologerChatSession.create({
            user: userId,
            astrologerKey: astro.key,
            astrologerName: astro.displayName,
            ratePerMinute: astro.ratePerMinute,
            minBalanceRequired: minRequired,
            status: 'ringing',
            requestedAt: new Date()
        });
    } catch (err) {
        // Partial unique index fired: a concurrent request (double tap, or
        // another user grabbing the same persona) won the race.
        if (err && err.code === 11000) {
            const mine = await AstrologerChatSession.findOne({ user: userId, status: { $in: LIVE } });
            if (mine) return fail(409, 'USER_BUSY', 'You already have an in-progress chat session', { session: mine });
            return fail(409, 'ASTROLOGER_BUSY',
                `${astro.displayName} is currently busy with another user. Please try again shortly.`);
        }
        throw err;
    }

    billing.armRingTimeout(session._id);

    const userDoc = await User.findById(userId).select('firstName lastName phone').lean();
    const estimatedMinutes = Math.floor(wallet.balance / astro.ratePerMinute);
    const ringPayload = {
        sessionId: session._id,
        astrologerKey: astro.key,
        astrologerName: astro.displayName,
        ratePerMinute: astro.ratePerMinute,
        user: {
            _id: session.user,
            firstName: userDoc?.firstName,
            lastName: userDoc?.lastName,
            phone: userDoc?.phone
        },
        walletBalance: wallet.balance,
        estimatedMinutes,
        requestedAt: session.requestedAt,
        expiresAt: new Date(session.requestedAt.getTime() + billing.RING_TIMEOUT_MS),
        ringTimeoutMs: billing.RING_TIMEOUT_MS
    };

    // Ring all admin sockets (single-admin model — every admin device shows
    // the incoming card; whoever taps Accept first wins).
    billing.emitToAdmins('astro_chat_ringing', ringPayload);

    // Ring the admin's phone even if the app is backgrounded / killed.
    astroPush.ringAdmins({
        session, astro, user: userDoc,
        walletBalance: wallet.balance,
        ringTimeoutMs: billing.RING_TIMEOUT_MS
    });

    const placedPayload = {
        sessionId: session._id,
        astrologerKey: astro.key,
        astrologerName: astro.displayName,
        ratePerMinute: astro.ratePerMinute,
        ringTimeoutMs: billing.RING_TIMEOUT_MS
    };
    billing.emitToUser(userId, 'astro_chat_ringing_placed', placedPayload);

    return {
        ok: true,
        session,
        walletBalance: wallet.balance,
        estimatedMinutes,
        ringTimeoutMs: billing.RING_TIMEOUT_MS,
        ringPayload,
        placedPayload
    };
}

/**
 * Admin accepts a ringing session. Atomic ringing -> accepted, so a double
 * tap or a race with the ring timeout can only produce one winner. Both
 * sides get `astro_chat_accepted`; the user's phone is pushed so they can
 * join before the join window closes; other admin devices are told to stop
 * ringing.
 */
async function acceptChat({ sessionId }) {
    if (!sessionId) return fail(400, 'SESSION_ID_REQUIRED', 'sessionId is required');

    const session = await AstrologerChatSession.findOneAndUpdate(
        { _id: sessionId, status: 'ringing' },
        { $set: { status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() } },
        { new: true }
    );
    if (!session) {
        const existing = await AstrologerChatSession.findById(sessionId).catch(() => null);
        return existing
            ? fail(400, 'SESSION_NOT_RINGING', `Session is already ${existing.status}`)
            : fail(404, 'SESSION_NOT_FOUND', 'Session not found');
    }

    billing.clearRingTimeout(session._id);
    billing.armJoinTimeout(session._id);

    const payload = {
        sessionId: session._id,
        astrologerKey: session.astrologerKey,
        astrologerName: session.astrologerName,
        ratePerMinute: session.ratePerMinute,
        joinTimeoutMs: billing.JOIN_TIMEOUT_MS,
        acceptedAt: session.acceptedAt
    };
    billing.emitToUser(session.user, 'astro_chat_accepted', payload);
    billing.emitToAdmins('astro_chat_accepted', { ...payload, userId: session.user });

    astroPush.acceptedToUser(session, billing.JOIN_TIMEOUT_MS);
    astroPush.ringCancelledToAdmins(session, 'accepted');

    return { ok: true, session, payload };
}

module.exports = {
    isAdminReachable,
    requestChat,
    acceptChat
};
