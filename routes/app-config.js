const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const appVersion = require('../services/appVersionService');

/**
 * GET /api/app-config?app=user
 * Public (no login). The app calls this on launch and shows a blocking
 * "update required" screen when `updateRequired` is true. If the app also
 * sends X-App-Version, `updateRequired` / `updateAvailable` are computed
 * for that build; otherwise the app compares `minBuild` itself.
 */
router.get('/', async (req, res) => {
    try {
        const info = appVersion.fromRequest(req);
        const appId = appVersion.normalizeAppId(req.query.app || info.appId);
        const policy = await appVersion.getPolicy(appId);
        const build = appVersion.parseBuild(info.build);
        res.json({ success: true, ...appVersion.publicView(policy, build) });
    } catch (err) {
        console.error('app-config get error:', err);
        res.status(500).json({ success: false, error: 'Failed to load app config' });
    }
});

// ---- Admin ----------------------------------------------------------------

const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    next();
};

/** GET /api/app-config/admin — full policy for both apps. */
router.get('/admin', auth, requireAdmin, async (req, res) => {
    try {
        const all = await appVersion.getAllPolicies({ fresh: true });
        res.json({ success: true, policies: all });
    } catch (err) {
        console.error('app-config admin get error:', err);
        res.status(500).json({ success: false, error: 'Failed to load policies' });
    }
});

/**
 * PUT /api/app-config/admin/:app   (:app = user | admin)
 * Body (all optional): minBuild, latestBuild, latestVersionName,
 *   blockMissingVersion (bool), androidStoreUrl, iosStoreUrl, messageEn, messageHi
 * Takes effect immediately on this server; other instances within 30s.
 */
router.put('/admin/:app', auth, requireAdmin, async (req, res) => {
    try {
        if (!appVersion.APP_IDS.includes(req.params.app)) {
            return res.status(400).json({ success: false, error: 'app must be "user" or "admin"' });
        }
        const result = await appVersion.updatePolicy(req.params.app, req.body || {}, req.user._id);
        if (!result.ok) {
            return res.status(result.status).json({ success: false, code: result.code, error: result.error });
        }
        res.json({ success: true, policy: result.policy });
    } catch (err) {
        console.error('app-config admin update error:', err);
        res.status(500).json({ success: false, error: 'Failed to update policy' });
    }
});

module.exports = router;
