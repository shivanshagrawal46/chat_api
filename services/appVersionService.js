/**
 * App version gate — decides whether a given app build may talk to the API.
 *
 * Policy lives in MongoDB (models/AppConfig.js), one row per app
 * ("user" / "admin"), seeded from env on first use. It is cached in memory
 * for a short time so the check costs nothing per request; admin updates
 * invalidate the cache immediately in this process, and other instances
 * pick the change up when their cache expires.
 *
 * Headers the app sends (all optional; missing = "old app"):
 *   X-App-Version       "92"  or "5.0.0+92"  (build number is what matters)
 *   X-App-Version-Name  "5.0.0"              (logging only)
 *   X-App-Id            "user" | "admin"     (defaults to "user")
 *
 * Socket.IO clients send the same values via handshake `auth`
 * ({ appVersion, appVersionName, appId }) or via extraHeaders.
 */
const AppVersionPolicy = require('../models/AppConfig');

const APP_IDS = ['user', 'admin'];
const CACHE_TTL_MS = 30 * 1000;
const UPDATE_REQUIRED = 'UPDATE_REQUIRED';

let cache = { at: 0, byApp: null };

function envInt(name, fallback) {
    const n = parseInt(process.env[name], 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envBool(name, fallback) {
    const v = (process.env[name] || '').trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
    return fallback;
}

// Defaults used the very first time a policy row is created. After that the
// DB row is the source of truth (change it via the admin endpoint).
function defaultsFor(app) {
    const upper = app.toUpperCase();
    return {
        app,
        minBuild: envInt(`APP_MIN_BUILD_${upper}`, app === 'user' ? 92 : 0),
        latestBuild: envInt(`APP_LATEST_BUILD_${upper}`, app === 'user' ? 92 : 0),
        latestVersionName: process.env[`APP_LATEST_VERSION_NAME_${upper}`] || (app === 'user' ? '5.0.0' : ''),
        blockMissingVersion: envBool(`APP_BLOCK_MISSING_VERSION_${upper}`, false),
        androidStoreUrl: process.env[`APP_ANDROID_STORE_URL_${upper}`] || process.env.APP_ANDROID_STORE_URL || '',
        iosStoreUrl: process.env[`APP_IOS_STORE_URL_${upper}`] || process.env.APP_IOS_STORE_URL || '',
        messageEn: 'Please update the app from the Play Store to continue.',
        messageHi: 'कृपया जारी रखने के लिए Play Store से ऐप अपडेट करें।'
    };
}

function normalizeAppId(raw) {
    const v = (raw || '').toString().trim().toLowerCase();
    return APP_IDS.includes(v) ? v : 'user';
}

/**
 * Turn whatever the client sent into an integer build number, or null.
 * Accepts "92", 92, "5.0.0+92". Anything unparseable counts as missing.
 */
function parseBuild(raw) {
    if (raw === undefined || raw === null) return null;
    let s = raw.toString().trim();
    if (!s) return null;
    const plus = s.lastIndexOf('+');
    if (plus !== -1) s = s.slice(plus + 1);
    if (!/^\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
}

async function loadAll() {
    const rows = await AppVersionPolicy.find({}).lean();
    const byApp = {};
    for (const r of rows) byApp[r.app] = r;
    // Seed any missing app row from env defaults (idempotent upsert).
    for (const app of APP_IDS) {
        if (!byApp[app]) {
            byApp[app] = await AppVersionPolicy.findOneAndUpdate(
                { app },
                { $setOnInsert: defaultsFor(app) },
                { upsert: true, new: true }
            ).lean();
        }
    }
    return byApp;
}

async function getAllPolicies({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && cache.byApp && now - cache.at < CACHE_TTL_MS) return cache.byApp;
    try {
        const byApp = await loadAll();
        cache = { at: now, byApp };
        return byApp;
    } catch (err) {
        // DB hiccup: keep serving the last known policy rather than locking
        // everyone out. If we never loaded one, use env defaults (no DB).
        console.error('appVersionService: failed to load policy:', err.message);
        if (cache.byApp) return cache.byApp;
        const byApp = {};
        for (const app of APP_IDS) byApp[app] = defaultsFor(app);
        return byApp;
    }
}

async function getPolicy(appId) {
    const all = await getAllPolicies();
    return all[normalizeAppId(appId)];
}

function invalidateCache() {
    cache = { at: 0, byApp: null };
}

/**
 * Shape sent to clients (public — no admin-only fields).
 */
function publicView(policy, build) {
    const hasBuild = build !== null && build !== undefined;
    return {
        app: policy.app,
        minBuild: policy.minBuild,
        latestBuild: policy.latestBuild,
        latestVersionName: policy.latestVersionName || '',
        currentBuild: hasBuild ? build : null,
        // Hard block: app cannot be used until updated.
        updateRequired: hasBuild ? build < policy.minBuild : !!policy.blockMissingVersion,
        // Soft nudge: newer build exists but this one still works.
        updateAvailable: hasBuild ? build < policy.latestBuild : false,
        androidStoreUrl: policy.androidStoreUrl || '',
        iosStoreUrl: policy.iosStoreUrl || '',
        message: { en: policy.messageEn, hi: policy.messageHi }
    };
}

/**
 * Body returned with HTTP 401 when the build is too old.
 * `error` is a plain string on purpose: the OLD app already prints the
 * `error` field on its login screen, so old users see the update text.
 */
function blockedBody(policy, build) {
    return {
        error: policy.messageEn,
        code: UPDATE_REQUIRED,
        ...publicView(policy, build),
        updateRequired: true
    };
}

/**
 * Core decision. Returns { ok: true, policy, build } or
 * { ok: false, status: 401, code, body, policy, build }.
 */
async function evaluate({ appId, build }) {
    const policy = await getPolicy(appId);
    const b = parseBuild(build);
    let blocked = false;
    if (b === null) {
        blocked = !!policy.blockMissingVersion;
    } else {
        blocked = b < (policy.minBuild || 0);
    }
    if (!blocked) return { ok: true, policy, build: b };
    return {
        ok: false,
        status: 401,
        code: UPDATE_REQUIRED,
        body: blockedBody(policy, b),
        policy,
        build: b
    };
}

/** Pull version info out of an Express request. */
function fromRequest(req) {
    return {
        appId: normalizeAppId(req.get('x-app-id')),
        build: req.get('x-app-version'),
        versionName: req.get('x-app-version-name') || ''
    };
}

/** Pull version info out of a Socket.IO handshake (auth object or headers). */
function fromSocket(socket) {
    const auth = (socket.handshake && socket.handshake.auth) || {};
    const headers = (socket.handshake && socket.handshake.headers) || {};
    return {
        appId: normalizeAppId(auth.appId || headers['x-app-id']),
        build: auth.appVersion !== undefined ? auth.appVersion : headers['x-app-version'],
        versionName: auth.appVersionName || headers['x-app-version-name'] || ''
    };
}

async function updatePolicy(appId, patch, updatedBy) {
    const app = normalizeAppId(appId);
    const $set = {};
    const intFields = ['minBuild', 'latestBuild'];
    for (const f of intFields) {
        if (patch[f] !== undefined) {
            const n = parseBuild(patch[f]);
            if (n === null) {
                return { ok: false, status: 400, code: 'INVALID_FIELD', error: `${f} must be a non-negative integer build number` };
            }
            $set[f] = n;
        }
    }
    const strFields = ['latestVersionName', 'androidStoreUrl', 'iosStoreUrl', 'messageEn', 'messageHi'];
    for (const f of strFields) {
        if (patch[f] !== undefined) {
            if (typeof patch[f] !== 'string' || patch[f].length > 1000) {
                return { ok: false, status: 400, code: 'INVALID_FIELD', error: `${f} must be a string (max 1000 chars)` };
            }
            $set[f] = patch[f].trim();
        }
    }
    if (patch.blockMissingVersion !== undefined) {
        if (typeof patch.blockMissingVersion !== 'boolean') {
            return { ok: false, status: 400, code: 'INVALID_FIELD', error: 'blockMissingVersion must be true or false' };
        }
        $set.blockMissingVersion = patch.blockMissingVersion;
    }
    if (Object.keys($set).length === 0) {
        return { ok: false, status: 400, code: 'NO_FIELDS', error: 'No valid fields to update' };
    }
    // Sanity: minBuild must not exceed latestBuild once both are known.
    const current = await getPolicy(app);
    const minB = $set.minBuild !== undefined ? $set.minBuild : current.minBuild;
    const latB = $set.latestBuild !== undefined ? $set.latestBuild : current.latestBuild;
    if (latB && minB > latB) {
        return { ok: false, status: 400, code: 'INVALID_RANGE', error: 'minBuild cannot be greater than latestBuild' };
    }
    if (updatedBy) $set.updatedBy = updatedBy;

    const updated = await AppVersionPolicy.findOneAndUpdate(
        { app },
        { $set, $setOnInsert: { app } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    invalidateCache();
    return { ok: true, policy: updated };
}

module.exports = {
    APP_IDS,
    UPDATE_REQUIRED,
    parseBuild,
    normalizeAppId,
    getPolicy,
    getAllPolicies,
    invalidateCache,
    publicView,
    blockedBody,
    evaluate,
    fromRequest,
    fromSocket,
    updatePolicy
};
