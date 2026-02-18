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
const GEMINI_MODEL = 'gemini-3-pro-preview';
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-pro';
const MAX_AI_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

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
const AI_CHAT_PRICE = 21; // ₹21 per question
const MAX_INPUT_WORDS = 200;
const MAX_OUTPUT_TOKENS = 5000;  // Total output budget (thinking + response)

// Per-user processing lock to prevent duplicate concurrent AI calls
// (e.g., frontend sending via both Socket.IO and REST simultaneously)
const activeAIRequests = new Map();

// Helper: Count words
const countWords = (text) => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

// Astrology-related keywords for validation (English + Hindi)
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
    'fasting', 'vrat', 'donation', 'daan', 'charity',
    // Hindi keywords (Devanagari)
    'कुंडली', 'कुण्डली', 'राशि', 'राशिफल', 'ज्योतिष', 'ग्रह', 'नक्षत्र', 'जन्मपत्री', 'जन्मकुंडली',
    'भविष्य', 'भविष्यवाणी', 'दशा', 'महादशा', 'अंतर्दशा', 'गोचर',
    // Hindi planets
    'सूर्य', 'चंद्र', 'चन्द्र', 'मंगल', 'बुध', 'गुरु', 'बृहस्पति', 'शुक्र', 'शनि', 'राहु', 'केतु',
    // Hindi zodiac signs
    'मेष', 'वृषभ', 'मिथुन', 'कर्क', 'सिंह', 'कन्या', 'तुला', 'वृश्चिक', 'धनु', 'मकर', 'कुंभ', 'कुम्भ', 'मीन',
    // Hindi doshas and yogas
    'दोष', 'मांगलिक', 'काल सर्प', 'साढ़े साती', 'साढ़ेसाती', 'योग',
    // Hindi life topics
    'शादी', 'विवाह', 'नौकरी', 'करियर', 'प्रेम', 'प्यार', 'स्वास्थ्य', 'सेहत', 'धन', 'पैसा', 'पैसे',
    'व्यापार', 'व्यवसाय', 'पढ़ाई', 'शिक्षा', 'परिवार', 'संतान', 'बच्चे', 'यात्रा', 'विदेश',
    'भाग्य', 'किस्मत', 'तकदीर', 'उपाय', 'समस्या', 'समाधान',
    // Hindi spiritual/religious
    'पूजा', 'मंत्र', 'रत्न', 'रुद्राक्ष', 'यंत्र', 'मंदिर', 'व्रत', 'उपवास', 'दान',
    // Hindi question patterns (transliterated)
    'kab hogi', 'kab milegi', 'kab hoga', 'kaisa hoga', 'kaisi hogi', 'kya hoga',
    'meri shaadi', 'mera career', 'meri naukri', 'mera bhavishya', 'meri kundli',
    'batao', 'bataiye', 'bataye', 'upay batao', 'kya karu', 'kya karein'
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
    
    // Check if the question contains Hindi (Devanagari) characters
    const hasHindiChars = /[\u0900-\u097F]/.test(lowerQuestion);
    if (hasHindiChars) {
        // If question is in Hindi, it's very likely astrology-related (since this is an astrology app)
        return true;
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
        // Hindi transliterated patterns
        /kab\s+(hogi|hoga|milegi|milega|aayegi|aayega)/i,
        /kaisa\s+(hoga|rahega)/i,
        /kaisi\s+(hogi|rahegi)/i,
        /kya\s+(hoga|karu|karein|karoon)/i,
        /mer[aie]\s+(shaadi|career|naukri|bhavishya|kundli|sehat|padhai)/i,
        /batao|bataiye|bataye/i,
        /upay\s+batao/i,
    ];
    
    for (const pattern of lifePatterns) {
        if (pattern.test(lowerQuestion)) {
            return true;
        }
    }
    
    return false;
};

// Non-astrology response (bilingual Hindi + English)
const NON_ASTROLOGY_RESPONSE = `🙏 नमस्ते! मैं आपका वैदिक ज्योतिष AI सहायक हूँ।
Namaste! I am your dedicated Vedic Astrology AI assistant.

मैं केवल आपकी कुंडली (जन्मपत्री) के आधार पर ज्योतिष संबंधी प्रश्नों में आपकी सहायता कर सकता हूँ।
I can only help you with astrology-related questions based on your Kundli (birth chart).

**मैं इनमें मदद कर सकता हूँ / I can help you with:**
✨ करियर और नौकरी भविष्यवाणी / Career and job predictions
✨ शादी और रिश्ते मार्गदर्शन / Marriage and relationship guidance
✨ स्वास्थ्य जानकारी / Health insights from your chart
✨ धन और वित्तीय भविष्यवाणी / Wealth and financial predictions
✨ शिक्षा मार्गदर्शन / Education and study guidance
✨ दशा विश्लेषण / Planetary periods (Dasha) analysis
✨ दोषों के उपाय / Remedies for planetary doshas
✨ मुहूर्त / Muhurat (auspicious timing)
✨ कुंडली मिलान / Compatibility analysis
✨ सामान्य जीवन भविष्यवाणी / General life predictions

**कृपया ज्योतिष से संबंधित कोई प्रश्न पूछें!**
**Please ask me something related to astrology, and I'll provide insights based on your birth chart!**`;

// Helper: Generate AI response (Astrology Only) - Using New SDK
const generateAIResponse = async (kundli, question, chatHistory) => {
    if (!genAI) {
        console.error('❌ Gemini AI not initialized! Check GEMINI_API_KEY in .env');
        throw new Error('AI service not available. Please check GEMINI_API_KEY configuration.');
    }
    
    // Per-user lock to prevent duplicate concurrent calls
    // (frontend may fire both Socket.IO and REST for the same question)
    const userId = kundli.user?.toString() || 'unknown';
    if (activeAIRequests.has(userId)) {
        console.log('⏳ AI request already in progress for user:', userId, '— skipping duplicate');
        throw new Error('Your question is already being processed. Please wait for the response.');
    }
    activeAIRequests.set(userId, Date.now());
    
    // Safety: auto-release lock after 100s no matter what (longer than 90s AI timeout)
    const lockTimeout = setTimeout(() => {
        if (activeAIRequests.has(userId)) {
            console.warn('⚠️ Force-releasing stale AI lock for user:', userId);
            activeAIRequests.delete(userId);
        }
    }, 100000);
    
    try {
        // Validate if question is astrology-related
        const isAstroQuestion = isAstrologyQuestion(question);
        console.log('🔍 Is astrology question:', isAstroQuestion, '| Question:', question.substring(0, 50));
        
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

LANGUAGE INSTRUCTIONS:
- You MUST reply in the SAME language the user writes in.
- If the user writes in English, reply ONLY in English.
- If the user writes in Hindi (Devanagari script like "मेरी शादी कब होगी"), reply in Hindi Devanagari.
- If the user writes in Hinglish (Hindi in Roman script like "meri shaadi kab hogi"), reply in Hinglish Roman script.
- NEVER mix languages. NEVER reply in Hinglish or Hindi if the user asked in English.

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
5. IMPORTANT: Keep responses CONCISE but COMPLETE - around 200-400 words
6. Use simple language that anyone can understand
7. Include relevant planetary positions, doshas, or yogas when applicable
8. Always end with positive guidance or remedies if discussing challenges
9. If the question is not about astrology, politely decline and suggest astrology-related topics
10. Do NOT write long paragraphs - be brief and to the point
11. MATCH the user's language exactly. English question = English answer. Hindi question = Hindi answer. Hinglish question = Hinglish answer. NEVER use Hindi/Hinglish for English questions.
12. CRITICAL: Always complete your response with a proper conclusion. NEVER leave a sentence unfinished.

User's Question: ${question}

Provide a COMPLETE astrological response in the SAME language as the question:`;

        const startTime = Date.now();
        const AI_TIMEOUT_MS = 90000;
        
        // Retry loop: try primary model, then fallback model on 503/429 errors
        let result;
        let lastError;
        
        for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
            const useModel = attempt <= 2 ? GEMINI_MODEL : GEMINI_FALLBACK_MODEL;
            const thinkBudget = useModel === GEMINI_MODEL ? 2524 : 1024;
            
            console.log(`🔮 Attempt ${attempt}/${MAX_AI_RETRIES} | Model: ${useModel} | User: ${userId}`);
            console.log(`🔮 Question: ${question.substring(0, 50)}...`);
            
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('AI response timed out after 90 seconds. Please retry.')), AI_TIMEOUT_MS)
            );
            
            try {
                const aiPromise = genAI.models.generateContent({
                    model: useModel,
                    contents: systemPrompt,
                    config: {
                        maxOutputTokens: MAX_OUTPUT_TOKENS,
                        temperature: 0.7,
                        thinkingConfig: {
                            thinkingBudget: thinkBudget
                        }
                    }
                });
                console.log('📡 Gemini API call initiated, waiting for response...');
                
                result = await Promise.race([aiPromise, timeoutPromise]);
                console.log(`✅ Gemini responded on attempt ${attempt}`);
                break;
                
            } catch (retryError) {
                const elapsed = Date.now() - startTime;
                lastError = retryError;
                const status = retryError.status || retryError.code;
                console.error(`❌ Attempt ${attempt} failed after ${elapsed}ms: ${retryError.message}`);
                if (status) console.error(`❌ HTTP Status: ${status}`);
                
                const isRetryable = status === 503 || status === 429 || status === 500;
                if (isRetryable && attempt < MAX_AI_RETRIES) {
                    const delay = RETRY_DELAY_MS * attempt;
                    console.log(`⏳ Retryable error (${status}). Waiting ${delay}ms before retry...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                
                if (!isRetryable) {
                    console.error('❌ Non-retryable error, giving up');
                    console.error('❌ Error name:', retryError.name, '| Code:', retryError.code || 'N/A');
                    if (retryError.errorDetails) console.error('❌ Error details:', JSON.stringify(retryError.errorDetails));
                    throw retryError;
                }
            }
        }
        
        if (!result) {
            console.error('❌ All retry attempts exhausted');
            throw lastError || new Error('AI failed after all retry attempts');
        }
        
        const elapsed = Date.now() - startTime;
        console.log(`📥 Gemini raw response received in ${elapsed}ms`);
        
        // Defensive response parsing — result.text can throw in some SDK versions
        let response;
        try {
            response = result.text;
        } catch (textError) {
            console.error('❌ Error reading result.text:', textError.message);
            // Fallback: try extracting from candidates directly
            if (result.candidates && result.candidates[0]?.content?.parts) {
                const parts = result.candidates[0].content.parts;
                response = parts
                    .filter(p => !p.thought)
                    .map(p => p.text)
                    .filter(Boolean)
                    .join('');
                console.log('🔄 Extracted response from candidates, length:', response?.length || 0);
            }
        }
        
        if (!response || response.trim().length === 0) {
            console.error('❌ Empty AI response. Result keys:', result ? Object.keys(result) : 'null');
            if (result?.candidates) {
                console.error('❌ Candidates:', JSON.stringify(result.candidates?.map(c => ({
                    finishReason: c.finishReason,
                    partsCount: c.content?.parts?.length
                }))));
            }
            if (result?.promptFeedback) {
                console.error('❌ Prompt feedback (may be blocked):', JSON.stringify(result.promptFeedback));
            }
            throw new Error('Empty response from AI. The prompt may have been blocked by safety filters.');
        }
        
        console.log(`✅ Gemini AI response received in ${elapsed}ms, length: ${response.length}`);
        return { response, isAstrologyQuestion: true };
        
    } catch (aiError) {
        console.error('❌ Gemini AI Error:', aiError.message);
        console.error('❌ Error stack:', aiError.stack);
        throw new Error(`AI generation failed: ${aiError.message}`);
    } finally {
        clearTimeout(lockTimeout);
        activeAIRequests.delete(userId);
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
        const userId = req.user._id.toString();
        const isProcessing = activeAIRequests.has(userId);
        console.log('📜 REST: Fetching chat history for user:', userId, isProcessing ? '(AI still processing)' : '');
        
        const aiChat = await AIChat.findOne({ user: req.user._id })
            .populate('kundli')
            .lean();
        
        if (!aiChat) {
            console.log('📜 REST: No chat found for user');
            return res.json({
                success: true,
                messages: [],
                totalQuestions: 0,
                freeQuestionUsed: false,
                isProcessing
            });
        }
        
        console.log('📜 REST: Chat found, messages count:', aiChat.messages?.length || 0);
        
        res.json({
            success: true,
            messages: aiChat.messages || [],
            totalQuestions: aiChat.totalQuestions,
            freeQuestionUsed: aiChat.freeQuestionUsed,
            totalSpent: aiChat.totalSpent,
            kundli: aiChat.kundli,
            isProcessing
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
                error: 'Free question already used. Please pay ₹21 for more questions.',
                requiresPayment: true,
                pricePerQuestion: AI_CHAT_PRICE
            });
        }
        
        console.log('🤖 REST: Generating AI response for user:', req.user._id.toString());
        // Generate AI response (has built-in per-user lock to prevent duplicates)
        let aiResult;
        try {
            aiResult = await generateAIResponse(
                kundli, 
                question.trim(), 
                aiChat ? aiChat.messages : []
            );
        } catch (aiError) {
            console.error('❌ REST: AI generation failed:', aiError.message);
            return res.status(500).json({ 
                error: aiError.message || 'AI failed to generate response. Please try again.',
                canRetry: true
            });
        }
        
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
        console.log('💾 REST: Chat saved! Total messages:', aiChat.messages.length, '| User:', req.user._id.toString());
        
        res.json({
            success: true,
            answer: aiResult.response,
            isAstrologyQuestion: aiResult.isAstrologyQuestion,
            isFreeQuestion: true,
            freeQuestionUsed: true,
            totalQuestions: aiChat.totalQuestions,
            message: 'This was your free question. Future questions will cost ₹21 each.'
        });
    } catch (error) {
        console.error('❌ REST: Error processing free question:', error.message);
        console.error('❌ REST: Stack:', error.stack);
        res.status(500).json({ 
            error: error.message || 'Failed to process your question',
            canRetry: true,
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
        
        // Create payment record with tracking fields
        const payment = new UnifiedPayment({
            user: req.user._id,
            type: 'ai_chat',
            amount: AI_CHAT_PRICE,
            status: 'pending',
            razorpayOrderId: order.id,
            details: {
                questionNumber: questionNumber,
                questionAnswered: false,  // Track if AI responded
                answerDelivered: false,   // Track if answer was sent
                retryCount: 0,            // Track retry attempts
                failureReason: null       // Track failure reason
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
        
        // Find payment record
        let payment = await UnifiedPayment.findOne({ 
            razorpayOrderId,
            user: req.user._id,
            type: 'ai_chat'
        });
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        // Check if this is a retry (payment made but question not answered)
        const isRetry = payment.status === 'paid' && !payment.details.questionAnswered;
        
        if (payment.status === 'paid' && payment.details.questionAnswered) {
            return res.status(400).json({ 
                error: 'This payment has already been used for a question',
                alreadyAnswered: true
            });
        }
        
        // First time payment verification
        if (payment.status !== 'paid') {
            // Verify payment signature
            const body = razorpayOrderId + '|' + razorpayPaymentId;
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(body)
                .digest('hex');
            
            if (expectedSignature !== razorpaySignature) {
                return res.status(400).json({ error: 'Invalid payment signature' });
            }
            
            // Update payment status
            payment.status = 'paid';
            payment.razorpayPaymentId = razorpayPaymentId;
            payment.razorpaySignature = razorpaySignature;
            payment.paidAt = new Date();
        }
        
        // Store the question being asked
        payment.details.question = question.trim();
        payment.details.retryCount = (payment.details.retryCount || 0) + (isRetry ? 1 : 0);
        await payment.save();
        
        console.log(`💬 Processing ${isRetry ? 'RETRY' : 'NEW'} paid question for user:`, req.user._id);
        
        // Get Kundli
        const kundli = await Kundli.findOne({ user: req.user._id });
        if (!kundli) {
            payment.details.failureReason = 'Kundli not found';
            await payment.save();
            return res.status(400).json({ error: 'Kundli not found', canRetry: true });
        }
        
        // Get or create AI chat
        let aiChat = await AIChat.findOne({ user: req.user._id });
        
        // Generate AI response
        let aiResult;
        try {
            aiResult = await generateAIResponse(
                kundli, 
                question.trim(), 
                aiChat ? aiChat.messages : []
            );
        } catch (aiError) {
            // AI failed - save failure reason and allow retry
            payment.details.failureReason = aiError.message;
            await payment.save();
            console.error('❌ AI generation failed for paid question:', aiError.message);
            return res.status(500).json({ 
                error: 'AI failed to generate response. You can retry with the same payment.',
                canRetry: true,
                paymentId: payment._id,
                razorpayOrderId: payment.razorpayOrderId
            });
        }
        
        // AI succeeded! Mark as answered
        payment.details.questionAnswered = true;
        payment.details.answerDelivered = true;
        payment.details.answeredAt = new Date();
        payment.details.failureReason = null;
        await payment.save();
        
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
        } else if (!isRetry) {
            // Only increment if not a retry
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

// Check for unused paid questions (paid but AI failed)
router.get('/check-unused-payment', auth, async (req, res) => {
    try {
        // Find any paid but unanswered questions for this user
        const unusedPayment = await UnifiedPayment.findOne({
            user: req.user._id,
            type: 'ai_chat',
            status: 'paid',
            'details.questionAnswered': { $ne: true }
        }).sort({ createdAt: -1 }).lean();
        
        if (!unusedPayment) {
            return res.json({
                success: true,
                hasUnusedPayment: false
            });
        }
        
        res.json({
            success: true,
            hasUnusedPayment: true,
            payment: {
                _id: unusedPayment._id,
                razorpayOrderId: unusedPayment.razorpayOrderId,
                razorpayPaymentId: unusedPayment.razorpayPaymentId,
                amount: unusedPayment.amount,
                question: unusedPayment.details.question,
                failureReason: unusedPayment.details.failureReason,
                retryCount: unusedPayment.details.retryCount || 0,
                paidAt: unusedPayment.paidAt
            },
            message: 'You have a paid question that was not answered. You can retry it.'
        });
    } catch (error) {
        console.error('Error checking unused payment:', error);
        res.status(400).json({ error: error.message });
    }
});

// Retry a failed paid question
router.post('/retry-paid', auth, async (req, res) => {
    try {
        const { question, paymentId } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }
        
        // Find the unused payment
        let payment;
        if (paymentId) {
            payment = await UnifiedPayment.findOne({
                _id: paymentId,
                user: req.user._id,
                type: 'ai_chat',
                status: 'paid',
                'details.questionAnswered': { $ne: true }
            });
        } else {
            // Find any unused payment for this user
            payment = await UnifiedPayment.findOne({
                user: req.user._id,
                type: 'ai_chat',
                status: 'paid',
                'details.questionAnswered': { $ne: true }
            }).sort({ createdAt: -1 });
        }
        
        if (!payment) {
            return res.status(404).json({ 
                error: 'No unused paid question found. Please make a new payment.',
                requiresPayment: true
            });
        }
        
        // Validate word count
        const wordCount = countWords(question);
        if (wordCount > MAX_INPUT_WORDS) {
            return res.status(400).json({ 
                error: `Question too long. Maximum ${MAX_INPUT_WORDS} words allowed.` 
            });
        }
        
        // Update retry count and question
        payment.details.question = question.trim();
        payment.details.retryCount = (payment.details.retryCount || 0) + 1;
        await payment.save();
        
        console.log(`🔄 Retry #${payment.details.retryCount} for user:`, req.user._id);
        
        // Get Kundli
        const kundli = await Kundli.findOne({ user: req.user._id });
        if (!kundli) {
            payment.details.failureReason = 'Kundli not found';
            await payment.save();
            return res.status(400).json({ error: 'Kundli not found', canRetry: true });
        }
        
        // Get AI chat
        let aiChat = await AIChat.findOne({ user: req.user._id });
        
        // Generate AI response
        let aiResult;
        try {
            aiResult = await generateAIResponse(
                kundli, 
                question.trim(), 
                aiChat ? aiChat.messages : []
            );
        } catch (aiError) {
            payment.details.failureReason = aiError.message;
            await payment.save();
            console.error('❌ AI retry failed:', aiError.message);
            return res.status(500).json({ 
                error: 'AI failed again. Please try later.',
                canRetry: true,
                retryCount: payment.details.retryCount
            });
        }
        
        // AI succeeded!
        payment.details.questionAnswered = true;
        payment.details.answerDelivered = true;
        payment.details.answeredAt = new Date();
        payment.details.failureReason = null;
        await payment.save();
        
        // Save to chat (first time saving since previous attempts failed)
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
        
        aiChat.messages.push({
            role: 'user',
            content: question.trim(),
            isFreeQuestion: false,
            paymentId: payment._id,
            createdAt: new Date()
        });
        
        aiChat.messages.push({
            role: 'ai',
            content: aiResult.response,
            isFreeQuestion: false,
            isAstrologyQuestion: aiResult.isAstrologyQuestion,
            paymentId: payment._id,
            createdAt: new Date()
        });
        
        await aiChat.save();
        console.log('✅ Retry successful! Question answered.');
        
        res.json({
            success: true,
            answer: aiResult.response,
            isAstrologyQuestion: aiResult.isAstrologyQuestion,
            retrySuccessful: true,
            totalQuestions: aiChat.totalQuestions,
            totalSpent: aiChat.totalSpent
        });
    } catch (error) {
        console.error('Error in retry:', error);
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
module.exports.activeAIRequests = activeAIRequests;
