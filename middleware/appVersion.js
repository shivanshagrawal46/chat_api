const appVersion = require('../services/appVersionService');

// Paths under /api that must stay reachable even for a blocked app, so it
// can fetch store links / the update message, and so an admin can still
// fix the policy if they lock themselves out.
const EXEMPT_PREFIXES = ['/app-config'];

/**
 * Express gate mounted on /api. Reads X-App-Version / X-App-Id and returns
 * 401 { code: 'UPDATE_REQUIRED', ... } when the build is below the minimum.
 *
 * 401 is chosen deliberately: it is the only status the OLD app already
 * reacts to (logout -> login screen, which prints `error`). The NEW app
 * must check `code === 'UPDATE_REQUIRED'` before treating a 401 as logout.
 */
async function appVersionGate(req, res, next) {
    try {
        if (req.method === 'OPTIONS') return next();
        if (EXEMPT_PREFIXES.some(p => req.path === p || req.path.startsWith(p + '/'))) return next();

        const info = appVersion.fromRequest(req);
        const result = await appVersion.evaluate(info);
        req.appVersion = { appId: info.appId, build: result.build, versionName: info.versionName };
        if (result.ok) return next();

        res.set('X-Update-Required', '1');
        return res.status(result.status).json(result.body);
    } catch (err) {
        // Never let the gate itself take the API down.
        console.error('appVersionGate error:', err);
        return next();
    }
}

module.exports = appVersionGate;
