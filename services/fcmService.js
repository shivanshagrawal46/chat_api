/**
 * Firebase Cloud Messaging service
 * --------------------------------
 * Single place that owns the Firebase Admin SDK instance and the three ways
 * we push to a device:
 *
 *   sendNotification  – ordinary tray notification (chat messages etc.)
 *   sendData          – high-priority DATA-ONLY message. Android shows nothing
 *                       by itself; the app's background handler draws its own
 *                       UI (full-screen incoming-chat ring). An optional iOS
 *                       alert is attached because iOS cannot draw UI from a
 *                       silent push.
 *   sendRingingBanner – legacy "notification + data" ring (kept behind
 *                       ASTRO_RING_PUSH_STYLE=banner for older app builds).
 *
 * Dead tokens are wiped from User docs automatically so we never retry them.
 */

const admin = require('firebase-admin');
const User = require('../models/User');

let initialized = false;

// FCM error codes that mean "this token is permanently dead — stop using it".
// Source: https://firebase.google.com/docs/cloud-messaging/send-message#admin
const DEAD_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'messaging/invalid-argument' // sometimes returned for malformed tokens
]);

function init() {
    try {
        if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
            const serviceAccount = {
                type: 'service_account',
                project_id: process.env.FIREBASE_PROJECT_ID,
                private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
                private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle escaped newlines
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                client_id: process.env.FIREBASE_CLIENT_ID,
                auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
                token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
                auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
                client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
                universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || 'googleapis.com'
            };

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            initialized = true;
            console.log('✅ Firebase Admin SDK initialized successfully');
            console.log(`📱 FCM configured for project: ${process.env.FIREBASE_PROJECT_ID}`);
        } else {
            console.log('⚠️ Firebase credentials not found. FCM notifications disabled.');
            console.log('   Required: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
        }
    } catch (error) {
        console.error('⚠️ Failed to initialize Firebase Admin SDK:', error.message);
        console.log('FCM notifications will be disabled.');
    }
    return initialized;
}

function isInitialized() {
    return initialized;
}

// When FCM tells us a token is dead, wipe it from any User docs that hold
// it so we never try to send to it again. Fire-and-forget.
async function cleanupDeadToken(fcmToken, errorCode) {
    if (!DEAD_TOKEN_CODES.has(errorCode)) return;
    try {
        const result = await User.updateMany(
            { fcmToken },
            { $unset: { fcmToken: '' } }
        );
        if (result.modifiedCount > 0) {
            console.log(`🧹 Cleared ${result.modifiedCount} dead FCM token(s) (${errorCode})`);
        }
    } catch (cleanupErr) {
        console.error('Failed to clear dead FCM token:', cleanupErr);
    }
}

// FCM requires every value in `data` to be a string.
function stringifyData(data = {}) {
    return Object.fromEntries(
        Object.entries(data)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [
                k,
                v === null ? '' : (typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : String(v instanceof Date ? v.toISOString() : v))
            ])
    );
}

async function send(message, label) {
    if (!initialized || !message.token) {
        return { success: false, error: 'FCM not initialized or no token' };
    }
    try {
        const response = await admin.messaging().send(message);
        return { success: true, response };
    } catch (error) {
        const code = error?.errorInfo?.code;
        if (DEAD_TOKEN_CODES.has(code)) {
            // Quiet log + cleanup — this is a known/expected condition, not a bug
            console.warn(`⚠️ FCM token dead (${code}) while sending ${label}. Cleaning up.`);
            cleanupDeadToken(message.token, code);
        } else {
            console.error(`Error sending ${label}:`, error);
        }
        return { success: false, error: error.message, code };
    }
}

/**
 * Ordinary notification (shown by the OS in the tray).
 */
async function sendNotification(fcmToken, title, body, data = {}) {
    const result = await send({
        token: fcmToken,
        notification: { title, body },
        data: stringifyData(data)
    }, 'FCM notification');
    if (result.success) console.log('Successfully sent FCM notification:', result.response);
    return result;
}

/**
 * High-priority DATA-ONLY message.
 *
 *   - Android: no `notification` block, so the OS shows nothing. The app's
 *     background handler receives `data` and draws its own full-screen
 *     incoming-chat UI (ringtone, Accept / Reject). `ttlMs` stops FCM from
 *     delivering a stale ring to a phone that was offline.
 *   - iOS: a silent push cannot draw UI, so when `ios` is given we attach a
 *     visible time-sensitive alert with a category the app can hang
 *     Accept / Reject actions on. Without `ios` it's a background push.
 */
async function sendData(fcmToken, data, { ttlMs = null, ios = null } = {}) {
    const message = {
        token: fcmToken,
        data: stringifyData(data),
        android: { priority: 'high' }
    };
    if (ttlMs != null) message.android.ttl = ttlMs;

    const headers = {};
    if (ttlMs != null) {
        headers['apns-expiration'] = String(Math.floor((Date.now() + ttlMs) / 1000));
    }
    if (ios) {
        headers['apns-priority'] = '10';
        headers['apns-push-type'] = 'alert';
        message.apns = {
            headers,
            payload: {
                aps: {
                    alert: { title: ios.title, body: ios.body },
                    sound: ios.sound || 'default',
                    category: ios.category,
                    contentAvailable: true,
                    'interruption-level': ios.interruptionLevel || 'time-sensitive'
                }
            }
        };
    } else {
        headers['apns-priority'] = '5';
        headers['apns-push-type'] = 'background';
        message.apns = {
            headers,
            payload: { aps: { contentAvailable: true } }
        };
    }
    return send(message, 'FCM data message');
}

/**
 * Legacy ring: notification + data with high priority. The OS shows a
 * normal (loud) banner. Used for the user-side "accepted, tap to join"
 * nudge, and for the admin ring when ASTRO_RING_PUSH_STYLE=banner.
 */
async function sendRingingBanner(fcmToken, title, body, data = {}, { ttlMs = null } = {}) {
    const message = {
        token: fcmToken,
        notification: { title, body },
        data: {
            ...stringifyData(data),
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'astro_chat_ring',
                sound: 'default',
                priority: 'max',
                visibility: 'public'
            }
        },
        apns: {
            headers: { 'apns-priority': '10' },
            payload: {
                aps: {
                    sound: 'default',
                    contentAvailable: true,
                    category: 'INCOMING_ASTRO_CHAT',
                    'interruption-level': 'time-sensitive'
                }
            }
        }
    };
    if (ttlMs != null) {
        message.android.ttl = ttlMs;
        message.apns.headers['apns-expiration'] = String(Math.floor((Date.now() + ttlMs) / 1000));
    }
    return send(message, 'ringing FCM notification');
}

module.exports = {
    init,
    isInitialized,
    sendNotification,
    sendData,
    sendRingingBanner,
    cleanupDeadToken,
    DEAD_TOKEN_CODES
};
