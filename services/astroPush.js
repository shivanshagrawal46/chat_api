/**
 * Astrologer-chat push notifications
 * ----------------------------------
 * Every FCM push the astrologer-chat flow sends lives here, so the socket
 * handlers, REST routes and the billing engine all produce identical
 * payloads. Nothing in this module depends on the billing engine, so it can
 * be required from anywhere without a cycle.
 *
 * Admin ring style (env ASTRO_RING_PUSH_STYLE):
 *   call   (default) – data-only, high priority. The admin app draws a
 *                      full-screen incoming-chat screen with a looping
 *                      ringtone and Accept / Reject. Requires the app's
 *                      background handler to be implemented.
 *   banner           – legacy notification + data. The OS shows a normal
 *                      banner. Use until the admin app is updated.
 */

const fcm = require('./fcmService');
const User = require('../models/User');

const RING_PUSH_STYLE =
    (process.env.ASTRO_RING_PUSH_STYLE || 'call').toLowerCase() === 'banner' ? 'banner' : 'call';
const RING_IOS_SOUND = process.env.ASTRO_RING_IOS_SOUND || 'default';
const RING_CANCEL_TTL_MS = 60 * 1000;

const fullName = (u) => `${u?.firstName || ''} ${u?.lastName || ''}`.trim();

async function adminTokens() {
    const admins = await User.find({ isAdmin: true, fcmToken: { $ne: null } })
        .select('fcmToken').lean();
    return admins.map(a => a.fcmToken).filter(Boolean);
}

async function userToken(userId) {
    const u = await User.findById(userId).select('fcmToken').lean();
    return u?.fcmToken || null;
}

/**
 * Ring every admin device for a freshly created `ringing` session.
 * `expiresAt` tells the client when to stop ringing on its own even if the
 * cancel push never arrives.
 */
async function ringAdmins({ session, astro, user, walletBalance, ringTimeoutMs }) {
    try {
        const tokens = await adminTokens();
        if (tokens.length === 0) return;

        const requestedAt = session.requestedAt || new Date();
        const expiresAt = new Date(new Date(requestedAt).getTime() + ringTimeoutMs);
        const userName = fullName(user);
        const title = `Incoming chat for ${astro.displayName}`;
        const body = `${user?.firstName || 'A user'} wants to chat (₹${astro.ratePerMinute}/min)`;

        const data = {
            type: 'incoming_astro_chat',
            sessionId: session._id.toString(),
            astrologerKey: astro.key,
            astrologerName: astro.displayName,
            ratePerMinute: astro.ratePerMinute,
            userId: session.user.toString(),
            userName,
            userPhone: user?.phone || '',
            walletBalance,
            estimatedMinutes: Math.floor(walletBalance / astro.ratePerMinute),
            requestedAt: new Date(requestedAt).toISOString(),
            expiresAt: expiresAt.toISOString(),
            ringTimeoutMs,
            title,
            body,
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
        };

        await Promise.all(tokens.map(token =>
            RING_PUSH_STYLE === 'banner'
                ? fcm.sendRingingBanner(token, title, body, data, { ttlMs: ringTimeoutMs })
                : fcm.sendData(token, data, {
                    ttlMs: ringTimeoutMs,
                    ios: { title, body, sound: RING_IOS_SOUND, category: 'INCOMING_ASTRO_CHAT' }
                })
        ));
    } catch (e) {
        console.error('Admin ring FCM error:', e);
    }
}

/**
 * Tell admin devices to stop ringing: the ring was accepted elsewhere,
 * cancelled by the user, or timed out. Silent data push.
 */
async function ringCancelledToAdmins(session, reason) {
    try {
        const tokens = await adminTokens();
        if (tokens.length === 0) return;
        const data = {
            type: 'astro_ring_cancelled',
            sessionId: session._id.toString(),
            astrologerKey: session.astrologerKey,
            userId: session.user.toString(),
            reason
        };
        await Promise.all(tokens.map(token => fcm.sendData(token, data, { ttlMs: RING_CANCEL_TTL_MS })));
    } catch (e) {
        console.error('Admin ring-cancel FCM error:', e);
    }
}

/**
 * Wake the user's app after the admin accepts so they can join before the
 * join window closes. Visible on both platforms.
 */
async function acceptedToUser(session, joinTimeoutMs) {
    try {
        const token = await userToken(session.user);
        if (!token) return;
        await fcm.sendRingingBanner(
            token,
            `${session.astrologerName} accepted your chat`,
            'Tap to join the chat now',
            {
                type: 'astro_chat_accepted',
                sessionId: session._id.toString(),
                astrologerKey: session.astrologerKey,
                astrologerName: session.astrologerName,
                ratePerMinute: session.ratePerMinute,
                joinTimeoutMs
            },
            { ttlMs: joinTimeoutMs }
        );
    } catch (e) {
        console.error('Accept FCM error:', e);
    }
}

/**
 * In-session message for a receiver whose socket is gone (app backgrounded
 * or killed mid-chat).
 */
async function messageToOfflineReceiver({ session, message, toAdmin, senderName }) {
    try {
        const preview = message.content.substring(0, 100);
        const data = {
            type: 'astro_chat_message',
            sessionId: session._id.toString(),
            astrologerKey: session.astrologerKey,
            astrologerName: session.astrologerName,
            userId: session.user.toString(),
            messageId: message._id.toString(),
            senderId: message.sender.toString(),
            message: message.content.substring(0, 200),
            timestamp: message.createdAt.toISOString(),
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
        };
        if (toAdmin) {
            const tokens = await adminTokens();
            await Promise.all(tokens.map(token =>
                fcm.sendNotification(token, `${senderName || 'User'} → ${session.astrologerName}`, preview, data)
            ));
        } else {
            const token = await userToken(session.user);
            if (token) await fcm.sendNotification(token, session.astrologerName, preview, data);
        }
    } catch (e) {
        console.error('Astro message FCM error:', e);
    }
}

module.exports = {
    RING_PUSH_STYLE,
    ringAdmins,
    ringCancelledToAdmins,
    acceptedToUser,
    messageToOfflineReceiver
};
