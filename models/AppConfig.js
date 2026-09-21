const mongoose = require('mongoose');

// One document per app ("user" app and "admin" app). Holds the minimum
// build number the backend still accepts, plus everything the app needs
// to show an "update required" screen (store links, message in EN + HI).
//
// Build number = the integer after "+" in pubspec.yaml (5.0.0+92 -> 92).
// Comparing integers is simpler and safer than comparing "5.0.0" strings.
const appVersionPolicySchema = new mongoose.Schema({
    app: {
        type: String,
        required: true,
        unique: true,
        enum: ['user', 'admin']
    },
    // Builds below this number get 401 UPDATE_REQUIRED on every API call.
    minBuild: { type: Number, default: 0, min: 0 },
    // Newest build on the store. Builds between minBuild and latestBuild
    // are allowed but the app may show a soft "update available" nudge.
    latestBuild: { type: Number, default: 0, min: 0 },
    latestVersionName: { type: String, default: '' },
    // When true, requests with NO version header (the old APK that predates
    // this feature) are blocked too. Keep false during rollout so old
    // users keep working; flip to true when you want to cut them off.
    blockMissingVersion: { type: Boolean, default: false },
    androidStoreUrl: { type: String, default: '' },
    iosStoreUrl: { type: String, default: '' },
    messageEn: {
        type: String,
        default: 'Please update the app from the Play Store to continue.'
    },
    messageHi: {
        type: String,
        default: 'कृपया जारी रखने के लिए Play Store से ऐप अपडेट करें।'
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

module.exports = mongoose.model('AppVersionPolicy', appVersionPolicySchema);
