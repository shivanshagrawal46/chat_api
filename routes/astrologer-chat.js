const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Astrologer = require('../models/Astrologer');
const AstrologerChatSession = require('../models/AstrologerChatSession');
const Wallet = require('../models/Wallet');
const Message = require('../models/Message');
const User = require('../models/User');
const auth = require('../middleware/auth');
const billing = require('../services/astroBillingEngine');

const MIN_MINUTES_TO_START = billing.MIN_MINUTES_TO_START;

// ==================== USER ENDPOINTS ====================

// GET /api/astrologer-chat/active — currently-active or ringing session for caller
router.get('/active', auth, async (req, res) => {
    try {
        const session = await AstrologerChatSession.findOne({
            user: req.user._id,
            status: { $in: ['ringing', 'accepted', 'active'] }
        }).lean();
        res.json({ success: true, session });
    } catch (error) {
        console.error('Error fetching active session:', error);
        res.status(500).json({ error: 'Failed to fetch active session' });
    }
});

// GET /api/astrologer-chat/history?page=&limit=&astrologerKey=
router.get('/history', auth, async (req, res) => {
    try {
        const { astrologerKey, page = 1, limit = 20 } = req.query;
        const query = { user: req.user._id, status: { $in: ['ended', 'cancelled'] } };
        if (astrologerKey) query.astrologerKey = astrologerKey.toLowerCase();

        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const [sessions, total] = await Promise.all([
            AstrologerChatSession.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit, 10))
                .lean(),
            AstrologerChatSession.countDocuments(query)
        ]);

        res.json({
            success: true,
            sessions,
            pagination: {
                current: parseInt(page, 10),
                pages: Math.ceil(total / parseInt(limit, 10)),
                total
            }
        });
    } catch (error) {
        console.error('Error fetching session history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// GET /api/astrologer-chat/:sessionId/messages
// Returns the full message thread for one session (chronological).
router.get('/:sessionId/messages', auth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(sessionId)) {
            return res.status(400).json({ error: 'Invalid session id' });
        }

        const session = await AstrologerChatSession.findById(sessionId).lean();
        if (!session) return res.status(404).json({ error: 'Session not found' });

        // Authorization: caller must be the user OR an admin
        const isParticipant =
            session.user.toString() === req.user._id.toString() || req.user.isAdmin;
        if (!isParticipant) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const messages = await Message.find({ sessionId })
            .sort({ createdAt: 1 })
            .lean();

        res.json({ success: true, session, messages });
    } catch (error) {
        console.error('Error fetching session messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// POST /api/astrologer-chat/sessions/start
// Body: { astrologerKey: string }
//
// Creates a session in `ringing` state and notifies admin sockets. Returns
// the session id and the FCM-ready payload the client app should pass to
// its native ringtone screen.
router.post('/sessions/start', auth, async (req, res) => {
    try {
        const { astrologerKey } = req.body;
        if (!astrologerKey) {
            return res.status(400).json({ error: 'astrologerKey is required' });
        }

        // 1. Validate astrologer
        const astro = await Astrologer.findOne({ key: astrologerKey.toLowerCase(), isActive: true });
        if (!astro) {
            return res.status(404).json({ error: 'Astrologer not found' });
        }
        if (!astro.isOnline) {
            return res.status(409).json({ error: 'Astrologer is currently offline' });
        }

        // 2. Block if user already has an in-flight session
        const existing = await AstrologerChatSession.findOne({
            user: req.user._id,
            status: { $in: ['ringing', 'accepted', 'active'] }
        });
        if (existing) {
            return res.status(409).json({
                error: 'You already have an in-progress chat session',
                session: existing
            });
        }

        // 3. Block if astrologer is already in a session (single admin can only
        // attend one user per persona at a time).
        const astroBusy = await AstrologerChatSession.findOne({
            astrologerKey: astro.key,
            status: { $in: ['ringing', 'accepted', 'active'] }
        });
        if (astroBusy) {
            return res.status(409).json({
                error: `${astro.displayName} is currently busy with another user. Please try again shortly.`
            });
        }

        // 4. Min-balance check (5 minutes worth)
        const wallet = await Wallet.findOrCreate(req.user._id);
        const minRequired = astro.ratePerMinute * MIN_MINUTES_TO_START;
        if (wallet.balance < minRequired) {
            return res.status(402).json({
                error: 'Insufficient wallet balance',
                walletBalance: wallet.balance,
                ratePerMinute: astro.ratePerMinute,
                minBalanceRequired: minRequired,
                shortfall: minRequired - wallet.balance
            });
        }

        // 5. Create session
        const session = await AstrologerChatSession.create({
            user: req.user._id,
            astrologerKey: astro.key,
            astrologerName: astro.displayName,
            ratePerMinute: astro.ratePerMinute,
            minBalanceRequired: minRequired,
            status: 'ringing',
            requestedAt: new Date()
        });

        // 6. Arm the ring timeout
        billing.armRingTimeout(session._id);

        // 7. Notify admin sockets (single-admin model)
        const ringPayload = {
            sessionId: session._id,
            astrologerKey: astro.key,
            astrologerName: astro.displayName,
            ratePerMinute: astro.ratePerMinute,
            user: {
                _id: req.user._id,
                firstName: req.user.firstName,
                lastName: req.user.lastName,
                phone: req.user.phone
            },
            walletBalance: wallet.balance,
            estimatedMinutes: Math.floor(wallet.balance / astro.ratePerMinute),
            requestedAt: session.requestedAt
        };
        billing.emitToAdmins('astro_chat_ringing', ringPayload);
        // Also tell the user we've placed the ring
        billing.emitToUser(req.user._id, 'astro_chat_ringing_placed', {
            sessionId: session._id,
            astrologerKey: astro.key,
            astrologerName: astro.displayName,
            ratePerMinute: astro.ratePerMinute,
            ringTimeoutMs: billing.RING_TIMEOUT_MS
        });

        res.json({
            success: true,
            session,
            walletBalance: wallet.balance,
            estimatedMinutes: Math.floor(wallet.balance / astro.ratePerMinute),
            ringTimeoutMs: billing.RING_TIMEOUT_MS
        });
    } catch (error) {
        console.error('Error starting astrologer chat session:', error);
        res.status(500).json({ error: 'Failed to start session' });
    }
});

// POST /api/astrologer-chat/sessions/:id/cancel
// User-initiated cancel BEFORE the session becomes active (so no charge).
router.post('/sessions/:id/cancel', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const session = await AstrologerChatSession.findById(id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (!['ringing', 'accepted'].includes(session.status)) {
            return res.status(400).json({ error: 'Session is no longer cancellable' });
        }
        await billing.endSession(id, 'user_cancelled');
        res.json({ success: true, message: 'Session cancelled' });
    } catch (error) {
        console.error('Error cancelling session:', error);
        res.status(500).json({ error: 'Failed to cancel session' });
    }
});

// ==================== ADMIN ENDPOINTS ====================

// GET /api/astrologer-chat/admin/tabs
// Returns one entry per astrologer with the LATEST conversation per user
// for that persona. This drives the admin's "5-tab" UI: each tab shows the
// list of users who have ever chatted with that astrologer, plus the last
// message preview and unread count for that persona.
router.get('/admin/tabs', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const astrologers = await Astrologer.find({ isActive: true })
            .sort({ sortOrder: 1 })
            .lean();

        // For each astrologer, pull the user list from their messages
        const tabs = await Promise.all(
            astrologers.map(async (astro) => {
                // Distinct users who have any message under this astrologer
                const userIds = await Message.distinct('sender', { astrologerKey: astro.key });
                const receiverIds = await Message.distinct('receiver', { astrologerKey: astro.key });
                const allUserIdSet = new Set([
                    ...userIds.map(id => id.toString()),
                    ...receiverIds.map(id => id.toString())
                ]);
                // Drop the admin's own id (admin appears as both sender & receiver)
                allUserIdSet.delete(req.user._id.toString());
                const allUserIds = [...allUserIdSet];

                const conversations = await Promise.all(
                    allUserIds.map(async (userId) => {
                        const [user, lastMessage, unreadCount, activeSession] = await Promise.all([
                            User.findById(userId).select('firstName lastName email phone').lean(),
                            Message.findOne({
                                astrologerKey: astro.key,
                                $or: [
                                    { sender: userId, receiver: req.user._id },
                                    { sender: req.user._id, receiver: userId }
                                ]
                            }).sort({ createdAt: -1 }).select('content createdAt isRead sender').lean(),
                            Message.countDocuments({
                                astrologerKey: astro.key,
                                sender: userId,
                                receiver: req.user._id,
                                isRead: false
                            }),
                            AstrologerChatSession.findOne({
                                user: userId,
                                astrologerKey: astro.key,
                                status: { $in: ['ringing', 'accepted', 'active'] }
                            }).lean()
                        ]);
                        if (!user) return null;
                        return { user, lastMessage, unreadCount, activeSession };
                    })
                );

                const validConvos = conversations
                    .filter(c => c !== null)
                    .sort((a, b) => {
                        const at = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0);
                        const bt = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0);
                        return bt - at;
                    });

                return {
                    astrologer: {
                        key: astro.key,
                        displayName: astro.displayName,
                        ratePerMinute: astro.ratePerMinute,
                        avatar: astro.avatar,
                        isOnline: astro.isOnline
                    },
                    conversations: validConvos,
                    unreadTotal: validConvos.reduce((sum, c) => sum + c.unreadCount, 0)
                };
            })
        );

        res.json({ success: true, tabs });
    } catch (error) {
        console.error('Error building admin tabs:', error);
        res.status(500).json({ error: 'Failed to build admin tabs' });
    }
});

// POST /api/astrologer-chat/admin/sessions/:id/accept
// Admin accepts a ringing session. Status -> accepted. Both parties must
// then emit `astro_join_chat` over Socket.IO before billing starts.
router.post('/admin/sessions/:id/accept', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        // Atomic ringing -> accepted: guards against a double accept or an
        // accept racing the ring-timeout (only one transition wins).
        const session = await AstrologerChatSession.findOneAndUpdate(
            { _id: req.params.id, status: 'ringing' },
            { $set: { status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() } },
            { new: true }
        );
        if (!session) {
            const existing = await AstrologerChatSession.findById(req.params.id);
            return res.status(existing ? 400 : 404).json({
                error: existing ? `Session is already ${existing.status}` : 'Session not found'
            });
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

        res.json({ success: true, session });
    } catch (error) {
        console.error('Error accepting session:', error);
        res.status(500).json({ error: 'Failed to accept session' });
    }
});

// POST /api/astrologer-chat/admin/sessions/:id/reject
router.post('/admin/sessions/:id/reject', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const session = await AstrologerChatSession.findById(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.status !== 'ringing') {
            return res.status(400).json({ error: `Session is already ${session.status}` });
        }
        await billing.endSession(session._id, 'admin_rejected');
        res.json({ success: true, message: 'Session rejected' });
    } catch (error) {
        console.error('Error rejecting session:', error);
        res.status(500).json({ error: 'Failed to reject session' });
    }
});

// POST /api/astrologer-chat/admin/sessions/:id/end
// Admin can force-end an active session (e.g. user is being abusive).
router.post('/admin/sessions/:id/end', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const session = await AstrologerChatSession.findById(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (!['ringing', 'accepted', 'active'].includes(session.status)) {
            return res.status(400).json({ error: 'Session is not active' });
        }
        await billing.endSession(session._id, 'admin_ended');
        res.json({ success: true, message: 'Session ended' });
    } catch (error) {
        console.error('Error ending session (admin):', error);
        res.status(500).json({ error: 'Failed to end session' });
    }
});

// GET /api/astrologer-chat/admin/sessions?astrologerKey=&status=&page=&limit=
router.get('/admin/sessions', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { astrologerKey, status, page = 1, limit = 50 } = req.query;
        const query = {};
        if (astrologerKey) query.astrologerKey = astrologerKey.toLowerCase();
        if (status) query.status = status;

        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const [sessions, total] = await Promise.all([
            AstrologerChatSession.find(query)
                .populate('user', 'firstName lastName email phone')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit, 10))
                .lean(),
            AstrologerChatSession.countDocuments(query)
        ]);
        res.json({
            success: true,
            sessions,
            pagination: {
                current: parseInt(page, 10),
                pages: Math.ceil(total / parseInt(limit, 10)),
                total
            }
        });
    } catch (error) {
        console.error('Error fetching admin sessions:', error);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

module.exports = router;
