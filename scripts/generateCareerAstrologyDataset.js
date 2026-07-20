/**
 * generateCareerAstrologyDataset.js
 *
 * SOURCE OF TRUTH for the Career Astrology Dataset.
 *
 * Why a generator instead of hand-written JSON?
 * ----------------------------------------------
 * A literal, fully-enumerated dataset covering every real birth chart combination
 * (12 lagnas x 12 lord-placements x 12 tenth-lord-placements x 2^9 planet-in-house-1
 * subsets x 2^9 planet-in-house-10 subsets x 36 conjunction pairs x 12 navamsa signs)
 * is astronomically large (many billions of rows) and cannot be meaningfully
 * hand-authored or even stored sensibly.
 *
 * Instead, this script encodes the classical Parashari knowledge (planet
 * significations, house significations, sign lordships/relationships) as small
 * "atomic" tables, and programmatically COMPOSES every relevant factor
 * combination from them:
 *
 *   - lagnaBase.json            12 rows   (lagna -> lagna lord, 10th sign, 10th lord)
 *   - lagnaLordInHouse.json     84 rows   (7 lords x 12 houses)
 *   - tenthLordInHouse.json     84 rows   (7 lords x 12 houses)
 *   - planetInHouse1.json        9 rows   (9 grahas in the 1st house)
 *   - planetInHouse10.json       9 rows   (9 grahas in the 10th house)
 *   - conjunctions.json         36 rows   (all unique graha pairs)
 *   - tenthLordInNavamsa.json   84 rows   (7 lords x 12 navamsa signs)
 *   - planets.json / rashis.json / houses.json (reference/lookup metadata)
 *
 * These are the *complete* set of atomic building blocks needed to describe
 * ANY real chart. A specific horoscope's full career reading is produced at
 * QUERY TIME by the lookup engine (services/careerPredictionEngine.js), which
 * simply does O(1) key look-ups into these pre-built JSON tables and stitches
 * the pieces together - this is what makes the dataset "fast" (no scanning,
 * no runtime AI calls) and "searchable" (every row has a stable, predictable
 * composite key, and a full-text inverted index is built over all rows).
 *
 * Run:  node scripts/generateCareerAstrologyDataset.js
 * Output: data/astrology/career/*.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'data', 'astrology', 'career');

// ---------------------------------------------------------------------------
// 1. ATOMIC DATA: PLANETS (Grahas)
// ---------------------------------------------------------------------------

const PLANETS = {
    sun: {
        order: 1,
        name: { en: 'Sun', hi: 'सूर्य (Surya)' },
        nature: 'malefic',
        traits: {
            en: 'a fiery, authoritative, and self-assured energy centered on leadership, willpower, and recognition',
            hi: 'एक तेजस्वी, अधिकारपूर्ण और आत्मविश्वासी ऊर्जा, जो नेतृत्व, इच्छाशक्ति और सम्मान पर केंद्रित है'
        },
        careerAreas: {
            en: ['government service and administration', 'politics and public leadership', 'management and executive roles', 'the energy, power or gold/bullion sector', 'medicine (especially heart-related fields)'],
            hi: ['सरकारी सेवा और प्रशासन', 'राजनीति और सार्वजनिक नेतृत्व', 'प्रबंधन और कार्यकारी पद', 'ऊर्जा, विद्युत या स्वर्ण/बुलियन क्षेत्र', 'चिकित्सा (विशेषकर हृदय से जुड़े क्षेत्र)']
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
            en: 'a receptive, nurturing, and adaptable energy centered on the mind, emotions, and public connection',
            hi: 'एक ग्रहणशील, पोषणकारी और अनुकूलनीय ऊर्जा, जो मन, भावनाओं और जनसंपर्क पर केंद्रित है'
        },
        careerAreas: {
            en: ['nursing, healthcare and hospitality', 'public relations and customer-facing roles', 'psychology and counselling', 'travel, tourism and shipping', 'dairy, liquids, food and beverages business'],
            hi: ['नर्सिंग, स्वास्थ्य सेवा और आतिथ्य', 'जनसंपर्क और ग्राहक-सेवा भूमिकाएँ', 'मनोविज्ञान और परामर्श', 'यात्रा, पर्यटन और जलमार्ग व्यवसाय', 'डेयरी, तरल पदार्थ, खाद्य एवं पेय व्यवसाय']
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
            en: 'a bold, energetic, and competitive drive centered on courage, action, and technical mastery',
            hi: 'एक साहसी, ऊर्जावान और प्रतिस्पर्धी प्रवृत्ति, जो साहस, कार्यवाही और तकनीकी दक्षता पर केंद्रित है'
        },
        careerAreas: {
            en: ['engineering, mechanical and automobile fields', 'defence, police and security services', 'sports, fitness and athletics', 'real estate and construction', 'surgery and technical/manual trades'],
            hi: ['इंजीनियरिंग, मैकेनिकल और ऑटोमोबाइल क्षेत्र', 'रक्षा, पुलिस और सुरक्षा सेवाएँ', 'खेल, फिटनेस और एथलेटिक्स', 'रियल एस्टेट और निर्माण कार्य', 'सर्जरी और तकनीकी/शारीरिक व्यवसाय']
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
        careerAreas: {
            en: ['business, trading and commerce', 'writing, journalism and media', 'accounting, finance and analytics', 'IT, software and data-driven fields', 'teaching (commerce/mathematics) and public speaking'],
            hi: ['व्यापार और वाणिज्य', 'लेखन, पत्रकारिता और मीडिया', 'लेखांकन, वित्त और विश्लेषण', 'आईटी, सॉफ्टवेयर और डेटा-आधारित क्षेत्र', 'शिक्षण (वाणिज्य/गणित) और सार्वजनिक वक्तृत्व']
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
            en: 'a wise, expansive, and principled energy centered on knowledge, guidance, and higher learning',
            hi: 'एक ज्ञानी, विस्तारवादी और सिद्धांतनिष्ठ ऊर्जा, जो ज्ञान, मार्गदर्शन और उच्च शिक्षा पर केंद्रित है'
        },
        careerAreas: {
            en: ['teaching, professorship and academia', 'law, judiciary and legal consultancy', 'banking, finance and investment advisory', 'civil services and public administration', 'religious, spiritual or philanthropic work'],
            hi: ['शिक्षण, प्रोफेसरशिप और शिक्षाजगत', 'कानून, न्यायपालिका और विधिक परामर्श', 'बैंकिंग, वित्त और निवेश सलाहकारी', 'सिविल सेवाएँ और लोक प्रशासन', 'धार्मिक, आध्यात्मिक या परोपकारी कार्य']
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
            en: 'a graceful, artistic, and diplomatic charm centered on beauty, comfort, and refined taste',
            hi: 'एक सुंदर, कलात्मक और कूटनीतिक आकर्षण, जो सौंदर्य, सुख-सुविधा और परिष्कृत रुचि पर केंद्रित है'
        },
        careerAreas: {
            en: ['arts, entertainment and the film industry', 'fashion, design and beauty industry', 'luxury goods, hospitality and event management', 'music, dance and creative performance', 'diplomacy, marketing and client relations'],
            hi: ['कला, मनोरंजन और फिल्म उद्योग', 'फैशन, डिज़ाइन और सौंदर्य उद्योग', 'विलासिता वस्तुएँ, आतिथ्य और इवेंट प्रबंधन', 'संगीत, नृत्य और रचनात्मक प्रदर्शन', 'कूटनीति, विपणन और ग्राहक संबंध']
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
        careerAreas: {
            en: ['labour-intensive and service-oriented industries', 'mining, oil, agriculture and heavy industry', 'judiciary, law-and-order and compliance roles', 'civil/structural engineering and infrastructure', 'social work and mass-oriented public service'],
            hi: ['श्रम-प्रधान और सेवा-उन्मुख उद्योग', 'खनन, तेल, कृषि और भारी उद्योग', 'न्यायपालिका, कानून-व्यवस्था और अनुपालन भूमिकाएँ', 'सिविल/संरचनात्मक इंजीनियरिंग और अवसंरचना', 'सामाजिक कार्य और जन-उन्मुख लोक सेवा']
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
            en: 'an ambitious, unconventional, and obsessive drive centered on sudden rise, innovation, and foreign connections',
            hi: 'एक महत्वाकांक्षी, अपरंपरागत और गहन प्रवृत्ति, जो अचानक उन्नति, नवाचार और विदेश संबंधों पर केंद्रित है'
        },
        careerAreas: {
            en: ['technology, IT and emerging/disruptive fields', 'foreign trade, import-export and aviation', 'mass media, digital content and photography', 'e-commerce and unconventional startups', 'politics and large-scale public influence'],
            hi: ['प्रौद्योगिकी, आईटी और उभरते/विघटनकारी क्षेत्र', 'विदेश व्यापार, आयात-निर्यात और विमानन', 'जनसंचार माध्यम, डिजिटल सामग्री और फोटोग्राफी', 'ई-कॉमर्स और अपरंपरागत स्टार्टअप', 'राजनीति और बड़े पैमाने पर जनप्रभाव']
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
            en: 'a detached, research-oriented, and intuitive depth centered on specialization, spirituality, and hidden knowledge',
            hi: 'एक विरक्त, शोध-उन्मुख और सहज गहराई, जो विशेषज्ञता, आध्यात्म और गूढ़ ज्ञान पर केंद्रित है'
        },
        careerAreas: {
            en: ['research, analytics and highly specialised technical work', 'spirituality, astrology and religious institutions', 'alternative medicine and healing sciences', 'IT/technical backend and behind-the-scenes roles', 'occult sciences and investigative work'],
            hi: ['शोध, विश्लेषण और उच्च-विशिष्ट तकनीकी कार्य', 'आध्यात्म, ज्योतिष और धार्मिक संस्थान', 'वैकल्पिक चिकित्सा और उपचार विज्ञान', 'आईटी/तकनीकी बैकएंड और पर्दे के पीछे की भूमिकाएँ', 'गूढ़ विद्या और खोजपरक कार्य']
        },
        friends: ['mars', 'venus', 'saturn'],
        neutrals: ['jupiter', 'mercury'],
        enemies: ['sun', 'moon']
    }
};

// Only these 7 "grahas" own/rule zodiac signs classically and can be a house lord.
const LORD_PLANETS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];
const ALL_PLANETS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];

// ---------------------------------------------------------------------------
// 2. ATOMIC DATA: RASHIS (Zodiac Signs)
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
    fire: {
        en: 'brings a dynamic, leadership-oriented, and self-driven quality to career growth',
        hi: 'करियर की वृद्धि में एक गतिशील, नेतृत्व-उन्मुख और आत्म-प्रेरित गुण लाता है'
    },
    earth: {
        en: 'brings a practical, stable, and result-oriented quality to career growth',
        hi: 'करियर की वृद्धि में एक व्यावहारिक, स्थिर और परिणाम-उन्मुख गुण लाता है'
    },
    air: {
        en: 'brings an intellectual, communicative, and networking-oriented quality to career growth',
        hi: 'करियर की वृद्धि में एक बौद्धिक, संचार-कुशल और नेटवर्किंग-उन्मुख गुण लाता है'
    },
    water: {
        en: 'brings an intuitive, emotionally-driven, and adaptive quality to career growth',
        hi: 'करियर की वृद्धि में एक सहज, भावनात्मक रूप से प्रेरित और अनुकूलनीय गुण लाता है'
    }
};

const QUALITY_TRAIT = {
    movable: { en: 'action tends to bring relatively quicker, visible movement in career matters', hi: 'इसमें कार्य अपेक्षाकृत तेज़ और दृश्यमान करियर परिवर्तन लाता है' },
    fixed: { en: 'results tend to build slowly but are stable and long-lasting once achieved', hi: 'परिणाम धीरे-धीरे बनते हैं परन्तु एक बार प्राप्त होने पर स्थिर और दीर्घकालिक रहते हैं' },
    dual: { en: 'growth tends to happen through varied, flexible, or multi-domain paths', hi: 'वृद्धि विविध, लचीले या बहु-क्षेत्रीय मार्गों के माध्यम से होती है' }
};

// ---------------------------------------------------------------------------
// 3. ATOMIC DATA: HOUSES (Bhavas) - career-relevant significations
// ---------------------------------------------------------------------------

const HOUSES = {
    1: {
        name: { en: '1st House (Lagna/Ascendant)', hi: 'प्रथम भाव (लग्न)' },
        signification: { en: 'self, personality, physical vitality, and overall approach to life', hi: 'स्वयं, व्यक्तित्व, शारीरिक ऊर्जा और जीवन के प्रति समग्र दृष्टिकोण' },
        careerAngle: { en: 'how your personal image, confidence, and individual initiative shape your professional journey', hi: 'आपकी व्यक्तिगत छवि, आत्मविश्वास और व्यक्तिगत पहल आपके व्यावसायिक सफर को कैसे आकार देती है' },
        category: 'kendra-trikona'
    },
    2: {
        name: { en: '2nd House (Dhana Bhava)', hi: 'द्वितीय भाव (धन भाव)' },
        signification: { en: 'wealth, family resources, accumulated savings, and speech', hi: 'धन, पारिवारिक संसाधन, संचित बचत और वाणी' },
        careerAngle: { en: 'income stability, family business, and how your speech/communication builds financial value', hi: 'आय की स्थिरता, पारिवारिक व्यवसाय और आपकी वाणी/संचार किस प्रकार वित्तीय मूल्य निर्मित करता है' },
        category: 'maraka'
    },
    3: {
        name: { en: '3rd House (Parakrama Bhava)', hi: 'तृतीय भाव (पराक्रम भाव)' },
        signification: { en: 'self-effort, courage, communication skills, and short journeys', hi: 'स्वप्रयास, साहस, संचार कौशल और छोटी यात्राएँ' },
        careerAngle: { en: 'growth through personal hustle, marketing/communication ability, and persistent self-effort', hi: 'व्यक्तिगत परिश्रम, विपणन/संचार क्षमता और निरंतर स्वप्रयास के माध्यम से वृद्धि' },
        category: 'upachaya'
    },
    4: {
        name: { en: '4th House (Sukha Bhava)', hi: 'चतुर्थ भाव (सुख भाव)' },
        signification: { en: 'comfort, real estate, vehicles, and emotional/domestic foundation', hi: 'सुख-सुविधा, संपत्ति, वाहन और भावनात्मक/घरेलू आधार' },
        careerAngle: { en: 'stability at the base level, property/vehicle-related fields, and a comfortable, secure work environment', hi: 'आधारभूत स्थिरता, संपत्ति/वाहन-संबंधी क्षेत्र और एक आरामदायक, सुरक्षित कार्य वातावरण' },
        category: 'kendra-trikona'
    },
    5: {
        name: { en: '5th House (Vidya/Purva Punya Bhava)', hi: 'पंचम भाव (विद्या/पूर्व पुण्य भाव)' },
        signification: { en: 'creativity, intelligence, education, and speculative ability', hi: 'रचनात्मकता, बुद्धिमत्ता, शिक्षा और सट्टा/अटकल क्षमता' },
        careerAngle: { en: 'success through creative thinking, higher education/qualifications, and calculated risk-taking', hi: 'रचनात्मक सोच, उच्च शिक्षा/योग्यता और सुविचारित जोखिम के माध्यम से सफलता' },
        category: 'kendra-trikona'
    },
    6: {
        name: { en: '6th House (Ripu/Roga Bhava)', hi: 'षष्ठम भाव (रिपु/रोग भाव)' },
        signification: { en: 'service, daily work routine, competition, and overcoming obstacles', hi: 'सेवा, दैनिक कार्य दिनचर्या, प्रतिस्पर्धा और बाधाओं पर विजय' },
        careerAngle: { en: 'success in service/employment, competitive exams, litigation, health-related or routine-driven professions', hi: 'सेवा/नौकरी, प्रतियोगी परीक्षा, मुकदमेबाज़ी, स्वास्थ्य-संबंधी या दिनचर्या-प्रधान व्यवसायों में सफलता' },
        category: 'upachaya'
    },
    7: {
        name: { en: '7th House (Kalatra/Vyapara Bhava)', hi: 'सप्तम भाव (कलत्र/व्यापार भाव)' },
        signification: { en: 'partnerships, business dealings, trade, and public interaction', hi: 'साझेदारी, व्यावसायिक लेन-देन, व्यापार और सार्वजनिक संपर्क' },
        careerAngle: { en: 'success through partnerships, client-facing/trade roles, and business collaborations (including with or through spouse)', hi: 'साझेदारी, ग्राहक-संपर्क/व्यापार भूमिकाओं और व्यावसायिक सहयोग (जीवनसाथी सहित) के माध्यम से सफलता' },
        category: 'kendra-trikona'
    },
    8: {
        name: { en: '8th House (Ayu/Mrityu Bhava)', hi: 'अष्टम भाव (आयु/मृत्यु भाव)' },
        signification: { en: 'research, transformation, insurance, inheritance, and hidden/occult matters', hi: 'शोध, रूपांतरण, बीमा, विरासत और गूढ़/छिपे विषय' },
        careerAngle: { en: 'depth-oriented fields like research, insurance, forensics, or occult sciences, often with delayed but transformative success', hi: 'शोध, बीमा, फोरेंसिक या गूढ़ विद्या जैसे गहराई-उन्मुख क्षेत्र, प्रायः विलंबित परन्तु रूपांतरकारी सफलता के साथ' },
        category: 'dusthana'
    },
    9: {
        name: { en: '9th House (Bhagya Bhava)', hi: 'नवम भाव (भाग्य भाव)' },
        signification: { en: 'fortune, higher education, philosophy, long-distance/foreign connections, and mentors', hi: 'भाग्य, उच्च शिक्षा, दर्शनशास्त्र, दूरस्थ/विदेश संबंध और गुरुजन' },
        careerAngle: { en: 'growth through higher learning, foreign opportunities, publishing/law, and the blessings of mentors or destiny', hi: 'उच्च शिक्षा, विदेश के अवसर, प्रकाशन/कानून और गुरुजनों या भाग्य के आशीर्वाद के माध्यम से वृद्धि' },
        category: 'kendra-trikona'
    },
    10: {
        name: { en: '10th House (Karma Bhava)', hi: 'दशम भाव (कर्म भाव)' },
        signification: { en: 'career, profession, public status, authority, and life-work (karma) itself', hi: 'करियर, व्यवसाय, सार्वजनिक प्रतिष्ठा, अधिकार और स्वयं जीवन-कर्म' },
        careerAngle: { en: 'this is the very house of profession - its condition most directly defines the nature, authority level, and public visibility of your career', hi: 'यह स्वयं व्यवसाय का भाव है - इसकी स्थिति सीधे आपके करियर की प्रकृति, अधिकार-स्तर और सार्वजनिक दृश्यता को परिभाषित करती है' },
        category: 'kendra-trikona'
    },
    11: {
        name: { en: '11th House (Labha Bhava)', hi: 'एकादश भाव (लाभ भाव)' },
        signification: { en: 'gains, income, large networks, and fulfilment of ambitions', hi: 'लाभ, आय, विस्तृत नेटवर्क और महत्वाकांक्षाओं की पूर्ति' },
        careerAngle: { en: 'strong financial gain, growth within large organisations/corporates, and fulfilment of long-term career goals', hi: 'मज़बूत वित्तीय लाभ, बड़े संगठनों/कॉर्पोरेट में वृद्धि और दीर्घकालिक करियर लक्ष्यों की पूर्ति' },
        category: 'upachaya'
    },
    12: {
        name: { en: '12th House (Vyaya Bhava)', hi: 'द्वादश भाव (व्यय भाव)' },
        signification: { en: 'foreign lands, expenditure, isolation, and spirituality', hi: 'विदेश, व्यय, एकांत और आध्यात्म' },
        careerAngle: { en: 'careers based abroad, behind-the-scenes/research work, hospital or institutional settings, or spiritually-inclined professions', hi: 'विदेश-आधारित करियर, पर्दे के पीछे/शोध कार्य, अस्पताल या संस्थागत परिवेश, या आध्यात्मिक झुकाव वाले व्यवसाय' },
        category: 'dusthana'
    }
};

const HOUSE_CATEGORY_GUIDANCE = {
    'kendra-trikona': {
        en: 'This is a Kendra/Trikona (angular or trinal) placement - one of the strongest positions in the chart. It gives direct, visible, and relatively stable career success, and this factor should be treated as a major pillar of strength in your professional life.',
        hi: 'यह एक केंद्र/त्रिकोण स्थान है - कुंडली की सबसे मज़बूत स्थितियों में से एक। यह करियर में प्रत्यक्ष, दृश्यमान और अपेक्षाकृत स्थिर सफलता देता है, और इसे आपके व्यावसायिक जीवन में एक प्रमुख शक्ति-स्तंभ माना जाना चाहिए।'
    },
    upachaya: {
        en: 'This is an Upachaya (growth-oriented) placement. Results may be modest early on but keep improving steadily with age, effort and experience - long-term persistence here pays off substantially.',
        hi: 'यह एक उपचय (वृद्धि-उन्मुख) स्थान है। प्रारंभ में परिणाम सामान्य हो सकते हैं परन्तु उम्र, प्रयास और अनुभव के साथ लगातार सुधरते जाते हैं - यहाँ दीर्घकालिक दृढ़ता का फल बहुत अच्छा मिलता है।'
    },
    dusthana: {
        en: 'This is a Dusthana (challenging) placement. It can bring delays, unconventional turns, or extra effort before success arrives - but it often rewards specialisation, research-depth, or foreign/behind-the-scenes work with unexpectedly strong, transformative results.',
        hi: 'यह एक दुःस्थान (चुनौतीपूर्ण) स्थान है। इसमें सफलता से पहले देरी, अपरंपरागत मोड़ या अतिरिक्त प्रयास आ सकता है - परन्तु यह प्रायः विशेषज्ञता, गहन शोध या विदेश/पर्दे के पीछे के कार्य को अप्रत्याशित रूप से मज़बूत, रूपांतरकारी परिणाम देकर पुरस्कृत करता है।'
    },
    maraka: {
        en: 'This placement links career matters to wealth and resource-accumulation themes - financial planning and steady value-building become an important part of your professional story.',
        hi: 'यह स्थान करियर के विषयों को धन और संसाधन-संचय की थीम से जोड़ता है - वित्तीय योजना और स्थिर मूल्य-निर्माण आपकी व्यावसायिक कहानी का एक महत्वपूर्ण हिस्सा बनते हैं।'
    }
};

// ---------------------------------------------------------------------------
// 4. HELPERS
// ---------------------------------------------------------------------------

function relationOf(planetKey, otherKey) {
    if (planetKey === otherKey) return 'own';
    const p = PLANETS[planetKey];
    if (p.friends.includes(otherKey)) return 'friend';
    if (p.enemies.includes(otherKey)) return 'enemy';
    return 'neutral';
}

const RELATION_TONE_LORD = {
    en: {
        own: 'This is the planet occupying its own significations most naturally, giving clean, straightforward results without internal conflict.',
        friend: 'The house lord is a natural friend of this placement, which smoothens outcomes and adds mutual support between personality and effort.',
        neutral: 'The relationship here is neutral, giving moderate, situation-dependent results that respond well to conscious effort.',
        enemy: 'There is some natural friction in this placement, which can create internal conflict or extra struggle before results manifest - deliberate effort and remedies help considerably.'
    },
    hi: {
        own: 'यह ग्रह अपनी ही विशेषताओं में सबसे स्वाभाविक रूप से स्थित है, जिससे बिना किसी आंतरिक संघर्ष के स्पष्ट और सीधे परिणाम मिलते हैं।',
        friend: 'यह भाव-स्वामी इस स्थिति का स्वाभाविक मित्र है, जो परिणामों को सरल बनाता है और व्यक्तित्व व प्रयास के बीच परस्पर सहयोग जोड़ता है।',
        neutral: 'यहाँ संबंध तटस्थ है, जो मध्यम, परिस्थिति-निर्भर परिणाम देता है जो सजग प्रयास से अच्छी प्रतिक्रिया देते हैं।',
        enemy: 'इस स्थिति में कुछ स्वाभाविक टकराव है, जो परिणाम मिलने से पहले आंतरिक द्वंद्व या अतिरिक्त संघर्ष उत्पन्न कर सकता है - सचेत प्रयास और उपाय काफी सहायक होते हैं।'
    }
};

function pairKey(a, b) {
    const [x, y] = [a, b].sort((p, q) => PLANETS[p].order - PLANETS[q].order);
    return `${x}_${y}`;
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function writeJson(fileName, data) {
    ensureDir(OUT_DIR);
    const filePath = path.join(OUT_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`  wrote ${path.relative(process.cwd(), filePath)} (${Array.isArray(data) ? data.length : Object.keys(data).length} entries)`);
}

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
// ---------------------------------------------------------------------------

// House-lordship categories used for Yoga classification (see section 12).
const KENDRA_HOUSES = [1, 4, 7, 10];
const TRIKONA_HOUSES = [1, 5, 9];
const DUSTHANA_HOUSES = [6, 8, 12];
const DHANA_HOUSES = [2, 11];
const KENDRA_EXCL_LAGNA = [4, 7, 10];
const TRIKONA_EXCL_LAGNA = [5, 9];

/** For a given lagna, returns { 1: planetKey, 2: planetKey, ... 12: planetKey } - which graha rules each house. */
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

/** A planet that rules BOTH a Kendra (4/7/10) and a Trikona (5/9) house for this lagna = Yogakaraka (e.g. Saturn for Taurus/Libra, Mars for Cancer/Leo). */
function computeYogakaraka(houseLords) {
    for (const planetKey of LORD_PLANETS) {
        const owned = Object.keys(houseLords).map(Number).filter((h) => houseLords[h] === planetKey);
        const ownsKendra = owned.some((h) => KENDRA_EXCL_LAGNA.includes(h));
        const ownsTrikona = owned.some((h) => TRIKONA_EXCL_LAGNA.includes(h));
        if (ownsKendra && ownsTrikona) return planetKey;
    }
    return null;
}

function generateLagnaBase() {
    const out = {};
    RASHI_KEYS_BY_ORDER.forEach((lagnaKey) => {
        const lagna = RASHIS[lagnaKey];
        const lagnaLord = lagna.lord;
        const tenthIndex = ((lagna.order - 1 + 9) % 12) + 1;
        const tenthSignKey = RASHI_KEYS_BY_ORDER.find((k) => RASHIS[k].order === tenthIndex);
        const tenthLord = RASHIS[tenthSignKey].lord;
        const houseLords = computeHouseLordsForLagna(lagnaKey);
        const yogakaraka = computeYogakaraka(houseLords);

        out[lagnaKey] = {
            lagna: lagnaKey,
            lagnaName: RASHIS[lagnaKey].name,
            lagnaLord,
            lagnaLordName: PLANETS[lagnaLord].name,
            tenthHouseSign: tenthSignKey,
            tenthHouseSignName: RASHIS[tenthSignKey].name,
            tenthLord,
            tenthLordName: PLANETS[tenthLord].name,
            houseLords, // { "1": planetKey, ..., "12": planetKey } - which graha rules each house for this lagna
            yogakaraka, // planetKey or null - the special Kendra+Trikona lord for this lagna, if any
            note: {
                en: `For ${RASHIS[lagnaKey].name.en} Lagna, the Ascendant (Lagna) lord is ${PLANETS[lagnaLord].name.en} and the 10th house falls in ${RASHIS[tenthSignKey].name.en}, ruled by ${PLANETS[tenthLord].name.en} (your 10th lord / career significator).${yogakaraka ? ` ${PLANETS[yogakaraka].name.en} is the Yogakaraka (a planet that rules both a Kendra and a Trikona house) for this Lagna - one of the most auspicious planets in this chart.` : ''}`,
                hi: `${RASHIS[lagnaKey].name.hi} लग्न के लिए, लग्नेश ${PLANETS[lagnaLord].name.hi} है और दशम भाव ${RASHIS[tenthSignKey].name.hi} राशि में पड़ता है, जिसके स्वामी ${PLANETS[tenthLord].name.hi} हैं (आपके दशमेश / करियर कारक)।${yogakaraka ? ` ${PLANETS[yogakaraka].name.hi} इस लग्न के लिए योगकारक ग्रह है (जो केंद्र और त्रिकोण दोनों भावों का स्वामी है) - यह इस कुंडली के सबसे शुभ ग्रहों में से एक है।` : ''}`
            }
        };
    });
    writeJson('lagnaBase.json', out);
    return out;
}

// ---------------------------------------------------------------------------
// 7. GENERATE: lagnaLordInHouse.json & tenthLordInHouse.json (7 lords x 12 houses)
// ---------------------------------------------------------------------------

function generateLordInHouseTable(role) {
    // role: 'lagna' | 'tenth'
    const out = {};
    LORD_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        for (let house = 1; house <= 12; house++) {
            const h = HOUSES[house];
            const key = `${planetKey}_${house}`;
            const guidance = HOUSE_CATEGORY_GUIDANCE[h.category];
            const careerAreasEn = planet.careerAreas.en.slice(0, 3).join(', ');
            const careerAreasHi = planet.careerAreas.hi.slice(0, 3).join(', ');

            let en, hi;
            if (role === 'lagna') {
                en = `Your Lagna (Ascendant) lord ${planet.name.en} is placed in the ${house}${ordinalSuffix(house)} house (${h.name.en}). This means your core personality and life-drive works through ${h.signification.en}. ${capitalize(planet.traits.en)} - specifically this shapes ${h.careerAngle.en}. This inclines you naturally towards fields such as ${careerAreasEn}. ${guidance.en}`;
                hi = `आपका लग्नेश ${planet.name.hi} ${house}वें भाव (${h.name.hi}) में स्थित है। इसका अर्थ है कि आपका मूल व्यक्तित्व और जीवन-प्रेरणा ${h.signification.hi} के माध्यम से कार्य करती है। यह ${planet.traits.hi} है - जो विशेष रूप से ${h.careerAngle.hi} को आकार देती है। यह आपको स्वाभाविक रूप से ${careerAreasHi} जैसे क्षेत्रों की ओर प्रवृत्त करता है। ${guidance.hi}`;
            } else {
                en = `Your 10th house (career/profession) lord ${planet.name.en} is placed in the ${house}${ordinalSuffix(house)} house (${h.name.en}). This means your profession itself is deeply connected with ${h.signification.en}. ${capitalize(planet.traits.en)} - so success in your career comes through ${h.careerAngle.en}. Career fields like ${careerAreasEn} are strongly favoured. ${guidance.en}`;
                hi = `आपका दशमेश (करियर/व्यवसाय स्वामी) ${planet.name.hi} ${house}वें भाव (${h.name.hi}) में स्थित है। इसका अर्थ है कि आपका व्यवसाय स्वयं ${h.signification.hi} से गहराई से जुड़ा है। यह ${planet.traits.hi} है - इसलिए आपके करियर में सफलता ${h.careerAngle.hi} के माध्यम से मिलती है। ${careerAreasHi} जैसे करियर क्षेत्र अत्यंत अनुकूल हैं। ${guidance.hi}`;
            }

            out[key] = {
                key,
                role,
                planet: planetKey,
                planetName: planet.name,
                house,
                houseName: h.name,
                text: { en, hi }
            };
        }
    });
    writeJson(role === 'lagna' ? 'lagnaLordInHouse.json' : 'tenthLordInHouse.json', out);
}

function ordinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// 8. GENERATE: planetInHouse1.json & planetInHouse10.json (9 grahas)
// ---------------------------------------------------------------------------

function generatePlanetInHouseTable(houseNum) {
    const out = {};
    const h = HOUSES[houseNum];
    ALL_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        const careerAreasEn = planet.careerAreas.en.slice(0, 3).join(', ');
        const careerAreasHi = planet.careerAreas.hi.slice(0, 3).join(', ');

        let en, hi;
        if (houseNum === 1) {
            en = `${planet.name.en} placed in the 1st house (Lagna) sits right on the Ascendant and directly colours your personality, physical presence, and overall approach to career. It carries ${planet.traits.en}. This placement inclines you towards ${careerAreasEn}, and others perceive you through this planet's qualities - a strong, visible personal-brand effect on your professional life.`;
            hi = `${planet.name.hi} का प्रथम भाव (लग्न) में स्थित होना सीधे लग्न पर बैठकर आपके व्यक्तित्व, शारीरिक उपस्थिति और करियर के प्रति समग्र दृष्टिकोण को रंग देता है। इसमें ${planet.traits.hi} है। यह स्थिति आपको ${careerAreasHi} की ओर प्रवृत्त करती है, और अन्य लोग आपको इस ग्रह के गुणों के माध्यम से देखते हैं - जो आपके व्यावसायिक जीवन पर एक मज़बूत, दृश्यमान व्यक्तिगत-छवि प्रभाव है।`;
        } else {
            en = `${planet.name.en} placed directly in the 10th house (career house) has a strong, immediate influence on your profession and public image, since it occupies the very house of career/karma. It carries ${planet.traits.en}. This placement strongly favours ${careerAreasEn}, and tends to bring visible recognition tied to this planet's nature in your professional field.`;
            hi = `${planet.name.hi} का सीधे दशम भाव (करियर भाव) में स्थित होना आपके व्यवसाय और सार्वजनिक छवि पर एक मज़बूत, तत्काल प्रभाव डालता है, क्योंकि यह स्वयं करियर/कर्म के भाव में स्थित है। इसमें ${planet.traits.hi} है। यह स्थिति ${careerAreasHi} के लिए अत्यंत अनुकूल है, और आपके व्यावसायिक क्षेत्र में इस ग्रह की प्रकृति से जुड़ी दृश्यमान पहचान लाती है।`;
        }

        out[planetKey] = {
            key: planetKey,
            planet: planetKey,
            planetName: planet.name,
            house: houseNum,
            houseName: h.name,
            text: { en, hi }
        };
    });
    writeJson(houseNum === 1 ? 'planetInHouse1.json' : 'planetInHouse10.json', out);
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
            const tone = RELATION_TONE_LORD.en[relation === 'own' ? 'own' : relation];
            const toneHi = RELATION_TONE_LORD.hi[relation === 'own' ? 'own' : relation];

            const areasEnA = pa.careerAreas.en.slice(0, 2).join(' and ');
            const areasEnB = pb.careerAreas.en.slice(0, 2).join(' and ');
            const areasHiA = pa.careerAreas.hi.slice(0, 2).join(' और ');
            const areasHiB = pb.careerAreas.hi.slice(0, 2).join(' और ');

            const en = `A conjunction of ${pa.name.en} and ${pb.name.en} blends ${pa.traits.en} with ${pb.traits.en}. ${tone} For career, this combination favours fields that merge ${areasEnA} with ${areasEnB} - a hybrid path that draws on both planets' strengths. When this conjunction falls in or influences the 1st or 10th house, its effect on career becomes especially direct.`;
            const hi = `${pa.name.hi} और ${pb.name.hi} की युति ${pa.traits.hi} को ${pb.traits.hi} के साथ मिलाती है। ${toneHi} करियर के लिए, यह संयोजन ${areasHiA} को ${areasHiB} के साथ जोड़ने वाले क्षेत्रों के लिए अनुकूल है - एक ऐसा मिश्रित मार्ग जो दोनों ग्रहों की शक्तियों का लाभ उठाता है। जब यह युति प्रथम या दशम भाव में हो या उसे प्रभावित करे, तो करियर पर इसका प्रभाव विशेष रूप से प्रत्यक्ष हो जाता है।`;

            out[key] = {
                key,
                planets: [a, b],
                planetNames: [pa.name, pb.name],
                relation,
                text: { en, hi }
            };
        }
    }
    writeJson('conjunctions.json', out);
}

// ---------------------------------------------------------------------------
// 10. GENERATE: tenthLordInNavamsa.json (7 lords x 12 signs = 84 rows)
// ---------------------------------------------------------------------------

const RELATION_STRENGTH_TONE = {
    en: {
        own: 'This is the planet\'s own sign in the Navamsa, a position of great strength - it strongly confirms and stabilises the career indications from the Rashi (D-1) chart, supporting long-term professional success.',
        friend: 'This is a friendly sign for the planet in the Navamsa, which supports and strengthens the career promise seen in the birth chart, adding stability to professional growth.',
        neutral: 'This is a neutral sign for the planet in the Navamsa, giving moderate, mixed support to career growth - outcomes depend significantly on other chart factors and personal effort.',
        enemy: 'This is a challenging (enemy) sign for the planet in the Navamsa, which can weaken or delay the career promise, bringing extra struggle, competition, or instability before success is achieved.'
    },
    hi: {
        own: 'नवांश में यह ग्रह की अपनी राशि है, जो अत्यंत बल की स्थिति है - यह राशि (डी-1) कुंडली से दिखने वाले करियर संकेतों की दृढ़ता से पुष्टि और स्थिरता प्रदान करती है, जिससे दीर्घकालिक व्यावसायिक सफलता को समर्थन मिलता है।',
        friend: 'नवांश में यह ग्रह के लिए एक मित्र राशि है, जो जन्म कुंडली में दिखने वाले करियर वादे का समर्थन और सुदृढ़ीकरण करती है, तथा व्यावसायिक वृद्धि में स्थिरता जोड़ती है।',
        neutral: 'नवांश में यह ग्रह के लिए एक तटस्थ राशि है, जो करियर वृद्धि को मध्यम, मिश्रित समर्थन देती है - परिणाम अन्य कुंडली कारकों और व्यक्तिगत प्रयास पर काफी हद तक निर्भर करते हैं।',
        enemy: 'नवांश में यह ग्रह के लिए एक चुनौतीपूर्ण (शत्रु) राशि है, जो करियर वादे को कमज़ोर या विलंबित कर सकती है, और सफलता मिलने से पहले अतिरिक्त संघर्ष, प्रतिस्पर्धा या अस्थिरता ला सकती है।'
    }
};

function elementHi(element) {
    return { fire: 'अग्नि', earth: 'पृथ्वी', air: 'वायु', water: 'जल' }[element];
}
function qualityHi(quality) {
    return { movable: 'चर', fixed: 'स्थिर', dual: 'द्विस्वभाव' }[quality];
}

function generateLordInNavamsaSignTable(role) {
    // role: 'lagna' | 'tenth' - which D-1 house-lord's D-9 sign placement this describes
    const out = {};
    const roleLabelEn = role === 'lagna' ? 'Lagna lord' : '10th lord';
    const roleLabelHi = role === 'lagna' ? 'लग्नेश' : 'दशमेश';
    const roleNoteEn = role === 'lagna'
        ? 'the deeper, long-term strength and true sustainability of your core personality and self-driven life path'
        : 'the deeper, long-term strength and true sustainability of the career path shown by your 10th house';
    const roleNoteHi = role === 'lagna'
        ? 'आपके मूल व्यक्तित्व और आत्म-प्रेरित जीवन-पथ की गहरी, दीर्घकालिक शक्ति और वास्तविक स्थायित्व'
        : 'आपके दशम भाव द्वारा दर्शाए गए करियर पथ की गहरी, दीर्घकालिक शक्ति और वास्तविक स्थायित्व';

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

            const en = `In the Navamsa (D-9) chart, your ${roleLabelEn} ${planet.name.en} is placed in ${sign.name.en}, ruled by ${PLANETS[sign.lord].name.en}. ${strengthTone} Since ${sign.name.en} is a ${sign.element}-element, ${sign.quality} sign, it ${elementTrait.en}, and ${qualityTrait.en}. Overall, this D-9 placement of the ${roleLabelEn.toLowerCase()} indicates ${roleNoteEn}.`;
            const hi = `नवांश (डी-9) कुंडली में, आपका ${roleLabelHi} ${planet.name.hi} ${sign.name.hi} राशि में स्थित है, जिसके स्वामी ${PLANETS[sign.lord].name.hi} हैं। ${strengthToneHi} चूंकि ${sign.name.hi} एक ${elementHi(sign.element)}-तत्व, ${qualityHi(sign.quality)} राशि है, यह ${elementTrait.hi}, और ${qualityTrait.hi}। कुल मिलाकर, ${roleLabelHi} की यह डी-9 स्थिति ${roleNoteHi} को इंगित करती है।`;

            out[key] = {
                key,
                role,
                planet: planetKey,
                planetName: planet.name,
                navamsaSign: signKey,
                navamsaSignName: sign.name,
                relation,
                text: { en, hi }
            };
        });
    });
    writeJson(role === 'lagna' ? 'lagnaLordInNavamsa.json' : 'tenthLordInNavamsa.json', out);
}

// ---------------------------------------------------------------------------
// 10b. GENERATE: lagnaLordInNavamsaHouse.json & tenthLordInNavamsaHouse.json
//      (7 lords x 12 HOUSE NUMBERS, counted from the Navamsa's own ascendant)
// ---------------------------------------------------------------------------

function generateLordInNavamsaHouseTable(role) {
    // role: 'lagna' | 'tenth'
    const out = {};
    const roleLabelEn = role === 'lagna' ? 'Lagna lord' : '10th lord';
    const roleLabelHi = role === 'lagna' ? 'लग्नेश' : 'दशमेश';

    LORD_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        for (let house = 1; house <= 12; house++) {
            const h = HOUSES[house];
            const key = `${planetKey}_${house}`;
            const guidance = HOUSE_CATEGORY_GUIDANCE[h.category];

            let en, hi;
            if (role === 'lagna') {
                en = `In the Navamsa (D-9) chart, your Lagna lord ${planet.name.en} falls in the ${house}${ordinalSuffix(house)} house counted from the Navamsa's own Ascendant. Since the D-9 chart reveals the deeper, destined strength behind what the Rashi (D-1) chart promises, this shows that your inner personality and life-purpose draw hidden strength from ${h.signification.en}, particularly regarding ${h.careerAngle.en}. ${guidance.en} This reflects how sustainable and deeply-rooted your core personality traits and life-drive really are, beyond surface appearances.`;
                hi = `नवांश (डी-9) कुंडली में, आपका लग्नेश ${planet.name.hi} नवांश के अपने लग्न से गिनने पर ${house}वें भाव में पड़ता है। चूंकि डी-9 कुंडली राशि (डी-1) कुंडली द्वारा दिए गए वादों के पीछे की गहरी, नियति-निर्धारित शक्ति को दर्शाती है, यह बताता है कि आपका आंतरिक व्यक्तित्व और जीवन-उद्देश्य ${h.signification.hi} से छिपी हुई शक्ति प्राप्त करता है, विशेष रूप से ${h.careerAngle.hi} के संबंध में। ${guidance.hi} यह दर्शाता है कि सतही दिखावे से परे, आपके मूल व्यक्तित्व लक्षण और जीवन-प्रेरणा वास्तव में कितने स्थायी और गहराई से जड़ें जमाए हुए हैं।`;
            } else {
                en = `In the Navamsa (D-9) chart, your 10th lord ${planet.name.en} falls in the ${house}${ordinalSuffix(house)} house counted from the Navamsa's own Ascendant. This reveals whether the career promise seen in your Rashi (D-1) chart actually holds up and sustains over time - it shows a deep, destined connection between your profession and ${h.signification.en}, particularly regarding ${h.careerAngle.en}. ${guidance.en} A well-placed 10th lord here confirms genuine, long-term career fulfilment rather than just a surface-level promise.`;
                hi = `नवांश (डी-9) कुंडली में, आपका दशमेश ${planet.name.hi} नवांश के अपने लग्न से गिनने पर ${house}वें भाव में पड़ता है। यह दर्शाता है कि क्या आपकी राशि (डी-1) कुंडली में दिखने वाला करियर वादा वास्तव में समय के साथ टिकता और बना रहता है - यह आपके व्यवसाय और ${h.signification.hi} के बीच एक गहरा, नियति-निर्धारित संबंध दिखाता है, विशेष रूप से ${h.careerAngle.hi} के संबंध में। ${guidance.hi} यहाँ एक अच्छी तरह स्थित दशमेश एक सतही वादे के बजाय वास्तविक, दीर्घकालिक करियर पूर्णता की पुष्टि करता है।`;
            }

            out[key] = {
                key,
                role,
                planet: planetKey,
                planetName: planet.name,
                navamsaHouse: house,
                navamsaHouseName: h.name,
                text: { en, hi }
            };
        }
    });
    writeJson(role === 'lagna' ? 'lagnaLordInNavamsaHouse.json' : 'tenthLordInNavamsaHouse.json', out);
}

// ---------------------------------------------------------------------------
// 12. GENERATE: firstHouseConjunctionYogas.json & tenthHouseConjunctionYogas.json
//      (12 lagnas x 36 planet pairs) - lagna-aware named-Yoga detection for
//      conjunctions occurring specifically in the 1st or 10th house.
// ---------------------------------------------------------------------------

const YOGA_TEXT = {
    raja_yoga: {
        en: (houseNum, houseLabel) => `This conjunction forms a classic **Raja Yoga** for this Lagna (a union between a Kendra-house lord and a Trikona-house lord), occurring right in the ${houseLabel}. Raja Yoga is one of the most powerful combinations in Vedic (Parashari) astrology - it indicates authority, status, recognition, and a significant rise in ${houseNum === 1 ? 'personal standing, confidence, and overall life direction' : 'career, public profession, and professional authority'}, often bringing leadership positions, government favour, or high professional rank.`,
        hi: (houseNum, houseLabel) => `यह युति इस लग्न के लिए एक क्लासिक **राज योग** बनाती है (एक केंद्र भाव स्वामी और एक त्रिकोण भाव स्वामी का मिलन), जो सीधे ${houseLabel} में हो रही है। राज योग वैदिक (पाराशरी) ज्योतिष के सबसे शक्तिशाली संयोजनों में से एक है - यह ${houseNum === 1 ? 'व्यक्तिगत प्रतिष्ठा, आत्मविश्वास और समग्र जीवन दिशा' : 'करियर, सार्वजनिक व्यवसाय और व्यावसायिक अधिकार'} में सत्ता, प्रतिष्ठा, सम्मान और उल्लेखनीय उन्नति को दर्शाता है, जो प्रायः नेतृत्व पद, सरकारी अनुकूलता या उच्च व्यावसायिक पद लाता है।`
    },
    dhana_yoga: {
        en: (houseNum, houseLabel) => `This conjunction forms a **Dhana Yoga** for this Lagna (a wealth-house lord - 2nd or 11th - combining with another wealth-linked lord), occurring in the ${houseLabel}. This strongly favours financial prosperity, multiple income streams, and material success connected to ${houseNum === 1 ? 'your personal effort and image' : 'your profession itself'}.`,
        hi: (houseNum, houseLabel) => `यह युति इस लग्न के लिए एक **धन योग** बनाती है (एक धन-भाव स्वामी - द्वितीय या एकादश - का किसी अन्य धन-संबंधी स्वामी के साथ संयोजन), जो ${houseLabel} में हो रही है। यह ${houseNum === 1 ? 'आपके व्यक्तिगत प्रयास और छवि' : 'स्वयं आपके व्यवसाय'} से जुड़ी वित्तीय समृद्धि, आय के कई स्रोतों और भौतिक सफलता के लिए अत्यंत अनुकूल है।`
    },
    vipreet_raja_yoga: {
        en: (houseNum, houseLabel) => `This conjunction forms a **Vipreet Raja Yoga**-type combination for this Lagna (both planets rule only Dusthana houses - 6th, 8th or 12th), occurring in the ${houseLabel}. Counter-intuitively, this can bring success through reversal of fortune - initial struggle, obstacles, litigation, or competition that, once overcome, leads to unexpected rise, often in research, crisis-management, service, or specialised/behind-the-scenes fields.`,
        hi: (houseNum, houseLabel) => `यह युति इस लग्न के लिए एक **विपरीत राज योग**-प्रकार का संयोजन बनाती है (दोनों ग्रह केवल दुःस्थान भावों - षष्ठ, अष्टम या द्वादश - के स्वामी हैं), जो ${houseLabel} में हो रही है। विरोधाभासी रूप से, यह भाग्य के उलटफेर के माध्यम से सफलता ला सकता है - प्रारंभिक संघर्ष, बाधाएँ, मुकदमेबाज़ी या प्रतिस्पर्धा, जिन्हें पार करने के बाद अप्रत्याशित उन्नति मिलती है, प्रायः शोध, संकट-प्रबंधन, सेवा या विशिष्ट/पर्दे के पीछे के क्षेत्रों में।`
    },
    general: {
        en: (houseNum, houseLabel) => `For this specific Lagna, this conjunction does not form one of the classical named Yogas (Raja/Dhana/Vipreet Raja) - the two planets involved do not share a Kendra-Trikona, Dhana, or pure-Dusthana lordship relationship here. Its effect in the ${houseLabel} is best read through the individual planetary conjunction meaning and each planet's own placement.`,
        hi: (houseNum, houseLabel) => `इस विशिष्ट लग्न के लिए, यह युति क्लासिक नामित योगों (राज/धन/विपरीत राज) में से कोई नहीं बनाती - यहाँ दोनों ग्रहों का केंद्र-त्रिकोण, धन, या शुद्ध-दुःस्थान स्वामित्व संबंध नहीं है। ${houseLabel} में इसका प्रभाव सर्वोत्तम रूप से व्यक्तिगत ग्रह-युति अर्थ और प्रत्येक ग्रह की अपनी स्थिति के माध्यम से समझा जाता है।`
    }
};

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

function generateHouseConjunctionYogas(houseNum) {
    const out = {};
    const h = HOUSES[houseNum];
    const houseLabelEn = houseNum === 1 ? '1st house (Lagna)' : '10th house (career house)';
    const houseLabelHi = houseNum === 1 ? 'प्रथम भाव (लग्न)' : 'दशम भाव (करियर भाव)';

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

                let en = template.en(houseNum, houseLabelEn);
                let hi = template.hi(houseNum, houseLabelHi);
                if (isYogakarakaInvolved) {
                    en += ` Notably, ${PLANETS[yogakaraka].name.en} - the Yogakaraka for ${RASHIS[lagnaKey].name.en} Lagna - is part of this combination, which further amplifies its auspicious, career-boosting effect.`;
                    hi += ` उल्लेखनीय है कि ${PLANETS[yogakaraka].name.hi} - जो ${RASHIS[lagnaKey].name.hi} लग्न के लिए योगकारक ग्रह है - इस संयोजन का हिस्सा है, जो इसके शुभ, करियर-वर्धक प्रभाव को और बढ़ाता है।`;
                }

                out[key] = {
                    key,
                    lagna: lagnaKey,
                    lagnaName: RASHIS[lagnaKey].name,
                    planets: [a, b],
                    planetNames: [PLANETS[a].name, PLANETS[b].name],
                    house: houseNum,
                    houseName: h.name,
                    yogaType,
                    yogakarakaInvolved: !!isYogakarakaInvolved,
                    text: { en, hi }
                };
            }
        }
    });
    writeJson(houseNum === 1 ? 'firstHouseConjunctionYogas.json' : 'tenthHouseConjunctionYogas.json', out);
}

// ---------------------------------------------------------------------------
// 13. GENERATE: classicalPairYogas.json - well-known, lagna-INDEPENDENT named
//      Yogas formed purely by two specific grahas conjoining (regardless of house-lordship).
// ---------------------------------------------------------------------------

const CLASSICAL_PAIR_YOGAS = {
    sun_mercury: {
        name: { en: 'Budh-Aditya Yoga', hi: 'बुध-आदित्य योग' },
        text: {
            en: 'Sun and Mercury together form Budh-Aditya Yoga, blending authority/leadership with sharp intellect and communication skill. This favours careers in government, administration, business analytics, media, and any field where intelligent decision-making and public authority combine.',
            hi: 'सूर्य और बुध मिलकर बुध-आदित्य योग बनाते हैं, जो अधिकार/नेतृत्व को तीक्ष्ण बुद्धि और संचार कौशल के साथ जोड़ता है। यह सरकार, प्रशासन, व्यावसायिक विश्लेषण, मीडिया और किसी भी ऐसे क्षेत्र में करियर के लिए अनुकूल है जहाँ बुद्धिमान निर्णय-क्षमता और सार्वजनिक अधिकार एक साथ आते हैं।'
        }
    },
    moon_jupiter: {
        name: { en: 'Gajakesari Yoga', hi: 'गजकेसरी योग' },
        text: {
            en: 'Moon and Jupiter together form Gajakesari Yoga, one of the most celebrated combinations for wisdom, reputation, and prosperity. This favours careers in teaching, counselling, law, finance, and any advisory or public-facing role where good judgement and likeability bring lasting respect and success.',
            hi: 'चंद्रमा और बृहस्पति मिलकर गजकेसरी योग बनाते हैं, जो ज्ञान, प्रतिष्ठा और समृद्धि के लिए सबसे प्रशंसित संयोजनों में से एक है। यह शिक्षण, परामर्श, कानून, वित्त और किसी भी सलाहकारी या जनसंपर्क भूमिका के लिए अनुकूल है जहाँ अच्छा निर्णय और लोकप्रियता स्थायी सम्मान और सफलता लाती है।'
        }
    },
    moon_mars: {
        name: { en: 'Chandra-Mangal Yoga', hi: 'चंद्र-मंगल योग' },
        text: {
            en: 'Moon and Mars together form Chandra-Mangal Yoga, a strong wealth-generating combination that blends emotional drive with bold action. This favours careers in real estate, business ventures, food/liquid-related trade, and entrepreneurial fields where quick decisive action creates financial gain.',
            hi: 'चंद्रमा और मंगल मिलकर चंद्र-मंगल योग बनाते हैं, जो भावनात्मक प्रेरणा को साहसिक कार्यवाही के साथ जोड़ने वाला एक मज़बूत धन-सृजनकारी संयोजन है। यह रियल एस्टेट, व्यावसायिक उद्यम, खाद्य/तरल पदार्थ-संबंधी व्यापार और उद्यमशील क्षेत्रों के लिए अनुकूल है जहाँ त्वरित निर्णायक कार्यवाही वित्तीय लाभ उत्पन्न करती है।'
        }
    },
    mars_jupiter: {
        name: { en: 'Guru-Mangal Yoga', hi: 'गुरु-मंगल योग' },
        text: {
            en: 'Mars and Jupiter together form Guru-Mangal Yoga, combining courage and technical energy with wisdom and principled judgement. This favours careers in engineering, law, defence leadership, sports administration, and property/finance fields that need both bold execution and sound ethical direction.',
            hi: 'मंगल और बृहस्पति मिलकर गुरु-मंगल योग बनाते हैं, जो साहस और तकनीकी ऊर्जा को ज्ञान और सिद्धांतनिष्ठ निर्णय के साथ जोड़ता है। यह इंजीनियरिंग, कानून, रक्षा नेतृत्व, खेल प्रशासन और संपत्ति/वित्त क्षेत्रों के लिए अनुकूल है जिन्हें साहसिक क्रियान्वयन और सुदृढ़ नैतिक दिशा दोनों की आवश्यकता होती है।'
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
                        en: 'This planetary pair does not carry one of the small set of universally-recognised classical Yoga names (like Budh-Aditya or Gajakesari) independent of house-lordship. Refer to the general conjunction meaning, and to the lagna-specific Raja/Dhana/Vipreet Raja Yoga check for this pair in the 1st/10th house tables.',
                        hi: 'यह ग्रह-युग्म किसी सर्वमान्य क्लासिक योग नाम (जैसे बुध-आदित्य या गजकेसरी) के तहत नहीं आता, जो भाव-स्वामित्व से स्वतंत्र हो। सामान्य युति अर्थ देखें, और इस युग्म के लिए प्रथम/दशम भाव की तालिकाओं में लग्न-विशिष्ट राज/धन/विपरीत राज योग जाँच देखें।'
                    }
            };
        }
    }
    writeJson('classicalPairYogas.json', out);
}

// ---------------------------------------------------------------------------
// 11. GENERATE: manifest / index.json (metadata + counts, used by the engine)
// ---------------------------------------------------------------------------

function generateManifest() {
    const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
    const manifest = {
        generatedAt: new Date().toISOString(),
        description: 'Career astrology combination dataset (Vedic/Parashari), covering Lagna lord placement, 10th lord placement, planets in 1st/10th house, generic planetary conjunctions, lagna-independent classical pair-Yogas (Budh-Aditya, Gajakesari, etc.), lagna-aware Raja/Dhana/Vipreet-Raja Yoga detection for 1st/10th-house conjunctions, and both the Lagna lord\'s and 10th lord\'s placement in Navamsa (D-9) by sign AND by house-number. Bilingual (English/Hindi). Generated by scripts/generateCareerAstrologyDataset.js - do not hand-edit, re-run the generator instead.',
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

console.log('Generating career astrology dataset...');
generateReferenceTables();
generateLagnaBase();
generateLordInHouseTable('lagna');
generateLordInHouseTable('tenth');
generatePlanetInHouseTable(1);
generatePlanetInHouseTable(10);
generateConjunctions();
generateLordInNavamsaSignTable('lagna');
generateLordInNavamsaSignTable('tenth');
generateLordInNavamsaHouseTable('lagna');
generateLordInNavamsaHouseTable('tenth');
generateHouseConjunctionYogas(1);
generateHouseConjunctionYogas(10);
generateClassicalPairYogas();
generateManifest();
console.log('Done. Output directory:', OUT_DIR);
