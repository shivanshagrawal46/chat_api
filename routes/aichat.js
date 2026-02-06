const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { GoogleGenAI } = require('@google/genai');
const AIChat = require('../models/AIChat');
const Kundli = require('../models/Kundli');
const UnifiedPayment = require('../models/UnifiedPayment');
const auth = require('../middleware/auth');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Gemini AI (New SDK)
let genAI = null;
const GEMINI_MODEL = 'gemini-2.0-flash';

try {
    if (process.env.GEMINI_API_KEY) {
        genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        console.log(`✅ Google Gemini AI initialized (model: ${GEMINI_MODEL})`);
    } else {
        console.log('⚠️ GEMINI_API_KEY not found. AI Chat disabled.');
    }
} catch (error) {
    console.error('⚠️ Failed to initialize Gemini AI:', error.message);
}

// Initialize Razorpay
let razorpay = null;
try {
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
    }
} catch (error) {
    console.error('Razorpay initialization error:', error);
}

// Constants
const AI_CHAT_PRICE = 501; // ₹501 per question
const MAX_INPUT_WORDS = 200;
const MAX_OUTPUT_TOKENS = 500;

// Helper: Count words
const countWords = (text) => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

// Astrology-related keywords for validation
const ASTROLOGY_KEYWORDS = [
    // General astrology terms
    'kundli', 'kundali', 'horoscope', 'zodiac', 'rashi', 'nakshatra', 'graha', 'planet',
    'astrology', 'jyotish', 'vedic', 'birth chart', 'natal chart', 'prediction', 'forecast',
    // Planets
    'sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu',
    'surya', 'chandra', 'mangal', 'budh', 'guru', 'shukra', 'shani',
    // Houses
    'house', 'bhava', 'ascendant', 'lagna', 'first house', 'second house', 'third house',
    'fourth house', 'fifth house', 'sixth house', 'seventh house', 'eighth house',
    'ninth house', 'tenth house', 'eleventh house', 'twelfth house',
    // Zodiac signs
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio',
    'sagittarius', 'capricorn', 'aquarius', 'pisces',
    'mesha', 'vrishabha', 'mithuna', 'karka', 'simha', 'kanya', 'tula', 'vrishchika',
    'dhanu', 'makara', 'kumbha', 'meena',
    // Doshas and yogas
    'dosha', 'yoga', 'manglik', 'kaal sarp', 'sade sati', 'mahadasha', 'antardasha',
    'dasha', 'gochar', 'transit', 'aspect', 'conjunction', 'retrograde',
    // Life topics (astrology context)
    'marriage', 'career', 'job', 'love', 'relationship', 'health', 'wealth', 'money',
    'finance', 'business', 'education', 'study', 'family', 'children', 'child',
    'travel', 'foreign', 'abroad', 'luck', 'fortune', 'destiny', 'fate',
    'compatible', 'compatibility', 'match', 'muhurat', 'auspicious', 'remedy', 'upay',
    // Questions about future/life
    'future', 'when will', 'will i', 'should i', 'what about my', 'tell me about',
    'predict', 'guidance', 'advice', 'suggest', 'happening', 'problem', 'solution',
    'lucky', 'unlucky', 'favorable', 'unfavorable', 'good time', 'bad time',
    // Spiritual/religious
    'pooja', 'puja', 'mantra', 'gemstone', 'stone', 'rudraksha', 'yantra', 'temple',
    'fasting', 'vrat', 'donation', 'daan', 'charity'
];

// Helper: Check if question is astrology-related
const isAstrologyQuestion = (question) => {
    const lowerQuestion = question.toLowerCase();
    
    // Check for astrology keywords
    for (const keyword of ASTROLOGY_KEYWORDS) {
        if (lowerQuestion.includes(keyword)) {
            return true;
        }
    }
    
    // Check for common question patterns about life (usually astrology context)
    const lifePatterns = [
        /when\s+will\s+(i|my)/i,
        /will\s+(i|my|we)/i,
        /what\s+(is|are|about)\s+my/i,
        /how\s+(is|will|about)\s+my/i,
        /should\s+i/i,
        /tell\s+me\s+about/i,
        /predict/i,
        /future/i,
        /this\s+(year|month|week)/i,
        /next\s+(year|month|week)/i,
        /\d{4}/, // Year mentions
    ];
    
    for (const pattern of lifePatterns) {
        if (pattern.test(lowerQuestion)) {
            return true;
        }
    }
    
    return false;
};

// Non-astrology response
const NON_ASTROLOGY_RESPONSE = `🙏 Namaste! I am your dedicated Vedic Astrology AI assistant.

I can only help you with astrology-related questions based on your Kundli (birth chart). 

**I can help you with:**
✨ Career and job predictions
✨ Marriage and relationship guidance
✨ Health insights from your chart
✨ Wealth and financial predictions
✨ Education and study guidance
✨ Planetary periods (Dasha) analysis
✨ Remedies for planetary doshas
✨ Muhurat (auspicious timing)
✨ Compatibility analysis
✨ General life predictions

**Please ask me something related to astrology, and I'll provide insights based on your birth chart!**`;

// Helper: Generate AI response (Astrology Only) - Using New SDK
const generateAIResponse = async (kundli, question, chatHistory) => {
    if (!genAI) {
        console.error('❌ Gemini AI not initialized! Check GEMINI_API_KEY in .env');
        throw new Error('AI service not available. Please check GEMINI_API_KEY configuration.');
    }
    
    // Validate if question is astrology-related
    const isAstroQuestion = isAstrologyQuestion(question);
    console.log('🔍 Is astrology question:', isAstroQuestion, '| Question:', question.substring(0, 30));
    
    if (!isAstroQuestion) {
        console.log('⚠️ Non-astrology question detected, returning default response');
        return { response: NON_ASTROLOGY_RESPONSE, isAstrologyQuestion: false };
    }
    
    // Build context with kundli details
    const kundliContext = `
User's Birth Details (Kundli):
- Name: ${kundli.fullName}
- Date of Birth: ${new Date(kundli.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
- Time of Birth: ${kundli.timeOfBirth}
- Place of Birth: ${kundli.placeOfBirth}
- Gender: ${kundli.gender}
`;

    // Build chat history context (last 10 messages for context)
    let historyContext = '';
    if (chatHistory && chatHistory.length > 0) {
        const recentHistory = chatHistory.slice(-10);
        historyContext = '\nPrevious Conversation:\n' + recentHistory.map(msg => 
            `${msg.role === 'user' ? 'User' : 'Astrologer AI'}: ${msg.content}`
        ).join('\n');
    }

    const systemPrompt = `You are an expert Vedic astrologer AI assistant. You ONLY provide astrological guidance based on the user's birth details (Kundli).

IMPORTANT RESTRICTIONS:
- You MUST ONLY answer questions related to astrology, horoscope, kundli, zodiac, planets, predictions, and spiritual guidance.
- If the user asks anything NOT related to astrology (like coding, general knowledge, math, science, news, etc.), politely decline and remind them you only handle astrology questions.
- Always base your answers on the user's Kundli details provided below.

${kundliContext}
${historyContext}

Instructions:
1. ONLY provide astrological insights based on the user's Kundli
2. Be respectful and compassionate in your responses
3. Give practical advice along with astrological predictions
4. If asked about career, marriage, health, etc., ALWAYS relate your answer to their birth chart and planetary positions
5. Keep responses concise but informative (max 500 tokens)
6. Use simple language that anyone can understand
7. Include relevant planetary positions, doshas, or yogas when applicable
8. Always end with positive guidance or remedies if discussing challenges
9. If the question is not about astrology, politely decline and suggest astrology-related topics

User's Question: ${question}

Provide your astrological response:`;

    try {
        console.log('🔮 Calling Gemini AI for question:', question.substring(0, 50) + '...');
        
        // New SDK syntax
        const result = await genAI.models.generateContent({
            model: GEMINI_MODEL,
            contents: systemPrompt,
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.7,
            }
        });
        
        const response = result.text;
        console.log('✅ Gemini AI response received, length:', response?.length || 0);
        
        if (!response || response.trim().length === 0) {
            throw new Error('Empty response from AI');
        }
        
        return { response, isAstrologyQuestion: true };
    } catch (aiError) {
        console.error('❌ Gemini AI Error:', aiError.message);
        throw new Error(`AI generation failed: ${aiError.message}`);
    }
};


// Check AI chat status (free question available?)
router.get('/status', auth, async (req, res) => {
    try {
        // Check if user has Kundli
        const kundli = await Kundli.findOne({ user: req.user._id }).lean();
        
        if (!kundli) {
            return res.json({
                hasKundli: false,
                freeQuestionAvailable: true,
                totalQuestions: 0,
                totalSpent: 0,
                message: 'Please save your Kundli details first to use AI chat'
            });
        }
        
        // Get or create AI chat session
        let aiChat = await AIChat.findOne({ user: req.user._id }).lean();
        
        res.json({
            hasKundli: true,
            kundli: {
                fullName: kundli.fullName,
                dateOfBirth: kundli.dateOfBirth,
                placeOfBirth: kundli.placeOfBirth
            },
            freeQuestionAvailable: aiChat ? !aiChat.freeQuestionUsed : true,
            totalQuestions: aiChat ? aiChat.totalQuestions : 0,
            totalSpent: aiChat ? aiChat.totalSpent : 0,
            pricePerQuestion: AI_CHAT_PRICE
        });
    } catch (error) {
        console.error('Error fetching AI chat status:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get chat history
router.get('/history', auth, async (req, res) => {
    try {
        console.log('📜 Fetching chat history for user:', req.user._id);
        
        const aiChat = await AIChat.findOne({ user: req.user._id })
            .populate('kundli')
            .lean();
        
        if (!aiChat) {
            console.log('📜 No chat found for user');
            return res.json({
                success: true,
                messages: [],
                totalQuestions: 0,
                freeQuestionUsed: false
            });
        }
        
        console.log('📜 Chat found, messages count:', aiChat.messages?.length || 0);
        
        res.json({
            success: true,
            messages: aiChat.messages || [],
            totalQuestions: aiChat.totalQuestions,
            freeQuestionUsed: aiChat.freeQuestionUsed,
            totalSpent: aiChat.totalSpent,
            kundli: aiChat.kundli
        });
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(400).json({ error: error.message });
    }
});

// Ask free question (first question only)
router.post('/ask-free', auth, async (req, res) => {
    try {
        console.log('📝 AI Ask-Free Request from user:', req.user._id);
        
        const { question } = req.body;
        
        if (!question || question.trim().length === 0) {
            console.log('❌ Empty question received');
            return res.status(400).json({ error: 'Question is required' });
        }
        
        console.log('📝 Question received:', question.substring(0, 50) + '...');
        
        // Validate word count
        const wordCount = countWords(question);
        if (wordCount > MAX_INPUT_WORDS) {
            return res.status(400).json({ 
                error: `Question too long. Maximum ${MAX_INPUT_WORDS} words allowed. Your question has ${wordCount} words.` 
            });
        }
        
        // Check Kundli
        console.log('🔍 Checking Kundli for user:', req.user._id);
        const kundli = await Kundli.findOne({ user: req.user._id });
        if (!kundli) {
            console.log('❌ No Kundli found for user');
            return res.status(400).json({ 
                error: 'Please save your Kundli details first',
                requiresKundli: true 
            });
        }
        console.log('✅ Kundli found:', kundli.fullName);
        
        // Get or create AI chat
        let aiChat = await AIChat.findOne({ user: req.user._id });
        
        if (aiChat && aiChat.freeQuestionUsed) {
            console.log('❌ Free question already used');
            return res.status(400).json({ 
                error: 'Free question already used. Please pay ₹501 for more questions.',
                requiresPayment: true,
                pricePerQuestion: AI_CHAT_PRICE
            });
        }
        
        console.log('🤖 Generating AI response...');
        // Generate AI response
        const aiResult = await generateAIResponse(
            kundli, 
            question.trim(), 
            aiChat ? aiChat.messages : []
        );
        
        // Save to chat
        if (!aiChat) {
            aiChat = new AIChat({
                user: req.user._id,
                kundli: kundli._id,
                messages: [],
                freeQuestionUsed: true,
                totalQuestions: 1
            });
        } else {
            aiChat.freeQuestionUsed = true;
            aiChat.totalQuestions += 1;
        }
        
        // Add user question
        aiChat.messages.push({
            role: 'user',
            content: question.trim(),
            isFreeQuestion: true,
            createdAt: new Date()
        });
        
        // Add AI response
        aiChat.messages.push({
            role: 'ai',
            content: aiResult.response,
            isFreeQuestion: true,
            isAstrologyQuestion: aiResult.isAstrologyQuestion,
            createdAt: new Date()
        });
        
        await aiChat.save();
        console.log('💾 Chat saved! Total messages:', aiChat.messages.length);
        
        res.json({
            success: true,
            answer: aiResult.response,
            isAstrologyQuestion: aiResult.isAstrologyQuestion,
            isFreeQuestion: true,
            freeQuestionUsed: true,
            totalQuestions: aiChat.totalQuestions,
            message: 'This was your free question. Future questions will cost ₹501 each.'
        });
    } catch (error) {
        console.error('❌ Error processing free question:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            error: error.message || 'Failed to process your question',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Create payment order for AI question
router.post('/create-payment', auth, async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(500).json({ error: 'Payment service not configured' });
        }
        
        // Check Kundli
        const kundli = await Kundli.findOne({ user: req.user._id });
        if (!kundli) {
            return res.status(400).json({ 
                error: 'Please save your Kundli details first',
                requiresKundli: true 
            });
        }
        
        // Get question count
        const aiChat = await AIChat.findOne({ user: req.user._id });
        const questionNumber = aiChat ? aiChat.totalQuestions + 1 : 1;
        
        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: AI_CHAT_PRICE * 100, // Convert to paise
            currency: 'INR',
            receipt: `ai_${req.user._id.toString().slice(-8)}_${Date.now().toString().slice(-8)}`,
            notes: {
                userId: req.user._id.toString(),
                type: 'ai_chat',
                questionNumber: questionNumber
            }
        });
        
        // Create payment record
        const payment = new UnifiedPayment({
            user: req.user._id,
            type: 'ai_chat',
            amount: AI_CHAT_PRICE,
            status: 'pending',
            razorpayOrderId: order.id,
            details: {
                questionNumber: questionNumber
            },
            description: `AI Astrologer Chat - Question #${questionNumber}`
        });
        await payment.save();
        
        res.json({
            success: true,
            orderId: order.id,
            amount: AI_CHAT_PRICE,
            currency: 'INR',
            paymentId: payment._id,
            questionNumber: questionNumber
        });
    } catch (error) {
        console.error('Error creating AI chat payment:', error);
        res.status(400).json({ error: error.message });
    }
});

// Verify payment and ask question
router.post('/ask-paid', auth, async (req, res) => {
    try {
        const { question, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
        
        if (!question || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({ 
                error: 'Missing required fields: question, razorpayOrderId, razorpayPaymentId, razorpaySignature' 
            });
        }
        
        // Validate word count
        const wordCount = countWords(question);
        if (wordCount > MAX_INPUT_WORDS) {
            return res.status(400).json({ 
                error: `Question too long. Maximum ${MAX_INPUT_WORDS} words allowed.` 
            });
        }
        
        // Verify payment signature
        const body = razorpayOrderId + '|' + razorpayPaymentId;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');
        
        if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }
        
        // Update payment record
        const payment = await UnifiedPayment.findOne({ 
            razorpayOrderId,
            user: req.user._id,
            type: 'ai_chat'
        });
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        if (payment.status === 'paid') {
            return res.status(400).json({ error: 'Payment already used' });
        }
        
        payment.status = 'paid';
        payment.razorpayPaymentId = razorpayPaymentId;
        payment.razorpaySignature = razorpaySignature;
        payment.paidAt = new Date();
        await payment.save();
        
        // Get Kundli
        const kundli = await Kundli.findOne({ user: req.user._id });
        if (!kundli) {
            return res.status(400).json({ error: 'Kundli not found' });
        }
        
        // Get or create AI chat
        let aiChat = await AIChat.findOne({ user: req.user._id });
        
        // Generate AI response
        const aiResult = await generateAIResponse(
            kundli, 
            question.trim(), 
            aiChat ? aiChat.messages : []
        );
        
        // Save to chat
        if (!aiChat) {
            aiChat = new AIChat({
                user: req.user._id,
                kundli: kundli._id,
                messages: [],
                freeQuestionUsed: true,
                totalQuestions: 1,
                totalSpent: AI_CHAT_PRICE
            });
        } else {
            aiChat.totalQuestions += 1;
            aiChat.totalSpent += AI_CHAT_PRICE;
        }
        
        // Add user question
        aiChat.messages.push({
            role: 'user',
            content: question.trim(),
            isFreeQuestion: false,
            paymentId: payment._id,
            createdAt: new Date()
        });
        
        // Add AI response
        aiChat.messages.push({
            role: 'ai',
            content: aiResult.response,
            isFreeQuestion: false,
            isAstrologyQuestion: aiResult.isAstrologyQuestion,
            paymentId: payment._id,
            createdAt: new Date()
        });
        
        await aiChat.save();
        
        res.json({
            success: true,
            answer: aiResult.response,
            isAstrologyQuestion: aiResult.isAstrologyQuestion,
            isFreeQuestion: false,
            totalQuestions: aiChat.totalQuestions,
            totalSpent: aiChat.totalSpent,
            paymentId: payment._id
        });
    } catch (error) {
        console.error('Error processing paid question:', error);
        res.status(400).json({ error: error.message });
    }
});

// Admin: Get all AI chats
router.get('/admin/all-chats', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const [chats, total] = await Promise.all([
            AIChat.find()
                .populate('user', 'firstName lastName email phone')
                .populate('kundli')
                .sort({ lastActivity: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AIChat.countDocuments()
        ]);
        
        res.json({
            success: true,
            chats,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        console.error('Error fetching all AI chats:', error);
        res.status(400).json({ error: error.message });
    }
});

// Admin: Get specific user's AI chat
router.get('/admin/user-chat/:userId', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { userId } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        const chat = await AIChat.findOne({ user: userId })
            .populate('user', 'firstName lastName email phone')
            .populate('kundli')
            .lean();
        
        if (!chat) {
            return res.status(404).json({ error: 'No AI chat found for this user' });
        }
        
        res.json({ success: true, chat });
    } catch (error) {
        console.error('Error fetching user AI chat:', error);
        res.status(400).json({ error: error.message });
    }
});

// Export router and helper functions for Socket.IO use
module.exports = router;
module.exports.router = router;
module.exports.generateAIResponse = generateAIResponse;
module.exports.isAstrologyQuestion = isAstrologyQuestion;
module.exports.countWords = countWords;
module.exports.AI_CHAT_PRICE = AI_CHAT_PRICE;
module.exports.MAX_INPUT_WORDS = MAX_INPUT_WORDS;
module.exports.NON_ASTROLOGY_RESPONSE = NON_ASTROLOGY_RESPONSE;
