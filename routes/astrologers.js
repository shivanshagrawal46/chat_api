const express = require('express');
const router = express.Router();
const Astrologer = require('../models/Astrologer');
const AstrologerChatSession = require('../models/AstrologerChatSession');
const auth = require('../middleware/auth');

const MIN_MINUTES_TO_START = 5;

// GET /api/astrologers — list of all active astrologers (public to logged-in users).
// Each entry includes the per-minute rate and the minimum balance needed to
// start a chat (5 × ratePerMinute) so the client can pre-validate.
router.get('/', auth, async (req, res) => {
    try {
        const astrologers = await Astrologer.find({ isActive: true })
            .sort({ sortOrder: 1, displayName: 1 })
            .lean();

        const enriched = astrologers.map(a => ({
            _id: a._id,
            key: a.key,
            displayName: a.displayName,
            ratePerMinute: a.ratePerMinute,
            minBalanceToStart: a.ratePerMinute * MIN_MINUTES_TO_START,
            avatar: a.avatar,
            bio: a.bio,
            specialities: a.specialities,
            languages: a.languages,
            isOnline: a.isOnline
        }));

        res.json({
            success: true,
            astrologers: enriched,
            minMinutesToStart: MIN_MINUTES_TO_START
        });
    } catch (error) {
        console.error('Error listing astrologers:', error);
        res.status(500).json({ error: 'Failed to list astrologers' });
    }
});

// GET /api/astrologers/:key — single astrologer details
router.get('/:key', auth, async (req, res) => {
    try {
        const astro = await Astrologer.findOne({ key: req.params.key.toLowerCase(), isActive: true }).lean();
        if (!astro) return res.status(404).json({ error: 'Astrologer not found' });

        res.json({
            success: true,
            astrologer: {
                _id: astro._id,
                key: astro.key,
                displayName: astro.displayName,
                ratePerMinute: astro.ratePerMinute,
                minBalanceToStart: astro.ratePerMinute * MIN_MINUTES_TO_START,
                avatar: astro.avatar,
                bio: astro.bio,
                specialities: astro.specialities,
                languages: astro.languages,
                isOnline: astro.isOnline
            }
        });
    } catch (error) {
        console.error('Error fetching astrologer:', error);
        res.status(500).json({ error: 'Failed to fetch astrologer' });
    }
});

// ==================== ADMIN ====================

// Admin: toggle astrologer online/offline. When offline, users cannot start
// new sessions with this astrologer (existing sessions are unaffected).
router.patch('/admin/:key/online', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { isOnline } = req.body;
        if (typeof isOnline !== 'boolean') {
            return res.status(400).json({ error: 'isOnline (boolean) required' });
        }
        const astro = await Astrologer.findOneAndUpdate(
            { key: req.params.key.toLowerCase() },
            { $set: { isOnline, updatedAt: new Date() } },
            { new: true }
        );
        if (!astro) return res.status(404).json({ error: 'Astrologer not found' });
        res.json({ success: true, astrologer: astro });
    } catch (error) {
        console.error('Error updating astrologer online status:', error);
        res.status(500).json({ error: 'Failed to update astrologer' });
    }
});

// Admin: update rate per minute for an astrologer
router.patch('/admin/:key/rate', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { ratePerMinute } = req.body;
        const rate = Number(ratePerMinute);
        if (isNaN(rate) || rate < 0) {
            return res.status(400).json({ error: 'ratePerMinute must be a non-negative number' });
        }
        const astro = await Astrologer.findOneAndUpdate(
            { key: req.params.key.toLowerCase() },
            { $set: { ratePerMinute: rate, updatedAt: new Date() } },
            { new: true }
        );
        if (!astro) return res.status(404).json({ error: 'Astrologer not found' });
        res.json({ success: true, astrologer: astro });
    } catch (error) {
        console.error('Error updating astrologer rate:', error);
        res.status(500).json({ error: 'Failed to update astrologer' });
    }
});

// Admin: snapshot of which astrologers currently have an active session
router.get('/admin/active-sessions', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const sessions = await AstrologerChatSession.find({
            status: { $in: ['ringing', 'accepted', 'active'] }
        })
            .populate('user', 'firstName lastName email phone')
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, sessions });
    } catch (error) {
        console.error('Error fetching active astro sessions:', error);
        res.status(500).json({ error: 'Failed to fetch active sessions' });
    }
});

module.exports = router;
