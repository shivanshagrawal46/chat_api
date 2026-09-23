#!/usr/bin/env node
/**
 * Change the app version policy straight in the database, without needing
 * an admin JWT. Same validation as PUT /api/app-config/admin/:app.
 *
 * Usage (run from the repo root, reads MONGODB_URI from .env):
 *   node scripts/set-app-version-policy.js user blockMissingVersion=true
 *   node scripts/set-app-version-policy.js user minBuild=92 latestBuild=95 latestVersionName=5.1.0
 *   node scripts/set-app-version-policy.js user            (no fields: just print the policy)
 *
 * A running server picks the change up within 30 seconds (policy cache),
 * and its socket sweep then disconnects any connected client that is no
 * longer allowed.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const appVersion = require('../services/appVersionService');

const BOOL_FIELDS = new Set(['blockMissingVersion']);

function parseArgs(argv) {
    const [app, ...pairs] = argv;
    if (!app || !appVersion.APP_IDS.includes(app)) {
        console.error(`First argument must be one of: ${appVersion.APP_IDS.join(', ')}`);
        process.exit(2);
    }
    const patch = {};
    for (const pair of pairs) {
        const eq = pair.indexOf('=');
        if (eq === -1) {
            console.error(`Expected key=value, got "${pair}"`);
            process.exit(2);
        }
        const key = pair.slice(0, eq);
        const raw = pair.slice(eq + 1);
        patch[key] = BOOL_FIELDS.has(key) ? ['1', 'true', 'yes'].includes(raw.toLowerCase()) : raw;
    }
    return { app, patch };
}

(async () => {
    const { app, patch } = parseArgs(process.argv.slice(2));
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not set');
        process.exit(2);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    try {
        if (Object.keys(patch).length > 0) {
            const result = await appVersion.updatePolicy(app, patch, null);
            if (!result.ok) {
                console.error(`Update rejected (${result.code}): ${result.error}`);
                process.exitCode = 1;
                return;
            }
            console.log(`Updated policy for "${app}".`);
        }
        const policy = await appVersion.getPolicy(app);
        const { _id, __v, updatedBy, ...view } = policy;
        console.log(JSON.stringify(view, null, 2));
    } finally {
        await mongoose.disconnect();
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
