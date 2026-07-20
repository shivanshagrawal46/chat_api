/**
 * generateMoneyAstrologyDataset.js
 *
 * SOURCE OF TRUTH for the Money/Wealth Astrology Dataset.
 *
 * This is the money counterpart of generateCareerAstrologyDataset.js /
 * generateMarriageAstrologyDataset.js. Same lagna-aware Yoga engine, same
 * fast O(1)-lookup dataset design - the structural difference is that money
 * classically has TWO significator houses instead of one:
 *   - 2nd house  (Dhana Bhava)  - accumulated wealth, savings, family resources
 *   - 11th house (Labha Bhava)  - gains, income, profits, fulfilment of desires
 * So wherever the career dataset used "10th house/10th lord" (one factor),
 * and the marriage dataset used "7th house/7th lord" (one factor), this
 * money dataset uses BOTH "2nd house/2nd lord" AND "11th house/11th lord"
 * (two parallel factors).
 *
 * Factors covered:
 *   1. Lagna lord + the house it occupies                -> lagnaLordInHouse.json
 *   2. 2nd lord (Dhana significator) + its house           -> secondLordInHouse.json
 *   2b. 11th lord (Labha significator) + its house          -> eleventhLordInHouse.json
 *   3. Planets sitting in the 1st house                    -> planetInHouse1.json
 *   4. Planets sitting in the 2nd house                    -> planetInHouse2.json
 *   4b. Planets sitting in the 11th house                   -> planetInHouse11.json
 *   5. Conjunctions + classical/lagna-aware Yogas in the    -> conjunctions.json,
 *        1st, 2nd AND 11th house                                classicalPairYogas.json,
 *                                                                firstHouseConjunctionYogas.json,
 *                                                                secondHouseConjunctionYogas.json,
 *                                                                eleventhHouseConjunctionYogas.json
 *   6. Lagna lord's, 2nd lord's, AND 11th lord's placement   -> lagnaLordInNavamsa(House).json,
 *        in Navamsa (D-9) - by SIGN and by HOUSE NUMBER          secondLordInNavamsa(House).json,
 *                                                                eleventhLordInNavamsa(House).json
 *
 * Run:  node scripts/generateMoneyAstrologyDataset.js
 * Output: data/astrology/money/*.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'data', 'astrology', 'money');

// ---------------------------------------------------------------------------
// 1. ATOMIC DATA: PLANETS (Grahas) - identity + MONEY/WEALTH significations
// ---------------------------------------------------------------------------

const PLANETS = {
    sun: {
        order: 1,
        name: { en: 'Sun', hi: 'सूर्य (Surya)' },
        nature: 'malefic',
        traits: {
            en: 'a fiery, authoritative, and self-assured energy centered on dignity, leadership, and self-respect',
            hi: 'एक तेजस्वी, अधिकारपूर्ण और आत्मविश्वासी ऊर्जा, जो प्रतिष्ठा, नेतृत्व और आत्म-सम्मान पर केंद्रित है'
        },
        moneyAreas: {
            en: ['wealth and standing tied to authority, government or leadership positions', 'income linked to status, power, or public office', 'inherited family wealth and paternal assets', 'earnings that grow with self-respect-driven, disciplined career choices', 'a tendency towards status-driven or prestige-linked spending'],
            hi: ['अधिकार, सरकार या नेतृत्व पदों से जुड़ी संपत्ति और प्रतिष्ठा', 'प्रतिष्ठा, सत्ता या सार्वजनिक पद से जुड़ी आय', 'विरासत में मिली पारिवारिक संपत्ति और पैतृक संपत्ति', 'आत्म-सम्मान-प्रेरित, अनुशासित करियर विकल्पों के साथ बढ़ती आय', 'प्रतिष्ठा-प्रेरित खर्च की प्रवृत्ति']
        },
        friends: ['moon', 'mars', 'jupiter'],
        neutrals: ['mercury'],
        enemies: ['venus', 'saturn', 'rahu', 'ketu']
    },
    moon: {
        order: 2,
        name: { en: 'Moon', hi: 'चंद्रमा (Chandra)' },
        nature: 'benefic',
        traits: {
            en: 'a receptive, nurturing, and emotionally sensitive energy centered on public connection and fluctuating moods',
            hi: 'एक ग्रहणशील, पोषणकारी और भावनात्मक रूप से संवेदनशील ऊर्जा, जो जनसंपर्क और उतार-चढ़ाव वाली मनोदशा पर केंद्रित है'
        },
        moneyAreas: {
            en: ['income through public dealing, hospitality, or caregiving-related business', 'wealth via liquids, dairy, food, or beverage trade', 'fluctuating income that waxes and wanes like the Moon itself', 'earnings connected with popularity, public image, or maternal inheritance', 'financial decisions strongly influenced by emotion and intuition'],
            hi: ['जनसंपर्क, आतिथ्य या देखभाल-संबंधी व्यवसाय से आय', 'तरल पदार्थ, डेयरी, खाद्य या पेय व्यापार से संपत्ति', 'आय जो चंद्रमा की तरह घटती-बढ़ती रहती है', 'लोकप्रियता, सार्वजनिक छवि या मातृ विरासत से जुड़ी कमाई', 'भावना और अंतर्ज्ञान से दृढ़ता से प्रभावित वित्तीय निर्णय']
        },
        friends: ['sun', 'mercury'],
        neutrals: ['mars', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'],
        enemies: []
    },
    mars: {
        order: 3,
        name: { en: 'Mars', hi: 'मंगल (Mangal)' },
        nature: 'malefic',
        traits: {
            en: 'a bold, energetic, and competitive drive centered on courage, quick action, and technical mastery',
            hi: 'एक साहसी, ऊर्जावान और प्रतिस्पर्धी प्रवृत्ति, जो साहस, त्वरित कार्यवाही और तकनीकी दक्षता पर केंद्रित है'
        },
        moneyAreas: {
            en: ['wealth through real estate, land, and property dealings', 'income via engineering, technical trades, or competitive ventures', 'sudden financial gains (or losses) from bold, impulsive risk-taking', 'earnings through entrepreneurial courage and quick decision-making', 'assets built through physical labour, machinery, or defence-related work'],
            hi: ['रियल एस्टेट, भूमि और संपत्ति सौदों से संपत्ति', 'इंजीनियरिंग, तकनीकी व्यापार या प्रतिस्पर्धी उद्यमों से आय', 'साहसिक, आवेगी जोखिम लेने से अचानक वित्तीय लाभ (या हानि)', 'उद्यमशील साहस और त्वरित निर्णय-क्षमता से कमाई', 'शारीरिक श्रम, मशीनरी या रक्षा-संबंधी कार्य से निर्मित संपत्ति']
        },
        friends: ['sun', 'moon', 'jupiter'],
        neutrals: ['venus', 'saturn', 'rahu', 'ketu'],
        enemies: ['mercury']
    },
    mercury: {
        order: 4,
        name: { en: 'Mercury', hi: 'बुध (Budh)' },
        nature: 'benefic',
        traits: {
            en: 'a sharp, analytical, and communicative intelligence centered on trade, logic, and versatility',
            hi: 'एक तीक्ष्ण, विश्लेषणात्मक और संचार-कुशल बुद्धि, जो व्यापार, तर्क और बहुमुखी प्रतिभा पर केंद्रित है'
        },
        moneyAreas: {
            en: ['wealth through business, trading, and commerce', 'income via writing, media, consulting, or analytical fields', 'multiple, diversified income streams rather than a single source', 'earnings built through negotiation skill and quick-witted decision-making', 'financial acumen strong enough to manage and grow money efficiently'],
            hi: ['व्यापार, व्यवसाय और वाणिज्य से संपत्ति', 'लेखन, मीडिया, परामर्श या विश्लेषणात्मक क्षेत्रों से आय', 'एक ही स्रोत के बजाय कई, विविध आय स्रोत', 'बातचीत कौशल और त्वरित-बुद्धि निर्णय-क्षमता से निर्मित कमाई', 'धन को कुशलतापूर्वक प्रबंधित और बढ़ाने में सक्षम वित्तीय कुशाग्रता']
        },
        friends: ['sun', 'venus'],
        neutrals: ['mars', 'jupiter', 'saturn', 'rahu', 'ketu'],
        enemies: ['moon']
    },
    jupiter: {
        order: 5,
        name: { en: 'Jupiter', hi: 'बृहस्पति / गुरु (Guru)' },
        nature: 'benefic',
        traits: {
            en: 'a wise, expansive, and principled energy centered on wisdom, growth, and ethical abundance',
            hi: 'एक ज्ञानी, विस्तारवादी और सिद्धांतनिष्ठ ऊर्जा, जो ज्ञान, विकास और नैतिक समृद्धि पर केंद्रित है'
        },
        moneyAreas: {
            en: ['one of the single greatest natural indicators (karaka) of wealth and abundance in the chart', 'income through teaching, law, finance, banking, or advisory work', 'steady, ethically-earned, long-term prosperity rather than quick gains', 'wealth accompanied by generosity, philanthropy, and good financial judgement', 'growth through wise, long-term investment rather than speculation'],
            hi: ['कुंडली में धन और समृद्धि के सबसे बड़े प्राकृतिक संकेतकों (कारक) में से एक', 'शिक्षण, कानून, वित्त, बैंकिंग या सलाहकारी कार्य से आय', 'त्वरित लाभ के बजाय स्थिर, नैतिक रूप से अर्जित, दीर्घकालिक समृद्धि', 'उदारता, परोपकार और अच्छे वित्तीय निर्णय के साथ संपत्ति', 'सट्टेबाज़ी के बजाय बुद्धिमान, दीर्घकालिक निवेश से वृद्धि']
        },
        friends: ['sun', 'moon', 'mars'],
        neutrals: ['saturn', 'rahu', 'ketu'],
        enemies: ['mercury', 'venus']
    },
    venus: {
        order: 6,
        name: { en: 'Venus', hi: 'शुक्र (Shukra)' },
        nature: 'benefic',
        traits: {
            en: 'a graceful, artistic, and comfort-loving charm centered on luxury, beauty, and pleasurable living',
            hi: 'एक सुंदर, कलात्मक और सुख-प्रिय आकर्षण, जो विलासिता, सौंदर्य और आनंददायक जीवन पर केंद्रित है'
        },
        moneyAreas: {
            en: ['wealth through arts, entertainment, fashion, or the beauty/luxury industry', 'income via partnerships, marriage-linked assets, or creative/aesthetic pursuits', 'a comfortable, pleasure-oriented lifestyle funded by steady earnings', 'earnings tied to hospitality, design, or high-value/luxury goods', 'a natural tendency towards indulgent or comfort-driven spending that needs balancing'],
            hi: ['कला, मनोरंजन, फैशन या सौंदर्य/विलासिता उद्योग से संपत्ति', 'साझेदारी, विवाह-संबंधी संपत्ति या रचनात्मक/सौंदर्यपरक कार्यों से आय', 'स्थिर कमाई से वित्तपोषित एक आरामदायक, सुख-उन्मुख जीवनशैली', 'आतिथ्य, डिज़ाइन या उच्च-मूल्य/विलासिता वस्तुओं से जुड़ी कमाई', 'भोग-विलासी या सुख-प्रेरित खर्च की एक स्वाभाविक प्रवृत्ति जिसे संतुलित करने की आवश्यकता है']
        },
        friends: ['mercury', 'saturn'],
        neutrals: ['mars', 'jupiter', 'rahu', 'ketu'],
        enemies: ['sun', 'moon']
    },
    saturn: {
        order: 7,
        name: { en: 'Saturn', hi: 'शनि (Shani)' },
        nature: 'malefic',
        traits: {
            en: 'a disciplined, patient, and hard-working nature centered on structure, service, and long-term perseverance',
            hi: 'एक अनुशासित, धैर्यवान और परिश्रमी स्वभाव, जो संरचना, सेवा और दीर्घकालिक दृढ़ता पर केंद्रित है'
        },
        moneyAreas: {
            en: ['wealth built slowly and steadily through discipline, labour, and long-term commitment', 'income via mining, land, agriculture, or heavy/structured industries', 'delayed but exceptionally durable and stable wealth once established', 'a frugal, careful approach to spending and saving', 'earnings through service-oriented, structured, or long-tenure professions'],
            hi: ['अनुशासन, श्रम और दीर्घकालिक प्रतिबद्धता के माध्यम से धीरे-धीरे और स्थिर रूप से निर्मित संपत्ति', 'खनन, भूमि, कृषि या भारी/संरचित उद्योगों से आय', 'स्थापित होने के बाद विलंबित परन्तु असाधारण रूप से टिकाऊ और स्थिर संपत्ति', 'खर्च और बचत के प्रति एक मितव्ययी, सतर्क दृष्टिकोण', 'सेवा-उन्मुख, संरचित या दीर्घकालिक व्यवसायों से कमाई']
        },
        friends: ['mercury', 'venus'],
        neutrals: ['jupiter', 'rahu', 'ketu'],
        enemies: ['sun', 'moon', 'mars']
    },
    rahu: {
        order: 8,
        name: { en: 'Rahu', hi: 'राहु (Rahu)' },
        nature: 'malefic (shadow)',
        traits: {
            en: 'an ambitious, unconventional, and obsessive drive centered on sudden rise, speculation, and boundary-crossing gains',
            hi: 'एक महत्वाकांक्षी, अपरंपरागत और गहन प्रवृत्ति, जो अचानक उन्नति, सट्टेबाज़ी और सीमा-पार लाभ पर केंद्रित है'
        },
        moneyAreas: {
            en: ['sudden, unconventional, or foreign-sourced wealth', 'speculative gains through stock markets, trading, or high-risk ventures', 'wealth through technology, foreign trade, or emerging/disruptive fields', 'dramatic financial rises (and equally dramatic falls) if unchecked', 'an obsessive drive to accumulate wealth that benefits from grounding and caution'],
            hi: ['अचानक, अपरंपरागत या विदेशी स्रोत से संपत्ति', 'शेयर बाज़ार, ट्रेडिंग या उच्च-जोखिम उद्यमों से सट्टा लाभ', 'तकनीक, विदेश व्यापार या उभरते/विघटनकारी क्षेत्रों से संपत्ति', 'बिना संयम के नाटकीय वित्तीय वृद्धि (और उतनी ही नाटकीय गिरावट)', 'संपत्ति संचय की एक गहन प्रवृत्ति जिसे स्थिरता और सावधानी से लाभ होता है']
        },
        friends: ['mercury', 'venus', 'saturn'],
        neutrals: ['jupiter'],
        enemies: ['sun', 'moon', 'mars']
    },
    ketu: {
        order: 9,
        name: { en: 'Ketu', hi: 'केतु (Ketu)' },
        nature: 'malefic (shadow)',
        traits: {
            en: 'a detached, research-oriented, and intuitive depth centered on renunciation, specialization, and hidden knowledge',
            hi: 'एक विरक्त, शोध-उन्मुख और सहज गहराई, जो त्याग, विशेषज्ञता और गूढ़ ज्ञान पर केंद्रित है'
        },
        moneyAreas: {
            en: ['relative detachment from material wealth or reduced interest in active accumulation', 'sudden, unexpected financial gains or losses, often outside one\'s direct control', 'wealth through research, specialised technical work, or spiritual/occult fields', 'a tendency to give away or lose focus on money matters unless consciously managed', 'past-life-linked financial karma - either unexpected windfalls or recurring drains'],
            hi: ['भौतिक संपत्ति से अपेक्षाकृत विरक्ति या सक्रिय संचय में घटी हुई रुचि', 'अक्सर व्यक्ति के प्रत्यक्ष नियंत्रण से बाहर, अचानक, अप्रत्याशित वित्तीय लाभ या हानि', 'शोध, विशिष्ट तकनीकी कार्य या आध्यात्मिक/गूढ़ क्षेत्रों से संपत्ति', 'जब तक सचेत रूप से प्रबंधित न किया जाए, धन के मामलों में ध्यान खोने या दान करने की प्रवृत्ति', 'पूर्व-जन्म से जुड़ा वित्तीय कर्म - या तो अप्रत्याशित लाभ या बार-बार होने वाली हानि']
        },
        friends: ['mars', 'venus', 'saturn'],
        neutrals: ['jupiter', 'mercury'],
        enemies: ['sun', 'moon']
    }
};

const LORD_PLANETS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];
const ALL_PLANETS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];

// ---------------------------------------------------------------------------
// 2. ATOMIC DATA: RASHIS (Zodiac Signs) - identical astronomical facts
// ---------------------------------------------------------------------------

const RASHIS = {
    aries: { order: 1, name: { en: 'Aries', hi: 'मेष (Mesh)' }, lord: 'mars', element: 'fire', quality: 'movable' },
    taurus: { order: 2, name: { en: 'Taurus', hi: 'वृषभ (Vrishabh)' }, lord: 'venus', element: 'earth', quality: 'fixed' },
    gemini: { order: 3, name: { en: 'Gemini', hi: 'मिथुन (Mithun)' }, lord: 'mercury', element: 'air', quality: 'dual' },
    cancer: { order: 4, name: { en: 'Cancer', hi: 'कर्क (Kark)' }, lord: 'moon', element: 'water', quality: 'movable' },
    leo: { order: 5, name: { en: 'Leo', hi: 'सिंह (Simha)' }, lord: 'sun', element: 'fire', quality: 'fixed' },
    virgo: { order: 6, name: { en: 'Virgo', hi: 'कन्या (Kanya)' }, lord: 'mercury', element: 'earth', quality: 'dual' },
    libra: { order: 7, name: { en: 'Libra', hi: 'तुला (Tula)' }, lord: 'venus', element: 'air', quality: 'movable' },
    scorpio: { order: 8, name: { en: 'Scorpio', hi: 'वृश्चिक (Vrishchik)' }, lord: 'mars', element: 'water', quality: 'fixed' },
    sagittarius: { order: 9, name: { en: 'Sagittarius', hi: 'धनु (Dhanu)' }, lord: 'jupiter', element: 'fire', quality: 'dual' },
    capricorn: { order: 10, name: { en: 'Capricorn', hi: 'मकर (Makar)' }, lord: 'saturn', element: 'earth', quality: 'movable' },
    aquarius: { order: 11, name: { en: 'Aquarius', hi: 'कुंभ (Kumbh)' }, lord: 'saturn', element: 'air', quality: 'fixed' },
    pisces: { order: 12, name: { en: 'Pisces', hi: 'मीन (Meen)' }, lord: 'jupiter', element: 'water', quality: 'dual' }
};

const RASHI_KEYS_BY_ORDER = Object.keys(RASHIS).sort((a, b) => RASHIS[a].order - RASHIS[b].order);

const ELEMENT_TRAIT = {
    fire: { en: 'brings a bold, fast-moving, and self-driven quality to financial growth', hi: 'वित्तीय वृद्धि में एक साहसी, तेज़ी से बढ़ने वाला और आत्म-प्रेरित गुण लाता है' },
    earth: { en: 'brings a practical, stable, and asset-building quality to financial growth', hi: 'वित्तीय वृद्धि में एक व्यावहारिक, स्थिर और संपत्ति-निर्माण गुण लाता है' },
    air: { en: 'brings an intellectual, networking, and idea-driven quality to financial growth', hi: 'वित्तीय वृद्धि में एक बौद्धिक, नेटवर्किंग और विचार-प्रेरित गुण लाता है' },
    water: { en: 'brings an intuitive, fluctuating, and emotionally-linked quality to financial growth', hi: 'वित्तीय वृद्धि में एक सहज, उतार-चढ़ाव वाला और भावनात्मक रूप से जुड़ा गुण लाता है' }
};

const QUALITY_TRAIT = {
    movable: { en: 'income and wealth-events tend to move and change relatively quickly', hi: 'आय और संपत्ति से जुड़ी घटनाएँ अपेक्षाकृत तेज़ी से बदलती हैं' },
    fixed: { en: 'wealth builds slowly but becomes exceptionally stable and long-lasting once accumulated', hi: 'संपत्ति धीरे-धीरे बनती है परन्तु संचित होने के बाद असाधारण रूप से स्थिर और दीर्घकालिक हो जाती है' },
    dual: { en: 'income tends to come from varied, multiple, or flexible sources rather than one', hi: 'आय एक के बजाय विविध, कई या लचीले स्रोतों से आती है' }
};

// ---------------------------------------------------------------------------
// 3. ATOMIC DATA: HOUSES (Bhavas) - MONEY/WEALTH-relevant significations
// ---------------------------------------------------------------------------

const HOUSES = {
    1: {
        name: { en: '1st House (Lagna/Ascendant)', hi: 'प्रथम भाव (लग्न)' },
        signification: { en: 'self, personality, physical vitality, and overall approach to life', hi: 'स्वयं, व्यक्तित्व, शारीरिक ऊर्जा और जीवन के प्रति समग्र दृष्टिकोण' },
        domainAngle: { en: 'how your own personality, confidence, and health form the foundation of your overall earning and money-handling capacity', hi: 'आपका व्यक्तित्व, आत्मविश्वास और स्वास्थ्य किस प्रकार आपकी समग्र कमाई और धन-प्रबंधन क्षमता की नींव बनाते हैं' },
        category: 'kendra-trikona'
    },
    2: {
        name: { en: '2nd House (Dhana Bhava)', hi: 'द्वितीय भाव (धन भाव)' },
        signification: { en: 'accumulated wealth, family resources, savings, and speech', hi: 'संचित संपत्ति, पारिवारिक संसाधन, बचत और वाणी' },
        domainAngle: { en: 'this is the primary house of accumulated wealth itself - bank balance, savings, family assets, and net worth', hi: 'यह स्वयं संचित संपत्ति का प्रमुख भाव है - बैंक बैलेंस, बचत, पारिवारिक संपत्ति और कुल निवल संपत्ति' },
        category: 'dhana'
    },
    3: {
        name: { en: '3rd House (Parakrama Bhava)', hi: 'तृतीय भाव (पराक्रम भाव)' },
        signification: { en: 'self-effort, courage, communication skills, and short journeys', hi: 'स्वप्रयास, साहस, संचार कौशल और छोटी यात्राएँ' },
        domainAngle: { en: 'wealth generated through self-driven hustle, courageous business initiatives, and support from siblings', hi: 'स्वप्रेरित परिश्रम, साहसिक व्यावसायिक पहल और भाई-बहनों के समर्थन से उत्पन्न संपत्ति' },
        category: 'upachaya'
    },
    4: {
        name: { en: '4th House (Sukha Bhava)', hi: 'चतुर्थ भाव (सुख भाव)' },
        signification: { en: 'comfort, real estate, vehicles, and emotional/domestic foundation', hi: 'सुख-सुविधा, संपत्ति, वाहन और भावनात्मक/घरेलू आधार' },
        domainAngle: { en: 'wealth through property, real estate, vehicles, and fixed/inherited assets', hi: 'संपत्ति, रियल एस्टेट, वाहन और स्थिर/विरासत में मिली संपत्ति से धन' },
        category: 'kendra-trikona'
    },
    5: {
        name: { en: '5th House (Vidya/Purva Punya Bhava)', hi: 'पंचम भाव (विद्या/पूर्व पुण्य भाव)' },
        signification: { en: 'creativity, intelligence, education, and speculative ability', hi: 'रचनात्मकता, बुद्धिमत्ता, शिक्षा और सट्टा/अटकल क्षमता' },
        domainAngle: { en: 'wealth through speculation (stocks/trading), intelligence-driven income, and education-linked earning potential', hi: 'सट्टेबाज़ी (शेयर/ट्रेडिंग), बुद्धि-प्रेरित आय और शिक्षा से जुड़ी कमाई क्षमता से धन' },
        category: 'kendra-trikona'
    },
    6: {
        name: { en: '6th House (Ripu/Rina Bhava)', hi: 'षष्ठम भाव (रिपु/ऋण भाव)' },
        signification: { en: 'debts, competition, service, and overcoming obstacles', hi: 'ऋण, प्रतिस्पर्धा, सेवा और बाधाओं पर विजय' },
        domainAngle: { en: 'debts, loans, financial disputes/litigation, and income through service or competitive employment', hi: 'ऋण, कर्ज़, वित्तीय विवाद/मुकदमेबाज़ी और सेवा या प्रतिस्पर्धी रोज़गार से आय' },
        category: 'upachaya'
    },
    7: {
        name: { en: '7th House (Kalatra/Vyapara Bhava)', hi: 'सप्तम भाव (कलत्र/व्यापार भाव)' },
        signification: { en: 'partnerships, business dealings, trade, and public interaction', hi: 'साझेदारी, व्यावसायिक लेन-देन, व्यापार और सार्वजनिक संपर्क' },
        domainAngle: { en: 'wealth through business partnerships, trade, and financial contribution from a spouse or collaborator', hi: 'व्यावसायिक साझेदारी, व्यापार और जीवनसाथी या सहयोगी से वित्तीय योगदान से धन' },
        category: 'kendra-trikona'
    },
    8: {
        name: { en: '8th House (Ayu/Mrityu Bhava)', hi: 'अष्टम भाव (आयु/मृत्यु भाव)' },
        signification: { en: 'transformation, insurance, inheritance, and hidden/sudden matters', hi: 'रूपांतरण, बीमा, विरासत और छिपे/अचानक विषय' },
        domainAngle: { en: 'sudden wealth or losses, inheritance, insurance payouts, and hidden or in-laws\' financial resources', hi: 'अचानक धन-लाभ या हानि, विरासत, बीमा भुगतान, और छिपे या ससुराल पक्ष के वित्तीय संसाधन' },
        category: 'dusthana'
    },
    9: {
        name: { en: '9th House (Bhagya Bhava)', hi: 'नवम भाव (भाग्य भाव)' },
        signification: { en: 'fortune, higher education, philosophy, and long-distance/foreign connections', hi: 'भाग्य, उच्च शिक्षा, दर्शनशास्त्र और दूरस्थ/विदेश संबंध' },
        domainAngle: { en: 'wealth through fortune/luck, paternal assets, foreign income, and dharmic or higher-education-linked earning', hi: 'भाग्य, पैतृक संपत्ति, विदेशी आय, और धर्म या उच्च-शिक्षा से जुड़ी कमाई से धन' },
        category: 'kendra-trikona'
    },
    10: {
        name: { en: '10th House (Karma Bhava)', hi: 'दशम भाव (कर्म भाव)' },
        signification: { en: 'career, profession, public status, and authority', hi: 'करियर, व्यवसाय, सार्वजनिक प्रतिष्ठा और अधिकार' },
        domainAngle: { en: 'wealth generated through career, professional reputation, and public recognition translating into earnings', hi: 'करियर, व्यावसायिक प्रतिष्ठा और आय में परिवर्तित होने वाली सार्वजनिक पहचान से उत्पन्न धन' },
        category: 'kendra-trikona'
    },
    11: {
        name: { en: '11th House (Labha Bhava)', hi: 'एकादश भाव (लाभ भाव)' },
        signification: { en: 'gains, income, large networks, and fulfilment of desires', hi: 'लाभ, आय, विस्तृत नेटवर्क और इच्छाओं की पूर्ति' },
        domainAngle: { en: 'this is the primary house of gains and income itself - profits, realised earnings, and fulfilment of financial ambitions', hi: 'यह स्वयं लाभ और आय का प्रमुख भाव है - मुनाफ़ा, वास्तविक कमाई और वित्तीय महत्वाकांक्षाओं की पूर्ति' },
        category: 'labha'
    },
    12: {
        name: { en: '12th House (Vyaya Bhava)', hi: 'द्वादश भाव (व्यय भाव)' },
        signification: { en: 'foreign lands, expenditure, isolation, and spirituality', hi: 'विदेश, व्यय, एकांत और आध्यात्म' },
        domainAngle: { en: 'expenditure, foreign income/investments, losses, and charitable or hidden financial outflows', hi: 'व्यय, विदेशी आय/निवेश, हानि, और धर्मार्थ या छिपा हुआ वित्तीय बहिर्वाह' },
        category: 'dusthana'
    }
};

const HOUSE_CATEGORY_GUIDANCE = {
    'kendra-trikona': {
        en: 'This is a Kendra/Trikona (angular or trinal) placement - one of the strongest positions in the chart. It gives direct, visible, and relatively stable financial growth, and this factor should be treated as a major pillar of strength in your wealth story.',
        hi: 'यह एक केंद्र/त्रिकोण स्थान है - कुंडली की सबसे मज़बूत स्थितियों में से एक। यह प्रत्यक्ष, दृश्यमान और अपेक्षाकृत स्थिर वित्तीय वृद्धि देता है, और इसे आपकी धन-कहानी में एक प्रमुख शक्ति-स्तंभ माना जाना चाहिए।'
    },
    upachaya: {
        en: 'This is an Upachaya (growth-oriented) placement. Financial results may be modest early on but keep improving steadily with age, effort and experience - long-term persistence here pays off substantially.',
        hi: 'यह एक उपचय (वृद्धि-उन्मुख) स्थान है। प्रारंभ में वित्तीय परिणाम सामान्य हो सकते हैं परन्तु उम्र, प्रयास और अनुभव के साथ लगातार सुधरते जाते हैं - यहाँ दीर्घकालिक दृढ़ता का फल बहुत अच्छा मिलता है।'
    },
    dusthana: {
        en: 'This is a Dusthana (challenging) placement. It can bring debts, sudden losses, or unconventional financial circumstances - but it often rewards depth, insurance/inheritance-linked gains, or foreign sources with unexpectedly strong results once initial hurdles are crossed.',
        hi: 'यह एक दुःस्थान (चुनौतीपूर्ण) स्थान है। इसमें ऋण, अचानक हानि या अपरंपरागत वित्तीय परिस्थितियाँ आ सकती हैं - परन्तु प्रारंभिक बाधाओं को पार करने के बाद यह प्रायः गहराई, बीमा/विरासत-संबंधी लाभ, या विदेशी स्रोतों को अप्रत्याशित रूप से मज़बूत परिणामों से पुरस्कृत करता है।'
    },
    dhana: {
        en: 'This is the 2nd house itself - the primary seat of accumulated wealth. A well-placed factor here directly and powerfully strengthens savings, family assets, and overall net worth.',
        hi: 'यह स्वयं द्वितीय भाव है - संचित संपत्ति का प्रमुख स्थान। यहाँ एक अच्छी तरह स्थित कारक सीधे और शक्तिशाली ढंग से बचत, पारिवारिक संपत्ति और कुल निवल संपत्ति को मज़बूत करता है।'
    },
    labha: {
        en: 'This is the 11th house itself - the primary seat of gains and income realisation. A well-placed factor here directly and powerfully strengthens actual cash-flow, profits, and fulfilment of financial goals.',
        hi: 'यह स्वयं एकादश भाव है - लाभ और आय-प्राप्ति का प्रमुख स्थान। यहाँ एक अच्छी तरह स्थित कारक सीधे और शक्तिशाली ढंग से वास्तविक नकदी-प्रवाह, मुनाफ़े और वित्तीय लक्ष्यों की पूर्ति को मज़बूत करता है।'
    }
};

// ---------------------------------------------------------------------------
// 4. HELPERS (mirrors generateCareerAstrologyDataset.js / generateMarriageAstrologyDataset.js)
// ---------------------------------------------------------------------------

const KENDRA_HOUSES = [1, 4, 7, 10];
const TRIKONA_HOUSES = [1, 5, 9];
const DUSTHANA_HOUSES = [6, 8, 12];
const DHANA_HOUSES = [2, 11];
const KENDRA_EXCL_LAGNA = [4, 7, 10];
const TRIKONA_EXCL_LAGNA = [5, 9];

function relationOf(planetKey, otherKey) {
    if (planetKey === otherKey) return 'own';
    const p = PLANETS[planetKey];
    if (p.friends.includes(otherKey)) return 'friend';
    if (p.enemies.includes(otherKey)) return 'enemy';
    return 'neutral';
}

function pairKey(a, b) {
    const [x, y] = [a, b].sort((p, q) => PLANETS[p].order - PLANETS[q].order);
    return `${x}_${y}`;
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function writeJson(fileName, data) {
    ensureDir(OUT_DIR);
    const filePath = path.join(OUT_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`  wrote ${path.relative(process.cwd(), filePath)} (${Array.isArray(data) ? data.length : Object.keys(data).length} entries)`);
}

function ordinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
}

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function elementHi(element) { return { fire: 'अग्नि', earth: 'पृथ्वी', air: 'वायु', water: 'जल' }[element]; }
function qualityHi(quality) { return { movable: 'चर', fixed: 'स्थिर', dual: 'द्विस्वभाव' }[quality]; }

function computeHouseLordsForLagna(lagnaKey) {
    const lagnaOrder = RASHIS[lagnaKey].order;
    const houseLords = {};
    for (let house = 1; house <= 12; house++) {
        const signOrder = ((lagnaOrder - 1 + house - 1) % 12) + 1;
        const signKey = RASHI_KEYS_BY_ORDER.find((k) => RASHIS[k].order === signOrder);
        houseLords[house] = RASHIS[signKey].lord;
    }
    return houseLords;
}

function computeYogakaraka(houseLords) {
    for (const planetKey of LORD_PLANETS) {
        const owned = Object.keys(houseLords).map(Number).filter((h) => houseLords[h] === planetKey);
        const ownsKendra = owned.some((h) => KENDRA_EXCL_LAGNA.includes(h));
        const ownsTrikona = owned.some((h) => TRIKONA_EXCL_LAGNA.includes(h));
        if (ownsKendra && ownsTrikona) return planetKey;
    }
    return null;
}

function classifyYoga(houseLords, planetA, planetB) {
    const housesOf = (p) => Object.keys(houseLords).map(Number).filter((h) => houseLords[h] === p);
    const aH = housesOf(planetA);
    const bH = housesOf(planetB);
    const overlaps = (arr, list) => arr.some((h) => list.includes(h));

    const aKendra = overlaps(aH, KENDRA_HOUSES), aTrikona = overlaps(aH, TRIKONA_HOUSES), aDusthana = overlaps(aH, DUSTHANA_HOUSES), aDhana = overlaps(aH, DHANA_HOUSES);
    const bKendra = overlaps(bH, KENDRA_HOUSES), bTrikona = overlaps(bH, TRIKONA_HOUSES), bDusthana = overlaps(bH, DUSTHANA_HOUSES), bDhana = overlaps(bH, DHANA_HOUSES);

    if ((aKendra && bTrikona) || (aTrikona && bKendra)) return 'raja_yoga';
    if ((aDhana && (bDhana || bTrikona)) || (bDhana && (aDhana || aTrikona))) return 'dhana_yoga';
    if (aDusthana && bDusthana && !aKendra && !aTrikona && !bKendra && !bTrikona) return 'vipreet_raja_yoga';
    return 'general';
}

const RELATION_TONE_LORD = {
    en: {
        own: 'This is the planet occupying its own significations most naturally, giving clean, straightforward results without internal conflict.',
        friend: 'The house lord is a natural friend of this placement, which smoothens outcomes and adds mutual support between personality and the matter at hand.',
        neutral: 'The relationship here is neutral, giving moderate, situation-dependent results that respond well to conscious effort.',
        enemy: 'There is some natural friction in this placement, which can create internal conflict or extra struggle before results manifest - deliberate effort and remedies help considerably.'
    },
    hi: {
        own: 'यह ग्रह अपनी ही विशेषताओं में सबसे स्वाभाविक रूप से स्थित है, जिससे बिना किसी आंतरिक संघर्ष के स्पष्ट और सीधे परिणाम मिलते हैं।',
        friend: 'यह भाव-स्वामी इस स्थिति का स्वाभाविक मित्र है, जो परिणामों को सरल बनाता है और व्यक्तित्व व संबंधित विषय के बीच परस्पर सहयोग जोड़ता है।',
        neutral: 'यहाँ संबंध तटस्थ है, जो मध्यम, परिस्थिति-निर्भर परिणाम देता है जो सजग प्रयास से अच्छी प्रतिक्रिया देते हैं।',
        enemy: 'इस स्थिति में कुछ स्वाभाविक टकराव है, जो परिणाम मिलने से पहले आंतरिक द्वंद्व या अतिरिक्त संघर्ष उत्पन्न कर सकता है - सचेत प्रयास और उपाय काफी सहायक होते हैं।'
    }
};

const RELATION_STRENGTH_TONE = {
    en: {
        own: 'This is the planet\'s own sign in the Navamsa, a position of great strength - it strongly confirms and stabilises the wealth indications from the Rashi (D-1) chart, supporting long-term financial success.',
        friend: 'This is a friendly sign for the planet in the Navamsa, which supports and strengthens the wealth promise seen in the birth chart, adding stability to financial growth.',
        neutral: 'This is a neutral sign for the planet in the Navamsa, giving moderate, mixed support to financial growth - outcomes depend significantly on other chart factors and personal effort.',
        enemy: 'This is a challenging (enemy) sign for the planet in the Navamsa, which can weaken or delay the wealth promise, bringing extra struggle, competition, or instability before financial success is achieved.'
    },
    hi: {
        own: 'नवांश में यह ग्रह की अपनी राशि है, जो अत्यंत बल की स्थिति है - यह राशि (डी-1) कुंडली से दिखने वाले धन संकेतों की दृढ़ता से पुष्टि और स्थिरता प्रदान करती है, जिससे दीर्घकालिक वित्तीय सफलता को समर्थन मिलता है।',
        friend: 'नवांश में यह ग्रह के लिए एक मित्र राशि है, जो जन्म कुंडली में दिखने वाले धन वादे का समर्थन और सुदृढ़ीकरण करती है, तथा वित्तीय वृद्धि में स्थिरता जोड़ती है।',
        neutral: 'नवांश में यह ग्रह के लिए एक तटस्थ राशि है, जो वित्तीय वृद्धि को मध्यम, मिश्रित समर्थन देती है - परिणाम अन्य कुंडली कारकों और व्यक्तिगत प्रयास पर काफी हद तक निर्भर करते हैं।',
        enemy: 'नवांश में यह ग्रह के लिए एक चुनौतीपूर्ण (शत्रु) राशि है, जो धन वादे को कमज़ोर या विलंबित कर सकती है, और वित्तीय सफलता मिलने से पहले अतिरिक्त संघर्ष, प्रतिस्पर्धा या अस्थिरता ला सकती है।'
    }
};

// ---------------------------------------------------------------------------
// 5. GENERATE: reference tables (planets, rashis, houses)
// ---------------------------------------------------------------------------

function generateReferenceTables() {
    writeJson('planets.json', PLANETS);
    writeJson('rashis.json', RASHIS);
    writeJson('houses.json', HOUSES);
}

// ---------------------------------------------------------------------------
// 6. GENERATE: lagnaBase.json - for each of the 12 lagnas, the fixed facts
//    (2nd house/2nd lord AND 11th house/11th lord, per the money technique)
// ---------------------------------------------------------------------------

function generateLagnaBase() {
    const out = {};
    RASHI_KEYS_BY_ORDER.forEach((lagnaKey) => {
        const lagna = RASHIS[lagnaKey];
        const lagnaLord = lagna.lord;

        const secondIndex = ((lagna.order - 1 + 1) % 12) + 1; // 2nd house = 1 sign ahead of lagna
        const secondSignKey = RASHI_KEYS_BY_ORDER.find((k) => RASHIS[k].order === secondIndex);
        const secondLord = RASHIS[secondSignKey].lord;

        const eleventhIndex = ((lagna.order - 1 + 10) % 12) + 1; // 11th house = 10 signs ahead of lagna
        const eleventhSignKey = RASHI_KEYS_BY_ORDER.find((k) => RASHIS[k].order === eleventhIndex);
        const eleventhLord = RASHIS[eleventhSignKey].lord;

        const houseLords = computeHouseLordsForLagna(lagnaKey);
        const yogakaraka = computeYogakaraka(houseLords);

        out[lagnaKey] = {
            lagna: lagnaKey,
            lagnaName: RASHIS[lagnaKey].name,
            lagnaLord,
            lagnaLordName: PLANETS[lagnaLord].name,
            secondHouseSign: secondSignKey,
            secondHouseSignName: RASHIS[secondSignKey].name,
            secondLord,
            secondLordName: PLANETS[secondLord].name,
            eleventhHouseSign: eleventhSignKey,
            eleventhHouseSignName: RASHIS[eleventhSignKey].name,
            eleventhLord,
            eleventhLordName: PLANETS[eleventhLord].name,
            houseLords,
            yogakaraka,
            note: {
                en: `For ${RASHIS[lagnaKey].name.en} Lagna, the Ascendant (Lagna) lord is ${PLANETS[lagnaLord].name.en}. The 2nd house (Dhana/wealth) falls in ${RASHIS[secondSignKey].name.en}, ruled by ${PLANETS[secondLord].name.en}, and the 11th house (Labha/gains) falls in ${RASHIS[eleventhSignKey].name.en}, ruled by ${PLANETS[eleventhLord].name.en}.${yogakaraka ? ` ${PLANETS[yogakaraka].name.en} is the Yogakaraka (a planet that rules both a Kendra and a Trikona house) for this Lagna - one of the most auspicious planets in this chart.` : ''}`,
                hi: `${RASHIS[lagnaKey].name.hi} लग्न के लिए, लग्नेश ${PLANETS[lagnaLord].name.hi} है। द्वितीय भाव (धन) ${RASHIS[secondSignKey].name.hi} राशि में पड़ता है, जिसके स्वामी ${PLANETS[secondLord].name.hi} हैं, और एकादश भाव (लाभ) ${RASHIS[eleventhSignKey].name.hi} राशि में पड़ता है, जिसके स्वामी ${PLANETS[eleventhLord].name.hi} हैं।${yogakaraka ? ` ${PLANETS[yogakaraka].name.hi} इस लग्न के लिए योगकारक ग्रह है (जो केंद्र और त्रिकोण दोनों भावों का स्वामी है) - यह इस कुंडली के सबसे शुभ ग्रहों में से एक है।` : ''}`
            }
        };
    });
    writeJson('lagnaBase.json', out);
    return out;
}

// ---------------------------------------------------------------------------
// 7. GENERATE: lagnaLordInHouse.json, secondLordInHouse.json, eleventhLordInHouse.json
//    (7 lords x 12 houses, for each of the three lord-roles)
// ---------------------------------------------------------------------------

function generateLordInHouseTable(role) {
    // role: 'lagna' | 'second' | 'eleventh'
    const out = {};
    const roleMeta = {
        lagna: { fileName: 'lagnaLordInHouse.json', labelEn: 'Lagna (Ascendant) lord', labelHi: 'लग्नेश', domainEn: 'core personality and approach to money', domainHi: 'मूल व्यक्तित्व और धन के प्रति दृष्टिकोण' },
        second: { fileName: 'secondLordInHouse.json', labelEn: '2nd house (Dhana/wealth) lord', labelHi: 'द्वितीयेश (धन भाव स्वामी)', domainEn: 'your accumulated wealth and savings', domainHi: 'आपकी संचित संपत्ति और बचत' },
        eleventh: { fileName: 'eleventhLordInHouse.json', labelEn: '11th house (Labha/gains) lord', labelHi: 'एकादशेश (लाभ भाव स्वामी)', domainEn: 'your actual income, gains, and cash-flow', domainHi: 'आपकी वास्तविक आय, लाभ और नकदी-प्रवाह' }
    };
    const meta = roleMeta[role];

    LORD_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        for (let house = 1; house <= 12; house++) {
            const h = HOUSES[house];
            const key = `${planetKey}_${house}`;
            const guidance = HOUSE_CATEGORY_GUIDANCE[h.category];
            const areasEn = planet.moneyAreas.en.slice(0, 3).join('; ');
            const areasHi = planet.moneyAreas.hi.slice(0, 3).join('; ');

            const en = `Your ${meta.labelEn} ${planet.name.en} is placed in the ${house}${ordinalSuffix(house)} house (${h.name.en}). This means ${meta.domainEn} works through ${h.signification.en}. ${capitalize(planet.traits.en)} - specifically this shapes ${h.domainAngle.en}. This favours ${areasEn}. ${guidance.en}`;
            const hi = `आपका ${meta.labelHi} ${planet.name.hi} ${house}वें भाव (${h.name.hi}) में स्थित है। इसका अर्थ है कि ${meta.domainHi} ${h.signification.hi} के माध्यम से कार्य करती है। यह ${planet.traits.hi} है - जो विशेष रूप से ${h.domainAngle.hi} को आकार देती है। यह ${areasHi} के लिए अनुकूल है। ${guidance.hi}`;

            out[key] = { key, role, planet: planetKey, planetName: planet.name, house, houseName: h.name, text: { en, hi } };
        }
    });
    writeJson(meta.fileName, out);
}

// ---------------------------------------------------------------------------
// 8. GENERATE: planetInHouse1.json, planetInHouse2.json, planetInHouse11.json (9 grahas each)
// ---------------------------------------------------------------------------

function generatePlanetInHouseTable(houseNum) {
    const out = {};
    const h = HOUSES[houseNum];
    const fileNames = { 1: 'planetInHouse1.json', 2: 'planetInHouse2.json', 11: 'planetInHouse11.json' };
    const houseLabelEn = { 1: '1st house (Lagna)', 2: '2nd house (Dhana/wealth house)', 11: '11th house (Labha/gains house)' }[houseNum];
    const houseLabelHi = { 1: 'प्रथम भाव (लग्न)', 2: 'द्वितीय भाव (धन भाव)', 11: 'एकादश भाव (लाभ भाव)' }[houseNum];

    ALL_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        const areasEn = planet.moneyAreas.en.slice(0, 3).join('; ');
        const areasHi = planet.moneyAreas.hi.slice(0, 3).join('; ');

        let en, hi;
        if (houseNum === 1) {
            en = `${planet.name.en} placed in the 1st house (Lagna) sits right on the Ascendant and directly colours your personality, physical presence, and overall approach to earning and handling money. It carries ${planet.traits.en}. This placement inclines you towards ${areasEn}, and your own nature strongly shapes your financial journey.`;
            hi = `${planet.name.hi} का प्रथम भाव (लग्न) में स्थित होना सीधे लग्न पर बैठकर आपके व्यक्तित्व, शारीरिक उपस्थिति और धन कमाने व संभालने के समग्र दृष्टिकोण को रंग देता है। इसमें ${planet.traits.hi} है। यह स्थिति आपको ${areasHi} की ओर प्रवृत्त करती है, और आपका अपना स्वभाव आपकी वित्तीय यात्रा को दृढ़ता से आकार देता है।`;
        } else {
            en = `${planet.name.en} placed directly in the ${houseLabelEn} has a strong, immediate influence on your finances, since it occupies one of the two primary wealth houses. It carries ${planet.traits.en}. This placement strongly favours ${areasEn}.`;
            hi = `${planet.name.hi} का सीधे ${houseLabelHi} में स्थित होना आपके वित्त पर एक मज़बूत, तत्काल प्रभाव डालता है, क्योंकि यह दो प्रमुख धन भावों में से एक में स्थित है। इसमें ${planet.traits.hi} है। यह स्थिति ${areasHi} के लिए अत्यंत अनुकूल है।`;
        }

        out[planetKey] = { key: planetKey, planet: planetKey, planetName: planet.name, house: houseNum, houseName: h.name, text: { en, hi } };
    });
    writeJson(fileNames[houseNum], out);
}

// ---------------------------------------------------------------------------
// 9. GENERATE: conjunctions.json (all unique pairs among 9 grahas = 36 rows)
// ---------------------------------------------------------------------------

function generateConjunctions() {
    const out = {};
    for (let i = 0; i < ALL_PLANETS.length; i++) {
        for (let j = i + 1; j < ALL_PLANETS.length; j++) {
            const a = ALL_PLANETS[i];
            const b = ALL_PLANETS[j];
            const key = pairKey(a, b);
            const pa = PLANETS[a];
            const pb = PLANETS[b];
            const relation = relationOf(a, b);
            const tone = RELATION_TONE_LORD.en[relation];
            const toneHi = RELATION_TONE_LORD.hi[relation];

            const areasEnA = pa.moneyAreas.en.slice(0, 2).join(' and ');
            const areasEnB = pb.moneyAreas.en.slice(0, 2).join(' and ');
            const areasHiA = pa.moneyAreas.hi.slice(0, 2).join(' और ');
            const areasHiB = pb.moneyAreas.hi.slice(0, 2).join(' और ');

            const en = `A conjunction of ${pa.name.en} and ${pb.name.en} blends ${pa.traits.en} with ${pb.traits.en}. ${tone} For wealth, this combination brings together ${areasEnA} with ${areasEnB} - a layered financial dynamic that draws on both planets' strengths. When this conjunction falls in or influences the 1st, 2nd, or 11th house, its effect on wealth becomes especially direct.`;
            const hi = `${pa.name.hi} और ${pb.name.hi} की युति ${pa.traits.hi} को ${pb.traits.hi} के साथ मिलाती है। ${toneHi} धन के लिए, यह संयोजन ${areasHiA} को ${areasHiB} के साथ एक साथ लाता है - एक बहुस्तरीय वित्तीय गतिशीलता जो दोनों ग्रहों की शक्तियों का लाभ उठाती है। जब यह युति प्रथम, द्वितीय या एकादश भाव में हो या उसे प्रभावित करे, तो धन पर इसका प्रभाव विशेष रूप से प्रत्यक्ष हो जाता है।`;

            out[key] = { key, planets: [a, b], planetNames: [pa.name, pb.name], relation, text: { en, hi } };
        }
    }
    writeJson('conjunctions.json', out);
}

// ---------------------------------------------------------------------------
// 10. GENERATE: lagnaLordInNavamsa.json, secondLordInNavamsa.json, eleventhLordInNavamsa.json
//     (7 lords x 12 signs, for each role)
// ---------------------------------------------------------------------------

function generateLordInNavamsaSignTable(role) {
    // role: 'lagna' | 'second' | 'eleventh'
    const out = {};
    const roleMeta = {
        lagna: { fileName: 'lagnaLordInNavamsa.json', labelEn: 'Lagna lord', labelHi: 'लग्नेश', noteEn: 'the deeper, long-term strength and true sustainability of your core personality and money-handling nature', noteHi: 'आपके मूल व्यक्तित्व और धन-प्रबंधन स्वभाव की गहरी, दीर्घकालिक शक्ति और वास्तविक स्थायित्व' },
        second: { fileName: 'secondLordInNavamsa.json', labelEn: '2nd lord', labelHi: 'द्वितीयेश', noteEn: 'the deeper, long-term strength and true sustainability of your accumulated wealth and savings shown by your 2nd house', noteHi: 'आपके द्वितीय भाव द्वारा दर्शाई गई संचित संपत्ति और बचत की गहरी, दीर्घकालिक शक्ति और वास्तविक स्थायित्व' },
        eleventh: { fileName: 'eleventhLordInNavamsa.json', labelEn: '11th lord', labelHi: 'एकादशेश', noteEn: 'the deeper, long-term strength and true sustainability of your income and gains shown by your 11th house', noteHi: 'आपके एकादश भाव द्वारा दर्शाए गए आय और लाभ की गहरी, दीर्घकालिक शक्ति और वास्तविक स्थायित्व' }
    };
    const meta = roleMeta[role];

    LORD_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        RASHI_KEYS_BY_ORDER.forEach((signKey) => {
            const sign = RASHIS[signKey];
            const key = `${planetKey}_${signKey}`;
            const relation = relationOf(planetKey, sign.lord);
            const strengthTone = RELATION_STRENGTH_TONE.en[relation];
            const strengthToneHi = RELATION_STRENGTH_TONE.hi[relation];
            const elementTrait = ELEMENT_TRAIT[sign.element];
            const qualityTrait = QUALITY_TRAIT[sign.quality];

            const en = `In the Navamsa (D-9) chart, your ${meta.labelEn} ${planet.name.en} is placed in ${sign.name.en}, ruled by ${PLANETS[sign.lord].name.en}. ${strengthTone} Since ${sign.name.en} is a ${sign.element}-element, ${sign.quality} sign, it ${elementTrait.en}, and ${qualityTrait.en}. Overall, this D-9 placement of the ${meta.labelEn.toLowerCase()} indicates ${meta.noteEn}.`;
            const hi = `नवांश (डी-9) कुंडली में, आपका ${meta.labelHi} ${planet.name.hi} ${sign.name.hi} राशि में स्थित है, जिसके स्वामी ${PLANETS[sign.lord].name.hi} हैं। ${strengthToneHi} चूंकि ${sign.name.hi} एक ${elementHi(sign.element)}-तत्व, ${qualityHi(sign.quality)} राशि है, यह ${elementTrait.hi}, और ${qualityTrait.hi}। कुल मिलाकर, ${meta.labelHi} की यह डी-9 स्थिति ${meta.noteHi} को इंगित करती है।`;

            out[key] = { key, role, planet: planetKey, planetName: planet.name, navamsaSign: signKey, navamsaSignName: sign.name, relation, text: { en, hi } };
        });
    });
    writeJson(meta.fileName, out);
}

// ---------------------------------------------------------------------------
// 10b. GENERATE: lagnaLordInNavamsaHouse.json, secondLordInNavamsaHouse.json,
//      eleventhLordInNavamsaHouse.json (7 lords x 12 HOUSE NUMBERS, counted
//      from the Navamsa's own ascendant)
// ---------------------------------------------------------------------------

function generateLordInNavamsaHouseTable(role) {
    const out = {};
    const roleMeta = {
        lagna: { fileName: 'lagnaLordInNavamsaHouse.json', labelEn: 'Lagna lord', labelHi: 'लग्नेश', subjectEn: 'your inner personality and money-handling nature', subjectHi: 'आपका आंतरिक व्यक्तित्व और धन-प्रबंधन स्वभाव' },
        second: { fileName: 'secondLordInNavamsaHouse.json', labelEn: '2nd lord', labelHi: 'द्वितीयेश', subjectEn: 'the true, destined strength of your accumulated wealth', subjectHi: 'आपकी संचित संपत्ति की वास्तविक, नियति-निर्धारित शक्ति' },
        eleventh: { fileName: 'eleventhLordInNavamsaHouse.json', labelEn: '11th lord', labelHi: 'एकादशेश', subjectEn: 'the true, destined strength of your income and gains', subjectHi: 'आपकी आय और लाभ की वास्तविक, नियति-निर्धारित शक्ति' }
    };
    const meta = roleMeta[role];

    LORD_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        for (let house = 1; house <= 12; house++) {
            const h = HOUSES[house];
            const key = `${planetKey}_${house}`;
            const guidance = HOUSE_CATEGORY_GUIDANCE[h.category];

            const en = `In the Navamsa (D-9) chart, your ${meta.labelEn} ${planet.name.en} falls in the ${house}${ordinalSuffix(house)} house counted from the Navamsa's own Ascendant. Since the D-9 chart reveals the deeper, destined strength behind what the Rashi (D-1) chart promises, this shows that ${meta.subjectEn} draws hidden strength from ${h.signification.en}, particularly regarding ${h.domainAngle.en}. ${guidance.en} A well-placed lord here confirms genuine, long-term financial fulfilment rather than just a surface-level promise.`;
            const hi = `नवांश (डी-9) कुंडली में, आपका ${meta.labelHi} ${planet.name.hi} नवांश के अपने लग्न से गिनने पर ${house}वें भाव में पड़ता है। चूंकि डी-9 कुंडली राशि (डी-1) कुंडली द्वारा दिए गए वादों के पीछे की गहरी, नियति-निर्धारित शक्ति को दर्शाती है, यह बताता है कि ${meta.subjectHi} ${h.signification.hi} से छिपी हुई शक्ति प्राप्त करती है, विशेष रूप से ${h.domainAngle.hi} के संबंध में। ${guidance.hi} यहाँ एक अच्छी तरह स्थित स्वामी एक सतही वादे के बजाय वास्तविक, दीर्घकालिक वित्तीय पूर्णता की पुष्टि करता है।`;

            out[key] = { key, role, planet: planetKey, planetName: planet.name, navamsaHouse: house, navamsaHouseName: h.name, text: { en, hi } };
        }
    });
    writeJson(meta.fileName, out);
}

// ---------------------------------------------------------------------------
// 11. GENERATE: firstHouseConjunctionYogas.json, secondHouseConjunctionYogas.json,
//      eleventhHouseConjunctionYogas.json (12 lagnas x 36 planet pairs each) -
//      lagna-aware named-Yoga detection for conjunctions occurring in the
//      1st, 2nd, or 11th house.
// ---------------------------------------------------------------------------

const YOGA_TEXT = {
    raja_yoga: {
        en: (houseLabel) => `This conjunction forms a classic **Raja Yoga** for this Lagna (a union between a Kendra-house lord and a Trikona-house lord), occurring right in the ${houseLabel}. Raja Yoga is one of the most powerful combinations in Vedic (Parashari) astrology - for wealth, it indicates prosperity linked to status and authority, high-value assets, and financial success that visibly elevates your social standing.`,
        hi: (houseLabel) => `यह युति इस लग्न के लिए एक क्लासिक **राज योग** बनाती है (एक केंद्र भाव स्वामी और एक त्रिकोण भाव स्वामी का मिलन), जो सीधे ${houseLabel} में हो रही है। राज योग वैदिक (पाराशरी) ज्योतिष के सबसे शक्तिशाली संयोजनों में से एक है - धन के लिए, यह प्रतिष्ठा और अधिकार से जुड़ी समृद्धि, उच्च-मूल्य संपत्ति, और वित्तीय सफलता को दर्शाता है जो आपकी सामाजिक प्रतिष्ठा को स्पष्ट रूप से बढ़ाती है।`
    },
    dhana_yoga: {
        en: (houseLabel) => `This conjunction forms a powerful **Dhana Yoga** for this Lagna (a wealth-house lord - 2nd or 11th - combining with another wealth-linked lord), occurring in the ${houseLabel}. This is one of the most direct and reliable indicators of financial prosperity, multiple income streams, and substantial accumulated wealth.`,
        hi: (houseLabel) => `यह युति इस लग्न के लिए एक शक्तिशाली **धन योग** बनाती है (एक धन-भाव स्वामी - द्वितीय या एकादश - का किसी अन्य धन-संबंधी स्वामी के साथ संयोजन), जो ${houseLabel} में हो रही है। यह वित्तीय समृद्धि, कई आय स्रोतों और पर्याप्त संचित संपत्ति के सबसे प्रत्यक्ष और विश्वसनीय संकेतकों में से एक है।`
    },
    vipreet_raja_yoga: {
        en: (houseLabel) => `This conjunction forms a **Vipreet Raja Yoga**-type combination for this Lagna (both planets rule only Dusthana houses - 6th, 8th or 12th), occurring in the ${houseLabel}. Counter-intuitively, this can bring wealth through reversal of fortune - initial debts, losses, or financial struggle that, once overcome, lead to an unexpected and often substantial rise in wealth.`,
        hi: (houseLabel) => `यह युति इस लग्न के लिए एक **विपरीत राज योग**-प्रकार का संयोजन बनाती है (दोनों ग्रह केवल दुःस्थान भावों - षष्ठ, अष्टम या द्वादश - के स्वामी हैं), जो ${houseLabel} में हो रही है। विरोधाभासी रूप से, यह भाग्य के उलटफेर के माध्यम से धन ला सकता है - प्रारंभिक ऋण, हानि या वित्तीय संघर्ष, जिन्हें पार करने के बाद संपत्ति में एक अप्रत्याशित और प्रायः पर्याप्त वृद्धि होती है।`
    },
    general: {
        en: (houseLabel) => `For this specific Lagna, this conjunction does not form one of the classical named Yogas (Raja/Dhana/Vipreet Raja) - the two planets involved do not share a Kendra-Trikona, Dhana, or pure-Dusthana lordship relationship here. Its effect in the ${houseLabel} is best read through the individual planetary conjunction meaning and each planet's own placement.`,
        hi: (houseLabel) => `इस विशिष्ट लग्न के लिए, यह युति क्लासिक नामित योगों (राज/धन/विपरीत राज) में से कोई नहीं बनाती - यहाँ दोनों ग्रहों का केंद्र-त्रिकोण, धन, या शुद्ध-दुःस्थान स्वामित्व संबंध नहीं है। ${houseLabel} में इसका प्रभाव सर्वोत्तम रूप से व्यक्तिगत ग्रह-युति अर्थ और प्रत्येक ग्रह की अपनी स्थिति के माध्यम से समझा जाता है।`
    }
};

function generateHouseConjunctionYogas(houseNum) {
    const out = {};
    const houseLabelEn = { 1: '1st house (Lagna)', 2: '2nd house (Dhana/wealth house)', 11: '11th house (Labha/gains house)' }[houseNum];
    const houseLabelHi = { 1: 'प्रथम भाव (लग्न)', 2: 'द्वितीय भाव (धन भाव)', 11: 'एकादश भाव (लाभ भाव)' }[houseNum];
    const fileNames = { 1: 'firstHouseConjunctionYogas.json', 2: 'secondHouseConjunctionYogas.json', 11: 'eleventhHouseConjunctionYogas.json' };

    RASHI_KEYS_BY_ORDER.forEach((lagnaKey) => {
        const houseLords = computeHouseLordsForLagna(lagnaKey);
        const yogakaraka = computeYogakaraka(houseLords);

        for (let i = 0; i < ALL_PLANETS.length; i++) {
            for (let j = i + 1; j < ALL_PLANETS.length; j++) {
                const a = ALL_PLANETS[i];
                const b = ALL_PLANETS[j];
                const key = `${lagnaKey}_${pairKey(a, b)}`;
                const yogaType = classifyYoga(houseLords, a, b);
                const template = YOGA_TEXT[yogaType];
                const isYogakarakaInvolved = yogakaraka && (a === yogakaraka || b === yogakaraka);

                let en = template.en(houseLabelEn);
                let hi = template.hi(houseLabelHi);
                if (isYogakarakaInvolved) {
                    en += ` Notably, ${PLANETS[yogakaraka].name.en} - the Yogakaraka for ${RASHIS[lagnaKey].name.en} Lagna - is part of this combination, which further amplifies its auspicious, wealth-boosting effect.`;
                    hi += ` उल्लेखनीय है कि ${PLANETS[yogakaraka].name.hi} - जो ${RASHIS[lagnaKey].name.hi} लग्न के लिए योगकारक ग्रह है - इस संयोजन का हिस्सा है, जो इसके शुभ, धन-वर्धक प्रभाव को और बढ़ाता है।`;
                }

                out[key] = {
                    key,
                    lagna: lagnaKey,
                    lagnaName: RASHIS[lagnaKey].name,
                    planets: [a, b],
                    planetNames: [PLANETS[a].name, PLANETS[b].name],
                    house: houseNum,
                    houseName: HOUSES[houseNum].name,
                    yogaType,
                    yogakarakaInvolved: !!isYogakarakaInvolved,
                    text: { en, hi }
                };
            }
        }
    });
    writeJson(fileNames[houseNum], out);
}

// ---------------------------------------------------------------------------
// 12. GENERATE: classicalPairYogas.json - well-known, lagna-INDEPENDENT named
//      Yogas formed purely by two specific grahas conjoining, reframed for wealth.
// ---------------------------------------------------------------------------

const CLASSICAL_PAIR_YOGAS = {
    sun_mercury: {
        name: { en: 'Budh-Aditya Yoga', hi: 'बुध-आदित्य योग' },
        text: {
            en: 'Sun and Mercury together form Budh-Aditya Yoga, blending authority/status with sharp financial and analytical intellect. This favours wealth through government-linked business, administrative authority combined with astute money management, and income built on intelligent, well-calculated decisions.',
            hi: 'सूर्य और बुध मिलकर बुध-आदित्य योग बनाते हैं, जो अधिकार/प्रतिष्ठा को तीक्ष्ण वित्तीय और विश्लेषणात्मक बुद्धि के साथ जोड़ता है। यह सरकार-संबंधित व्यवसाय, कुशाग्र धन-प्रबंधन के साथ प्रशासनिक अधिकार, और बुद्धिमान, सुनियोजित निर्णयों पर निर्मित आय के माध्यम से धन के लिए अनुकूल है।'
        }
    },
    moon_jupiter: {
        name: { en: 'Gajakesari Yoga', hi: 'गजकेसरी योग' },
        text: {
            en: 'Moon and Jupiter together form Gajakesari Yoga, one of the most celebrated combinations for prosperity and abundance. For wealth, this indicates steady, ethically-earned financial growth, a reputation that attracts opportunities, and long-term prosperity supported by wise judgement.',
            hi: 'चंद्रमा और बृहस्पति मिलकर गजकेसरी योग बनाते हैं, जो समृद्धि और प्रचुरता के लिए सबसे प्रशंसित संयोजनों में से एक है। धन के लिए, यह स्थिर, नैतिक रूप से अर्जित वित्तीय वृद्धि, अवसरों को आकर्षित करने वाली प्रतिष्ठा, और बुद्धिमान निर्णय द्वारा समर्थित दीर्घकालिक समृद्धि को दर्शाता है।'
        }
    },
    moon_mars: {
        name: { en: 'Chandra-Mangal Yoga', hi: 'चंद्र-मंगल योग' },
        text: {
            en: 'Moon and Mars together form Chandra-Mangal Yoga, classically recognised as one of the direct Dhana (wealth) Yogas. It blends emotional drive with bold action, favouring quick wealth generation through business ventures, real estate, or property dealings - though it benefits from disciplined follow-through to avoid impulsive financial decisions.',
            hi: 'चंद्रमा और मंगल मिलकर चंद्र-मंगल योग बनाते हैं, जिसे शास्त्रीय रूप से प्रत्यक्ष धन योगों में से एक माना जाता है। यह भावनात्मक प्रेरणा को साहसिक कार्यवाही के साथ जोड़ता है, जो व्यावसायिक उद्यमों, रियल एस्टेट या संपत्ति सौदों के माध्यम से त्वरित धन-सृजन के लिए अनुकूल है - हालाँकि आवेगी वित्तीय निर्णयों से बचने के लिए अनुशासित निरंतरता से इसे लाभ होता है।'
        }
    },
    mars_jupiter: {
        name: { en: 'Guru-Mangal Yoga', hi: 'गुरु-मंगल योग' },
        text: {
            en: 'Mars and Jupiter together form Guru-Mangal Yoga, combining courage and technical energy with wisdom and ethical judgement. For wealth, this favours prosperity through real estate, engineering, law, or property-linked ventures, with a principled, long-term approach to building assets.',
            hi: 'मंगल और बृहस्पति मिलकर गुरु-मंगल योग बनाते हैं, जो साहस और तकनीकी ऊर्जा को ज्ञान और नैतिक निर्णय के साथ जोड़ता है। धन के लिए, यह रियल एस्टेट, इंजीनियरिंग, कानून या संपत्ति-संबंधी उद्यमों के माध्यम से समृद्धि के लिए अनुकूल है, जिसमें संपत्ति निर्माण के प्रति एक सिद्धांतनिष्ठ, दीर्घकालिक दृष्टिकोण है।'
        }
    }
};

function generateClassicalPairYogas() {
    const out = {};
    for (let i = 0; i < ALL_PLANETS.length; i++) {
        for (let j = i + 1; j < ALL_PLANETS.length; j++) {
            const a = ALL_PLANETS[i];
            const b = ALL_PLANETS[j];
            const key = pairKey(a, b);
            const named = CLASSICAL_PAIR_YOGAS[key];

            out[key] = {
                key,
                planets: [a, b],
                planetNames: [PLANETS[a].name, PLANETS[b].name],
                hasClassicalName: !!named,
                yogaName: named ? named.name : null,
                text: named
                    ? named.text
                    : {
                        en: 'This planetary pair does not carry one of the small set of universally-recognised classical Yoga names (like Budh-Aditya or Gajakesari) independent of house-lordship. Refer to the general conjunction meaning, and to the lagna-specific Raja/Dhana/Vipreet Raja Yoga check for this pair in the 1st/2nd/11th house tables.',
                        hi: 'यह ग्रह-युग्म किसी सर्वमान्य क्लासिक योग नाम (जैसे बुध-आदित्य या गजकेसरी) के तहत नहीं आता, जो भाव-स्वामित्व से स्वतंत्र हो। सामान्य युति अर्थ देखें, और इस युग्म के लिए प्रथम/द्वितीय/एकादश भाव की तालिकाओं में लग्न-विशिष्ट राज/धन/विपरीत राज योग जाँच देखें।'
                    }
            };
        }
    }
    writeJson('classicalPairYogas.json', out);
}

// ---------------------------------------------------------------------------
// 13. GENERATE: manifest / index.json
// ---------------------------------------------------------------------------

function generateManifest() {
    const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
    const manifest = {
        generatedAt: new Date().toISOString(),
        description: 'Money/Wealth astrology combination dataset (Vedic/Parashari) - the money counterpart of the career/marriage datasets, using BOTH the 2nd house/2nd lord (Dhana/accumulated wealth) AND the 11th house/11th lord (Labha/gains) in place of the single 10th or 7th house factor. Covers Lagna lord placement, 2nd lord placement, 11th lord placement, planets in 1st/2nd/11th house, generic conjunctions, lagna-independent classical pair-Yogas, lagna-aware Raja/Dhana/Vipreet-Raja Yoga detection for 1st/2nd/11th-house conjunctions, and the Lagna/2nd/11th lords\' placement in Navamsa (D-9) by sign AND by house-number. Bilingual (English/Hindi). Generated by scripts/generateMoneyAstrologyDataset.js - do not hand-edit, re-run the generator instead.',
        files: files.map((f) => {
            const data = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
            return { file: f, entries: Array.isArray(data) ? data.length : Object.keys(data).length };
        })
    };
    writeJson('index.json', manifest);
}

// ---------------------------------------------------------------------------
// RUN
// ---------------------------------------------------------------------------

console.log('Generating money/wealth astrology dataset...');
generateReferenceTables();
generateLagnaBase();
generateLordInHouseTable('lagna');
generateLordInHouseTable('second');
generateLordInHouseTable('eleventh');
generatePlanetInHouseTable(1);
generatePlanetInHouseTable(2);
generatePlanetInHouseTable(11);
generateConjunctions();
generateLordInNavamsaSignTable('lagna');
generateLordInNavamsaSignTable('second');
generateLordInNavamsaSignTable('eleventh');
generateLordInNavamsaHouseTable('lagna');
generateLordInNavamsaHouseTable('second');
generateLordInNavamsaHouseTable('eleventh');
generateHouseConjunctionYogas(1);
generateHouseConjunctionYogas(2);
generateHouseConjunctionYogas(11);
generateClassicalPairYogas();
generateManifest();
console.log('Done. Output directory:', OUT_DIR);
