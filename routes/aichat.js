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
    // More Indian cities (500+ additional)
    tirupati: [13.6288, 79.4192],
    shirdi: [19.7656, 74.4773],
    somnath: [20.8892, 70.4010],
    kedarnath: [30.7352, 79.0669],
    badrinath: [30.7440, 79.4932],
    amarnath: [34.2140, 75.5007],
    vaishnodevi: [33.0294, 74.9483],
    // MP more
    sehore: [23.2000, 77.0833],
    harda: [22.3333, 77.1000],
    hoshangabad: [22.7500, 77.7167],
    itarsi: [22.6167, 77.7500],
    mandsaur: [24.0718, 75.0699],
    raisen: [23.3333, 77.7833],
    seoni: [22.0833, 79.5500],
    balaghat: [21.8000, 80.1833],
    mandla: [22.6000, 80.3833],
    dindori: [22.9500, 81.0833],
    narsinghpur: [22.9500, 79.2000],
    hoshangabad: [22.7500, 77.7167],
    burhanpur: [21.3090, 76.2296],
    khandwa: [21.8247, 76.3526],
    khargone: [21.8230, 75.6125],
    barwani: [22.0333, 74.9000],
    alirajpur: [22.3000, 74.3500],
    jhabua: [22.7667, 74.6000],
    rajkot: [22.3039, 70.8022],
    // UP more
    bulandshahr: [28.4064, 77.8492],
    mathura: [27.4924, 77.6737],
    aligarh: [27.8974, 78.0880],
    hathras: [27.6000, 78.0500],
    etawah: [26.7767, 78.7392],
    mainpuri: [27.2333, 78.9167],
    firozabad: [27.1591, 78.3957],
    etah: [27.6333, 78.6667],
    kasganj: [27.8167, 78.6500],
    farrukhabad: [27.4000, 79.5667],
    kannauj: [27.0500, 79.9167],
    auraiya: [26.4667, 79.5167],
    shikohabad: [27.1167, 78.5833],
    firozabad: [27.1591, 78.3957],
    shahjahanpur: [27.8833, 79.9167],
    pilibhit: [28.6333, 79.8000],
    lakhimpur: [27.9500, 80.7667],
    sitapur: [27.5667, 80.6833],
    lakhimpurkheri: [28.5500, 80.3333],
    hardoi: [27.4167, 80.1167],
    unnao: [26.5500, 80.4833],
    raebareli: [26.2167, 81.2333],
    pratapgarh: [25.9000, 81.9500],
    sultanpur: [26.2649, 82.0727],
    amethi: [26.1500, 81.8167],
    barabanki: [26.9167, 81.2000],
    gonda: [27.1333, 81.9500],
    bahraich: [27.5833, 81.6000],
    shravasti: [27.5167, 82.0500],
    balrampur: [27.4333, 82.1833],
    siddharthnagar: [27.0333, 82.7167],
    maharajganj: [27.1333, 83.5667],
    gorakhpur: [26.7606, 83.3732],
    kushinagar: [26.7333, 83.8833],
    deoria: [26.5000, 83.7833],
    azamgarh: [26.0674, 83.1836],
    mau: [25.9500, 83.5667],
    ballia: [25.7667, 84.1500],
    ghazipur: [25.5833, 83.5667],
    chandauli: [25.2667, 83.2667],
    mirzapur: [25.1500, 82.5833],
    sonbhadra: [24.4000, 83.0500],
    allahabad: [25.4358, 81.8463],
    kaushambi: [25.3333, 81.3833],
    fatehpur: [25.9333, 80.8000],
    banda: [25.4833, 80.3333],
    chitrakoot: [25.2000, 80.8833],
    hamirpur: [25.9500, 80.1500],
    mahoba: [25.2833, 79.8667],
    jalaun: [26.1500, 79.3333],
    jhansi: [25.4484, 78.5685],
    lalitpur: [24.6833, 78.4167],
    // Gujarat more
    surat: [21.1702, 72.8311],
    bardoli: [21.1167, 73.1167],
    vyara: [21.1167, 73.4000],
    navsari: [20.9506, 72.9342],
    valsad: [20.6333, 72.9333],
    vapi: [20.3717, 72.9050],
    silvassa: [20.2736, 73.0013],
    daman: [20.4167, 72.8333],
    diu: [20.7141, 70.9876],
    bharuch: [21.7051, 72.9959],
    ankleshwar: [21.6333, 72.9833],
    dahod: [22.8333, 74.2500],
    godhra: [22.7756, 73.6147],
    modasa: [23.4667, 73.3000],
    himmatnagar: [23.6000, 72.9500],
    palanpur: [24.1711, 72.4380],
    banaskantha: [24.2500, 72.5000],
    patan: [23.8500, 72.1167],
    mahesana: [23.5880, 72.3693],
    kheda: [22.7500, 72.6833],
    anand: [22.5645, 72.9289],
    nadiad: [22.6939, 72.8614],
    khambhat: [22.3000, 72.6167],
    bhavnagar: [21.7645, 72.1519],
    palitana: [21.5167, 71.8333],
    amreli: [21.6000, 71.2167],
    junagadh: [21.5222, 70.4579],
    veraval: [20.9000, 70.3667],
    porbandar: [21.6417, 69.6293],
    jamnagar: [22.4707, 70.0577],
    dwarka: [22.2394, 68.9678],
    surendranagar: [23.1000, 71.6500],
    wadhwan: [22.7000, 71.6833],
    morbi: [22.8196, 70.8376],
    rajkot: [22.3039, 70.8022],
    gondal: [21.9667, 70.8000],
    jetpur: [21.7500, 70.6167],
    kutch: [23.2500, 69.6667],
    bhuj: [23.2420, 69.6669],
    mandvi: [22.8333, 69.3500],
    // Rajasthan more
    sawaimadhopur: [26.0070, 76.3475],
    karauli: [26.5000, 77.0167],
    dausa: [26.8833, 76.3333],
    jaipur: [26.9124, 75.7873],
    tonk: [26.1657, 75.7901],
    bundi: [25.4333, 75.6333],
    kota: [25.2138, 75.8648],
    baran: [25.1000, 76.5167],
    jhalawar: [24.6000, 76.1500],
    banswara: [23.5500, 74.4500],
    dungarpur: [23.8333, 73.7167],
    pratapgarh: [24.0333, 74.7833],
    udaipur: [24.5854, 73.7125],
    rajsamand: [25.0667, 73.8833],
    bhilwara: [25.3475, 74.6408],
    chittorgarh: [24.8799, 74.6290],
    neemuch: [24.4700, 74.8700],
    mandsaur: [24.0718, 75.0699],
    ratlam: [23.3343, 75.0376],
    jhabua: [22.7667, 74.6000],
    banswara: [23.5500, 74.4500],
    jaisalmer: [26.9117, 70.9229],
    barmer: [25.7500, 71.3833],
    jodhpur: [26.2389, 73.0243],
    jalore: [25.3500, 72.6167],
    sirohi: [24.8833, 72.8667],
    pali: [25.7711, 73.3233],
    nagaur: [27.2000, 73.7333],
    ajmer: [26.4499, 74.6399],
    beawar: [26.1000, 74.3167],
    pushkar: [26.4900, 74.5500],
    sikar: [27.6119, 75.1397],
    jhunjhunu: [28.1333, 75.4000],
    churu: [28.3041, 74.9612],
    bikaner: [28.0229, 73.3119],
    sri: [29.9038, 73.8772],
    hanumangarh: [29.5818, 74.3294],
    // Maharashtra more
    wardha: [20.7500, 78.6167],
    yavatmal: [20.4000, 78.1333],
    washim: [20.1000, 77.1500],
    hingoli: [19.7167, 77.1500],
    parbhani: [19.2613, 76.7754],
    nanded: [19.1383, 77.3210],
    latur: [18.4088, 76.5604],
    osmanabad: [18.1667, 76.0500],
    beed: [18.9833, 75.7667],
    jalna: [19.8342, 75.8816],
    aurangabad: [19.8762, 75.3433],
    jalgaon: [21.0027, 75.5660],
    dhule: [20.9042, 74.7742],
    nandurbar: [21.3667, 74.2500],
    buldhana: [20.5333, 76.1833],
    akola: [20.7096, 76.9981],
    washim: [20.1000, 77.1500],
    amravati: [20.9374, 77.7796],
    gondia: [21.4500, 80.2000],
    bhandara: [21.1667, 79.6500],
    chandrapur: [19.9615, 79.2961],
    gadchiroli: [20.1667, 80.0000],
    sindhudurg: [16.1667, 73.7500],
    ratnagiri: [16.9902, 73.3120],
    raigad: [18.2500, 73.4167],
    pune: [18.5204, 73.8567],
    satara: [17.6805, 74.0183],
    sangli: [16.8544, 74.5642],
    kolhapur: [16.7050, 74.2433],
    solapur: [17.6599, 75.9064],
    osmanabad: [18.1667, 76.0500],
    // West Bengal more
    bardhaman: [23.2324, 87.8616],
    asansol: [23.6739, 86.9524],
    durgapur: [23.5204, 87.3119],
    bankura: [23.2500, 87.0667],
    purulia: [23.3333, 86.3667],
    jhargram: [22.4500, 86.9833],
    midnapore: [22.4333, 87.3333],
    tamluk: [22.3000, 87.9167],
    haldia: [22.0333, 88.0667],
    contai: [21.7833, 87.7500],
    diamondharbour: [22.2000, 88.2000],
    barrackpore: [22.7667, 88.3667],
    serampore: [22.7500, 88.3500],
    chakdaha: [23.0833, 88.5167],
    ranaghat: [23.1833, 88.5833],
    krishnanagar: [23.4000, 88.5000],
    baharampur: [24.1047, 88.2515],
    malda: [25.0112, 88.1425],
    raiganj: [25.6167, 88.1167],
    balurghat: [25.2167, 88.7667],
    coochbehar: [26.3234, 89.4522],
    jalpaiguri: [26.5167, 88.7333],
    alipurduar: [26.4833, 89.5167],
    siliguri: [26.7271, 88.3953],
    darjeeling: [27.0410, 88.2663],
    kalimpong: [27.0667, 88.4833],
    // Tamil Nadu more
    ariyalur: [11.1333, 79.0833],
    chengalpattu: [12.6833, 79.9833],
    chennai: [13.0827, 80.2707],
    cuddalore: [11.7447, 79.7680],
    dharmapuri: [12.1333, 78.1667],
    dindigul: [10.3673, 77.9803],
    erode: [11.3410, 77.7172],
    kallakurichi: [11.7333, 78.9667],
    kanchipuram: [12.8342, 79.7036],
    kanniyakumari: [8.0873, 77.5385],
    karur: [10.9601, 78.0766],
    krishnagiri: [12.5333, 78.2167],
    madurai: [9.9252, 78.1198],
    mayiladuthurai: [11.1000, 79.6500],
    nagapattinam: [10.7667, 79.8333],
    namakkal: [11.2333, 78.1667],
    perambalur: [11.2333, 78.8833],
    pudukkottai: [10.3833, 78.8167],
    ramanathapuram: [9.3833, 78.8333],
    ranipet: [12.9333, 79.3333],
    salem: [11.6643, 78.1460],
    sivaganga: [9.8500, 78.4833],
    tenkasi: [8.9500, 77.3167],
    thanjavur: [10.7869, 79.1378],
    theni: [10.0167, 77.4833],
    thiruvallur: [13.1333, 79.9000],
    thiruvarur: [10.7667, 79.6500],
    tiruchirappalli: [10.7905, 78.7047],
    tirunelveli: [8.7139, 77.7567],
    tiruppur: [11.1085, 77.3411],
    tiruvannamalai: [12.2333, 79.0667],
    vellore: [12.9165, 79.1325],
    viluppuram: [11.9500, 79.5000],
    virudhunagar: [9.5833, 77.9500],
    // Karnataka more
    bagalkot: [16.1833, 75.7000],
    bangalore: [12.9716, 77.5946],
    belgaum: [15.8497, 74.4977],
    bellary: [15.1394, 76.9214],
    bidar: [17.9104, 77.5199],
    chamarajanagar: [11.9167, 76.9500],
    chikballapur: [13.4333, 77.7333],
    chikkamagaluru: [13.3167, 75.7667],
    chitradurga: [14.2111, 76.4002],
    dakshinakannada: [12.8333, 74.8333],
    davangere: [14.4644, 75.9218],
    dharwad: [15.4589, 75.0078],
    gadag: [15.4333, 75.6167],
    gulbarga: [17.3297, 76.8343],
    hassan: [13.0031, 76.1004],
    haveri: [14.8000, 75.4000],
    kodagu: [12.4167, 75.7333],
    kolar: [13.1333, 78.1333],
    koppal: [15.3500, 76.1500],
    mandya: [12.5167, 76.9000],
    mysore: [12.2958, 76.6394],
    raichur: [16.2076, 77.3463],
    ramanagara: [12.7167, 77.2833],
    shimoga: [13.9299, 75.5681],
    tumkur: [13.3415, 77.1010],
    udupi: [13.3389, 74.7451],
    uttarakannada: [14.6833, 74.4833],
    vijayapura: [16.8302, 75.7100],
    yadgir: [16.7667, 77.1333],
    // Kerala more
    alappuzha: [9.4981, 76.3388],
    ernakulam: [9.9312, 76.2673],
    idukki: [9.8497, 76.9681],
    kannur: [11.8745, 75.3704],
    kasaragod: [12.4994, 74.9896],
    kollam: [8.8932, 76.6141],
    kottayam: [9.5916, 76.5222],
    kozhikode: [11.2588, 75.7804],
    malappuram: [11.0500, 76.0833],
    palakkad: [10.7867, 76.6548],
    pathanamthitta: [9.2648, 76.7870],
    thiruvananthapuram: [8.5241, 76.9366],
    thrissur: [10.5276, 76.2144],
    wayanad: [11.6854, 76.1320],
    // Andhra & Telangana more
    adilabad: [19.6643, 78.5320],
    anantapur: [14.6819, 77.6006],
    chittoor: [13.2167, 79.1000],
    eastgodavari: [17.0000, 82.0000],
    guntur: [16.3067, 80.4365],
    kadapa: [14.4675, 78.8242],
    kakinada: [16.9891, 82.2475],
    karimnagar: [18.4386, 79.1288],
    khammam: [17.2473, 80.1514],
    krishna: [16.5000, 81.0000],
    kurnool: [15.8281, 78.0373],
    mahabubabad: [17.6000, 80.0000],
    mahabubnagar: [16.7312, 78.0061],
    medak: [18.0333, 78.2667],
    nalgonda: [17.0586, 79.2670],
    nellore: [14.4426, 79.9865],
    nizamabad: [18.6725, 78.0941],
    prakasam: [15.5000, 79.5000],
    srikakulam: [18.3000, 83.9000],
    vishakhapatnam: [17.6868, 83.2185],
    vizianagaram: [18.1167, 83.4167],
    warangal: [17.9689, 79.5941],
    westgodavari: [16.9333, 81.6667],
    // Bihar more
    arwal: [25.1500, 84.6833],
    aurangabad: [24.7500, 84.3667],
    banka: [24.8833, 86.9167],
    begusarai: [25.4185, 86.1339],
    bhagalpur: [25.2445, 86.9718],
    bhojpur: [25.5500, 84.6667],
    buxar: [25.5667, 83.9833],
    darbhanga: [26.1522, 85.8972],
    gopalganj: [26.4667, 84.4333],
    jamui: [24.9167, 86.2167],
    jehanabad: [25.2167, 84.9833],
    kaimur: [25.0500, 83.5833],
    khagaria: [25.5000, 86.4833],
    kishanganj: [26.1000, 87.9500],
    lakhisarai: [25.1667, 86.0833],
    madhepura: [25.9167, 86.7833],
    madhubani: [26.3500, 86.0833],
    munger: [25.3750, 86.4733],
    muzaffarpur: [26.1209, 85.3647],
    nalanda: [25.1333, 85.4500],
    nawada: [24.8833, 85.5333],
    paschimchamparan: [27.0833, 84.5000],
    patna: [25.5941, 85.1376],
    purbichamparan: [26.5000, 84.7500],
    purnia: [25.7740, 87.4740],
    rohtas: [24.5833, 83.9167],
    saharsa: [25.8833, 86.6000],
    samastipur: [25.8500, 85.7833],
    saran: [25.9167, 84.7500],
    sheikhpura: [25.1333, 85.8333],
    sheohar: [26.5167, 85.3000],
    sitamarhi: [26.6000, 85.4833],
    siwan: [26.2167, 84.3500],
    supaul: [26.1167, 86.6000],
    vaishali: [25.9833, 85.1333],
    // Jharkhand more
    chatra: [24.2000, 84.8667],
    garhwa: [24.1667, 83.8167],
    giridih: [24.1910, 86.3025],
    godda: [24.8333, 87.2167],
    gumla: [23.0500, 84.5333],
    hazaribagh: [23.9924, 85.3616],
    jamtara: [23.9667, 86.8000],
    khunti: [23.0667, 85.2833],
    koderma: [24.4667, 85.5833],
    latehar: [23.7500, 84.5000],
    lohardaga: [23.4333, 84.6833],
    pakur: [24.6333, 87.8500],
    palamu: [24.0333, 84.0667],
    sahibganj: [25.2443, 87.6391],
    seraikela: [22.7000, 86.1500],
    simdega: [22.6167, 84.5000],
    westsinghbhum: [22.5000, 85.5000],
    // Odisha more
    angul: [20.8333, 85.1000],
    balangir: [20.7167, 83.4833],
    balasore: [21.4945, 86.9338],
    bargarh: [21.3334, 83.6191],
    bhadrak: [21.0667, 86.5000],
    boudh: [20.8333, 84.3333],
    cuttack: [20.4625, 85.8829],
    deogarh: [21.5333, 84.7333],
    dhenkanal: [20.6667, 85.6000],
    gajapati: [19.3667, 84.2000],
    ganjam: [19.3833, 85.0500],
    jagatsinghpur: [20.2667, 86.1667],
    jajpur: [20.8500, 86.3333],
    jharsuguda: [21.8554, 84.0062],
    kalahandi: [19.9167, 83.1667],
    kandhamal: [20.4667, 84.2333],
    kendrapara: [20.5000, 86.4167],
    keonjhar: [21.6333, 85.5833],
    khordha: [20.1667, 85.6167],
    koraput: [18.8167, 82.7167],
    malkangiri: [18.3500, 81.9000],
    mayurbhanj: [22.2500, 86.6333],
    nabarangpur: [19.2333, 82.5500],
    nayagarh: [20.1333, 85.1000],
    nuapada: [20.4500, 82.6500],
    puri: [19.8006, 85.8254],
    rayagada: [19.1667, 83.4167],
    sambalpur: [21.4669, 83.9812],
    sonepur: [20.8333, 83.9167],
    sundargarh: [22.1167, 84.0333],
    // Chhattisgarh more
    balod: [20.7333, 81.2167],
    balodabazar: [21.6500, 82.1667],
    balrampur: [23.6000, 83.6167],
    bastar: [19.0833, 81.9500],
    bemetara: [21.7000, 81.5333],
    bijapur: [18.8333, 80.8167],
    bilaspur: [22.0736, 82.1520],
    dantewada: [18.9000, 81.3500],
    dhamtari: [20.7072, 81.5489],
    durg: [21.1904, 81.2849],
    gariaband: [20.6333, 82.0667],
    gaurella: [22.7500, 82.3833],
    janjgir: [22.0167, 82.5833],
    jashpur: [22.8833, 83.8833],
    kabirdham: [22.0833, 81.2000],
    kanker: [20.2667, 81.4833],
    kondagaon: [19.5833, 81.6667],
    korba: [22.3458, 82.6963],
    koriya: [23.3333, 82.1500],
    mungeli: [22.0667, 81.6833],
    narayanpur: [19.1167, 81.1333],
    raigarh: [21.8974, 83.3965],
    raipur: [21.2514, 81.6296],
    rajnandgaon: [21.1000, 81.0333],
    sukma: [17.2500, 81.7000],
    surajpur: [23.2167, 82.8500],
    surguja: [22.8833, 83.1000],
    // Punjab more
    fazilka: [30.4000, 74.0333],
    firozpur: [30.9500, 74.6000],
    gurdaspur: [32.0333, 75.4000],
    kapurthala: [31.3833, 75.3833],
    sangrur: [30.2500, 75.8500],
    tarn: [31.4500, 75.1167],
    // Haryana more
    faridabad: [28.4089, 77.3178],
    gurugram: [28.4595, 77.0266],
    nuh: [28.1167, 77.0000],
    palwal: [28.1333, 77.3167],
    rewari: [28.1990, 76.6193],
    // Assam more
    baksa: [26.6833, 91.3167],
    barpeta: [26.3167, 91.0000],
    biswanath: [26.7333, 92.8500],
    bongaigaon: [26.4833, 90.5667],
    cachar: [24.8000, 92.8000],
    charaideo: [26.9833, 93.4500],
    chirang: [26.5167, 90.5000],
    darrang: [26.5167, 91.9833],
    dhemaji: [27.4833, 94.5667],
    dhubri: [26.0167, 89.9833],
    dibrugarh: [27.4728, 94.9120],
    dimahasao: [25.5000, 93.0000],
    goalpara: [26.1667, 90.6167],
    golaghat: [26.5167, 93.9667],
    hailakandi: [24.6833, 92.5667],
    hojai: [26.0000, 92.8667],
    jorhat: [26.7500, 94.2167],
    kamrup: [26.1333, 91.3667],
    karbianglong: [26.1000, 93.5167],
    karimganj: [24.8667, 92.3500],
    kokrajhar: [26.4000, 90.2667],
    lakhimpur: [27.2333, 94.1167],
    majuli: [26.9500, 94.1667],
    marigaon: [26.2500, 92.3500],
    nagaon: [26.3500, 92.6833],
    nalbari: [26.4500, 91.4333],
    sivasagar: [26.9833, 94.6333],
    sonitpur: [26.6333, 92.8000],
    southsalpara: [24.8333, 92.5667],
    tinsukia: [27.5000, 95.3500],
    udalguri: [26.7500, 92.1000],
    westkarbianglong: [26.0000, 92.5000],
    // ========== WORLD CITIES (250+ major) ==========
    // Nepal
    kathmandu: [27.7172, 85.3240],
    pokhara: [28.2096, 83.9856],
    lalitpur: [27.6710, 85.3240],
    bharatpur: [27.6833, 84.4333],
    biratnagar: [26.4833, 87.2833],
    birgunj: [27.0000, 84.8833],
    butwal: [27.7000, 83.4500],
    dharan: [26.8167, 87.2833],
    bhaktapur: [27.6710, 85.4290],
    janakpur: [26.7167, 85.9167],
    nepalgunj: [28.0500, 81.6167],
    hetauda: [27.4167, 85.0333],
    itahari: [26.6667, 87.2833],
    dhading: [27.8667, 84.9167],
    kavre: [27.6333, 85.5833],
    chitwan: [27.5833, 84.5000],
    // South Asia
    dhaka: [23.8103, 90.4125],
    chittagong: [22.3569, 91.7832],
    khulna: [22.8456, 89.5403],
    sylhet: [24.8949, 91.8687],
    colombo: [6.9271, 79.8612],
    kandy: [7.2906, 80.6337],
    islamabad: [33.6844, 73.0479],
    karachi: [24.8607, 67.0011],
    lahore: [31.5204, 74.3587],
    faisalabad: [31.4180, 73.0790],
    rawalpindi: [33.6007, 73.0679],
    multan: [30.1575, 71.5249],
    peshawar: [34.0080, 71.5785],
    quetta: [30.1798, 66.9750],
    // Middle East
    dubai: [25.2048, 55.2708],
    abudhabi: [24.4539, 54.3773],
    sharjah: [25.3573, 55.4033],
    riyadh: [24.7136, 46.6753],
    jeddah: [21.5433, 39.1728],
    mecca: [21.4225, 39.8262],
    medina: [24.5247, 39.5692],
    doha: [25.2854, 51.5310],
    kuwait: [29.3759, 47.9774],
    manama: [26.2285, 50.5860],
    muscat: [23.5880, 58.3829],
    tehran: [35.6892, 51.3890],
    baghdad: [33.3152, 44.3661],
    damascus: [33.5138, 36.2765],
    beirut: [33.8938, 35.5018],
    amman: [31.9454, 35.9284],
    jerusalem: [31.7683, 35.2137],
    telaviv: [32.0853, 34.7818],
    istanbul: [41.0082, 28.9784],
    ankara: [39.9334, 32.8597],
    izmir: [38.4237, 27.1428],
    // Europe
    london: [51.5074, -0.1278],
    paris: [48.8566, 2.3522],
    berlin: [48.1351, 11.5820],
    madrid: [40.4168, -3.7038],
    rome: [41.9028, 12.4964],
    amsterdam: [52.3676, 4.9041],
    brussels: [50.8503, 4.3517],
    vienna: [48.2082, 16.3738],
    zurich: [47.3769, 8.5417],
    geneva: [46.2044, 6.1432],
    munich: [48.1351, 11.5820],
    frankfurt: [50.1109, 8.6821],
    hamburg: [53.5511, 9.9937],
    cologne: [50.9375, 6.9603],
    barcelona: [41.3851, 2.1734],
    milan: [45.4642, 9.1900],
    lisbon: [38.7223, -9.1393],
    athens: [37.9838, 23.7275],
    dublin: [53.3498, -6.2603],
    copenhagen: [55.6761, 12.5683],
    stockholm: [59.3293, 18.0686],
    oslo: [59.9139, 10.7522],
    helsinki: [60.1695, 24.9354],
    warsaw: [52.2297, 21.0122],
    prague: [50.0755, 14.4378],
    budapest: [47.4979, 19.0402],
    bucharest: [44.4268, 26.1025],
    sofia: [42.6977, 23.3219],
    moscow: [55.7558, 37.6173],
    saintpetersburg: [59.9343, 30.3351],
    kiev: [50.4501, 30.5234],
    kyiv: [50.4501, 30.5234],
    minsk: [53.9045, 27.5615],
    // Asia Pacific
    singapore: [1.3521, 103.8198],
    hongkong: [22.3193, 114.1694],
    tokyo: [35.6762, 139.6503],
    osaka: [34.6937, 135.5023],
    kyoto: [35.0116, 135.7681],
    yokohama: [35.4437, 139.6380],
    nagoya: [35.1815, 136.9066],
    seoul: [37.5665, 126.9780],
    busan: [35.1028, 129.0403],
    beijing: [39.9042, 116.4074],
    shanghai: [31.2304, 121.4737],
    guangzhou: [23.1291, 113.2644],
    shenzhen: [22.5431, 114.0579],
    hongkong: [22.3193, 114.1694],
    taipei: [25.0330, 121.5654],
    bangkok: [13.7563, 100.5018],
    kualalumpur: [3.1390, 101.6869],
    jakarta: [-6.2088, 106.8456],
    manila: [14.5995, 120.9842],
    hanoi: [21.0285, 105.8542],
    hochiminh: [10.8231, 106.6297],
    saigon: [10.8231, 106.6297],
    phnompenh: [11.5564, 104.9282],
    yangon: [16.8661, 96.1951],
    vientiane: [17.9757, 102.6331],
    kathmandu: [27.7172, 85.3240],
    thimphu: [27.4728, 89.6390],
    dhaka: [23.8103, 90.4125],
    sydney: [-33.8688, 151.2093],
    melbourne: [-37.8136, 144.9631],
    brisbane: [-27.4698, 153.0251],
    perth: [-31.9505, 115.8605],
    auckland: [-36.8509, 174.7645],
    wellington: [-41.2866, 174.7756],
    // Americas
    newyork: [40.7128, -74.0060],
    losangeles: [34.0522, -118.2437],
    chicago: [41.8781, -87.6298],
    houston: [29.7604, -95.3698],
    miami: [25.7617, -80.1918],
    sanfrancisco: [37.7749, -122.4194],
    washington: [38.9072, -77.0369],
    boston: [42.3601, -71.0589],
    seattle: [47.6062, -122.3321],
    denver: [39.7392, -104.9903],
    atlanta: [33.7490, -84.3880],
    dallas: [32.7767, -97.7970],
    phoenix: [33.4484, -112.0740],
    lasvegas: [36.1699, -115.1398],
    toronto: [43.6532, -79.3832],
    vancouver: [49.2827, -123.1207],
    montreal: [45.5017, -73.5673],
    mexicocity: [19.4326, -99.1332],
    cancun: [21.1619, -86.8515],
    guadalajara: [20.6597, -103.3496],
    monterrey: [25.6866, -100.3161],
    saopaulo: [-23.5505, -46.6333],
    riodejaneiro: [-22.9068, -43.1729],
    buenosaires: [-34.6037, -58.3816],
    lima: [-12.0464, -77.0428],
    bogota: [4.7110, -74.0721],
    caracas: [10.4806, -66.9036],
    santiago: [-33.4489, -70.6693],
    // Africa
    cairo: [30.0444, 31.2357],
    johannesburg: [-26.2041, 28.0473],
    capetown: [-33.9249, 18.4241],
    'cape town': [-33.9249, 18.4241],
    lagos: [6.5244, 3.3792],
    nairobi: [-1.2921, 36.8219],
    accra: [5.6037, -0.1870],
    casablanca: [33.5731, -7.5898],
    tunis: [36.8065, 10.1815],
    algiers: [36.7538, 3.0588],
    addisababa: [9.0320, 38.7469],
    daressalaam: [-6.7924, 39.2083],
    'dar es salaam': [-6.7924, 39.2083],
    kampala: [0.3476, 32.5825],
    // UK & Ireland
    manchester: [53.4808, -2.2426],
    birmingham: [52.4862, -1.8904],
    leeds: [53.8008, -1.5491],
    liverpool: [53.4084, -2.9916],
    glasgow: [55.8642, -4.2518],
    edinburgh: [55.9533, -3.1883],
    belfast: [54.5973, -5.9301],
    cardiff: [51.4816, -3.1791],
    bristol: [51.4545, -2.5879],
    newcastle: [54.9783, -1.6178],
    nottingham: [52.9548, -1.1581],
    sheffield: [53.3811, -1.4701],
    cork: [51.8985, -8.4756],
    galway: [53.2707, -9.0492]
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

ANALYSIS FRAMEWORK (follow these steps when analyzing the question):

1. RADICALITY (Question validity): Check if the question is fit for judgement. Valid if: Lagnesh connected with Moon; Lagnesh strong; Moon in Lagna/Kendra/Trikona; Ascendant not severely afflicted. If absent, note the question may be unreliable.

2. LAGNA: Examine Ascendant sign (movable/fixed/dual), planets in it, benefic/malefic aspects. Benefic in Lagna → success; Malefic in Lagna → obstacles; Benefic aspect → favorable; Malefic aspect → difficulties.

3. LAGNESH (Ascendant lord): Check strength. Exalted/own sign → certain success; In Kendra/Trine → success; Debilitated → obstacles; Combust → weakness/failure.

4. MOON: Key indicator. In Kendra/Trine → success; Aspected by benefics → favorable; 8th house → trouble; 12th house → delay.

5. RELEVANT HOUSE: Map question to house (Marriage→7, Career→10, Wealth→2/11, Travel→9, Children→5, Property→4). Analyze planets in that house, house lord strength, aspects.

6. LAGNESH–HOUSE LORD RELATION: Critical. If Lagnesh and house lord have conjunction, mutual aspect, or exchange → task likely to succeed. No connection → difficulty.

7. ASPECT TYPE: Applying aspect (Ithasala) → success; Separating/broken aspect (Isarpha) → failure or delay.

8. OBSTACLES: Note when: Moon in 8th; relevant house with malefics; Lagna with Papakartari Yoga: Lagna trapped between malefics.

9. TIMING: Movable sign → quick; Fixed sign → delay; Dual sign → moderate.

Instructions:
1. ONLY provide astrological insights based on the user's Kundli
2. Be respectful and compassionate in your responses
3. Give practical advice along with astrological predictions
4. If asked about career, marriage, health, etc., ALWAYS relate your answer to their birth chart and planetary positions
5. IMPORTANT: Use the Lagna (house chart) and Mahadasha data provided above when they are available. Reference specific planets, houses, and dasha periods in your predictions
6. Apply the ANALYSIS FRAMEWORK above when analyzing each question—structure your response around these checks where relevant
7. Keep responses CONCISE but COMPLETE - around 200-400 words
8. Use simple language that anyone can understand
9. Include relevant planetary positions, doshas, or yogas when applicable
10. Always end with positive guidance or remedies if discussing challenges
11. If the question is not about astrology, politely decline and suggest astrology-related topics
12. Do NOT write long paragraphs - be brief and to the point
13. MATCH the user's language exactly. English question = English answer. Hindi question = Hindi answer. Hinglish question = Hinglish answer. NEVER use Hindi/Hinglish for English questions.
14. CRITICAL: Always complete your response with a proper conclusion. NEVER leave a sentence unfinished.

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
