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
const GEMINI_MODEL = 'gemini-2.5-pro';
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash';
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

// Kundli API base URL (from env; used to fetch lagna, mahadasha for AI context)
const KUNDLI_API_BASE = process.env.KUNDLI_API_BASE_URL || 'http://64.227.131.149:3102/api';
const KUNDLI_API_TIMEOUT_MS = 15000;

// Fallback lat/lon when Kundli has no coordinates (API rejects 0,0)
const CITY_COORDS = {
    // Major metros
    delhi: [28.6139, 77.2090],
    newdelhi: [28.6139, 77.2090],
    mumbai: [19.076, 72.8777],
    bombay: [19.076, 72.8777],
    kolkata: [22.5726, 88.3639],
    calcutta: [22.5726, 88.3639],
    chennai: [13.0827, 80.2707],
    madras: [13.0827, 80.2707],
    bangalore: [12.9716, 77.5946],
    bengaluru: [12.9716, 77.5946],
    hyderabad: [17.385, 78.4867],
    pune: [18.5204, 73.8567],
    poona: [18.5204, 73.8567],
    ahmedabad: [23.0225, 72.5714],
    // Madhya Pradesh
    bhopal: [23.2599, 77.4126],
    indore: [22.7196, 75.8577],
    gwalior: [26.2183, 78.1828],
    jabalpur: [23.1815, 79.9864],
    ujjain: [23.1765, 75.7885],
    satna: [24.5780, 80.8272],
    rewa: [24.5373, 81.3042],
    ratlam: [23.3343, 75.0376],
    burhanpur: [21.3090, 76.2296],
    khandwa: [21.8247, 76.3526],
    morena: [26.4969, 78.0011],
    bhind: [26.5649, 78.7873],
    chhindwara: [22.0569, 78.9391],
    betul: [21.9038, 77.8969],
    sagar: [23.8388, 78.7378],
    damoh: [23.8434, 79.4539],
    vidisha: [23.5251, 77.8081],
    singrauli: [24.1997, 82.6753],
    dhar: [22.6010, 75.3025],
    mandsaur: [24.0718, 75.0699],
    khargone: [21.8230, 75.6125],
    dewas: [22.9658, 76.0553],
    shivpuri: [25.4235, 77.6621],
    guna: [24.6465, 77.3123],
    datia: [25.6733, 78.4590],
    tikamgarh: [24.7434, 78.8306],
    chhatarpur: [24.9142, 79.5878],
    panna: [24.7194, 80.1874],
    shahdol: [23.2833, 81.3500],
    umaria: [23.5246, 80.8362],
    sidhi: [24.4132, 81.8820],
    neemuch: [24.4700, 74.8700],
    mandsour: [24.0718, 75.0699],
    // Uttar Pradesh
    lucknow: [26.8467, 80.9462],
    kanpur: [26.4499, 80.3319],
    agra: [27.1767, 78.0081],
    varanasi: [25.3176, 82.9739],
    banaras: [25.3176, 82.9739],
    kashi: [25.3176, 82.9739],
    allahabad: [25.4358, 81.8463],
    prayagraj: [25.4358, 81.8463],
    meerut: [28.9845, 77.7064],
    ghaziabad: [28.6692, 77.4538],
    noida: [28.5355, 77.3910],
    greaternoida: [28.4744, 77.5040],
    aligarh: [27.8974, 78.0880],
    bareilly: [28.3670, 79.4304],
    moradabad: [28.8388, 78.7378],
    saharanpur: [29.9675, 77.5451],
    muzaffarnagar: [29.4727, 77.7085],
    mathura: [27.4924, 77.6737],
    ayodhya: [26.7922, 82.2047],
    faizabad: [26.7755, 82.1498],
    gorakhpur: [26.7606, 83.3732],
    jhansi: [25.4484, 78.5685],
    muradabad: [28.8388, 78.7378],
    sultanpur: [26.2649, 82.0727],
    azamgarh: [26.0674, 83.1836],
    basti: [26.8154, 82.7786],
    chandausi: [28.4530, 78.7830],
    dehradun: [30.3165, 78.0322],
    haridwar: [29.9450, 78.1642],
    rishikesh: [30.0869, 78.2676],
    roorkee: [29.8630, 77.8870],
    // Gujarat
    surat: [21.1702, 72.8311],
    vadodara: [22.3072, 73.1812],
    baroda: [22.3072, 73.1812],
    rajkot: [22.3039, 70.8022],
    bhavnagar: [21.7645, 72.1519],
    jamnagar: [22.4707, 70.0577],
    junagadh: [21.5222, 70.4579],
    gandhinagar: [23.2156, 72.6369],
    nadiad: [22.6939, 72.8614],
    morbi: [22.8196, 70.8376],
    anand: [22.5645, 72.9289],
    mehsana: [23.5880, 72.3693],
    bhuj: [23.2420, 69.6669],
    porbandar: [21.6417, 69.6293],
    dwarka: [22.2394, 68.9678],
    palanpur: [24.1711, 72.4380],
    godhra: [22.7756, 73.6147],
    navsari: [20.9506, 72.9342],
    valsad: [20.6333, 72.9333],
    // Rajasthan
    jaipur: [26.9124, 75.7873],
    jodhpur: [26.2389, 73.0243],
    udaipur: [24.5854, 73.7125],
    kota: [25.2138, 75.8648],
    bikaner: [28.0229, 73.3119],
    ajmer: [26.4499, 74.6399],
    bhilwara: [25.3475, 74.6408],
    alwar: [27.5665, 76.6103],
    bharatpur: [27.2156, 77.4910],
    sikar: [27.6119, 75.1397],
    pali: [25.7711, 73.3233],
    tonk: [26.1657, 75.7901],
    churu: [28.3041, 74.9612],
    hanumangarh: [29.5818, 74.3294],
    ganganagar: [29.9038, 73.8772],
    sawaimadhopur: [26.0070, 76.3475],
    chittorgarh: [24.8799, 74.6290],
    dholpur: [26.7025, 77.8933],
    // Maharashtra
    nagpur: [21.1458, 79.0882],
    nashik: [19.9975, 73.7898],
    aurangabad: [19.8762, 75.3433],
    solapur: [17.6599, 75.9064],
    kolhapur: [16.7050, 74.2433],
    amravati: [20.9374, 77.7796],
    nanded: [19.1383, 77.3210],
    sangli: [16.8544, 74.5642],
    malegaon: [20.5598, 74.5255],
    jalgaon: [21.0027, 75.5660],
    akola: [20.7096, 76.9981],
    latur: [18.4088, 76.5604],
    dhule: [20.9042, 74.7742],
    ahmednagar: [19.0952, 74.7496],
    ichalkaranji: [16.6911, 74.4608],
    chandrapur: [19.9615, 79.2961],
    parbhani: [19.2613, 76.7754],
    jalna: [19.8342, 75.8816],
    bhusawal: [21.0417, 75.7859],
    panvel: [18.9888, 73.1101],
    ulhasnagar: [19.2215, 73.1645],
    thane: [19.2183, 72.9781],
    mira: [19.1136, 72.8697],
    bhiwandi: [19.2962, 73.0650],
    kalyan: [19.2403, 73.1305],
    vasai: [19.4081, 72.8397],
    satara: [17.6805, 74.0183],
    ratnagiri: [16.9902, 73.3120],
    // West Bengal
    howrah: [22.5958, 88.2636],
    durgapur: [23.5204, 87.3119],
    asansol: [23.6739, 86.9524],
    siliguri: [26.7271, 88.3953],
    bardhaman: [23.2324, 87.8616],
    malda: [25.0112, 88.1425],
    baharampur: [24.1047, 88.2515],
    habra: [22.8420, 88.6560],
    kharagpur: [22.3460, 87.2320],
    shantiniketan: [23.6825, 87.6844],
    darjeeling: [27.0410, 88.2663],
    coochbehar: [26.3234, 89.4522],
    jalpaiguri: [26.5167, 88.7333],
    alipurduar: [26.4833, 89.5167],
    // Tamil Nadu
    coimbatore: [11.0168, 76.9558],
    madurai: [9.9252, 78.1198],
    trichy: [10.7905, 78.7047],
    tiruchirappalli: [10.7905, 78.7047],
    salem: [11.6643, 78.1460],
    tirunelveli: [8.7139, 77.7567],
    thanjavur: [10.7869, 79.1378],
    vellore: [12.9165, 79.1325],
    kanchipuram: [12.8342, 79.7036],
    erode: [11.3410, 77.7172],
    tiruppur: [11.1085, 77.3411],
    dindigul: [10.3673, 77.9803],
    karur: [10.9601, 78.0766],
    udagamandalam: [11.4102, 76.6950],
    ooty: [11.4102, 76.6950],
    kanyakumari: [8.0873, 77.5385],
    nagercoil: [8.1773, 77.4343],
    cuddalore: [11.7447, 79.7680],
    // Karnataka
    mysore: [12.2958, 76.6394],
    mysuru: [12.2958, 76.6394],
    mangalore: [12.9141, 74.8560],
    hubli: [15.3647, 75.1240],
    hubballi: [15.3647, 75.1240],
    belgaum: [15.8497, 74.4977],
    belagavi: [15.8497, 74.4977],
    gulbarga: [17.3297, 76.8343],
    kalaburagi: [17.3297, 76.8343],
    davangere: [14.4644, 75.9218],
    bellary: [15.1394, 76.9214],
    ballari: [15.1394, 76.9214],
    bijapur: [16.8302, 75.7100],
    vijayapura: [16.8302, 75.7100],
    shimoga: [13.9299, 75.5681],
    shivamogga: [13.9299, 75.5681],
    tumakuru: [13.3415, 77.1010],
    raichur: [16.2076, 77.3463],
    bidar: [17.9104, 77.5199],
    hospet: [15.2689, 76.3909],
    hassan: [13.0031, 76.1004],
    chitradurga: [14.2111, 76.4002],
    // Kerala
    kochi: [9.9312, 76.2673],
    cochin: [9.9312, 76.2673],
    trivandrum: [8.5241, 76.9366],
    thiruvananthapuram: [8.5241, 76.9366],
    kozhikode: [11.2588, 75.7804],
    calicut: [11.2588, 75.7804],
    thrissur: [10.5276, 76.2144],
    trichur: [10.5276, 76.2144],
    kollam: [8.8932, 76.6141],
    quilon: [8.8932, 76.6141],
    alappuzha: [9.4981, 76.3388],
    alleppey: [9.4981, 76.3388],
    palakkad: [10.7867, 76.6548],
    palghat: [10.7867, 76.6548],
    kottayam: [9.5916, 76.5222],
    kannur: [11.8745, 75.3704],
    kasaragod: [12.4994, 74.9896],
    pathanamthitta: [9.2648, 76.7870],
    idukki: [9.8497, 76.9681],
    wayanad: [11.6854, 76.1320],
    // Andhra Pradesh & Telangana
    visakhapatnam: [17.6868, 83.2185],
    vijayawada: [16.5062, 80.6480],
    guntur: [16.3067, 80.4365],
    nellore: [14.4426, 79.9865],
    kurnool: [15.8281, 78.0373],
    kakinada: [16.9891, 82.2475],
    kadapa: [14.4675, 78.8242],
    anantapur: [14.6819, 77.6006],
    tirupati: [13.6288, 79.4192],
    rajahmundry: [17.0005, 81.8040],
    warangal: [17.9689, 79.5941],
    nizamabad: [18.6725, 78.0941],
    karimnagar: [18.4386, 79.1288],
    ramagundam: [18.7550, 79.4740],
    khammam: [17.2473, 80.1514],
    mahbubnagar: [16.7312, 78.0061],
    adilabad: [19.6643, 78.5320],
    nalgonda: [17.0586, 79.2670],
    // Bihar
    patna: [25.5941, 85.1376],
    gaya: [24.7969, 84.9922],
    bhagalpur: [25.2445, 86.9718],
    muzaffarpur: [26.1209, 85.3647],
    purnea: [25.7740, 87.4740],
    darbhanga: [26.1522, 85.8972],
    bihar: [25.0961, 85.3131],
    biharsharif: [25.1972, 85.5179],
    arrah: [25.5560, 84.6633],
    begusarai: [25.4185, 86.1339],
    katihar: [25.5335, 87.5834],
    munger: [25.3750, 86.4733],
    chapra: [25.7805, 84.7491],
    sahibganj: [25.2443, 87.6391],
    // Jharkhand
    ranchi: [23.3441, 85.3096],
    jamshedpur: [22.8046, 86.2029],
    dhanbad: [23.7956, 86.4304],
    bokaro: [23.6693, 86.1511],
    deoghar: [24.4850, 86.6950],
    hazaribagh: [23.9924, 85.3616],
    giridih: [24.1910, 86.3025],
    ramgarh: [23.6314, 85.5196],
    medininagar: [24.4435, 84.3750],
    dumka: [24.2676, 87.2496],
    phusro: [23.6967, 86.0244],
    // Odisha
    bhubaneswar: [20.2961, 85.8245],
    cuttack: [20.4625, 85.8829],
    rourkela: [22.2492, 84.8828],
    berhampur: [19.3149, 84.7941],
    sambalpur: [21.4669, 83.9812],
    puri: [19.8006, 85.8254],
    balasore: [21.4945, 86.9338],
    baripada: [21.7342, 86.8205],
    jharsuguda: [21.8554, 84.0062],
    bargarh: [21.3334, 83.6191],
    jeypore: [18.8563, 82.5716],
    // Chhattisgarh
    raipur: [21.2514, 81.6296],
    bilaspur: [22.0736, 82.1520],
    korba: [22.3458, 82.6963],
    durg: [21.1904, 81.2849],
    bhilai: [21.2092, 81.4285],
    raigarh: [21.8974, 83.3965],
    jagdalpur: [19.0791, 82.0357],
    ambikapur: [23.1188, 83.1954],
    dhamtari: [20.7072, 81.5489],
    // Punjab
    ludhiana: [30.9010, 75.8573],
    amritsar: [31.6340, 74.8723],
    jalandhar: [31.3260, 75.5792],
    patiala: [30.3398, 76.3869],
    bathinda: [30.2070, 74.9455],
    mohali: [30.7046, 76.7179],
    pathankot: [32.2748, 75.6528],
    hoshiarpur: [31.5320, 75.9170],
    batala: [31.8188, 75.2028],
    moga: [30.8158, 75.1715],
    abohar: [30.1445, 74.1993],
    malerkotla: [30.5309, 75.8795],
    khanna: [30.7044, 76.2219],
    phagwara: [31.2240, 75.7698],
    // Haryana
    gurgaon: [28.4595, 77.0266],
    gurugram: [28.4595, 77.0266],
    faridabad: [28.4089, 77.3178],
    panipat: [29.3909, 76.9635],
    ambala: [30.3782, 76.7767],
    yamunanagar: [30.1290, 77.2674],
    rohtak: [28.8955, 76.6066],
    hisar: [29.1492, 75.7217],
    karnal: [29.6857, 76.9905],
    sonipat: [28.9931, 77.0151],
    panchkula: [30.6942, 76.8606],
    bhiwani: [28.7930, 76.1395],
    sirsa: [29.5354, 75.0289],
    bahadurgarh: [28.6922, 76.9236],
    jind: [29.3154, 76.3160],
    thanesar: [29.9612, 76.8170],
    kaithal: [29.8013, 76.3996],
    rewari: [28.1990, 76.6193],
    // Assam
    guwahati: [26.1445, 91.7362],
    dispur: [26.1433, 91.7898],
    silchar: [24.8333, 92.7789],
    dibrugarh: [27.4728, 94.9120],
    jorhat: [26.7500, 94.2167],
    nagaon: [26.3500, 92.6833],
    tezpur: [26.6333, 92.8000],
    tinsukia: [27.5000, 95.3500],
    diphu: [25.8431, 93.4381],
    northlakhimpur: [27.2333, 94.1167],
    // North East
    imphal: [24.8170, 93.9368],
    shillong: [25.5788, 91.8933],
    aizawl: [23.7307, 92.7173],
    kohima: [25.6744, 94.1086],
    agartala: [23.8315, 91.2868],
    itanagar: [27.1026, 93.6952],
    gangtok: [27.3389, 88.6061],
    dimapur: [25.9117, 93.7217],
    // Jammu & Kashmir
    srinagar: [34.0837, 74.7973],
    jammu: [32.7266, 74.8570],
    anantnag: [33.7311, 75.1546],
    baramulla: [34.2090, 74.3428],
    sopore: [34.2994, 74.4669],
    kathua: [32.3700, 75.5200],
    udhampur: [32.9240, 75.1336],
    // Himachal Pradesh
    shimla: [31.1048, 77.1734],
    dharamshala: [32.2190, 76.3234],
    solan: [30.9086, 77.0965],
    mandi: [31.7074, 76.9324],
    palampur: [32.1145, 76.5316],
    una: [31.4643, 76.2691],
    nahan: [30.5582, 77.2950],
    hamirpur: [31.6862, 76.5214],
    // Uttarakhand
    dehradun: [30.3165, 78.0322],
    haridwar: [29.9450, 78.1642],
    rishikesh: [30.0869, 78.2676],
    roorkee: [29.8630, 77.8870],
    haldwani: [29.2183, 79.5130],
    rudrapur: [28.8070, 79.3925],
    kashipur: [29.2131, 78.9594],
    pithoragarh: [29.5825, 80.2182],
    mussoorie: [30.4598, 78.0644],
    nainital: [29.3803, 79.4636],
    // Goa
    panaji: [15.4909, 73.8278],
    goa: [15.2993, 74.1240],
    margao: [15.2730, 73.9573],
    vasco: [15.3984, 73.8117],
    mapusa: [15.5915, 73.8088],
    ponda: [15.4030, 74.0152],
    // Union Territories
    chandigarh: [30.7333, 76.7794],
    puducherry: [11.9416, 79.8083],
    pondicherry: [11.9416, 79.8083],
    portblair: [11.6234, 92.7265],
    andaman: [11.6234, 92.7265],
    kavaratti: [10.5626, 72.6359],
    silvassa: [20.2736, 73.0013],
    dadra: [20.3014, 72.9681],
    // Other major cities
    tirupati: [13.6288, 79.4192],
    shirdi: [19.7656, 74.4773],
    dwarka: [22.2394, 68.9678],
    somnath: [20.8892, 70.4010],
    kedarnath: [30.7352, 79.0669],
    badrinath: [30.7440, 79.4932],
    amarnath: [34.2140, 75.5007],
    vaishnodevi: [33.0294, 74.9483]
};

const getLatLon = (kundli) => {
    const lat = kundli.coordinates?.latitude;
    const lon = kundli.coordinates?.longitude;
    if (lat != null && lon != null && lat !== 0 && lon !== 0) return [lat, lon];
    const city = (kundli.placeOfBirth || '').trim().toLowerCase();
    const key = Object.keys(CITY_COORDS).find(k => city.includes(k));
    return key ? CITY_COORDS[key] : [23.2599, 77.4126]; // default Bhopal
};

/**
 * Fetch Lagna + Mahadasha data from external Kundli API.
 * Returns formatted string for Gemini prompt, or empty string on failure (AI still gets birth details).
 */
const fetchKundliDataForAI = async (kundli) => {
    if (!kundli) {
        console.warn('⚠️ Kundli API: No kundli object provided');
        return '';
    }
    try {
        const dob = new Date(kundli.dateOfBirth);
        const dateStr = dob.toISOString().slice(0, 10);
        const [hh, mm] = (kundli.timeOfBirth || '00:00').split(':');
        const hour = parseInt(hh, 10) || 0;
        const minute = parseInt(mm, 10) || 0;

        const userId = kundli.user?.toString?.() || kundli.user;
        const [lat, lon] = getLatLon(kundli);
        const body = {
            year: dob.getFullYear(),
            month: dob.getMonth() + 1,
            day: dob.getDate(),
            hour,
            minute,
            second: 0,
            timezone: 'Asia/Kolkata',
            dst: false,
            name: (kundli.fullName || '').trim(),
            gender: (kundli.gender || 'male').toLowerCase(),
            city: (kundli.placeOfBirth || '').trim(),
            lat,
            lon,
            save: true,
            jvk: userId || 'guest_user'
        };

        const url = `${KUNDLI_API_BASE}/userSearcheds/kundali`;

        console.log('📡 Kundli API: Calling', url);
        console.log('🔍 DEBUG Kundli API REQUEST BODY:', JSON.stringify(body, null, 2));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), KUNDLI_API_TIMEOUT_MS);

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const rawText = await res.text();
        if (!res.ok) {
            console.warn('⚠️ Kundli API returned', res.status, '| Body:', rawText?.slice(0, 200));
            return '';
        }

        let json;
        try {
            json = JSON.parse(rawText);
        } catch (parseErr) {
            console.warn('⚠️ Kundli API: Invalid JSON response');
            return '';
        }

        const data = json.data ?? json;
        const topKeys = typeof data === 'object' && data !== null ? Object.keys(data) : [];
        console.log('📡 Kundli API: Response keys:', topKeys);
        console.log('🔍 DEBUG Kundli API FULL RESPONSE:', JSON.stringify(json, null, 2));
        if (data?.lagna) {
            console.log('🔍 DEBUG Kundli API LAGNA:', JSON.stringify(data.lagna, null, 2));
        }

        const parts = [];

        const lagna = data?.lagna ?? data?.lagnaChart;
        if (lagna && typeof lagna === 'object') {
            parts.push('LAGNA (Birth Chart):');
            if (lagna.sign) parts.push(`- Lagna Sign: ${lagna.sign}`);
            const chart = lagna.chart ?? lagna.houses;
            if (Array.isArray(chart) && chart.length) {
                parts.push('- Houses:');
                chart.forEach((h, i) => {
                    const sign = h.sign ?? h.rashi ?? '';
                    const planets = Array.isArray(h.planets) ? h.planets.join(', ') : (h.planet ? [h.planet].flat().join(', ') : '');
                    parts.push(`  House ${(h.house ?? i + 1)}: ${sign}${planets ? ` | Planets: ${planets}` : ''}`);
                });
            }
            const planetDetails = lagna.planetDetails ?? lagna.planets ?? lagna.planetPosition;
            if (Array.isArray(planetDetails) && planetDetails.length) {
                parts.push('- Planet Details:');
                planetDetails.forEach(p => {
                    const name = p.name ?? p.planet ?? '';
                    const flags = [p.retrograde && 'retrograde', p.combust && 'combust', p.exalted && 'exalted', p.debilitated && 'debilitated'].filter(Boolean);
                    if (name) parts.push(`  ${name}: ${flags.length ? flags.join(', ') : 'normal'}`);
                });
            }
        }

        const vim = data?.vimshottari?.vimshottari ?? data?.vimshottari ?? data?.dasha;
        const mahaDasha = vim?.mahaDasha ?? vim?.maha_dasha ?? vim?.mahadasha;
        if (Array.isArray(mahaDasha) && mahaDasha.length) {
            parts.push('MAHADASHA (Vimshottari):');
            mahaDasha.forEach(m => {
                const planet = m.planet ?? m.name ?? '';
                const start = m.start ? new Date(m.start).toLocaleDateString('en-IN') : '';
                const end = (m.date ?? m.end) ? new Date(m.date ?? m.end).toLocaleDateString('en-IN') : '';
                if (planet) parts.push(`  ${planet}: ${start} - ${end}`);
            });
        }

        if (parts.length === 0) {
            console.warn('⚠️ Kundli API: No lagna/mahadasha in response. Top-level keys:', topKeys);
            return '';
        }
        console.log('✅ Kundli API: Fetched', parts.length, 'sections for Gemini');
        return '\n\nKundli Chart Data (from Kundli software):\n' + parts.join('\n');
    } catch (err) {
        console.warn('⚠️ Kundli API fetch failed:', err.message, err.cause || '');
        return '';
    }
};

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

        // Fetch Lagna + Mahadasha from Kundli API (async, non-blocking; fallback to birth details only on failure)
        const kundliChartData = await fetchKundliDataForAI(kundli);
        console.log('🔍 DEBUG Kundli Chart Data SENT TO GEMINI:', kundliChartData || '(empty - API fetch failed or no lagna)');

        // Build context with birth details + kundli chart data (lagna, mahadasha)
        const kundliContext = `
User's Birth Details (Kundli):
- Name: ${kundli.fullName}
- Date of Birth: ${new Date(kundli.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
- Time of Birth: ${kundli.timeOfBirth}
- Place of Birth: ${kundli.placeOfBirth}
- Gender: ${kundli.gender}
${kundliChartData}
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
5. IMPORTANT: Use the Lagna (house chart) and Mahadasha data provided above when they are available. Reference specific planets, houses, and dasha periods in your predictions
6. Keep responses CONCISE but COMPLETE - around 200-400 words
7. Use simple language that anyone can understand
8. Include relevant planetary positions, doshas, or yogas when applicable
9. Always end with positive guidance or remedies if discussing challenges
10. If the question is not about astrology, politely decline and suggest astrology-related topics
11. Do NOT write long paragraphs - be brief and to the point
12. MATCH the user's language exactly. English question = English answer. Hindi question = Hindi answer. Hinglish question = Hinglish answer. NEVER use Hindi/Hinglish for English questions.
13. CRITICAL: Always complete your response with a proper conclusion. NEVER leave a sentence unfinished.

User's Question: ${question}

Provide a COMPLETE astrological response in the SAME language as the question:`;

        console.log('🔍 DEBUG FULL PROMPT TO GEMINI (systemPrompt):');
        console.log('--- BEGIN GEMINI PROMPT ---');
        console.log(systemPrompt);
        console.log('--- END GEMINI PROMPT ---');

        const startTime = Date.now();
        const AI_TIMEOUT_MS = 90000;
        
        // Retry loop: always use Gemini 2.5 Pro for astrology analysis (no Flash fallback)
        let result;
        let lastError;
        
        for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
            const useModel = GEMINI_MODEL;
            const thinkBudget = 2524;
            
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
                    const delay = status === 429 ? 8000 * attempt : RETRY_DELAY_MS * attempt;
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
