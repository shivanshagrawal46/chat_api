const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const PalmReading = require('../models/PalmReading');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const auth = require('../middleware/auth');

// ==================== CONFIG ====================
const GEMINI_MODEL = 'gemini-2.5-pro';
const MAX_AI_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const AI_TIMEOUT_MS = 90000;
const MAX_OUTPUT_TOKENS = 4000;

const FREE_PALM_READINGS = 2;       // first 2 readings are free per user
const PALM_READING_PRICE = 11;      // ₹11 per reading thereafter
const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB decoded cap
const MAX_NOTE_WORDS = 200;

// Same Gemini SDK the AI chat uses. A second lightweight client is fine.
let genAI = null;
try {
    if (process.env.GEMINI_API_KEY) {
        genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        console.log(`✅ Gemini initialized for Palmistry (model: ${GEMINI_MODEL})`);
    } else {
        console.log('⚠️ GEMINI_API_KEY not found. Palmistry disabled.');
    }
} catch (error) {
    console.error('⚠️ Failed to initialize Gemini for Palmistry:', error.message);
}

// Per-user lock — prevents a double-tap / duplicate submit from charging the
// wallet twice or firing two concurrent AI calls for the same user.
const activePalmRequests = new Map();

const countWords = (text) => (text || '').trim().split(/\s+/).filter(Boolean).length;

// ==================== PALMISTRY PROMPT ====================
// Strong, structured hast-rekha (cheiromancy) prompt so the model behaves like
// a seasoned professional palm reader.
const buildPalmistryPrompt = ({ note, hand, language }) => {
    const langLine = (() => {
        if (language === 'hi') return 'Reply ONLY in Hindi (Devanagari script).';
        if (language === 'hinglish') return 'Reply ONLY in Hinglish (Hindi written in Roman/English script).';
        if (language === 'en') return 'Reply ONLY in clear, simple English.';
        // Auto: match the user's note; default to English if no note.
        return 'Reply in the SAME language as the user\'s note below. If no note is given, reply in clear, simple English. NEVER mix languages.';
    })();

    return `You are "Hast Rekha Guru" — a world-class professional palmist and hand reader with 30+ years of experience in Vedic/Indian palmistry (Samudrik Shastra) and Western cheiromancy. You are warm, precise, and practical.

You will be shown a PHOTO OF A HUMAN HAND/PALM. Read it like a real palmist examining the hand in person.

${langLine}

FIRST — VALIDATE THE IMAGE:
- If the image is NOT a human hand/palm (blurry beyond use, wrong subject, or no palm visible), do NOT invent a reading. Politely explain what a good palm photo needs (well-lit, full open palm facing the camera, fingers slightly spread, whole hand in frame) and ask them to re-upload. Keep this short.
- If only part of the palm is visible, read what you can and gently mention what was unclear.

WHAT TO EXAMINE (cover the ones you can actually see):
1. HAND SHAPE & ELEMENT: Earth (square palm, short fingers), Air (square palm, long fingers), Fire (long palm, short fingers), Water (long palm, long fingers) — and what it says about temperament.
2. MAJOR LINES:
   - Heart Line (emotions, love, relationships)
   - Head Line (intellect, thinking style, decision-making)
   - Life Line (vitality, life energy, major changes — NOT lifespan)
   - Fate/Destiny Line (career, life direction, external influences)
   - Sun/Apollo Line (fame, success, creativity) if present
   - Health/Mercury Line if present
   - Marriage/Relationship line(s) below the little finger
3. MOUNTS (raised pads): Jupiter (ambition, leadership), Saturn (discipline, responsibility), Apollo/Sun (creativity, joy), Mercury (communication, business), Venus (love, vitality, family), Mars (courage), Luna/Moon (imagination, intuition).
4. FINGERS & THUMB: length, shape, flexibility, thumb (willpower & logic), finger spacing.
5. SPECIAL SIGNS on lines/mounts: star, cross, island, triangle, square, grille, trident, chain — and their meaning in that location.
6. NAILS & SKIN texture if visible.

ANALYSIS FRAMEWORK (structure the reading around these):
- Personality & core nature
- Career & success (Fate/Sun line, Jupiter/Saturn/Mercury mounts, Head line)
- Love, relationships & marriage (Heart line, marriage lines, Venus mount)
- Wealth & finances (Sun/Fate lines, Mercury mount, money triangle if visible)
- Health & vitality (Life line, Health line, Mars/Venus)
- Life path, key strengths, and cautions — with practical, positive guidance/remedies

OUTPUT RULES:
- Be specific to what you observe in THIS hand — reference the actual lines/mounts/signs you see, not generic statements.
- Use short clear sections with headings (or bullets). 250–450 words. Concise but complete.
- Be compassionate and empowering. Frame challenges with remedies or constructive advice.
- Where palmistry traditionally allows timing (e.g., markings along the Fate/Life line), you may give approximate life-stage guidance, but never predict death or exact dates of tragedy.
- End with one line of positive encouragement.
- NEVER leave a sentence unfinished. Always complete your reading with a proper conclusion.
${hand ? `\nThe user says this is their ${hand} hand.` : ''}${note ? `\n\nUser's note/focus: "${note}"` : ''}

Now examine the attached hand image and give the reading:`;
};

// ==================== AI CALL (multimodal) ====================
// Sends the image inline (base64) to Gemini. The image is held only in memory
// for this request and is never written to disk or DB.
const generatePalmReading = async ({ base64, mimeType, note, hand, language, userId }) => {
    if (!genAI) {
        throw new Error('AI service not available. Please check GEMINI_API_KEY configuration.');
    }

    const systemPrompt = buildPalmistryPrompt({ note, hand, language });
    const contents = [{
        role: 'user',
        parts: [
            { text: systemPrompt },
            { inlineData: { mimeType, data: base64 } }
        ]
    }];

    const startTime = Date.now();
    let result;
    let lastError;

    for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
        console.log(`🖐️ Palmistry attempt ${attempt}/${MAX_AI_RETRIES} | Model: ${GEMINI_MODEL} | User: ${userId}`);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI response timed out after 90 seconds. Please retry.')), AI_TIMEOUT_MS)
        );
        try {
            const aiPromise = genAI.models.generateContent({
                model: GEMINI_MODEL,
                contents,
                config: {
                    maxOutputTokens: MAX_OUTPUT_TOKENS,
                    temperature: 0.7,
                    thinkingConfig: { thinkingBudget: 2048 }
                }
            });
            result = await Promise.race([aiPromise, timeoutPromise]);
            console.log(`✅ Palmistry: Gemini responded on attempt ${attempt}`);
            break;
        } catch (retryError) {
            lastError = retryError;
            const status = retryError.status || retryError.code;
            console.error(`❌ Palmistry attempt ${attempt} failed: ${retryError.message}${status ? ` (status ${status})` : ''}`);
            const isRetryable = status === 503 || status === 429 || status === 500;
            if (isRetryable && attempt < MAX_AI_RETRIES) {
                const delay = status === 429 ? 8000 * attempt : RETRY_DELAY_MS * attempt;
                console.log(`⏳ Retryable error (${status}). Waiting ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            if (!isRetryable) throw retryError;
        }
    }

    if (!result) throw lastError || new Error('AI failed after all retry attempts');

    // Defensive response parsing (result.text can throw in some SDK versions)
    let response;
    try {
        response = result.text;
    } catch (textError) {
        if (result.candidates && result.candidates[0]?.content?.parts) {
            response = result.candidates[0].content.parts
                .filter(p => !p.thought)
                .map(p => p.text)
                .filter(Boolean)
                .join('');
        }
    }

    if (!response || response.trim().length === 0) {
        if (result?.promptFeedback) {
            console.error('❌ Palmistry prompt feedback (maybe blocked):', JSON.stringify(result.promptFeedback));
        }
        throw new Error('Empty response from AI. The image may have been blocked by safety filters. Please try a clearer palm photo.');
    }

    console.log(`✅ Palmistry reading generated in ${Date.now() - startTime}ms, length: ${response.length}`);
    return response.trim();
};

// ==================== IMAGE PARSING ====================
// Accepts a raw base64 string or a data URL. Returns { base64, mimeType } or
// throws a user-friendly error. Nothing is written to disk.
const parseImage = (image, mimeTypeHint) => {
    if (!image || typeof image !== 'string') {
        throw new Error('A hand image is required.');
    }
    let raw = image.trim();
    let mimeType = mimeTypeHint;

    const dataUrl = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(raw);
    if (dataUrl) {
        mimeType = dataUrl[1];
        raw = dataUrl[2];
    }
    // Strip any whitespace/newlines that clients sometimes insert
    raw = raw.replace(/\s/g, '');
    mimeType = (mimeType || 'image/jpeg').toLowerCase();

    if (!mimeType.startsWith('image/')) {
        throw new Error('Only image files are accepted for palm reading.');
    }

    const buffer = Buffer.from(raw, 'base64');
    if (!buffer.length) {
        throw new Error('The uploaded image is empty or invalid.');
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error('Image is too large. Please upload a photo under 12 MB.');
    }
    return { base64: raw, mimeType };
};

// ==================== ROUTES ====================

// GET /api/palmistry/status — free readings left, price, wallet balance
router.get('/status', auth, async (req, res) => {
    try {
        const [reading, wallet] = await Promise.all([
            PalmReading.findOne({ user: req.user._id }).lean(),
            Wallet.findOrCreate(req.user._id)
        ]);
        const freeUsed = reading ? reading.freeReadingsUsed : 0;
        res.json({
            success: true,
            freeReadingsUsed: freeUsed,
            freeReadingsRemaining: Math.max(0, FREE_PALM_READINGS - freeUsed),
            freeLimit: FREE_PALM_READINGS,
            totalReadings: reading ? reading.totalReadings : 0,
            totalSpent: reading ? reading.totalSpent : 0,
            pricePerReading: PALM_READING_PRICE,
            walletBalance: wallet.balance,
            nextReadingFree: freeUsed < FREE_PALM_READINGS
        });
    } catch (error) {
        console.error('Error fetching palmistry status:', error);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

// GET /api/palmistry/history — past readings (text only; no images are stored)
router.get('/history', auth, async (req, res) => {
    try {
        const reading = await PalmReading.findOne({ user: req.user._id }).lean();
        res.json({
            success: true,
            messages: reading ? reading.messages : [],
            totalReadings: reading ? reading.totalReadings : 0,
            freeReadingsUsed: reading ? reading.freeReadingsUsed : 0,
            totalSpent: reading ? reading.totalSpent : 0
        });
    } catch (error) {
        console.error('Error fetching palmistry history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// POST /api/palmistry/read
// Body: { image: base64|dataURL, mimeType?, question?/note?, hand?: 'left'|'right', language?: 'en'|'hi'|'hinglish' }
//
// One unified endpoint. The server decides free vs paid:
//   - readings 1 & 2  -> FREE
//   - reading 3+       -> ₹11 debited from wallet BEFORE generating; auto-refunded
//                         if the AI fails, so money is never lost.
router.post('/read', auth, async (req, res) => {
    const uid = req.user._id.toString();

    // Guard against duplicate concurrent submissions (prevents double charge).
    if (activePalmRequests.has(uid)) {
        return res.status(429).json({ error: 'A palm reading is already being processed. Please wait.' });
    }
    activePalmRequests.set(uid, Date.now());

    let charged = false; // whether we debited the wallet in this request
    try {
        if (!genAI) {
            return res.status(503).json({ error: 'AI service not available right now. Please try later.' });
        }

        const { image, mimeType, question, note, hand, language } = req.body || {};
        const userNote = (question || note || '').toString().trim();
        const handSide = ['left', 'right'].includes((hand || '').toLowerCase()) ? hand.toLowerCase() : null;

        if (userNote && countWords(userNote) > MAX_NOTE_WORDS) {
            return res.status(400).json({ error: `Note too long. Maximum ${MAX_NOTE_WORDS} words allowed.` });
        }

        // Parse image (in memory only — never persisted).
        let parsed;
        try {
            parsed = parseImage(image, mimeType);
        } catch (imgErr) {
            return res.status(400).json({ error: imgErr.message });
        }

        // Load/create the user's reading log.
        let reading = await PalmReading.findOne({ user: req.user._id });
        const freeUsed = reading ? reading.freeReadingsUsed : 0;
        const isFree = freeUsed < FREE_PALM_READINGS;

        // ---- Payment (only when not free): atomic debit BEFORE generating ----
        let balanceAfter = null;
        if (!isFree) {
            const wallet = await Wallet.findOneAndUpdate(
                { user: req.user._id, balance: { $gte: PALM_READING_PRICE } },
                {
                    $inc: { balance: -PALM_READING_PRICE, totalSpent: PALM_READING_PRICE },
                    $set: { lastTransactionAt: new Date(), updatedAt: new Date() }
                },
                { new: true }
            );
            if (!wallet) {
                const current = await Wallet.findOrCreate(req.user._id);
                return res.status(402).json({
                    error: 'Insufficient wallet balance for a palm reading',
                    requiresPayment: true,
                    walletBalance: current.balance,
                    pricePerReading: PALM_READING_PRICE,
                    shortfall: Math.max(0, PALM_READING_PRICE - current.balance)
                });
            }
            charged = true;
            balanceAfter = wallet.balance;
        }

        // ---- Generate the reading ----
        let answer;
        try {
            answer = await generatePalmReading({
                base64: parsed.base64,
                mimeType: parsed.mimeType,
                note: userNote,
                hand: handSide,
                language,
                userId: uid
            });
        } catch (aiErr) {
            // AI failed — refund the charge (if any) so no money is lost.
            if (charged) {
                try {
                    const refunded = await Wallet.findOneAndUpdate(
                        { user: req.user._id },
                        {
                            $inc: { balance: PALM_READING_PRICE, totalSpent: -PALM_READING_PRICE },
                            $set: { lastTransactionAt: new Date(), updatedAt: new Date() }
                        },
                        { new: true }
                    );
                    if (refunded) {
                        await WalletTransaction.create({
                            user: req.user._id,
                            type: 'refund',
                            amount: PALM_READING_PRICE,
                            balanceAfter: refunded.balance,
                            description: 'Refund: palm reading could not be generated',
                            status: 'success'
                        });
                        const io = req.app.get('io');
                        if (io) {
                            io.to(uid).emit('wallet_updated', {
                                balance: refunded.balance,
                                lastTransaction: { type: 'refund', amount: PALM_READING_PRICE }
                            });
                        }
                    }
                } catch (refundErr) {
                    console.error('❌ Palmistry refund failed:', refundErr.message);
                }
            }
            return res.status(500).json({
                error: aiErr.message || 'Failed to read the palm. Please try again.',
                canRetry: true,
                refunded: charged
            });
        }

        // ---- Success: persist reading (NO image) + finalize billing ----
        if (!reading) {
            reading = new PalmReading({ user: req.user._id, messages: [] });
        }
        reading.totalReadings += 1;
        if (isFree) {
            reading.freeReadingsUsed += 1;
        } else {
            reading.totalSpent += PALM_READING_PRICE;
        }
        reading.messages.push({
            role: 'user',
            content: userNote || '[Hand image submitted for reading]',
            isFree,
            hand: handSide,
            amountCharged: isFree ? 0 : PALM_READING_PRICE,
            createdAt: new Date()
        });
        reading.messages.push({
            role: 'ai',
            content: answer,
            isFree,
            hand: handSide,
            amountCharged: isFree ? 0 : PALM_READING_PRICE,
            createdAt: new Date()
        });
        await reading.save();

        // Ledger + real-time confirmation for paid readings.
        let confirmationMessage = null;
        if (charged) {
            confirmationMessage = `₹${PALM_READING_PRICE} deducted from your wallet for your palm reading. Remaining balance: ₹${balanceAfter}.`;
            await WalletTransaction.create({
                user: req.user._id,
                type: 'palm_reading',
                amount: -PALM_READING_PRICE,
                balanceAfter,
                description: confirmationMessage,
                status: 'success'
            });
            const io = req.app.get('io');
            if (io) {
                io.to(uid).emit('wallet_updated', {
                    balance: balanceAfter,
                    lastTransaction: {
                        type: 'palm_reading',
                        amount: -PALM_READING_PRICE,
                        description: confirmationMessage,
                        createdAt: new Date()
                    }
                });
            }
        }

        const freeRemaining = Math.max(0, FREE_PALM_READINGS - reading.freeReadingsUsed);
        res.json({
            success: true,
            answer,
            isFree,
            charged,
            amount: charged ? PALM_READING_PRICE : 0,
            walletBalance: balanceAfter, // null for free readings
            paymentMessage: confirmationMessage,
            freeReadingsRemaining: freeRemaining,
            nextReadingFree: freeRemaining > 0,
            pricePerReading: PALM_READING_PRICE,
            totalReadings: reading.totalReadings,
            totalSpent: reading.totalSpent
        });
    } catch (error) {
        console.error('❌ Palmistry /read error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to process palm reading', canRetry: true });
    } finally {
        activePalmRequests.delete(uid);
    }
});

module.exports = router;
