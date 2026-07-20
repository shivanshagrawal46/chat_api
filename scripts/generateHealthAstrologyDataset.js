/**
 * generateHealthAstrologyDataset.js
 *
 * SOURCE OF TRUTH for the Health Astrology Dataset.
 *
 * This is the health counterpart of generateCareerAstrologyDataset.js /
 * generateMarriageAstrologyDataset.js / generateMoneyAstrologyDataset.js.
 * Same lagna-aware Yoga engine, same fast O(1)-lookup dataset design - the
 * structural difference is that health classically uses THREE significator
 * houses (the Trik/Dusthana houses) instead of one or two:
 *   - 6th house  (Roga Bhava)   - disease, injury, infection, immunity
 *   - 8th house  (Ayu Bhava)    - chronic illness, longevity, surgery, transformation
 *   - 12th house (Vyaya Bhava)  - hospitalization, confinement, sleep, loss of vitality
 * So wherever career used "10th house" (one factor) and money used "2nd AND
 * 11th house" (two factors), this health dataset uses THREE parallel factors:
 * 6th lord, 8th lord, and 12th lord (each with its own house-placement,
 * planets-in-house, and lagna-aware Yoga table).
 *
 * A crucial classical detail captured naturally by the existing Yoga engine:
 * when two planets rule ONLY Dusthana houses (6th/8th/12th) and conjoin, this
 * forms a "Vipreet Raja Yoga" - classically a *protective* combination that
 * neutralises the disease-related houses and can grant unexpected recovery,
 * resistance to chronic illness, or resilience through health crises. This is
 * an especially meaningful Yoga for the health domain.
 *
 * Factors covered:
 *   1. Lagna lord + the house it occupies                 -> lagnaLordInHouse.json
 *   2. 6th lord (Roga/disease) + its house                  -> sixthLordInHouse.json
 *   2b. 8th lord (Ayu/chronic-longevity) + its house          -> eighthLordInHouse.json
 *   2c. 12th lord (Vyaya/hospitalization) + its house         -> twelfthLordInHouse.json
 *   3. Planets sitting in the 1st house                     -> planetInHouse1.json
 *   4. Planets sitting in the 6th house                      -> planetInHouse6.json
 *   4b. Planets sitting in the 8th house                      -> planetInHouse8.json
 *   4c. Planets sitting in the 12th house                     -> planetInHouse12.json
 *   5. Conjunctions + classical/lagna-aware Yogas in the      -> conjunctions.json,
 *        1st, 6th, 8th AND 12th house                            classicalPairYogas.json,
 *                                                                  firstHouseConjunctionYogas.json,
 *                                                                  sixthHouseConjunctionYogas.json,
 *                                                                  eighthHouseConjunctionYogas.json,
 *                                                                  twelfthHouseConjunctionYogas.json
 *   6. Lagna/6th/8th/12th lords' placement in Navamsa (D-9)   -> lagnaLordInNavamsa(House).json,
 *        by SIGN and by HOUSE NUMBER                              sixthLordInNavamsa(House).json,
 *                                                                  eighthLordInNavamsa(House).json,
 *                                                                  twelfthLordInNavamsa(House).json
 *
 * Run:  node scripts/generateHealthAstrologyDataset.js
 * Output: data/astrology/health/*.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'data', 'astrology', 'health');

// ---------------------------------------------------------------------------
// 1. ATOMIC DATA: PLANETS (Grahas) - identity + HEALTH significations
// ---------------------------------------------------------------------------

const PLANETS = {
    sun: {
        order: 1,
        name: { en: 'Sun', hi: 'सूर्य (Surya)' },
        nature: 'malefic',
        traits: {
            en: 'a fiery, authoritative, and self-assured energy centered on vitality, heat, and the core life-force',
            hi: 'एक तेजस्वी, अधिकारपूर्ण और आत्मविश्वासी ऊर्जा, जो जीवनशक्ति, ऊष्मा और मूल जीवन-ऊर्जा पर केंद्रित है'
        },
        healthAreas: {
            en: ['overall vitality, life-force, and core immune strength', 'heart, bones, and the eyes (especially the right eye)', 'heat-related conditions - fevers, inflammation, blood pressure', 'father\'s health and paternal-line hereditary constitution', 'a strong Sun generally supports faster recovery and resilient stamina'],
            hi: ['समग्र जीवनशक्ति, जीवन-ऊर्जा और मूल प्रतिरक्षा शक्ति', 'हृदय, हड्डियाँ और आँखें (विशेष रूप से दायीं आँख)', 'ऊष्मा-संबंधी स्थितियाँ - बुखार, सूजन, रक्तचाप', 'पिता का स्वास्थ्य और पितृ-वंश की वंशानुगत संरचना', 'एक मज़बूत सूर्य आम तौर पर तेज़ रिकवरी और मज़बूत सहनशक्ति का समर्थन करता है']
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
            en: 'a receptive, nurturing, and emotionally sensitive energy centered on the mind and bodily fluids',
            hi: 'एक ग्रहणशील, पोषणकारी और भावनात्मक रूप से संवेदनशील ऊर्जा, जो मन और शारीरिक तरल पदार्थों पर केंद्रित है'
        },
        healthAreas: {
            en: ['mental and emotional wellbeing, sleep quality, and stress resilience', 'bodily fluids, lymphatic balance, and digestive sensitivity', 'health that fluctuates with emotional state, much like the Moon\'s phases', 'mother\'s health and maternal-line hereditary constitution', 'a weak or afflicted Moon often shows as anxiety, insomnia, or fluid-retention issues'],
            hi: ['मानसिक और भावनात्मक कल्याण, नींद की गुणवत्ता और तनाव-सहनशीलता', 'शारीरिक तरल पदार्थ, लसीका संतुलन और पाचन संवेदनशीलता', 'स्वास्थ्य जो चंद्रमा की कलाओं की तरह भावनात्मक स्थिति के साथ बदलता है', 'माता का स्वास्थ्य और मातृ-वंश की वंशानुगत संरचना', 'एक कमज़ोर या पीड़ित चंद्रमा प्रायः चिंता, अनिद्रा या द्रव-प्रतिधारण समस्याओं के रूप में दिखता है']
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
            en: 'a bold, energetic, and combative drive centered on blood, muscle, and physical action',
            hi: 'एक साहसी, ऊर्जावान और आक्रामक प्रवृत्ति, जो रक्त, मांसपेशियों और शारीरिक क्रिया पर केंद्रित है'
        },
        healthAreas: {
            en: ['blood, muscles, and physical stamina', 'injuries, cuts, burns, accidents, and surgery-related events', 'inflammatory or fast-onset conditions, and higher risk of impulsive-risk-driven injury', 'a well-placed Mars supports quick healing, strong immunity, and surgical success', 'an afflicted Mars raises risk of blood disorders, high blood pressure, or accident-proneness'],
            hi: ['रक्त, मांसपेशियाँ और शारीरिक सहनशक्ति', 'चोटें, कट, जलन, दुर्घटनाएँ और शल्य-चिकित्सा से जुड़ी घटनाएँ', 'सूजन संबंधी या तेज़ी से शुरू होने वाली स्थितियाँ, और आवेगी-जोखिम से चोट लगने का अधिक खतरा', 'एक अच्छी तरह स्थित मंगल तेज़ उपचार, मज़बूत प्रतिरक्षा और सफल शल्य-चिकित्सा का समर्थन करता है', 'एक पीड़ित मंगल रक्त विकार, उच्च रक्तचाप या दुर्घटना-प्रवणता का खतरा बढ़ाता है']
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
            en: 'a sharp, analytical, and communicative intelligence centered on the nervous system and adaptability',
            hi: 'एक तीक्ष्ण, विश्लेषणात्मक और संचार-कुशल बुद्धि, जो तंत्रिका तंत्र और अनुकूलनशीलता पर केंद्रित है'
        },
        healthAreas: {
            en: ['the nervous system, skin, and respiratory function', 'speech-related organs and overall neuro-muscular coordination', 'nervous tension, anxiety, or skin allergies when afflicted', 'quick mental processing that helps in fast diagnosis and adaptive treatment decisions', 'a well-placed Mercury supports a resilient, quick-recovering nervous system'],
            hi: ['तंत्रिका तंत्र, त्वचा और श्वसन क्रिया', 'वाणी-संबंधी अंग और समग्र न्यूरो-मस्कुलर समन्वय', 'पीड़ित होने पर तंत्रिका तनाव, चिंता या त्वचा एलर्जी', 'त्वरित मानसिक प्रसंस्करण जो तेज़ निदान और अनुकूल उपचार निर्णयों में सहायक है', 'एक अच्छी तरह स्थित बुध एक लचीले, तेज़ी से ठीक होने वाले तंत्रिका तंत्र का समर्थन करता है']
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
            en: 'a wise, expansive, and nourishing energy centered on growth, healing, and natural immunity',
            hi: 'एक ज्ञानी, विस्तारवादी और पोषणकारी ऊर्जा, जो विकास, उपचार और प्राकृतिक प्रतिरक्षा पर केंद्रित है'
        },
        healthAreas: {
            en: ['one of the single greatest natural indicators (karaka) of health, healing, and longevity in the chart', 'the liver, fat metabolism, and overall bodily growth/expansion', 'strong natural immunity and recuperative power when well-placed', 'a tendency towards weight gain, liver strain, or blood-sugar issues if excessive/afflicted', 'general protection from chronic and severe disease when well-supported'],
            hi: ['कुंडली में स्वास्थ्य, उपचार और दीर्घायु के सबसे बड़े प्राकृतिक संकेतकों (कारक) में से एक', 'यकृत, वसा चयापचय और समग्र शारीरिक वृद्धि/विस्तार', 'अच्छी तरह स्थित होने पर मज़बूत प्राकृतिक प्रतिरक्षा और स्वास्थ्य-लाभ क्षमता', 'अत्यधिक/पीड़ित होने पर वज़न बढ़ने, यकृत पर दबाव या रक्त-शर्करा समस्याओं की प्रवृत्ति', 'अच्छी तरह समर्थित होने पर गंभीर और पुरानी बीमारी से सामान्य सुरक्षा']
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
            en: 'a graceful, comfort-loving charm centered on hormonal balance, the reproductive system, and physical vitality',
            hi: 'एक सुंदर, सुख-प्रिय आकर्षण, जो हार्मोनल संतुलन, प्रजनन तंत्र और शारीरिक जीवनशक्ति पर केंद्रित है'
        },
        healthAreas: {
            en: ['the reproductive and hormonal systems, and kidney function', 'skin health, complexion, and overall physical glow/vitality', 'a tendency towards indulgence-linked conditions - diabetes, kidney strain, hormonal imbalance', 'comfort and pleasure-seeking that, unchecked, can undermine disciplined health habits', 'a well-placed Venus supports healthy vitality and hormonal balance'],
            hi: ['प्रजनन और हार्मोनल तंत्र, और गुर्दे की कार्यप्रणाली', 'त्वचा स्वास्थ्य, रंगत और समग्र शारीरिक चमक/जीवनशक्ति', 'भोग-प्रवृत्त स्थितियों की प्रवृत्ति - मधुमेह, गुर्दे पर दबाव, हार्मोनल असंतुलन', 'सुख और आनंद की चाह जो अनियंत्रित होने पर अनुशासित स्वास्थ्य आदतों को कमज़ोर कर सकती है', 'एक अच्छी तरह स्थित शुक्र स्वस्थ जीवनशक्ति और हार्मोनल संतुलन का समर्थन करता है']
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
            en: 'a disciplined, patient, and slow-moving nature centered on structure, chronicity, and endurance',
            hi: 'एक अनुशासित, धैर्यवान और धीमी गति का स्वभाव, जो संरचना, दीर्घकालिकता और सहनशक्ति पर केंद्रित है'
        },
        healthAreas: {
            en: ['bones, joints, teeth, and long-term skeletal/structural health', 'chronic, slow-onset, or degenerative conditions - arthritis, stiffness, prolonged ailments', 'longevity itself, along with a disciplined approach to health routines', 'a tendency towards low energy, delayed recovery, or depressive tendencies if afflicted', 'a well-placed Saturn supports remarkable long-term endurance and longevity despite slow-healing tendencies'],
            hi: ['हड्डियाँ, जोड़, दाँत और दीर्घकालिक कंकालीय/संरचनात्मक स्वास्थ्य', 'पुरानी, धीरे-धीरे शुरू होने वाली या अपक्षयी स्थितियाँ - गठिया, अकड़न, दीर्घकालिक बीमारियाँ', 'स्वयं दीर्घायु, स्वास्थ्य दिनचर्या के प्रति अनुशासित दृष्टिकोण के साथ', 'पीड़ित होने पर कम ऊर्जा, विलंबित रिकवरी या अवसादग्रस्त प्रवृत्तियों की प्रवृत्ति', 'एक अच्छी तरह स्थित शनि धीमी गति से ठीक होने की प्रवृत्ति के बावजूद उल्लेखनीय दीर्घकालिक सहनशक्ति और दीर्घायु का समर्थन करता है']
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
            en: 'an obsessive, unconventional, and boundary-crossing energy centered on the unknown and the unexplained',
            hi: 'एक गहन, अपरंपरागत और सीमा-पार करने वाली ऊर्जा, जो अज्ञात और अस्पष्टीकृत पर केंद्रित है'
        },
        healthAreas: {
            en: ['mysterious, undiagnosed, or hard-to-treat ailments', 'allergies, poisoning-type reactions, and psychological/obsessive disturbances', 'sudden, unexplained health crises that defy conventional diagnosis', 'a tendency towards addictive or compulsive behaviours affecting health if unchecked', 'often benefits from foreign or unconventional treatment approaches'],
            hi: ['रहस्यमय, अनिदान या इलाज में कठिन बीमारियाँ', 'एलर्जी, विषाक्तता-प्रकार की प्रतिक्रियाएँ, और मनोवैज्ञानिक/गहन विक्षोभ', 'अचानक, अस्पष्टीकृत स्वास्थ्य संकट जो पारंपरिक निदान को चुनौती देते हैं', 'अनियंत्रित होने पर स्वास्थ्य को प्रभावित करने वाली व्यसनी या बाध्यकारी प्रवृत्तियाँ', 'प्रायः विदेशी या अपरंपरागत उपचार दृष्टिकोणों से लाभ होता है']
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
            en: 'a detached, research-oriented, and intuitive depth centered on hidden, subtle, and psychosomatic patterns',
            hi: 'एक विरक्त, शोध-उन्मुख और सहज गहराई, जो छिपे, सूक्ष्म और मनोदैहिक प्रतिरूपों पर केंद्रित है'
        },
        healthAreas: {
            en: ['subtle, hidden, or psychosomatic ailments that resist conventional diagnosis', 'accidents, sudden ailments, or equally sudden and unexpected recovery', 'a relative detachment from the physical body and its needs unless consciously managed', 'issues linked to the nervous system or spiritual/psychic disturbance', 'benefits from alternative, spiritual, or research-based healing approaches'],
            hi: ['सूक्ष्म, छिपी हुई या मनोदैहिक बीमारियाँ जो पारंपरिक निदान का विरोध करती हैं', 'दुर्घटनाएँ, अचानक बीमारियाँ, या समान रूप से अचानक और अप्रत्याशित रिकवरी', 'जब तक सचेत रूप से प्रबंधित न किया जाए, भौतिक शरीर और उसकी आवश्यकताओं से अपेक्षाकृत विरक्ति', 'तंत्रिका तंत्र या आध्यात्मिक/मानसिक विक्षोभ से जुड़े मुद्दे', 'वैकल्पिक, आध्यात्मिक या शोध-आधारित उपचार दृष्टिकोणों से लाभ']
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
    fire: { en: 'brings a fast, high-energy, and quick-to-flare-up quality to health events', hi: 'स्वास्थ्य घटनाओं में एक तेज़, उच्च-ऊर्जा और शीघ्र-भड़कने वाला गुण लाता है' },
    earth: { en: 'brings a practical, stable, and gradually-building quality to health conditions', hi: 'स्वास्थ्य स्थितियों में एक व्यावहारिक, स्थिर और धीरे-धीरे विकसित होने वाला गुण लाता है' },
    air: { en: 'brings a nervous, restless, and quickly-changing quality to health conditions', hi: 'स्वास्थ्य स्थितियों में एक बेचैन, अस्थिर और तेज़ी से बदलने वाला गुण लाता है' },
    water: { en: 'brings an emotional, fluid-related, and fluctuating quality to health conditions', hi: 'स्वास्थ्य स्थितियों में एक भावनात्मक, द्रव-संबंधी और उतार-चढ़ाव वाला गुण लाता है' }
};

const QUALITY_TRAIT = {
    movable: { en: 'health events tend to arise and resolve relatively quickly', hi: 'स्वास्थ्य घटनाएँ अपेक्षाकृत तेज़ी से उत्पन्न होती और सुलझती हैं' },
    fixed: { en: 'health conditions, once established, tend to be long-lasting and take real effort to shift', hi: 'स्वास्थ्य स्थितियाँ, एक बार स्थापित होने पर, दीर्घकालिक होती हैं और बदलने के लिए वास्तविक प्रयास लेती हैं' },
    dual: { en: 'health tends to show variable, mixed, or recurring patterns rather than a single fixed course', hi: 'स्वास्थ्य एक निश्चित पाठ्यक्रम के बजाय परिवर्तनशील, मिश्रित या आवर्ती प्रतिरूप दिखाता है' }
};

// ---------------------------------------------------------------------------
// 3. ATOMIC DATA: HOUSES (Bhavas) - HEALTH-relevant significations
// ---------------------------------------------------------------------------

const HOUSES = {
    1: {
        name: { en: '1st House (Lagna/Ascendant)', hi: 'प्रथम भाव (लग्न)' },
        signification: { en: 'self, personality, physical body, and overall vitality', hi: 'स्वयं, व्यक्तित्व, भौतिक शरीर और समग्र जीवनशक्ति' },
        domainAngle: { en: 'the physical body and constitution itself - your baseline vitality, immune strength, and overall approach to health', hi: 'स्वयं भौतिक शरीर और संरचना - आपकी आधारभूत जीवनशक्ति, प्रतिरक्षा शक्ति और स्वास्थ्य के प्रति समग्र दृष्टिकोण' },
        category: 'kendra-trikona'
    },
    2: {
        name: { en: '2nd House (Dhana/Maraka Bhava)', hi: 'द्वितीय भाव (धन/मारक भाव)' },
        signification: { en: 'face, eyes, teeth, speech, and family resources', hi: 'चेहरा, आँखें, दाँत, वाणी और पारिवारिक संसाधन' },
        domainAngle: { en: 'the face, eyes, teeth, and throat area, along with family health history and nutritional/bodily reserves', hi: 'चेहरा, आँखें, दाँत और गले का क्षेत्र, साथ ही पारिवारिक स्वास्थ्य इतिहास और पोषण/शारीरिक भंडार' },
        category: 'maraka'
    },
    3: {
        name: { en: '3rd House (Parakrama Bhava)', hi: 'तृतीय भाव (पराक्रम भाव)' },
        signification: { en: 'courage, stamina, ears, arms, and shoulders', hi: 'साहस, सहनशक्ति, कान, बाँहें और कंधे' },
        domainAngle: { en: 'stamina, courage-driven resilience, the ears/arms/shoulders, respiratory strength, and siblings\' health', hi: 'सहनशक्ति, साहस-प्रेरित लचीलापन, कान/बाँहें/कंधे, श्वसन शक्ति और भाई-बहनों का स्वास्थ्य' },
        category: 'upachaya'
    },
    4: {
        name: { en: '4th House (Sukha Bhava)', hi: 'चतुर्थ भाव (सुख भाव)' },
        signification: { en: 'chest, heart, stomach, and emotional/domestic foundation', hi: 'छाती, हृदय, पेट और भावनात्मक/घरेलू आधार' },
        domainAngle: { en: 'the chest, heart, and digestive comfort, along with emotional wellbeing and mother\'s health', hi: 'छाती, हृदय और पाचन संबंधी आराम, साथ ही भावनात्मक कल्याण और माता का स्वास्थ्य' },
        category: 'kendra-trikona'
    },
    5: {
        name: { en: '5th House (Vidya/Purva Punya Bhava)', hi: 'पंचम भाव (विद्या/पूर्व पुण्य भाव)' },
        signification: { en: 'intelligence, stomach, upper abdomen, and past-life merit', hi: 'बुद्धि, पेट, ऊपरी उदर और पूर्व-जन्म का पुण्य' },
        domainAngle: { en: 'mental health, the stomach/upper abdominal region, and health karma linked to children', hi: 'मानसिक स्वास्थ्य, पेट/ऊपरी उदर क्षेत्र, और बच्चों से जुड़ा स्वास्थ्य कर्म' },
        category: 'kendra-trikona'
    },
    6: {
        name: { en: '6th House (Roga Bhava)', hi: 'षष्ठम भाव (रोग भाव)' },
        signification: { en: 'disease, injury, enemies, debts, and daily discipline', hi: 'रोग, चोट, शत्रु, ऋण और दैनिक अनुशासन' },
        domainAngle: { en: 'this is the primary house of disease itself - illness, infection, injury, immune resistance, and health discipline/routine', hi: 'यह स्वयं रोग का प्रमुख भाव है - बीमारी, संक्रमण, चोट, प्रतिरक्षा प्रतिरोध और स्वास्थ्य अनुशासन/दिनचर्या' },
        category: 'roga'
    },
    7: {
        name: { en: '7th House (Kalatra/Vyapara Bhava)', hi: 'सप्तम भाव (कलत्र/व्यापार भाव)' },
        signification: { en: 'partnerships, kidneys, and the reproductive/urinary system', hi: 'साझेदारी, गुर्दे और प्रजनन/मूत्र तंत्र' },
        domainAngle: { en: 'the kidneys, reproductive and urinary organs, and spouse\'s health/its impact on your own wellbeing', hi: 'गुर्दे, प्रजनन और मूत्र अंग, और जीवनसाथी का स्वास्थ्य/आपके स्वयं के कल्याण पर इसका प्रभाव' },
        category: 'maraka'
    },
    8: {
        name: { en: '8th House (Ayu Bhava)', hi: 'अष्टम भाव (आयु भाव)' },
        signification: { en: 'longevity, chronic conditions, surgery, and transformation', hi: 'दीर्घायु, पुरानी स्थितियाँ, शल्य-चिकित्सा और रूपांतरण' },
        domainAngle: { en: 'this is the primary house of chronic illness, longevity, surgery, accidents, and hidden or transformative health crises', hi: 'यह पुरानी बीमारी, दीर्घायु, शल्य-चिकित्सा, दुर्घटनाओं और छिपे या रूपांतरणकारी स्वास्थ्य संकटों का प्रमुख भाव है' },
        category: 'ayu'
    },
    9: {
        name: { en: '9th House (Bhagya Bhava)', hi: 'नवम भाव (भाग्य भाव)' },
        signification: { en: 'fortune, hips/thighs, and higher wisdom', hi: 'भाग्य, कूल्हे/जांघें और उच्च ज्ञान' },
        domainAngle: { en: 'the hips and thighs, fortune/luck in health matters, father\'s health, and benefit from foreign or higher-wisdom-guided treatment', hi: 'कूल्हे और जांघें, स्वास्थ्य मामलों में भाग्य, पिता का स्वास्थ्य, और विदेशी या उच्च-ज्ञान-निर्देशित उपचार से लाभ' },
        category: 'kendra-trikona'
    },
    10: {
        name: { en: '10th House (Karma Bhava)', hi: 'दशम भाव (कर्म भाव)' },
        signification: { en: 'career, public status, and the knees/joints', hi: 'करियर, सार्वजनिक प्रतिष्ठा और घुटने/जोड़' },
        domainAngle: { en: 'the knees and joints, and career/professional-stress-linked health impacts such as burnout', hi: 'घुटने और जोड़, तथा करियर/व्यावसायिक-तनाव से जुड़े स्वास्थ्य प्रभाव जैसे थकावट' },
        category: 'kendra-trikona'
    },
    11: {
        name: { en: '11th House (Labha Bhava)', hi: 'एकादश भाव (लाभ भाव)' },
        signification: { en: 'gains, circulation, calves/ankles, and fulfilment of desires', hi: 'लाभ, रक्त-संचार, पिंडली/टखने और इच्छाओं की पूर्ति' },
        domainAngle: { en: 'the calves and ankles, blood circulation, and gains/recovery achieved from treatment - the fulfilment of health goals', hi: 'पिंडली और टखने, रक्त-संचार, और उपचार से प्राप्त लाभ/रिकवरी - स्वास्थ्य लक्ष्यों की पूर्ति' },
        category: 'upachaya'
    },
    12: {
        name: { en: '12th House (Vyaya Bhava)', hi: 'द्वादश भाव (व्यय भाव)' },
        signification: { en: 'hospitalization, feet, sleep, isolation, and loss', hi: 'अस्पताल में भर्ती, पैर, नींद, एकांत और हानि' },
        domainAngle: { en: 'this is the primary house of hospitalization, confinement, sleep disorders, subconscious/psychological health, and rest-linked recovery', hi: 'यह अस्पताल में भर्ती, एकांतवास, नींद संबंधी विकार, अवचेतन/मनोवैज्ञानिक स्वास्थ्य, और विश्राम-संबंधी रिकवरी का प्रमुख भाव है' },
        category: 'vyaya'
    }
};

const HOUSE_CATEGORY_GUIDANCE = {
    'kendra-trikona': {
        en: 'This is a Kendra/Trikona (angular or trinal) placement - one of the strongest positions in the chart. It gives a stable constitutional foundation, resilient vitality, and generally quicker, more complete recovery from any health challenges.',
        hi: 'यह एक केंद्र/त्रिकोण स्थान है - कुंडली की सबसे मज़बूत स्थितियों में से एक। यह एक स्थिर संरचनात्मक आधार, लचीली जीवनशक्ति, और किसी भी स्वास्थ्य चुनौती से सामान्यतः तेज़, अधिक पूर्ण रिकवरी देता है।'
    },
    upachaya: {
        en: 'This is an Upachaya (growth-oriented) placement. Health and stamina may need extra attention in youth, but resilience, immunity, and recovery capacity tend to improve steadily with age, discipline, and experience.',
        hi: 'यह एक उपचय (वृद्धि-उन्मुख) स्थान है। युवावस्था में स्वास्थ्य और सहनशक्ति पर अतिरिक्त ध्यान देने की आवश्यकता हो सकती है, परन्तु उम्र, अनुशासन और अनुभव के साथ लचीलापन, प्रतिरक्षा और रिकवरी क्षमता लगातार सुधरती है।'
    },
    maraka: {
        en: 'This is a Maraka (classically "life-vulnerability-marking") house placement, traditionally used to time periods of health sensitivity via planetary periods (dashas). This is not an automatic threat, but it marks factors and time-windows where health check-ups and preventive care are especially valuable.',
        hi: 'यह एक मारक (शास्त्रीय रूप से "जीवन-भेद्यता-सूचक") भाव स्थिति है, जिसका पारंपरिक रूप से ग्रह दशाओं के माध्यम से स्वास्थ्य संवेदनशीलता की अवधि को समयबद्ध करने के लिए उपयोग किया जाता है। यह कोई स्वतः खतरा नहीं है, परन्तु यह उन कारकों और समय-अवधियों को चिन्हित करता है जहाँ स्वास्थ्य जाँच और निवारक देखभाल विशेष रूप से मूल्यवान होती है।'
    },
    roga: {
        en: 'This is the 6th house itself - the primary seat of disease, injury, and immunity in the chart. A well-placed factor here strongly supports disease-resistance, quick recovery, and effective handling of health-related stress or conflict; a poorly-placed one can indicate recurring infections or immune vulnerability that needs conscious lifestyle management.',
        hi: 'यह स्वयं षष्ठ भाव है - कुंडली में रोग, चोट और प्रतिरक्षा का प्रमुख स्थान। यहाँ एक अच्छी तरह स्थित कारक रोग-प्रतिरोध, तेज़ रिकवरी और स्वास्थ्य-संबंधी तनाव या संघर्ष के प्रभावी प्रबंधन का दृढ़ता से समर्थन करता है; एक खराब स्थित कारक बार-बार होने वाले संक्रमण या प्रतिरक्षा भेद्यता को इंगित कर सकता है जिसके लिए सचेत जीवनशैली प्रबंधन आवश्यक है।'
    },
    ayu: {
        en: 'This is the 8th house itself - the primary seat of chronic conditions, longevity, surgery, and transformative health events. A well-placed factor here supports resilience through major health events and genuine long-term longevity; a poorly-placed one can indicate hidden, chronic, or sudden health crises that require extra vigilance.',
        hi: 'यह स्वयं अष्टम भाव है - पुरानी स्थितियों, दीर्घायु, शल्य-चिकित्सा और रूपांतरणकारी स्वास्थ्य घटनाओं का प्रमुख स्थान। यहाँ एक अच्छी तरह स्थित कारक बड़ी स्वास्थ्य घटनाओं के दौरान लचीलापन और वास्तविक दीर्घकालिक दीर्घायु का समर्थन करता है; एक खराब स्थित कारक छिपे, पुराने या अचानक स्वास्थ्य संकट को इंगित कर सकता है जिसके लिए अतिरिक्त सतर्कता आवश्यक है।'
    },
    vyaya: {
        en: 'This is the 12th house itself - the primary seat of hospitalization, confinement, sleep, and withdrawal from active life for recovery. A well-placed factor here supports peaceful healing, restful recovery, and benefit from rest, isolation, or foreign/specialised treatment; a poorly-placed one can indicate prolonged hospital stays, sleep disorders, or hidden ailments.',
        hi: 'यह स्वयं द्वादश भाव है - अस्पताल में भर्ती, एकांतवास, नींद और रिकवरी हेतु सक्रिय जीवन से हटने का प्रमुख स्थान। यहाँ एक अच्छी तरह स्थित कारक शांतिपूर्ण उपचार, आरामदायक रिकवरी, और विश्राम, एकांत या विदेशी/विशेषीकृत उपचार से लाभ का समर्थन करता है; एक खराब स्थित कारक लंबे अस्पताल प्रवास, नींद संबंधी विकार या छिपी हुई बीमारियों को इंगित कर सकता है।'
    }
};

// ---------------------------------------------------------------------------
// 4. HELPERS (mirrors generateMoneyAstrologyDataset.js)
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
        friend: 'The house lord is a natural friend of this placement, which smoothens outcomes and supports resilience between constitution and the matter at hand.',
        neutral: 'The relationship here is neutral, giving moderate, situation-dependent results that respond well to conscious lifestyle effort.',
        enemy: 'There is some natural friction in this placement, which can create internal strain or extra vulnerability before results stabilise - deliberate care, discipline, and remedies help considerably.'
    },
    hi: {
        own: 'यह ग्रह अपनी ही विशेषताओं में सबसे स्वाभाविक रूप से स्थित है, जिससे बिना किसी आंतरिक संघर्ष के स्पष्ट और सीधे परिणाम मिलते हैं।',
        friend: 'यह भाव-स्वामी इस स्थिति का स्वाभाविक मित्र है, जो परिणामों को सरल बनाता है और संरचना व संबंधित विषय के बीच लचीलेपन का समर्थन करता है।',
        neutral: 'यहाँ संबंध तटस्थ है, जो मध्यम, परिस्थिति-निर्भर परिणाम देता है जो सचेत जीवनशैली प्रयास से अच्छी प्रतिक्रिया देते हैं।',
        enemy: 'इस स्थिति में कुछ स्वाभाविक टकराव है, जो परिणाम स्थिर होने से पहले आंतरिक तनाव या अतिरिक्त भेद्यता उत्पन्न कर सकता है - सचेत देखभाल, अनुशासन और उपाय काफी सहायक होते हैं।'
    }
};

const RELATION_STRENGTH_TONE = {
    en: {
        own: 'This is the planet\'s own sign in the Navamsa, a position of great strength - it strongly confirms and stabilises the health indications from the Rashi (D-1) chart, supporting long-term resilience and recovery capacity.',
        friend: 'This is a friendly sign for the planet in the Navamsa, which supports and strengthens the health promise seen in the birth chart, adding stability to recovery and immunity.',
        neutral: 'This is a neutral sign for the planet in the Navamsa, giving moderate, mixed support to health outcomes - results depend significantly on other chart factors and lifestyle choices.',
        enemy: 'This is a challenging (enemy) sign for the planet in the Navamsa, which can weaken or delay the health promise, bringing extra vulnerability, slower recovery, or instability before genuine wellbeing is achieved.'
    },
    hi: {
        own: 'नवांश में यह ग्रह की अपनी राशि है, जो अत्यंत बल की स्थिति है - यह राशि (डी-1) कुंडली से दिखने वाले स्वास्थ्य संकेतों की दृढ़ता से पुष्टि और स्थिरता प्रदान करती है, जिससे दीर्घकालिक लचीलापन और रिकवरी क्षमता को समर्थन मिलता है।',
        friend: 'नवांश में यह ग्रह के लिए एक मित्र राशि है, जो जन्म कुंडली में दिखने वाले स्वास्थ्य वादे का समर्थन और सुदृढ़ीकरण करती है, तथा रिकवरी और प्रतिरक्षा में स्थिरता जोड़ती है।',
        neutral: 'नवांश में यह ग्रह के लिए एक तटस्थ राशि है, जो स्वास्थ्य परिणामों को मध्यम, मिश्रित समर्थन देती है - परिणाम अन्य कुंडली कारकों और जीवनशैली विकल्पों पर काफी हद तक निर्भर करते हैं।',
        enemy: 'नवांश में यह ग्रह के लिए एक चुनौतीपूर्ण (शत्रु) राशि है, जो स्वास्थ्य वादे को कमज़ोर या विलंबित कर सकती है, और वास्तविक कल्याण मिलने से पहले अतिरिक्त भेद्यता, धीमी रिकवरी या अस्थिरता ला सकती है।'
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
//    (6th/8th/12th house sign + lord, per the health technique)
// ---------------------------------------------------------------------------

function signKeyAtOffset(lagnaOrder, offset) {
    const signOrder = ((lagnaOrder - 1 + offset) % 12) + 1;
    return RASHI_KEYS_BY_ORDER.find((k) => RASHIS[k].order === signOrder);
}

function generateLagnaBase() {
    const out = {};
    RASHI_KEYS_BY_ORDER.forEach((lagnaKey) => {
        const lagna = RASHIS[lagnaKey];
        const lagnaLord = lagna.lord;

        const sixthSignKey = signKeyAtOffset(lagna.order, 5); // 6th house = 5 signs ahead
        const sixthLord = RASHIS[sixthSignKey].lord;

        const eighthSignKey = signKeyAtOffset(lagna.order, 7); // 8th house = 7 signs ahead
        const eighthLord = RASHIS[eighthSignKey].lord;

        const twelfthSignKey = signKeyAtOffset(lagna.order, 11); // 12th house = 11 signs ahead (i.e. 1 behind)
        const twelfthLord = RASHIS[twelfthSignKey].lord;

        const houseLords = computeHouseLordsForLagna(lagnaKey);
        const yogakaraka = computeYogakaraka(houseLords);

        out[lagnaKey] = {
            lagna: lagnaKey,
            lagnaName: RASHIS[lagnaKey].name,
            lagnaLord,
            lagnaLordName: PLANETS[lagnaLord].name,
            sixthHouseSign: sixthSignKey,
            sixthHouseSignName: RASHIS[sixthSignKey].name,
            sixthLord,
            sixthLordName: PLANETS[sixthLord].name,
            eighthHouseSign: eighthSignKey,
            eighthHouseSignName: RASHIS[eighthSignKey].name,
            eighthLord,
            eighthLordName: PLANETS[eighthLord].name,
            twelfthHouseSign: twelfthSignKey,
            twelfthHouseSignName: RASHIS[twelfthSignKey].name,
            twelfthLord,
            twelfthLordName: PLANETS[twelfthLord].name,
            houseLords,
            yogakaraka,
            note: {
                en: `For ${RASHIS[lagnaKey].name.en} Lagna, the Ascendant (Lagna) lord is ${PLANETS[lagnaLord].name.en}. The 6th house (Roga/disease) falls in ${RASHIS[sixthSignKey].name.en}, ruled by ${PLANETS[sixthLord].name.en}; the 8th house (Ayu/chronic-longevity) falls in ${RASHIS[eighthSignKey].name.en}, ruled by ${PLANETS[eighthLord].name.en}; and the 12th house (Vyaya/hospitalization) falls in ${RASHIS[twelfthSignKey].name.en}, ruled by ${PLANETS[twelfthLord].name.en}.${yogakaraka ? ` ${PLANETS[yogakaraka].name.en} is the Yogakaraka (a planet that rules both a Kendra and a Trikona house) for this Lagna - one of the most auspicious, health-strengthening planets in this chart.` : ''}`,
                hi: `${RASHIS[lagnaKey].name.hi} लग्न के लिए, लग्नेश ${PLANETS[lagnaLord].name.hi} है। षष्ठ भाव (रोग) ${RASHIS[sixthSignKey].name.hi} राशि में पड़ता है, जिसके स्वामी ${PLANETS[sixthLord].name.hi} हैं; अष्टम भाव (आयु) ${RASHIS[eighthSignKey].name.hi} राशि में पड़ता है, जिसके स्वामी ${PLANETS[eighthLord].name.hi} हैं; और द्वादश भाव (व्यय) ${RASHIS[twelfthSignKey].name.hi} राशि में पड़ता है, जिसके स्वामी ${PLANETS[twelfthLord].name.hi} हैं।${yogakaraka ? ` ${PLANETS[yogakaraka].name.hi} इस लग्न के लिए योगकारक ग्रह है (जो केंद्र और त्रिकोण दोनों भावों का स्वामी है) - यह इस कुंडली के सबसे शुभ, स्वास्थ्य-वर्धक ग्रहों में से एक है।` : ''}`
            }
        };
    });
    writeJson('lagnaBase.json', out);
    return out;
}

// ---------------------------------------------------------------------------
// 7. GENERATE: lagnaLordInHouse.json, sixthLordInHouse.json,
//    eighthLordInHouse.json, twelfthLordInHouse.json (7 lords x 12 houses each)
// ---------------------------------------------------------------------------

function generateLordInHouseTable(role) {
    // role: 'lagna' | 'sixth' | 'eighth' | 'twelfth'
    const out = {};
    const roleMeta = {
        lagna: { fileName: 'lagnaLordInHouse.json', labelEn: 'Lagna (Ascendant) lord', labelHi: 'लग्नेश', domainEn: 'your core physical constitution and overall vitality', domainHi: 'आपकी मूल शारीरिक संरचना और समग्र जीवनशक्ति' },
        sixth: { fileName: 'sixthLordInHouse.json', labelEn: '6th house (Roga/disease) lord', labelHi: 'षष्ठेश (रोग भाव स्वामी)', domainEn: 'your disease-resistance, immunity, and susceptibility to illness/injury', domainHi: 'आपकी रोग-प्रतिरोधक क्षमता, प्रतिरक्षा और बीमारी/चोट की संवेदनशीलता' },
        eighth: { fileName: 'eighthLordInHouse.json', labelEn: '8th house (Ayu/longevity) lord', labelHi: 'अष्टमेश (आयु भाव स्वामी)', domainEn: 'your longevity, resilience through chronic or major health events, and surgical outcomes', domainHi: 'आपकी दीर्घायु, पुरानी या बड़ी स्वास्थ्य घटनाओं के दौरान लचीलापन, और शल्य-चिकित्सा परिणाम' },
        twelfth: { fileName: 'twelfthLordInHouse.json', labelEn: '12th house (Vyaya/hospitalization) lord', labelHi: 'द्वादशेश (व्यय भाव स्वामी)', domainEn: 'your experience of hospitalization, rest-linked recovery, and sleep/subconscious health', domainHi: 'आपके अस्पताल में भर्ती होने, विश्राम-संबंधी रिकवरी, और नींद/अवचेतन स्वास्थ्य का अनुभव' }
    };
    const meta = roleMeta[role];

    LORD_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        for (let house = 1; house <= 12; house++) {
            const h = HOUSES[house];
            const key = `${planetKey}_${house}`;
            const guidance = HOUSE_CATEGORY_GUIDANCE[h.category];
            const areasEn = planet.healthAreas.en.slice(0, 3).join('; ');
            const areasHi = planet.healthAreas.hi.slice(0, 3).join('; ');

            const en = `Your ${meta.labelEn} ${planet.name.en} is placed in the ${house}${ordinalSuffix(house)} house (${h.name.en}). This means ${meta.domainEn} works through ${h.signification.en}. ${capitalize(planet.traits.en)} - specifically this shapes ${h.domainAngle.en}. This highlights ${areasEn}. ${guidance.en}`;
            const hi = `आपका ${meta.labelHi} ${planet.name.hi} ${house}वें भाव (${h.name.hi}) में स्थित है। इसका अर्थ है कि ${meta.domainHi} ${h.signification.hi} के माध्यम से कार्य करती है। यह ${planet.traits.hi} है - जो विशेष रूप से ${h.domainAngle.hi} को आकार देती है। यह ${areasHi} को उजागर करता है। ${guidance.hi}`;

            out[key] = { key, role, planet: planetKey, planetName: planet.name, house, houseName: h.name, text: { en, hi } };
        }
    });
    writeJson(meta.fileName, out);
}

// ---------------------------------------------------------------------------
// 8. GENERATE: planetInHouse1.json, planetInHouse6.json, planetInHouse8.json,
//    planetInHouse12.json (9 grahas each)
// ---------------------------------------------------------------------------

function generatePlanetInHouseTable(houseNum) {
    const out = {};
    const h = HOUSES[houseNum];
    const fileNames = { 1: 'planetInHouse1.json', 6: 'planetInHouse6.json', 8: 'planetInHouse8.json', 12: 'planetInHouse12.json' };
    const houseLabelEn = { 1: '1st house (Lagna)', 6: '6th house (Roga/disease house)', 8: '8th house (Ayu/longevity house)', 12: '12th house (Vyaya/hospitalization house)' }[houseNum];
    const houseLabelHi = { 1: 'प्रथम भाव (लग्न)', 6: 'षष्ठ भाव (रोग भाव)', 8: 'अष्टम भाव (आयु भाव)', 12: 'द्वादश भाव (व्यय भाव)' }[houseNum];

    ALL_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        const areasEn = planet.healthAreas.en.slice(0, 3).join('; ');
        const areasHi = planet.healthAreas.hi.slice(0, 3).join('; ');

        let en, hi;
        if (houseNum === 1) {
            en = `${planet.name.en} placed in the 1st house (Lagna) sits right on the Ascendant and directly colours your physical constitution, appearance, and baseline vitality. It carries ${planet.traits.en}. This placement highlights ${areasEn}, and your own bodily nature strongly shapes your overall health journey.`;
            hi = `${planet.name.hi} का प्रथम भाव (लग्न) में स्थित होना सीधे लग्न पर बैठकर आपकी शारीरिक संरचना, रूप-रंग और आधारभूत जीवनशक्ति को रंग देता है। इसमें ${planet.traits.hi} है। यह स्थिति ${areasHi} को उजागर करती है, और आपका अपना शारीरिक स्वभाव आपकी समग्र स्वास्थ्य यात्रा को दृढ़ता से आकार देता है।`;
        } else {
            en = `${planet.name.en} placed directly in the ${houseLabelEn} has a strong, immediate influence on your health, since it occupies one of the three primary Trik/Dusthana health houses. It carries ${planet.traits.en}. This placement strongly highlights ${areasEn}.`;
            hi = `${planet.name.hi} का सीधे ${houseLabelHi} में स्थित होना आपके स्वास्थ्य पर एक मज़बूत, तत्काल प्रभाव डालता है, क्योंकि यह तीन प्रमुख त्रिक/दुःस्थान स्वास्थ्य भावों में से एक में स्थित है। इसमें ${planet.traits.hi} है। यह स्थिति ${areasHi} को दृढ़ता से उजागर करती है।`;
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

            const areasEnA = pa.healthAreas.en.slice(0, 2).join(' and ');
            const areasEnB = pb.healthAreas.en.slice(0, 2).join(' and ');
            const areasHiA = pa.healthAreas.hi.slice(0, 2).join(' और ');
            const areasHiB = pb.healthAreas.hi.slice(0, 2).join(' और ');

            const en = `A conjunction of ${pa.name.en} and ${pb.name.en} blends ${pa.traits.en} with ${pb.traits.en}. ${tone} For health, this combination brings together ${areasEnA} with ${areasEnB} - a layered constitutional dynamic that draws on both planets' significations. When this conjunction falls in or influences the 1st, 6th, 8th, or 12th house, its effect on health becomes especially direct.`;
            const hi = `${pa.name.hi} और ${pb.name.hi} की युति ${pa.traits.hi} को ${pb.traits.hi} के साथ मिलाती है। ${toneHi} स्वास्थ्य के लिए, यह संयोजन ${areasHiA} को ${areasHiB} के साथ एक साथ लाता है - एक बहुस्तरीय संरचनात्मक गतिशीलता जो दोनों ग्रहों की विशेषताओं का लाभ उठाती है। जब यह युति प्रथम, षष्ठ, अष्टम या द्वादश भाव में हो या उसे प्रभावित करे, तो स्वास्थ्य पर इसका प्रभाव विशेष रूप से प्रत्यक्ष हो जाता है।`;

            out[key] = { key, planets: [a, b], planetNames: [pa.name, pb.name], relation, text: { en, hi } };
        }
    }
    writeJson('conjunctions.json', out);
}

// ---------------------------------------------------------------------------
// 10. GENERATE: lagnaLordInNavamsa.json, sixthLordInNavamsa.json,
//     eighthLordInNavamsa.json, twelfthLordInNavamsa.json (7 lords x 12 signs)
// ---------------------------------------------------------------------------

function generateLordInNavamsaSignTable(role) {
    const out = {};
    const roleMeta = {
        lagna: { fileName: 'lagnaLordInNavamsa.json', labelEn: 'Lagna lord', labelHi: 'लग्नेश', noteEn: 'the deeper, long-term strength and true sustainability of your core constitution and vitality', noteHi: 'आपकी मूल संरचना और जीवनशक्ति की गहरी, दीर्घकालिक शक्ति और वास्तविक स्थायित्व' },
        sixth: { fileName: 'sixthLordInNavamsa.json', labelEn: '6th lord', labelHi: 'षष्ठेश', noteEn: 'the deeper, long-term strength and true sustainability of your disease-resistance and immunity shown by your 6th house', noteHi: 'आपके षष्ठ भाव द्वारा दर्शाई गई रोग-प्रतिरोधक क्षमता और प्रतिरक्षा की गहरी, दीर्घकालिक शक्ति और वास्तविक स्थायित्व' },
        eighth: { fileName: 'eighthLordInNavamsa.json', labelEn: '8th lord', labelHi: 'अष्टमेश', noteEn: 'the deeper, long-term strength and true sustainability of your longevity and resilience through major health events shown by your 8th house', noteHi: 'आपके अष्टम भाव द्वारा दर्शाई गई दीर्घायु और बड़ी स्वास्थ्य घटनाओं में लचीलेपन की गहरी, दीर्घकालिक शक्ति और वास्तविक स्थायित्व' },
        twelfth: { fileName: 'twelfthLordInNavamsa.json', labelEn: '12th lord', labelHi: 'द्वादशेश', noteEn: 'the deeper, long-term strength and true sustainability of your recovery-through-rest and hospitalization outcomes shown by your 12th house', noteHi: 'आपके द्वादश भाव द्वारा दर्शाए गए विश्राम-द्वारा-रिकवरी और अस्पताल भर्ती परिणामों की गहरी, दीर्घकालिक शक्ति और वास्तविक स्थायित्व' }
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
// 10b. GENERATE: lagnaLordInNavamsaHouse.json, sixthLordInNavamsaHouse.json,
//      eighthLordInNavamsaHouse.json, twelfthLordInNavamsaHouse.json
//      (7 lords x 12 HOUSE NUMBERS, counted from the Navamsa's own ascendant)
// ---------------------------------------------------------------------------

function generateLordInNavamsaHouseTable(role) {
    const out = {};
    const roleMeta = {
        lagna: { fileName: 'lagnaLordInNavamsaHouse.json', labelEn: 'Lagna lord', labelHi: 'लग्नेश', subjectEn: 'your inner constitution and vitality', subjectHi: 'आपकी आंतरिक संरचना और जीवनशक्ति' },
        sixth: { fileName: 'sixthLordInNavamsaHouse.json', labelEn: '6th lord', labelHi: 'षष्ठेश', subjectEn: 'the true, destined strength of your disease-resistance and immunity', subjectHi: 'आपकी रोग-प्रतिरोधक क्षमता और प्रतिरक्षा की वास्तविक, नियति-निर्धारित शक्ति' },
        eighth: { fileName: 'eighthLordInNavamsaHouse.json', labelEn: '8th lord', labelHi: 'अष्टमेश', subjectEn: 'the true, destined strength of your longevity and chronic-illness resilience', subjectHi: 'आपकी दीर्घायु और पुरानी बीमारी के प्रति लचीलेपन की वास्तविक, नियति-निर्धारित शक्ति' },
        twelfth: { fileName: 'twelfthLordInNavamsaHouse.json', labelEn: '12th lord', labelHi: 'द्वादशेश', subjectEn: 'the true, destined strength of your recovery-through-rest and hospitalization outcomes', subjectHi: 'आपके विश्राम-द्वारा-रिकवरी और अस्पताल भर्ती परिणामों की वास्तविक, नियति-निर्धारित शक्ति' }
    };
    const meta = roleMeta[role];

    LORD_PLANETS.forEach((planetKey) => {
        const planet = PLANETS[planetKey];
        for (let house = 1; house <= 12; house++) {
            const h = HOUSES[house];
            const key = `${planetKey}_${house}`;
            const guidance = HOUSE_CATEGORY_GUIDANCE[h.category];

            const en = `In the Navamsa (D-9) chart, your ${meta.labelEn} ${planet.name.en} falls in the ${house}${ordinalSuffix(house)} house counted from the Navamsa's own Ascendant. Since the D-9 chart reveals the deeper, destined strength behind what the Rashi (D-1) chart promises, this shows that ${meta.subjectEn} draws hidden strength from ${h.signification.en}, particularly regarding ${h.domainAngle.en}. ${guidance.en} A well-placed lord here confirms genuine, long-term health resilience rather than just a surface-level promise.`;
            const hi = `नवांश (डी-9) कुंडली में, आपका ${meta.labelHi} ${planet.name.hi} नवांश के अपने लग्न से गिनने पर ${house}वें भाव में पड़ता है। चूंकि डी-9 कुंडली राशि (डी-1) कुंडली द्वारा दिए गए वादों के पीछे की गहरी, नियति-निर्धारित शक्ति को दर्शाती है, यह बताता है कि ${meta.subjectHi} ${h.signification.hi} से छिपी हुई शक्ति प्राप्त करती है, विशेष रूप से ${h.domainAngle.hi} के संबंध में। ${guidance.hi} यहाँ एक अच्छी तरह स्थित स्वामी एक सतही वादे के बजाय वास्तविक, दीर्घकालिक स्वास्थ्य लचीलेपन की पुष्टि करता है।`;

            out[key] = { key, role, planet: planetKey, planetName: planet.name, navamsaHouse: house, navamsaHouseName: h.name, text: { en, hi } };
        }
    });
    writeJson(meta.fileName, out);
}

// ---------------------------------------------------------------------------
// 11. GENERATE: firstHouseConjunctionYogas.json, sixthHouseConjunctionYogas.json,
//      eighthHouseConjunctionYogas.json, twelfthHouseConjunctionYogas.json
//      (12 lagnas x 36 planet pairs each) - lagna-aware named-Yoga detection
//      for conjunctions occurring in the 1st, 6th, 8th, or 12th house.
// ---------------------------------------------------------------------------

const YOGA_TEXT = {
    raja_yoga: {
        en: (houseLabel) => `This conjunction forms a classic **Raja Yoga** for this Lagna (a union between a Kendra-house lord and a Trikona-house lord), occurring right in the ${houseLabel}. For health, this is an excellent combination - it indicates a strong, resilient constitution, high natural immunity, and a marked ability to bounce back fully from illness or injury.`,
        hi: (houseLabel) => `यह युति इस लग्न के लिए एक क्लासिक **राज योग** बनाती है (एक केंद्र भाव स्वामी और एक त्रिकोण भाव स्वामी का मिलन), जो सीधे ${houseLabel} में हो रही है। स्वास्थ्य के लिए, यह एक उत्कृष्ट संयोजन है - यह एक मज़बूत, लचीली संरचना, उच्च प्राकृतिक प्रतिरक्षा, और बीमारी या चोट से पूरी तरह उबरने की उल्लेखनीय क्षमता को दर्शाता है।`
    },
    dhana_yoga: {
        en: (houseLabel) => `This conjunction forms a **Dhana Yoga**-type combination for this Lagna (a wealth-house lord - 2nd or 11th - combining with another wealth-linked lord), occurring in the ${houseLabel}. For health, this indicates strong underlying bodily reserves and resources - good nutritional foundation, stamina reserves, and the practical means to access excellent healthcare and treatment when needed.`,
        hi: (houseLabel) => `यह युति इस लग्न के लिए एक **धन योग**-प्रकार का संयोजन बनाती है (एक धन-भाव स्वामी - द्वितीय या एकादश - का किसी अन्य धन-संबंधी स्वामी के साथ संयोजन), जो ${houseLabel} में हो रही है। स्वास्थ्य के लिए, यह मज़बूत अंतर्निहित शारीरिक भंडार और संसाधनों को दर्शाता है - अच्छा पोषण आधार, सहनशक्ति भंडार, और आवश्यकता पड़ने पर उत्कृष्ट स्वास्थ्य सेवा और उपचार तक पहुँचने के व्यावहारिक साधन।`
    },
    vipreet_raja_yoga: {
        en: (houseLabel) => `This conjunction forms a **Vipreet Raja Yoga** for this Lagna (both planets rule only Dusthana houses - 6th, 8th or 12th), occurring in the ${houseLabel}. This is a classically protective, health-specific combination: when the disease-related houses' own lords combine like this, their negative potential neutralises and often reverses - granting unexpected recovery, strong resistance to chronic illness, or the ability to overcome serious health scares in surprising fashion.`,
        hi: (houseLabel) => `यह युति इस लग्न के लिए एक **विपरीत राज योग** बनाती है (दोनों ग्रह केवल दुःस्थान भावों - षष्ठ, अष्टम या द्वादश - के स्वामी हैं), जो ${houseLabel} में हो रही है। यह एक शास्त्रीय रूप से सुरक्षात्मक, स्वास्थ्य-विशिष्ट संयोजन है: जब रोग-संबंधी भावों के स्वामी इस प्रकार संयोजित होते हैं, तो उनकी नकारात्मक क्षमता निष्प्रभावी हो जाती है और प्रायः उलट जाती है - जिससे अप्रत्याशित रिकवरी, पुरानी बीमारी के प्रति मज़बूत प्रतिरोध, या आश्चर्यजनक ढंग से गंभीर स्वास्थ्य संकट पर विजय पाने की क्षमता मिलती है।`
    },
    general: {
        en: (houseLabel) => `For this specific Lagna, this conjunction does not form one of the classical named Yogas (Raja/Dhana/Vipreet Raja) - the two planets involved do not share a Kendra-Trikona, Dhana, or pure-Dusthana lordship relationship here. Its effect in the ${houseLabel} is best read through the individual planetary conjunction meaning and each planet's own placement.`,
        hi: (houseLabel) => `इस विशिष्ट लग्न के लिए, यह युति क्लासिक नामित योगों (राज/धन/विपरीत राज) में से कोई नहीं बनाती - यहाँ दोनों ग्रहों का केंद्र-त्रिकोण, धन, या शुद्ध-दुःस्थान स्वामित्व संबंध नहीं है। ${houseLabel} में इसका प्रभाव सर्वोत्तम रूप से व्यक्तिगत ग्रह-युति अर्थ और प्रत्येक ग्रह की अपनी स्थिति के माध्यम से समझा जाता है।`
    }
};

function generateHouseConjunctionYogas(houseNum) {
    const out = {};
    const houseLabelEn = { 1: '1st house (Lagna)', 6: '6th house (Roga/disease house)', 8: '8th house (Ayu/longevity house)', 12: '12th house (Vyaya/hospitalization house)' }[houseNum];
    const houseLabelHi = { 1: 'प्रथम भाव (लग्न)', 6: 'षष्ठ भाव (रोग भाव)', 8: 'अष्टम भाव (आयु भाव)', 12: 'द्वादश भाव (व्यय भाव)' }[houseNum];
    const fileNames = { 1: 'firstHouseConjunctionYogas.json', 6: 'sixthHouseConjunctionYogas.json', 8: 'eighthHouseConjunctionYogas.json', 12: 'twelfthHouseConjunctionYogas.json' };

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
                    en += ` Notably, ${PLANETS[yogakaraka].name.en} - the Yogakaraka for ${RASHIS[lagnaKey].name.en} Lagna - is part of this combination, which further amplifies its auspicious, health-strengthening effect.`;
                    hi += ` उल्लेखनीय है कि ${PLANETS[yogakaraka].name.hi} - जो ${RASHIS[lagnaKey].name.hi} लग्न के लिए योगकारक ग्रह है - इस संयोजन का हिस्सा है, जो इसके शुभ, स्वास्थ्य-वर्धक प्रभाव को और बढ़ाता है।`;
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
//      Yogas formed purely by two specific grahas conjoining, reframed for health.
// ---------------------------------------------------------------------------

const CLASSICAL_PAIR_YOGAS = {
    sun_mercury: {
        name: { en: 'Budh-Aditya Yoga', hi: 'बुध-आदित्य योग' },
        text: {
            en: 'Sun and Mercury together form Budh-Aditya Yoga, blending core vitality with a sharp, adaptable nervous system. This favours strong nerve-vitality integration, quick mental processing during health decisions, and a resilient constitution that adapts well to treatment.',
            hi: 'सूर्य और बुध मिलकर बुध-आदित्य योग बनाते हैं, जो मूल जीवनशक्ति को एक तीक्ष्ण, अनुकूलनशील तंत्रिका तंत्र के साथ जोड़ता है। यह मज़बूत तंत्रिका-जीवनशक्ति एकीकरण, स्वास्थ्य निर्णयों के दौरान त्वरित मानसिक प्रसंस्करण, और उपचार के प्रति अच्छी तरह अनुकूलित होने वाली लचीली संरचना के लिए अनुकूल है।'
        }
    },
    moon_jupiter: {
        name: { en: 'Gajakesari Yoga', hi: 'गजकेसरी योग' },
        text: {
            en: 'Moon and Jupiter together form Gajakesari Yoga, one of the most celebrated protective combinations. For health, this indicates strong natural immunity, emotional resilience, sound mental health, and excellent recuperative capacity from most illnesses.',
            hi: 'चंद्रमा और बृहस्पति मिलकर गजकेसरी योग बनाते हैं, जो सबसे प्रशंसित सुरक्षात्मक संयोजनों में से एक है। स्वास्थ्य के लिए, यह मज़बूत प्राकृतिक प्रतिरक्षा, भावनात्मक लचीलापन, सुदृढ़ मानसिक स्वास्थ्य, और अधिकांश बीमारियों से उत्कृष्ट स्वास्थ्य-लाभ क्षमता को दर्शाता है।'
        }
    },
    moon_mars: {
        name: { en: 'Chandra-Mangal Yoga', hi: 'चंद्र-मंगल योग' },
        text: {
            en: 'Moon and Mars together form Chandra-Mangal Yoga, blending emotional sensitivity with bold physical energy. This supports strong physical stamina and quick recovery from injury, though it also raises the risk of blood-pressure or inflammatory conditions if the combination is afflicted - balance and calm are especially valuable here.',
            hi: 'चंद्रमा और मंगल मिलकर चंद्र-मंगल योग बनाते हैं, जो भावनात्मक संवेदनशीलता को साहसिक शारीरिक ऊर्जा के साथ जोड़ता है। यह मज़बूत शारीरिक सहनशक्ति और चोट से तेज़ रिकवरी का समर्थन करता है, हालाँकि यदि यह संयोजन पीड़ित हो तो रक्तचाप या सूजन संबंधी स्थितियों का खतरा भी बढ़ जाता है - यहाँ संतुलन और शांति विशेष रूप से मूल्यवान है।'
        }
    },
    mars_jupiter: {
        name: { en: 'Guru-Mangal Yoga', hi: 'गुरु-मंगल योग' },
        text: {
            en: 'Mars and Jupiter together form Guru-Mangal Yoga, combining physical strength and quick action with wisdom and natural healing capacity. For health, this favours a robust constitution, particularly strong bone/muscle health, and quick, well-guided recovery from injury or surgery.',
            hi: 'मंगल और बृहस्पति मिलकर गुरु-मंगल योग बनाते हैं, जो शारीरिक शक्ति और त्वरित कार्यवाही को ज्ञान और प्राकृतिक उपचार क्षमता के साथ जोड़ता है। स्वास्थ्य के लिए, यह एक मज़बूत संरचना, विशेष रूप से मज़बूत हड्डी/मांसपेशी स्वास्थ्य, और चोट या शल्य-चिकित्सा से तेज़, अच्छी तरह निर्देशित रिकवरी के लिए अनुकूल है।'
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
                        en: 'This planetary pair does not carry one of the small set of universally-recognised classical Yoga names (like Budh-Aditya or Gajakesari) independent of house-lordship. Refer to the general conjunction meaning, and to the lagna-specific Raja/Dhana/Vipreet Raja Yoga check for this pair in the 1st/6th/8th/12th house tables.',
                        hi: 'यह ग्रह-युग्म किसी सर्वमान्य क्लासिक योग नाम (जैसे बुध-आदित्य या गजकेसरी) के तहत नहीं आता, जो भाव-स्वामित्व से स्वतंत्र हो। सामान्य युति अर्थ देखें, और इस युग्म के लिए प्रथम/षष्ठ/अष्टम/द्वादश भाव की तालिकाओं में लग्न-विशिष्ट राज/धन/विपरीत राज योग जाँच देखें।'
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
        description: 'Health astrology combination dataset (Vedic/Parashari) - the health counterpart of the career/marriage/money datasets, using the THREE classical Trik/Dusthana houses (6th = Roga/disease, 8th = Ayu/chronic-longevity, 12th = Vyaya/hospitalization) in place of a single or double significator house. Covers Lagna lord placement, 6th/8th/12th lord placement, planets in 1st/6th/8th/12th house, generic conjunctions, lagna-independent classical pair-Yogas, lagna-aware Raja/Dhana/Vipreet-Raja Yoga detection for 1st/6th/8th/12th-house conjunctions (Vipreet Raja Yoga being especially protective/relevant here), and the Lagna/6th/8th/12th lords\' placement in Navamsa (D-9) by sign AND by house-number. Bilingual (English/Hindi). Generated by scripts/generateHealthAstrologyDataset.js - do not hand-edit, re-run the generator instead.',
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

console.log('Generating health astrology dataset...');
generateReferenceTables();
generateLagnaBase();
generateLordInHouseTable('lagna');
generateLordInHouseTable('sixth');
generateLordInHouseTable('eighth');
generateLordInHouseTable('twelfth');
generatePlanetInHouseTable(1);
generatePlanetInHouseTable(6);
generatePlanetInHouseTable(8);
generatePlanetInHouseTable(12);
generateConjunctions();
generateLordInNavamsaSignTable('lagna');
generateLordInNavamsaSignTable('sixth');
generateLordInNavamsaSignTable('eighth');
generateLordInNavamsaSignTable('twelfth');
generateLordInNavamsaHouseTable('lagna');
generateLordInNavamsaHouseTable('sixth');
generateLordInNavamsaHouseTable('eighth');
generateLordInNavamsaHouseTable('twelfth');
generateHouseConjunctionYogas(1);
generateHouseConjunctionYogas(6);
generateHouseConjunctionYogas(8);
generateHouseConjunctionYogas(12);
generateClassicalPairYogas();
generateManifest();
console.log('Done. Output directory:', OUT_DIR);
