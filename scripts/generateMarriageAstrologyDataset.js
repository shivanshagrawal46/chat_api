/**
 * generateMarriageAstrologyDataset.js
 *
 * SOURCE OF TRUTH for the Marriage Astrology Dataset.
 *
 * This is the marriage counterpart of generateCareerAstrologyDataset.js.
 * Same six-factor technique, same lagna-aware Yoga engine, same fast
 * O(1)-lookup dataset design - the ONLY structural change is that the
 * "10th house / 10th lord" (career/profession) factor is replaced by the
 * "7th house / 7th lord" (marriage/spouse/partnership) factor, and every
 * piece of content is reframed from career language to marriage language.
 *
 * Six factors covered:
 *   1. Lagna lord + the house it occupies              -> lagnaLordInHouse.json
 *   2. 7th lord (marriage significator) + its house     -> seventhLordInHouse.json
 *   3. Planets sitting in the 1st house                 -> planetInHouse1.json
 *   4. Planets sitting in the 7th house                 -> planetInHouse7.json
 *   5. Conjunctions + classical/lagna-aware Yogas in     -> conjunctions.json,
 *        the 1st/7th house                                  classicalPairYogas.json,
 *                                                            firstHouseConjunctionYogas.json,
 *                                                            seventhHouseConjunctionYogas.json
 *   6. Lagna lord's AND 7th lord's placement in the      -> lagnaLordInNavamsa.json,
 *        Navamsa (D-9) - by SIGN and by HOUSE NUMBER        seventhLordInNavamsa.json,
 *        (D-9 is classically THE marriage chart, so this    lagnaLordInNavamsaHouse.json,
 *        factor carries extra weight here)                  seventhLordInNavamsaHouse.json
 *
 * Why a generator instead of hand-written JSON? See generateCareerAstrologyDataset.js
 * for the full rationale (the combinatorial space is billions of rows; this
 * decomposes into atomic factor-tables and composes a chart's reading at query time).
 *
 * Run:  node scripts/generateMarriageAstrologyDataset.js
 * Output: data/astrology/marriage/*.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'data', 'astrology', 'marriage');

// ---------------------------------------------------------------------------
// 1. ATOMIC DATA: PLANETS (Grahas) - identity + MARRIAGE significations
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
        marriageAreas: {
            en: ['a spouse who is authoritative, proud, and status-conscious', 'a partner connected with government, administration, or leadership roles', 'a relationship where ego and mutual respect need conscious balancing', 'a marriage that visibly raises your social standing', 'a father-figure-like, protective quality in the partner'],
            hi: ['एक अधिकारपूर्ण, स्वाभिमानी और प्रतिष्ठा-सजग जीवनसाथी', 'सरकार, प्रशासन या नेतृत्व भूमिकाओं से जुड़ा साथी', 'एक ऐसा रिश्ता जहाँ अहं और पारस्परिक सम्मान का सचेत संतुलन आवश्यक है', 'एक विवाह जो आपकी सामाजिक प्रतिष्ठा को स्पष्ट रूप से बढ़ाता है', 'साथी में पिता-तुल्य, संरक्षणात्मक गुण']
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
            en: 'a receptive, nurturing, and emotionally sensitive energy centered on care, mood, and domestic comfort',
            hi: 'एक ग्रहणशील, पोषणकारी और भावनात्मक रूप से संवेदनशील ऊर्जा, जो देखभाल, मनोदशा और घरेलू सुख पर केंद्रित है'
        },
        marriageAreas: {
            en: ['a caring, emotionally attuned, and nurturing spouse', 'strong emotional bonding and empathetic understanding between partners', 'a relationship where mood swings need gentle handling', 'a home-loving partner who prioritises domestic comfort', 'a spouse who may be publicly liked or involved in caregiving/hospitality fields'],
            hi: ['एक देखभाल करने वाला, भावनात्मक रूप से जुड़ा और पोषणकारी जीवनसाथी', 'साथियों के बीच मज़बूत भावनात्मक जुड़ाव और सहानुभूतिपूर्ण समझ', 'एक ऐसा रिश्ता जहाँ मनोदशा में उतार-चढ़ाव को कोमलता से संभालने की आवश्यकता है', 'घर-प्रेमी साथी जो घरेलू सुख को प्राथमिकता देता है', 'एक साथी जो सार्वजनिक रूप से पसंद किया जाए या देखभाल/आतिथ्य क्षेत्रों से जुड़ा हो']
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
            en: 'a bold, energetic, and passionate drive centered on courage, protectiveness, and quick action',
            hi: 'एक साहसी, ऊर्जावान और भावुक प्रवृत्ति, जो साहस, संरक्षण और त्वरित कार्यवाही पर केंद्रित है'
        },
        marriageAreas: {
            en: ['a passionate, energetic, and protective spouse', 'a relationship with strong physical chemistry but a tendency towards arguments if unchecked', 'a partner connected with engineering, defence, sports, or technical fields', 'possible early friction, delays, or the classical "Mangal Dosha" concern before the relationship stabilises', 'a marriage that grows stronger once mutual patience and respect are established'],
            hi: ['एक भावुक, ऊर्जावान और संरक्षणात्मक जीवनसाथी', 'एक ऐसा रिश्ता जिसमें मज़बूत शारीरिक आकर्षण हो परन्तु बिना संयम के बहस की प्रवृत्ति भी हो', 'इंजीनियरिंग, रक्षा, खेल या तकनीकी क्षेत्रों से जुड़ा साथी', 'रिश्ते के स्थिर होने से पहले संभावित प्रारंभिक टकराव, देरी या क्लासिक "मंगल दोष" की चिंता', 'एक विवाह जो पारस्परिक धैर्य और सम्मान स्थापित होने के बाद अधिक मज़बूत होता है']
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
            en: 'a sharp, witty, and communicative intelligence centered on conversation, logic, and playful youthfulness',
            hi: 'एक तीक्ष्ण, विनोदी और संचार-कुशल बुद्धि, जो बातचीत, तर्क और चंचल यौवन पर केंद्रित है'
        },
        marriageAreas: {
            en: ['a communicative, witty, and intellectually engaging spouse', 'a relationship where conversation, humour, and shared interests matter greatly', 'a partner connected with business, writing, media, or analytical fields', 'a youthful, adaptable dynamic between partners', 'a need to guard against overthinking or emotional detachment in the relationship'],
            hi: ['एक संचार-कुशल, विनोदी और बौद्धिक रूप से आकर्षक जीवनसाथी', 'एक ऐसा रिश्ता जहाँ बातचीत, हास्य और साझा रुचियाँ बहुत मायने रखती हैं', 'व्यापार, लेखन, मीडिया या विश्लेषणात्मक क्षेत्रों से जुड़ा साथी', 'साथियों के बीच एक युवा, अनुकूलनीय गतिशीलता', 'रिश्ते में अत्यधिक विचार-मंथन या भावनात्मक दूरी से बचने की आवश्यकता']
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
            en: 'a wise, expansive, and principled energy centered on wisdom, generosity, and moral guidance',
            hi: 'एक ज्ञानी, विस्तारवादी और सिद्धांतनिष्ठ ऊर्जा, जो ज्ञान, उदारता और नैतिक मार्गदर्शन पर केंद्रित है'
        },
        marriageAreas: {
            en: ['a wise, respected, and morally-grounded spouse', 'one of the most auspicious placements for marital happiness and mutual growth', 'a partner connected with teaching, law, finance, or spiritual/advisory fields', 'a marriage that brings blessings, prosperity, and long-term stability', 'a relationship built on trust, guidance, and shared values'],
            hi: ['एक ज्ञानी, सम्मानित और नैतिक रूप से दृढ़ जीवनसाथी', 'वैवाहिक सुख और पारस्परिक विकास के लिए सबसे शुभ स्थितियों में से एक', 'शिक्षण, कानून, वित्त या आध्यात्मिक/सलाहकारी क्षेत्रों से जुड़ा साथी', 'एक विवाह जो आशीर्वाद, समृद्धि और दीर्घकालिक स्थिरता लाता है', 'विश्वास, मार्गदर्शन और साझा मूल्यों पर आधारित एक रिश्ता']
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
            en: 'a graceful, romantic, and diplomatic charm centered on love, beauty, and harmonious partnership',
            hi: 'एक सुंदर, रोमांटिक और कूटनीतिक आकर्षण, जो प्रेम, सौंदर्य और सामंजस्यपूर्ण साझेदारी पर केंद्रित है'
        },
        marriageAreas: {
            en: ['a romantic, charming, and aesthetically-inclined spouse', 'the single strongest natural indicator of love, attraction, and marital harmony', 'a higher likelihood of a love marriage or a strongly romantic courtship', 'a partner connected with arts, fashion, beauty, or luxury/hospitality fields', 'a relationship marked by affection, comfort, and mutual enjoyment of life\'s pleasures'],
            hi: ['एक रोमांटिक, आकर्षक और सौंदर्य-प्रिय जीवनसाथी', 'प्रेम, आकर्षण और वैवाहिक सामंजस्य का सबसे मज़बूत प्राकृतिक संकेतक', 'प्रेम-विवाह या अत्यंत रोमांटिक प्रणय-निवेदन की अधिक संभावना', 'कला, फैशन, सौंदर्य या विलासिता/आतिथ्य क्षेत्रों से जुड़ा साथी', 'स्नेह, सुख-सुविधा और जीवन के आनंद के पारस्परिक भोग से चिह्नित एक रिश्ता']
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
            en: 'a disciplined, patient, and reserved nature centered on responsibility, maturity, and long-term commitment',
            hi: 'एक अनुशासित, धैर्यवान और संयमित स्वभाव, जो ज़िम्मेदारी, परिपक्वता और दीर्घकालिक प्रतिबद्धता पर केंद्रित है'
        },
        marriageAreas: {
            en: ['a mature, disciplined, and often older or more reserved spouse', 'a tendency towards delayed marriage or a slow, cautious courtship', 'a partner connected with labour-intensive, structured, or service-oriented professions', 'a relationship that may feel distant or cold initially but deepens into a very stable, dependable bond', 'marriage built on duty, patience, and long-term loyalty rather than early excitement'],
            hi: ['एक परिपक्व, अनुशासित और प्रायः अधिक आयु वाला या संयमित जीवनसाथी', 'विवाह में देरी या धीमी, सतर्क प्रणय-प्रक्रिया की प्रवृत्ति', 'श्रम-प्रधान, संरचित या सेवा-उन्मुख व्यवसायों से जुड़ा साथी', 'एक ऐसा रिश्ता जो शुरू में दूर या ठंडा महसूस हो सकता है परन्तु एक अत्यंत स्थिर, भरोसेमंद बंधन में गहरा होता है', 'प्रारंभिक उत्साह के बजाय कर्तव्य, धैर्य और दीर्घकालिक निष्ठा पर निर्मित विवाह']
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
            en: 'an intense, unconventional, and obsessive drive centered on infatuation, boundary-crossing, and sudden events',
            hi: 'एक तीव्र, अपरंपरागत और गहन प्रवृत्ति, जो मोह, सीमा-उल्लंघन और अचानक घटनाओं पर केंद्रित है'
        },
        marriageAreas: {
            en: ['an unconventional match - possibly crossing caste, community, religion, or country boundaries', 'intense attraction or infatuation-driven courtship', 'a sudden, unexpected, or fast-moving path to marriage', 'a partner connected with foreign lands, technology, or unconventional fields', 'a need for caution against illusion, secrecy, or deception in the relationship'],
            hi: ['एक अपरंपरागत मेल - संभवतः जाति, समुदाय, धर्म या देश की सीमाओं को पार करते हुए', 'तीव्र आकर्षण या मोह-प्रेरित प्रणय-निवेदन', 'विवाह की ओर एक अचानक, अप्रत्याशित या तीव्र गति वाला मार्ग', 'विदेश, तकनीक या अपरंपरागत क्षेत्रों से जुड़ा साथी', 'रिश्ते में भ्रम, गोपनीयता या छल से सावधान रहने की आवश्यकता']
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
            en: 'a detached, introspective, and spiritually-inclined depth centered on renunciation, intuition, and inward focus',
            hi: 'एक विरक्त, आत्मनिरीक्षी और आध्यात्मिक रूप से झुकी हुई गहराई, जो त्याग, अंतर्ज्ञान और आंतरिक केंद्रितता पर केंद्रित है'
        },
        marriageAreas: {
            en: ['a private, spiritually or introspectively inclined spouse', 'a tendency towards emotional detachment or reduced interest in worldly relationship dynamics', 'a relationship carrying a "past-life connection" quality, feeling destined rather than pursued', 'possible phases of separation, distance, or a preference for solitude within the marriage', 'a partner connected with research, healing, or spiritual/occult fields'],
            hi: ['एक निजी, आध्यात्मिक या आत्मनिरीक्षी रूप से झुका हुआ जीवनसाथी', 'सांसारिक रिश्ते की गतिशीलता में भावनात्मक दूरी या घटी हुई रुचि की प्रवृत्ति', 'एक रिश्ता जिसमें "पूर्व-जन्म संबंध" जैसा गुण हो, जो पीछा किए जाने के बजाय नियति-निर्धारित महसूस हो', 'विवाह के भीतर अलगाव, दूरी या एकांत की प्राथमिकता के संभावित दौर', 'शोध, उपचार या आध्यात्मिक/गूढ़ क्षेत्रों से जुड़ा साथी']
        },
        friends: ['mars', 'venus', 'saturn'],
        neutrals: ['jupiter', 'mercury'],
        enemies: ['sun', 'moon']
    }
};

const LORD_PLANETS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];
const ALL_PLANETS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];

// ---------------------------------------------------------------------------
// 2. ATOMIC DATA: RASHIS (Zodiac Signs) - identical astronomical facts to the career dataset
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
    fire: { en: 'brings a passionate, spontaneous, and self-driven quality to marital life', hi: 'वैवाहिक जीवन में एक भावुक, स्वतःस्फूर्त और आत्म-प्रेरित गुण लाता है' },
    earth: { en: 'brings a practical, stable, and security-oriented quality to marital life', hi: 'वैवाहिक जीवन में एक व्यावहारिक, स्थिर और सुरक्षा-उन्मुख गुण लाता है' },
    air: { en: 'brings an intellectual, communicative, and socially-oriented quality to marital life', hi: 'वैवाहिक जीवन में एक बौद्धिक, संचार-कुशल और सामाजिक रूप से उन्मुख गुण लाता है' },
    water: { en: 'brings an intuitive, emotionally deep, and nurturing quality to marital life', hi: 'वैवाहिक जीवन में एक सहज, भावनात्मक रूप से गहरा और पोषणकारी गुण लाता है' }
};

const QUALITY_TRAIT = {
    movable: { en: 'events around marriage (meeting, courtship, wedding) tend to move relatively quickly', hi: 'विवाह से जुड़ी घटनाएँ (मिलन, प्रणय, विवाह) अपेक्षाकृत तेज़ी से घटित होती हैं' },
    fixed: { en: 'the bond takes time to form but becomes exceptionally stable and long-lasting once committed', hi: 'बंधन बनने में समय लगता है परन्तु प्रतिबद्ध होने के बाद यह असाधारण रूप से स्थिर और दीर्घकालिक हो जाता है' },
    dual: { en: 'the relationship may go through more than one significant phase or connection before settling', hi: 'स्थिर होने से पहले रिश्ता एक से अधिक महत्वपूर्ण चरणों या संबंधों से गुज़र सकता है' }
};

// ---------------------------------------------------------------------------
// 3. ATOMIC DATA: HOUSES (Bhavas) - MARRIAGE-relevant significations
// ---------------------------------------------------------------------------

const HOUSES = {
    1: {
        name: { en: '1st House (Lagna/Ascendant)', hi: 'प्रथम भाव (लग्न)' },
        signification: { en: 'self, personality, physical vitality, and overall approach to life', hi: 'स्वयं, व्यक्तित्व, शारीरिक ऊर्जा और जीवन के प्रति समग्र दृष्टिकोण' },
        domainAngle: { en: 'how your own personality, self-confidence, and readiness for commitment shape your approach to marriage and partnership', hi: 'आपका व्यक्तित्व, आत्मविश्वास और प्रतिबद्धता के लिए तत्परता किस प्रकार विवाह और साझेदारी के प्रति आपके दृष्टिकोण को आकार देती है' },
        category: 'kendra-trikona'
    },
    2: {
        name: { en: '2nd House (Dhana/Kutumba Bhava)', hi: 'द्वितीय भाव (धन/कुटुंब भाव)' },
        signification: { en: 'family, accumulated resources, speech, and values', hi: 'परिवार, संचित संसाधन, वाणी और मूल्य' },
        domainAngle: { en: 'family values after marriage, shared household resources, and how your speech shapes harmony within the family', hi: 'विवाह के बाद पारिवारिक मूल्य, साझा घरेलू संसाधन और आपकी वाणी परिवार में सामंजस्य को कैसे आकार देती है' },
        category: 'maraka'
    },
    3: {
        name: { en: '3rd House (Parakrama Bhava)', hi: 'तृतीय भाव (पराक्रम भाव)' },
        signification: { en: 'self-effort, courage, communication skills, and short journeys', hi: 'स्वप्रयास, साहस, संचार कौशल और छोटी यात्राएँ' },
        domainAngle: { en: 'the courage and initiative to pursue and commit to a relationship, and day-to-day communication with your partner', hi: 'रिश्ते को आगे बढ़ाने और प्रतिबद्ध होने का साहस व पहल, तथा अपने साथी के साथ दैनिक संचार' },
        category: 'upachaya'
    },
    4: {
        name: { en: '4th House (Sukha Bhava)', hi: 'चतुर्थ भाव (सुख भाव)' },
        signification: { en: 'comfort, home, vehicles, and emotional/domestic foundation', hi: 'सुख-सुविधा, घर, वाहन और भावनात्मक/घरेलू आधार' },
        domainAngle: { en: 'domestic peace, emotional security, and overall comfort and happiness within married life', hi: 'घरेलू शांति, भावनात्मक सुरक्षा और वैवाहिक जीवन में समग्र सुख-सुविधा' },
        category: 'kendra-trikona'
    },
    5: {
        name: { en: '5th House (Vidya/Purva Punya Bhava)', hi: 'पंचम भाव (विद्या/पूर्व पुण्य भाव)' },
        signification: { en: 'romance, intelligence, creativity, and children', hi: 'रोमांस, बुद्धिमत्ता, रचनात्मकता और संतान' },
        domainAngle: { en: 'romance, courtship, love affairs, and the blessing of children within the marriage', hi: 'रोमांस, प्रणय-निवेदन, प्रेम-प्रसंग और विवाह में संतान का आशीर्वाद' },
        category: 'kendra-trikona'
    },
    6: {
        name: { en: '6th House (Ripu/Roga Bhava)', hi: 'षष्ठम भाव (रिपु/रोग भाव)' },
        signification: { en: 'disputes, competition, health, and daily routine', hi: 'विवाद, प्रतिस्पर्धा, स्वास्थ्य और दैनिक दिनचर्या' },
        domainAngle: { en: 'misunderstandings, disagreements, possible legal/litigation matters, or health concerns that test the relationship', hi: 'गलतफहमियाँ, मतभेद, संभावित कानूनी/मुकदमेबाज़ी मामले, या स्वास्थ्य चिंताएँ जो रिश्ते की परीक्षा लेती हैं' },
        category: 'upachaya'
    },
    7: {
        name: { en: '7th House (Kalatra/Vivaha Bhava)', hi: 'सप्तम भाव (कलत्र/विवाह भाव)' },
        signification: { en: 'marriage, spouse, partnership, and public dealing', hi: 'विवाह, जीवनसाथी, साझेदारी और सार्वजनिक व्यवहार' },
        domainAngle: { en: 'this is the very house of marriage itself - its condition most directly defines the nature of your spouse, marital happiness, and the quality of the partnership', hi: 'यह स्वयं विवाह का भाव है - इसकी स्थिति सीधे आपके जीवनसाथी की प्रकृति, वैवाहिक सुख और साझेदारी की गुणवत्ता को परिभाषित करती है' },
        category: 'kendra-trikona'
    },
    8: {
        name: { en: '8th House (Ayu/Mrityu Bhava)', hi: 'अष्टम भाव (आयु/मृत्यु भाव)' },
        signification: { en: 'transformation, intimacy, inheritance, and hidden/sudden matters', hi: 'रूपांतरण, अंतरंगता, विरासत और छिपे/अचानक विषय' },
        domainAngle: { en: 'the longevity and depth of the marital bond, physical intimacy, in-laws\' wealth, and sudden transformative events in married life', hi: 'वैवाहिक बंधन की दीर्घायु और गहराई, शारीरिक अंतरंगता, ससुराल पक्ष की संपत्ति, और वैवाहिक जीवन की अचानक रूपांतरकारी घटनाएँ' },
        category: 'dusthana'
    },
    9: {
        name: { en: '9th House (Bhagya Bhava)', hi: 'नवम भाव (भाग्य भाव)' },
        signification: { en: 'fortune, dharma, philosophy, and long-distance/foreign connections', hi: 'भाग्य, धर्म, दर्शनशास्त्र और दूरस्थ/विदेश संबंध' },
        domainAngle: { en: 'the spouse\'s luck and moral compass, blessings from father-in-law/elders, and possibly a foreign or long-distance connection with the partner', hi: 'जीवनसाथी का भाग्य और नैतिक दिशा-बोध, ससुर/बड़ों का आशीर्वाद, और संभवतः साथी के साथ विदेश या दूरस्थ संबंध' },
        category: 'kendra-trikona'
    },
    10: {
        name: { en: '10th House (Karma Bhava)', hi: 'दशम भाव (कर्म भाव)' },
        signification: { en: 'career, public status, and authority', hi: 'करियर, सार्वजनिक प्रतिष्ठा और अधिकार' },
        domainAngle: { en: 'the spouse\'s career and professional status, and how the marriage affects your own public image and standing', hi: 'जीवनसाथी का करियर और व्यावसायिक प्रतिष्ठा, तथा विवाह आपकी अपनी सार्वजनिक छवि और प्रतिष्ठा को कैसे प्रभावित करता है' },
        category: 'kendra-trikona'
    },
    11: {
        name: { en: '11th House (Labha Bhava)', hi: 'एकादश भाव (लाभ भाव)' },
        signification: { en: 'gains, networks, and fulfilment of desires', hi: 'लाभ, नेटवर्क और इच्छाओं की पूर्ति' },
        domainAngle: { en: 'financial gains through marriage, friendship and camaraderie with your spouse, and fulfilment of shared desires as a couple', hi: 'विवाह के माध्यम से वित्तीय लाभ, जीवनसाथी के साथ मित्रता और सौहार्द, तथा दंपति के रूप में साझा इच्छाओं की पूर्ति' },
        category: 'upachaya'
    },
    12: {
        name: { en: '12th House (Vyaya Bhava)', hi: 'द्वादश भाव (व्यय भाव)' },
        signification: { en: 'foreign lands, expenditure, isolation, and spirituality', hi: 'विदेश, व्यय, एकांत और आध्यात्म' },
        domainAngle: { en: 'bed pleasures and physical intimacy, possible foreign settlement with the spouse, periods of separation, or family-related expenditure', hi: 'शय्या सुख और शारीरिक अंतरंगता, साथी के साथ संभावित विदेश निवास, अलगाव की अवधि, या परिवार-संबंधी व्यय' },
        category: 'dusthana'
    }
};

const HOUSE_CATEGORY_GUIDANCE = {
    'kendra-trikona': {
        en: 'This is a Kendra/Trikona (angular or trinal) placement - one of the strongest positions in the chart. It gives a direct, visible, and relatively stable and happy marriage, and this factor should be treated as a major pillar of strength in your married life.',
        hi: 'यह एक केंद्र/त्रिकोण स्थान है - कुंडली की सबसे मज़बूत स्थितियों में से एक। यह एक प्रत्यक्ष, दृश्यमान और अपेक्षाकृत स्थिर व सुखी विवाह देता है, और इसे आपके वैवाहिक जीवन में एक प्रमुख शक्ति-स्तंभ माना जाना चाहिए।'
    },
    upachaya: {
        en: 'This is an Upachaya (growth-oriented) placement. The relationship may need more effort or patience in the early years but keeps improving steadily with time, maturity and mutual effort - long-term persistence here pays off substantially.',
        hi: 'यह एक उपचय (वृद्धि-उन्मुख) स्थान है। शुरुआती वर्षों में रिश्ते को अधिक प्रयास या धैर्य की आवश्यकता हो सकती है परन्तु समय, परिपक्वता और पारस्परिक प्रयास के साथ यह लगातार सुधरता जाता है - यहाँ दीर्घकालिक दृढ़ता का फल बहुत अच्छा मिलता है।'
    },
    dusthana: {
        en: 'This is a Dusthana (challenging) placement. It can bring delays, disagreements, health concerns, or unconventional circumstances around marriage - but it often rewards depth, transformation, or unusual/foreign connections with an unexpectedly strong bond once the initial hurdles are crossed.',
        hi: 'यह एक दुःस्थान (चुनौतीपूर्ण) स्थान है। इसमें विवाह से जुड़ी देरी, मतभेद, स्वास्थ्य चिंताएँ या अपरंपरागत परिस्थितियाँ आ सकती हैं - परन्तु प्रारंभिक बाधाओं को पार करने के बाद यह प्रायः गहराई, रूपांतरण या असामान्य/विदेशी संबंधों को एक अप्रत्याशित रूप से मज़बूत बंधन से पुरस्कृत करता है।'
    },
    maraka: {
        en: 'This placement links marital matters to family and resource themes - shared finances and family values become an important part of your married life\'s story.',
        hi: 'यह स्थान वैवाहिक विषयों को परिवार और संसाधन की थीम से जोड़ता है - साझा वित्त और पारिवारिक मूल्य आपके वैवाहिक जीवन की कहानी का एक महत्वपूर्ण हिस्सा बनते हैं।'
    }
};

// ---------------------------------------------------------------------------
// 4. HELPERS (mirrors generateCareerAstrologyDataset.js)
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
        own: 'This is the planet\'s own sign in the Navamsa, a position of great strength - it strongly confirms and stabilises the marriage indications from the Rashi (D-1) chart, supporting a long-term, sustainable marital bond.',
        friend: 'This is a friendly sign for the planet in the Navamsa, which supports and strengthens the marriage promise seen in the birth chart, adding stability to married life.',
        neutral: 'This is a neutral sign for the planet in the Navamsa, giving moderate, mixed support to marital matters - outcomes depend significantly on other chart factors and personal effort.',
        enemy: 'This is a challenging (enemy) sign for the planet in the Navamsa, which can weaken or delay the marriage promise, bringing extra friction, complications, or instability before a stable bond is achieved.'
    },
    hi: {
        own: 'नवांश में यह ग्रह की अपनी राशि है, जो अत्यंत बल की स्थिति है - यह राशि (डी-1) कुंडली से दिखने वाले विवाह संकेतों की दृढ़ता से पुष्टि और स्थिरता प्रदान करती है, जिससे दीर्घकालिक, स्थायी वैवाहिक बंधन को समर्थन मिलता है।',
        friend: 'नवांश में यह ग्रह के लिए एक मित्र राशि है, जो जन्म कुंडली में दिखने वाले विवाह वादे का समर्थन और सुदृढ़ीकरण करती है, तथा वैवाहिक जीवन में स्थिरता जोड़ती है।',
        neutral: 'नवांश में यह ग्रह के लिए एक तटस्थ राशि है, जो वैवाहिक विषयों को मध्यम, मिश्रित समर्थन देती है - परिणाम अन्य कुंडली कारकों और व्यक्तिगत प्रयास पर काफी हद तक निर्भर करते हैं।',
        enemy: 'नवांश में यह ग्रह के लिए एक चुनौतीपूर्ण (शत्रु) राशि है, जो विवाह वादे को कमज़ोर या विलंबित कर सकती है, और स्थिर बंधन बनने से पहले अतिरिक्त टकराव, जटिलताएँ या अस्थिरता ला सकती है।'
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
//    (7th house/7th lord instead of 10th, per the marriage technique)
// ---------------------------------------------------------------------------

function generateLagnaBase() {
    const out = {};
    RASHI_KEYS_BY_ORDER.forEach((lagnaKey) => {
        const lagna = RASHIS[lagnaKey];
        const lagnaLord = lagna.lord;
        const seventhIndex = ((lagna.order - 1 + 6) % 12) + 1; // 7th house = 6 signs ahead of lagna
        const seventhSignKey = RASHI_KEYS_BY_ORDER.find((k) => RASHIS[k].order === seventhIndex);
        const seventhLord = RASHIS[seventhSignKey].lord;
        const houseLords = computeHouseLordsForLagna(lagnaKey);
        const yogakaraka = computeYogakaraka(houseLords);

        out[lagnaKey] = {
            lagna: lagnaKey,
            lagnaName: RASHIS[lagnaKey].name,
            lagnaLord,
            lagnaLordName: PLANETS[lagnaLord].name,
            seventhHouseSign: seventhSignKey,
            seventhHouseSignName: RASHIS[seventhSignKey].name,
            seventhLord,
            seventhLordName: PLANETS[seventhLord].name,
            houseLords,
            yogakaraka,
            note: {
                en: `For ${RASHIS[lagnaKey].name.en} Lagna, the Ascendant (Lagna) lord is ${PLANETS[lagnaLord].name.en} and the 7th house falls in ${RASHIS[seventhSignKey].name.en}, ruled by ${PLANETS[seventhLord].name.en} (your 7th lord / marriage significator).${yogakaraka ? ` ${PLANETS[yogakaraka].name.en} is the Yogakaraka (a planet that rules both a Kendra and a Trikona house) for this Lagna - one of the most auspicious planets in this chart.` : ''}`,
                hi: `${RASHIS[lagnaKey].name.hi} लग्न के लिए, लग्नेश ${PLANETS[lagnaLord].name.hi} है और सप्तम भाव ${RASHIS[seventhSignKey].name.hi} राशि में पड़ता है, जिसके स्वामी ${PLANETS[seventhLord].name.hi} हैं (आपके सप्तमेश / विवाह कारक)।${yogakaraka ? ` ${PLANETS[yogakaraka].name.hi} इस लग्न के लिए योगकारक ग्रह है (जो केंद्र और त्रिकोण दोनों भावों का स्वामी है) - यह इस कुंडली के सबसे शुभ ग्रहों में से एक है।` : ''}`
            }
        };
    });
    writeJson('lagnaBase.json', out);
    return out;
}

// ---------------------------------------------------------------------------
// 7. GENERATE: lagnaLordInHouse.json & seventhLordInHouse.json (7 lords x 12 houses)
// ---------------------------------------------------------------------------

function generateLordInHouseTable(role) {
    // role: 'lagna' | 'seventh'
    const out = {};
    LORD_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        for (let house = 1; house <= 12; house++) {
            const h = HOUSES[house];
            const key = `${planetKey}_${house}`;
            const guidance = HOUSE_CATEGORY_GUIDANCE[h.category];
            const areasEn = planet.marriageAreas.en.slice(0, 3).join('; ');
            const areasHi = planet.marriageAreas.hi.slice(0, 3).join('; ');

            let en, hi;
            if (role === 'lagna') {
                en = `Your Lagna (Ascendant) lord ${planet.name.en} is placed in the ${house}${ordinalSuffix(house)} house (${h.name.en}). This means your core personality and approach to relationships works through ${h.signification.en}. ${capitalize(planet.traits.en)} - specifically this shapes ${h.domainAngle.en}. This inclines you towards ${areasEn}. ${guidance.en}`;
                hi = `आपका लग्नेश ${planet.name.hi} ${house}वें भाव (${h.name.hi}) में स्थित है। इसका अर्थ है कि आपका मूल व्यक्तित्व और संबंधों के प्रति दृष्टिकोण ${h.signification.hi} के माध्यम से कार्य करता है। यह ${planet.traits.hi} है - जो विशेष रूप से ${h.domainAngle.hi} को आकार देती है। यह आपको ${areasHi} की ओर प्रवृत्त करता है। ${guidance.hi}`;
            } else {
                en = `Your 7th house (marriage/spouse) lord ${planet.name.en} is placed in the ${house}${ordinalSuffix(house)} house (${h.name.en}). This means your married life itself is deeply connected with ${h.signification.en}. ${capitalize(planet.traits.en)} - so your marital experience is coloured by ${h.domainAngle.en}. This favours ${areasEn}. ${guidance.en}`;
                hi = `आपका सप्तमेश (विवाह/जीवनसाथी स्वामी) ${planet.name.hi} ${house}वें भाव (${h.name.hi}) में स्थित है। इसका अर्थ है कि आपका वैवाहिक जीवन स्वयं ${h.signification.hi} से गहराई से जुड़ा है। यह ${planet.traits.hi} है - इसलिए आपका वैवाहिक अनुभव ${h.domainAngle.hi} से रंगा हुआ है। यह ${areasHi} के लिए अनुकूल है। ${guidance.hi}`;
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
    writeJson(role === 'lagna' ? 'lagnaLordInHouse.json' : 'seventhLordInHouse.json', out);
}

// ---------------------------------------------------------------------------
// 8. GENERATE: planetInHouse1.json & planetInHouse7.json (9 grahas)
// ---------------------------------------------------------------------------

function generatePlanetInHouseTable(houseNum) {
    const out = {};
    const h = HOUSES[houseNum];
    ALL_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        const areasEn = planet.marriageAreas.en.slice(0, 3).join('; ');
        const areasHi = planet.marriageAreas.hi.slice(0, 3).join('; ');

        let en, hi;
        if (houseNum === 1) {
            en = `${planet.name.en} placed in the 1st house (Lagna) sits right on the Ascendant and directly colours your personality, physical presence, and overall approach to relationships and marriage. It carries ${planet.traits.en}. This placement inclines you towards ${areasEn}, and your own nature strongly shapes how the marriage unfolds.`;
            hi = `${planet.name.hi} का प्रथम भाव (लग्न) में स्थित होना सीधे लग्न पर बैठकर आपके व्यक्तित्व, शारीरिक उपस्थिति और रिश्तों व विवाह के प्रति समग्र दृष्टिकोण को रंग देता है। इसमें ${planet.traits.hi} है। यह स्थिति आपको ${areasHi} की ओर प्रवृत्त करती है, और आपका अपना स्वभाव विवाह के विकसित होने के तरीके को दृढ़ता से आकार देता है।`;
        } else {
            en = `${planet.name.en} placed directly in the 7th house (marriage house) has a strong, immediate influence on your spouse and married life, since it occupies the very house of partnership. It carries ${planet.traits.en}. This placement strongly indicates ${areasEn}.${planetKey === 'mars' ? ' Note: Mars in the 7th house is the classical basis of "Mangal Dosha" (Manglik) consideration - it is best evaluated together with Mars\'s placement from the Moon and Venus, and can be balanced through matching with another Manglik chart or the usual classical remedies.' : ''}`;
            hi = `${planet.name.hi} का सीधे सप्तम भाव (विवाह भाव) में स्थित होना आपके जीवनसाथी और वैवाहिक जीवन पर एक मज़बूत, तत्काल प्रभाव डालता है, क्योंकि यह स्वयं साझेदारी के भाव में स्थित है। इसमें ${planet.traits.hi} है। यह स्थिति ${areasHi} को दृढ़ता से दर्शाती है।${planetKey === 'mars' ? ' ध्यान दें: सप्तम भाव में मंगल क्लासिक "मंगल दोष" (मांगलिक) विचार का आधार है - इसका मूल्यांकन चंद्रमा और शुक्र से मंगल की स्थिति के साथ मिलाकर करना सर्वोत्तम है, और इसे किसी अन्य मांगलिक कुंडली से मिलान या सामान्य क्लासिक उपायों के माध्यम से संतुलित किया जा सकता है।' : ''}`;
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
    writeJson(houseNum === 1 ? 'planetInHouse1.json' : 'planetInHouse7.json', out);
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

            const areasEnA = pa.marriageAreas.en.slice(0, 2).join(' and ');
            const areasEnB = pb.marriageAreas.en.slice(0, 2).join(' and ');
            const areasHiA = pa.marriageAreas.hi.slice(0, 2).join(' और ');
            const areasHiB = pb.marriageAreas.hi.slice(0, 2).join(' और ');

            const en = `A conjunction of ${pa.name.en} and ${pb.name.en} blends ${pa.traits.en} with ${pb.traits.en}. ${tone} For marriage, this combination brings together ${areasEnA} with ${areasEnB} - a layered dynamic that draws on both planets' qualities. When this conjunction falls in or influences the 1st or 7th house, its effect on marriage becomes especially direct.`;
            const hi = `${pa.name.hi} और ${pb.name.hi} की युति ${pa.traits.hi} को ${pb.traits.hi} के साथ मिलाती है। ${toneHi} विवाह के लिए, यह संयोजन ${areasHiA} को ${areasHiB} के साथ एक साथ लाता है - एक बहुस्तरीय गतिशीलता जो दोनों ग्रहों के गुणों का लाभ उठाती है। जब यह युति प्रथम या सप्तम भाव में हो या उसे प्रभावित करे, तो विवाह पर इसका प्रभाव विशेष रूप से प्रत्यक्ष हो जाता है।`;

            out[key] = { key, planets: [a, b], planetNames: [pa.name, pb.name], relation, text: { en, hi } };
        }
    }
    writeJson('conjunctions.json', out);
}

// ---------------------------------------------------------------------------
// 10. GENERATE: lagnaLordInNavamsa.json & seventhLordInNavamsa.json (7 lords x 12 signs)
//     D-9 (Navamsa) is classically THE marriage chart, so this factor carries extra weight.
// ---------------------------------------------------------------------------

function generateLordInNavamsaSignTable(role) {
    // role: 'lagna' | 'seventh'
    const out = {};
    const roleLabelEn = role === 'lagna' ? 'Lagna lord' : '7th lord';
    const roleLabelHi = role === 'lagna' ? 'लग्नेश' : 'सप्तमेश';
    const roleNoteEn = role === 'lagna'
        ? 'the deeper, long-term strength and true sustainability of your core personality and how you show up in a marriage'
        : 'the deeper, long-term strength and true sustainability of the marital bond shown by your 7th house - remember, the Navamsa (D-9) is classically considered the primary chart for marriage, so this factor is especially significant';
    const roleNoteHi = role === 'lagna'
        ? 'आपके मूल व्यक्तित्व और विवाह में आप कैसे सामने आते हैं, इसकी गहरी, दीर्घकालिक शक्ति और वास्तविक स्थायित्व'
        : 'आपके सप्तम भाव द्वारा दर्शाए गए वैवाहिक बंधन की गहरी, दीर्घकालिक शक्ति और वास्तविक स्थायित्व - याद रखें, नवांश (डी-9) को शास्त्रीय रूप से विवाह की प्रमुख कुंडली माना जाता है, इसलिए यह कारक विशेष रूप से महत्वपूर्ण है';

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

            out[key] = { key, role, planet: planetKey, planetName: planet.name, navamsaSign: signKey, navamsaSignName: sign.name, relation, text: { en, hi } };
        });
    });
    writeJson(role === 'lagna' ? 'lagnaLordInNavamsa.json' : 'seventhLordInNavamsa.json', out);
}

// ---------------------------------------------------------------------------
// 10b. GENERATE: lagnaLordInNavamsaHouse.json & seventhLordInNavamsaHouse.json
//      (7 lords x 12 HOUSE NUMBERS, counted from the Navamsa's own ascendant)
// ---------------------------------------------------------------------------

function generateLordInNavamsaHouseTable(role) {
    // role: 'lagna' | 'seventh'
    const out = {};
    LORD_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        for (let house = 1; house <= 12; house++) {
            const h = HOUSES[house];
            const key = `${planetKey}_${house}`;
            const guidance = HOUSE_CATEGORY_GUIDANCE[h.category];

            let en, hi;
            if (role === 'lagna') {
                en = `In the Navamsa (D-9) chart, your Lagna lord ${planet.name.en} falls in the ${house}${ordinalSuffix(house)} house counted from the Navamsa's own Ascendant. Since the D-9 chart reveals the deeper, destined strength behind what the Rashi (D-1) chart promises, this shows that your inner personality and readiness for partnership draw hidden strength from ${h.signification.en}, particularly regarding ${h.domainAngle.en}. ${guidance.en} This reflects how sustainable and deeply-rooted your core relational nature really is, beyond surface appearances.`;
                hi = `नवांश (डी-9) कुंडली में, आपका लग्नेश ${planet.name.hi} नवांश के अपने लग्न से गिनने पर ${house}वें भाव में पड़ता है। चूंकि डी-9 कुंडली राशि (डी-1) कुंडली द्वारा दिए गए वादों के पीछे की गहरी, नियति-निर्धारित शक्ति को दर्शाती है, यह बताता है कि आपका आंतरिक व्यक्तित्व और साझेदारी के लिए तत्परता ${h.signification.hi} से छिपी हुई शक्ति प्राप्त करती है, विशेष रूप से ${h.domainAngle.hi} के संबंध में। ${guidance.hi} यह दर्शाता है कि सतही दिखावे से परे, आपका मूल संबंध-स्वभाव वास्तव में कितना स्थायी और गहराई से जड़ें जमाए हुए है।`;
            } else {
                en = `In the Navamsa (D-9) chart, your 7th lord ${planet.name.en} falls in the ${house}${ordinalSuffix(house)} house counted from the Navamsa's own Ascendant. Since D-9 is classically the primary marriage chart, this reveals whether the marital promise seen in your Rashi (D-1) chart actually holds up and sustains over time - it shows a deep, destined connection between your married life and ${h.signification.en}, particularly regarding ${h.domainAngle.en}. ${guidance.en} A well-placed 7th lord here confirms genuine, long-term marital fulfilment rather than just a surface-level promise.`;
                hi = `नवांश (डी-9) कुंडली में, आपका सप्तमेश ${planet.name.hi} नवांश के अपने लग्न से गिनने पर ${house}वें भाव में पड़ता है। चूंकि डी-9 शास्त्रीय रूप से विवाह की प्रमुख कुंडली है, यह दर्शाता है कि क्या आपकी राशि (डी-1) कुंडली में दिखने वाला वैवाहिक वादा वास्तव में समय के साथ टिकता और बना रहता है - यह आपके वैवाहिक जीवन और ${h.signification.hi} के बीच एक गहरा, नियति-निर्धारित संबंध दिखाता है, विशेष रूप से ${h.domainAngle.hi} के संबंध में। ${guidance.hi} यहाँ एक अच्छी तरह स्थित सप्तमेश एक सतही वादे के बजाय वास्तविक, दीर्घकालिक वैवाहिक पूर्णता की पुष्टि करता है।`;
            }

            out[key] = { key, role, planet: planetKey, planetName: planet.name, navamsaHouse: house, navamsaHouseName: h.name, text: { en, hi } };
        }
    });
    writeJson(role === 'lagna' ? 'lagnaLordInNavamsaHouse.json' : 'seventhLordInNavamsaHouse.json', out);
}

// ---------------------------------------------------------------------------
// 11. GENERATE: firstHouseConjunctionYogas.json & seventhHouseConjunctionYogas.json
//      (12 lagnas x 36 planet pairs) - lagna-aware named-Yoga detection for
//      conjunctions occurring specifically in the 1st or 7th house.
// ---------------------------------------------------------------------------

const YOGA_TEXT = {
    raja_yoga: {
        en: (houseNum, houseLabel) => `This conjunction forms a classic **Raja Yoga** for this Lagna (a union between a Kendra-house lord and a Trikona-house lord), occurring right in the ${houseLabel}. Raja Yoga is one of the most powerful combinations in Vedic (Parashari) astrology - for marriage, it indicates a spouse of high status/prominence, a respected and empowering partnership, and a marriage that visibly elevates ${houseNum === 1 ? 'your own personal standing and confidence' : 'your social standing as a couple'}.`,
        hi: (houseNum, houseLabel) => `यह युति इस लग्न के लिए एक क्लासिक **राज योग** बनाती है (एक केंद्र भाव स्वामी और एक त्रिकोण भाव स्वामी का मिलन), जो सीधे ${houseLabel} में हो रही है। राज योग वैदिक (पाराशरी) ज्योतिष के सबसे शक्तिशाली संयोजनों में से एक है - विवाह के लिए, यह एक उच्च प्रतिष्ठा वाले जीवनसाथी, एक सम्मानित और सशक्त साझेदारी, तथा एक ऐसे विवाह को दर्शाता है जो ${houseNum === 1 ? 'आपकी अपनी व्यक्तिगत प्रतिष्ठा और आत्मविश्वास' : 'दंपति के रूप में आपकी सामाजिक प्रतिष्ठा'} को स्पष्ट रूप से बढ़ाता है।`
    },
    dhana_yoga: {
        en: (houseNum, houseLabel) => `This conjunction forms a **Dhana Yoga** for this Lagna (a wealth-house lord - 2nd or 11th - combining with another wealth-linked lord), occurring in the ${houseLabel}. This strongly favours a financially prosperous marriage, with the spouse contributing to and multiplying household wealth.`,
        hi: (houseNum, houseLabel) => `यह युति इस लग्न के लिए एक **धन योग** बनाती है (एक धन-भाव स्वामी - द्वितीय या एकादश - का किसी अन्य धन-संबंधी स्वामी के साथ संयोजन), जो ${houseLabel} में हो रही है। यह एक वित्तीय रूप से समृद्ध विवाह के लिए अत्यंत अनुकूल है, जिसमें जीवनसाथी घरेलू धन-संपत्ति में योगदान और वृद्धि करता है।`
    },
    vipreet_raja_yoga: {
        en: (houseNum, houseLabel) => `This conjunction forms a **Vipreet Raja Yoga**-type combination for this Lagna (both planets rule only Dusthana houses - 6th, 8th or 12th), occurring in the ${houseLabel}. Counter-intuitively, this can bring marital success through reversal of fortune - initial friction, delays, broken engagements, or disagreements that, once overcome, lead to an unexpectedly stable and successful partnership.`,
        hi: (houseNum, houseLabel) => `यह युति इस लग्न के लिए एक **विपरीत राज योग**-प्रकार का संयोजन बनाती है (दोनों ग्रह केवल दुःस्थान भावों - षष्ठ, अष्टम या द्वादश - के स्वामी हैं), जो ${houseLabel} में हो रही है। विरोधाभासी रूप से, यह भाग्य के उलटफेर के माध्यम से वैवाहिक सफलता ला सकता है - प्रारंभिक टकराव, देरी, टूटी हुई सगाई या मतभेद, जिन्हें पार करने के बाद एक अप्रत्याशित रूप से स्थिर और सफल साझेदारी मिलती है।`
    },
    general: {
        en: (houseNum, houseLabel) => `For this specific Lagna, this conjunction does not form one of the classical named Yogas (Raja/Dhana/Vipreet Raja) - the two planets involved do not share a Kendra-Trikona, Dhana, or pure-Dusthana lordship relationship here. Its effect in the ${houseLabel} is best read through the individual planetary conjunction meaning and each planet's own placement.`,
        hi: (houseNum, houseLabel) => `इस विशिष्ट लग्न के लिए, यह युति क्लासिक नामित योगों (राज/धन/विपरीत राज) में से कोई नहीं बनाती - यहाँ दोनों ग्रहों का केंद्र-त्रिकोण, धन, या शुद्ध-दुःस्थान स्वामित्व संबंध नहीं है। ${houseLabel} में इसका प्रभाव सर्वोत्तम रूप से व्यक्तिगत ग्रह-युति अर्थ और प्रत्येक ग्रह की अपनी स्थिति के माध्यम से समझा जाता है।`
    }
};

function generateHouseConjunctionYogas(houseNum) {
    const out = {};
    const houseLabelEn = houseNum === 1 ? '1st house (Lagna)' : '7th house (marriage house)';
    const houseLabelHi = houseNum === 1 ? 'प्रथम भाव (लग्न)' : 'सप्तम भाव (विवाह भाव)';

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
                    en += ` Notably, ${PLANETS[yogakaraka].name.en} - the Yogakaraka for ${RASHIS[lagnaKey].name.en} Lagna - is part of this combination, which further amplifies its auspicious, marriage-strengthening effect.`;
                    hi += ` उल्लेखनीय है कि ${PLANETS[yogakaraka].name.hi} - जो ${RASHIS[lagnaKey].name.hi} लग्न के लिए योगकारक ग्रह है - इस संयोजन का हिस्सा है, जो इसके शुभ, विवाह-सुदृढ़ प्रभाव को और बढ़ाता है।`;
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
    writeJson(houseNum === 1 ? 'firstHouseConjunctionYogas.json' : 'seventhHouseConjunctionYogas.json', out);
}

// ---------------------------------------------------------------------------
// 12. GENERATE: classicalPairYogas.json - well-known, lagna-INDEPENDENT named
//      Yogas formed purely by two specific grahas conjoining, reframed for marriage.
// ---------------------------------------------------------------------------

const CLASSICAL_PAIR_YOGAS = {
    sun_mercury: {
        name: { en: 'Budh-Aditya Yoga', hi: 'बुध-आदित्य योग' },
        text: {
            en: 'Sun and Mercury together form Budh-Aditya Yoga, blending dignity/authority with sharp intellect and communication skill. For marriage, this favours a communicative, intellectually compatible relationship marked by mutual respect and clear, honest conversation - the spouse may be linked with government, administration, or intellectual/business fields.',
            hi: 'सूर्य और बुध मिलकर बुध-आदित्य योग बनाते हैं, जो प्रतिष्ठा/अधिकार को तीक्ष्ण बुद्धि और संचार कौशल के साथ जोड़ता है। विवाह के लिए, यह पारस्परिक सम्मान और स्पष्ट, ईमानदार बातचीत से चिह्नित एक संचार-कुशल, बौद्धिक रूप से संगत रिश्ते के लिए अनुकूल है - साथी सरकार, प्रशासन या बौद्धिक/व्यावसायिक क्षेत्रों से जुड़ा हो सकता है।'
        }
    },
    moon_jupiter: {
        name: { en: 'Gajakesari Yoga', hi: 'गजकेसरी योग' },
        text: {
            en: 'Moon and Jupiter together form Gajakesari Yoga, one of the most celebrated combinations for happiness, reputation, and prosperity. For marriage, this is an excellent indicator of a harmonious, respected, and emotionally fulfilling married life, with a wise and caring spouse who brings mutual growth and blessings.',
            hi: 'चंद्रमा और बृहस्पति मिलकर गजकेसरी योग बनाते हैं, जो सुख, प्रतिष्ठा और समृद्धि के लिए सबसे प्रशंसित संयोजनों में से एक है। विवाह के लिए, यह एक सामंजस्यपूर्ण, सम्मानित और भावनात्मक रूप से संतोषजनक वैवाहिक जीवन का एक उत्कृष्ट संकेतक है, जिसमें एक ज्ञानी और देखभाल करने वाला जीवनसाथी पारस्परिक विकास और आशीर्वाद लाता है।'
        }
    },
    moon_mars: {
        name: { en: 'Chandra-Mangal Yoga', hi: 'चंद्र-मंगल योग' },
        text: {
            en: 'Moon and Mars together form Chandra-Mangal Yoga, blending emotional depth with bold, passionate energy. For marriage, this indicates a physically and emotionally intense relationship with strong chemistry, though it needs conscious effort to manage occasional friction - it can also bring financial gains connected with the spouse or marriage.',
            hi: 'चंद्रमा और मंगल मिलकर चंद्र-मंगल योग बनाते हैं, जो भावनात्मक गहराई को साहसिक, भावुक ऊर्जा के साथ जोड़ता है। विवाह के लिए, यह मज़बूत आकर्षण वाला एक शारीरिक और भावनात्मक रूप से तीव्र रिश्ता दर्शाता है, हालाँकि कभी-कभार होने वाले टकराव को संभालने के लिए सचेत प्रयास की आवश्यकता होती है - यह जीवनसाथी या विवाह से जुड़े वित्तीय लाभ भी ला सकता है।'
        }
    },
    mars_jupiter: {
        name: { en: 'Guru-Mangal Yoga', hi: 'गुरु-मंगल योग' },
        text: {
            en: 'Mars and Jupiter together form Guru-Mangal Yoga, combining courage and protective energy with wisdom and principled judgement. For marriage, this favours a stable, respected married life with a spouse who is both principled and protective, though the relationship benefits from balancing assertiveness with patience.',
            hi: 'मंगल और बृहस्पति मिलकर गुरु-मंगल योग बनाते हैं, जो साहस और संरक्षणात्मक ऊर्जा को ज्ञान और सिद्धांतनिष्ठ निर्णय के साथ जोड़ता है। विवाह के लिए, यह एक स्थिर, सम्मानित वैवाहिक जीवन के लिए अनुकूल है जिसमें जीवनसाथी सिद्धांतनिष्ठ और संरक्षणात्मक दोनों है, हालाँकि रिश्ते को दृढ़ता और धैर्य के संतुलन से लाभ होता है।'
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
                        en: 'This planetary pair does not carry one of the small set of universally-recognised classical Yoga names (like Budh-Aditya or Gajakesari) independent of house-lordship. Refer to the general conjunction meaning, and to the lagna-specific Raja/Dhana/Vipreet Raja Yoga check for this pair in the 1st/7th house tables.',
                        hi: 'यह ग्रह-युग्म किसी सर्वमान्य क्लासिक योग नाम (जैसे बुध-आदित्य या गजकेसरी) के तहत नहीं आता, जो भाव-स्वामित्व से स्वतंत्र हो। सामान्य युति अर्थ देखें, और इस युग्म के लिए प्रथम/सप्तम भाव की तालिकाओं में लग्न-विशिष्ट राज/धन/विपरीत राज योग जाँच देखें।'
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
        description: 'Marriage astrology combination dataset (Vedic/Parashari) - the marriage counterpart of the career dataset, using the 7th house/7th lord (marriage significator) in place of the 10th house/10th lord. Covers Lagna lord placement, 7th lord placement, planets in 1st/7th house, generic conjunctions, lagna-independent classical pair-Yogas, lagna-aware Raja/Dhana/Vipreet-Raja Yoga detection for 1st/7th-house conjunctions, and both the Lagna lord\'s and 7th lord\'s placement in Navamsa (D-9) by sign AND by house-number. Bilingual (English/Hindi). Generated by scripts/generateMarriageAstrologyDataset.js - do not hand-edit, re-run the generator instead.',
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

console.log('Generating marriage astrology dataset...');
generateReferenceTables();
generateLagnaBase();
generateLordInHouseTable('lagna');
generateLordInHouseTable('seventh');
generatePlanetInHouseTable(1);
generatePlanetInHouseTable(7);
generateConjunctions();
generateLordInNavamsaSignTable('lagna');
generateLordInNavamsaSignTable('seventh');
generateLordInNavamsaHouseTable('lagna');
generateLordInNavamsaHouseTable('seventh');
generateHouseConjunctionYogas(1);
generateHouseConjunctionYogas(7);
generateClassicalPairYogas();
generateManifest();
console.log('Done. Output directory:', OUT_DIR);
