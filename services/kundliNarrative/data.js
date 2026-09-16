/**
 * services/kundliNarrative/data.js
 *
 * Bilingual (English / Hindi) knowledge bank used by the kundli narrative
 * composer. Everything here is static astrological vocabulary - planet
 * profiles, sign flavours, house themes, dignity wording, yoga descriptions
 * and per-domain wording. NO AI is involved: the composer stitches these
 * fragments with chart facts into flowing paragraphs.
 *
 * Keep entries short noun/verb phrases so they can be dropped into the
 * sentence builders in sentences.en.js / sentences.hi.js.
 */

'use strict';

const PLANET_ORDER = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];
const SIGN_ORDER = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];

// ---------------------------------------------------------------------------
// Planets
// ---------------------------------------------------------------------------
const PLANETS = {
    sun: {
        name: { en: 'Sun', hi: 'सूर्य' },
        nature: 'malefic',
        exalt: 'aries', debil: 'libra', own: ['leo'],
        friends: ['moon', 'mars', 'jupiter'], enemies: ['venus', 'saturn', 'rahu', 'ketu'],
        essence: { en: 'the planet of vitality, authority and self-expression', hi: 'जीवन-शक्ति, अधिकार और आत्म-अभिव्यक्ति का ग्रह' },
        onLagna: { en: 'a commanding presence, natural confidence and a strong wish to be respected for who you are', hi: 'एक प्रभावशाली व्यक्तित्व, स्वाभाविक आत्मविश्वास और अपने वास्तविक रूप में सम्मान पाने की प्रबल इच्छा' },
        body: { en: 'a strong frame, bright eyes and good vitality', hi: 'मज़बूत शरीर, चमकदार आँखें और अच्छी जीवन-शक्ति' },
        strengths: { en: 'leadership, clarity of purpose and the ability to take responsibility', hi: 'नेतृत्व, उद्देश्य की स्पष्टता और ज़िम्मेदारी उठाने की क्षमता' },
        cautions: { en: 'ego, stubbornness and a tendency to take criticism too personally', hi: 'अहंकार, हठ और आलोचना को बहुत व्यक्तिगत रूप से लेने की प्रवृत्ति' },
        advice: { en: 'Lead with humility; your influence grows fastest when others feel respected rather than overshadowed.', hi: 'विनम्रता के साथ नेतृत्व करें; जब लोग स्वयं को सम्मानित महसूस करते हैं, तब आपका प्रभाव सबसे तेज़ी से बढ़ता है।' }
    },
    moon: {
        name: { en: 'Moon', hi: 'चंद्रमा' },
        nature: 'benefic',
        exalt: 'taurus', debil: 'scorpio', own: ['cancer'],
        friends: ['sun', 'mercury'], enemies: [],
        essence: { en: 'the planet of mind, emotions and nurturing', hi: 'मन, भावनाओं और पोषण का ग्रह' },
        onLagna: { en: 'a sensitive, receptive and caring personality that quickly senses the mood of the people around you', hi: 'एक संवेदनशील, ग्रहणशील और देखभाल करने वाला व्यक्तित्व, जो आस-पास के लोगों की भावनाओं को तुरंत समझ लेता है' },
        body: { en: 'a soft, rounded look and a body that responds strongly to diet and sleep', hi: 'कोमल, गोलाकार रूप-रंग और ऐसा शरीर जो आहार और नींद से गहराई से प्रभावित होता है' },
        strengths: { en: 'empathy, adaptability and a natural connection with the public', hi: 'सहानुभूति, अनुकूलनशीलता और जनता से स्वाभाविक जुड़ाव' },
        cautions: { en: 'mood swings, over-sensitivity and a habit of carrying other people\'s worries', hi: 'मनोदशा में उतार-चढ़ाव, अति-संवेदनशीलता और दूसरों की चिंताएँ अपने ऊपर ले लेने की आदत' },
        advice: { en: 'Protect your peace of mind; steady routines and proper rest keep your emotional strength intact.', hi: 'अपने मन की शांति की रक्षा करें; नियमित दिनचर्या और पर्याप्त विश्राम आपकी भावनात्मक शक्ति को बनाए रखते हैं।' }
    },
    mars: {
        name: { en: 'Mars', hi: 'मंगल' },
        nature: 'malefic',
        exalt: 'capricorn', debil: 'cancer', own: ['aries', 'scorpio'],
        friends: ['sun', 'moon', 'jupiter'], enemies: ['mercury'],
        essence: { en: 'the planet of energy, courage and action', hi: 'ऊर्जा, साहस और कर्म का ग्रह' },
        onLagna: { en: 'a bold, restless and competitive personality with plenty of physical drive', hi: 'एक साहसी, चंचल और प्रतिस्पर्धी व्यक्तित्व, जिसमें भरपूर शारीरिक ऊर्जा है' },
        body: { en: 'a muscular, athletic build and a constitution that runs hot', hi: 'गठीला, खिलाड़ी जैसा शरीर और गर्म प्रकृति' },
        strengths: { en: 'courage, initiative and the ability to act quickly under pressure', hi: 'साहस, पहल और दबाव में तुरंत कार्य करने की क्षमता' },
        cautions: { en: 'impatience, anger and a tendency to rush into conflict or risk', hi: 'अधीरता, क्रोध और बिना सोचे टकराव या जोखिम में कूद पड़ने की प्रवृत्ति' },
        advice: { en: 'Channel your energy into disciplined effort; patience turns your courage into lasting results.', hi: 'अपनी ऊर्जा को अनुशासित प्रयास में लगाएँ; धैर्य आपके साहस को स्थायी परिणामों में बदल देता है।' }
    },
    mercury: {
        name: { en: 'Mercury', hi: 'बुध' },
        nature: 'benefic',
        exalt: 'virgo', debil: 'pisces', own: ['gemini', 'virgo'],
        friends: ['sun', 'venus'], enemies: ['moon'],
        essence: { en: 'the planet of intellect, communication and commerce', hi: 'बुद्धि, संवाद और व्यापार का ग्रह' },
        onLagna: { en: 'a sharp, curious and articulate personality that thinks and speaks quickly', hi: 'एक तीक्ष्ण, जिज्ञासु और वाक्पटु व्यक्तित्व, जो तेज़ी से सोचता और बोलता है' },
        body: { en: 'a slim, youthful look and quick, expressive gestures', hi: 'छरहरा, युवा रूप और तेज़, अभिव्यंजक हाव-भाव' },
        strengths: { en: 'analysis, adaptability, communication and fast learning', hi: 'विश्लेषण, अनुकूलनशीलता, संवाद-कौशल और तेज़ी से सीखने की क्षमता' },
        cautions: { en: 'restlessness, over-thinking and scattering your attention across too many interests', hi: 'बेचैनी, अधिक सोचना और बहुत सारी रुचियों में ध्यान बिखेर देना' },
        advice: { en: 'Pick a few skills and go deep; focus is what turns your quick mind into real expertise.', hi: 'कुछ चुने हुए कौशलों में गहराई हासिल करें; एकाग्रता ही आपकी तेज़ बुद्धि को सच्ची विशेषज्ञता में बदलती है।' }
    },
    jupiter: {
        name: { en: 'Jupiter', hi: 'गुरु' },
        nature: 'benefic',
        exalt: 'cancer', debil: 'capricorn', own: ['sagittarius', 'pisces'],
        friends: ['sun', 'moon', 'mars'], enemies: ['mercury', 'venus'],
        essence: { en: 'the planet of wisdom, growth and good fortune', hi: 'ज्ञान, विकास और सौभाग्य का ग्रह' },
        onLagna: { en: 'a warm, optimistic and dignified personality that others naturally trust', hi: 'एक स्नेही, आशावादी और गरिमामय व्यक्तित्व, जिस पर लोग स्वाभाविक रूप से भरोसा करते हैं' },
        body: { en: 'a broad, well-built frame and a tendency to gain weight with comfort', hi: 'चौड़ा, सुगठित शरीर और सुख-सुविधा के साथ वज़न बढ़ने की प्रवृत्ति' },
        strengths: { en: 'wisdom, faith, generosity and a broad, ethical outlook', hi: 'ज्ञान, श्रद्धा, उदारता और एक व्यापक, नैतिक दृष्टिकोण' },
        cautions: { en: 'over-confidence, complacency and promising more than you can deliver', hi: 'अति-आत्मविश्वास, आत्मसंतुष्टि और क्षमता से अधिक वादे करना' },
        advice: { en: 'Keep learning and keep giving; your fortune expands in proportion to your integrity.', hi: 'सीखते रहें और देते रहें; आपका सौभाग्य आपकी ईमानदारी के अनुपात में बढ़ता है।' }
    },
    venus: {
        name: { en: 'Venus', hi: 'शुक्र' },
        nature: 'benefic',
        exalt: 'pisces', debil: 'virgo', own: ['taurus', 'libra'],
        friends: ['mercury', 'saturn'], enemies: ['sun', 'moon'],
        essence: { en: 'the planet of love, beauty, comfort and harmony', hi: 'प्रेम, सौंदर्य, सुख और सामंजस्य का ग्रह' },
        onLagna: { en: 'a charming, graceful and pleasant personality with a refined sense of taste', hi: 'एक आकर्षक, सौम्य और सुखद व्यक्तित्व, जिसमें परिष्कृत रुचि है' },
        body: { en: 'attractive features, a pleasant voice and a love of good living', hi: 'आकर्षक नैन-नक्श, मधुर आवाज़ और अच्छे रहन-सहन का शौक' },
        strengths: { en: 'diplomacy, creativity, charm and the ability to build harmonious relationships', hi: 'कूटनीति, रचनात्मकता, आकर्षण और मधुर संबंध बनाने की क्षमता' },
        cautions: { en: 'indulgence, vanity and avoiding hard decisions in order to keep everyone happy', hi: 'भोग-विलास, दिखावा और सबको खुश रखने के लिए कठिन निर्णय टालना' },
        advice: { en: 'Enjoy comfort, but do not let it soften your discipline; balance pleasure with purpose.', hi: 'सुख-सुविधा का आनंद लें, पर उसे अपने अनुशासन को कमज़ोर न करने दें; आनंद और उद्देश्य में संतुलन रखें।' }
    },
    saturn: {
        name: { en: 'Saturn', hi: 'शनि' },
        nature: 'malefic',
        exalt: 'libra', debil: 'aries', own: ['capricorn', 'aquarius'],
        friends: ['mercury', 'venus'], enemies: ['sun', 'moon', 'mars'],
        essence: { en: 'the planet of discipline, patience and karma', hi: 'अनुशासन, धैर्य और कर्म-फल का ग्रह' },
        onLagna: { en: 'a serious, reserved and responsible personality that matures early and works hard', hi: 'एक गंभीर, संयमित और ज़िम्मेदार व्यक्तित्व, जो जल्दी परिपक्व होता है और कठिन परिश्रम करता है' },
        body: { en: 'a lean or bony frame, a serious face and a body that needs care in cold weather', hi: 'दुबला या हड्डीला शरीर, गंभीर चेहरा और ऐसा शरीर जिसे ठंड में देखभाल चाहिए' },
        strengths: { en: 'endurance, discipline, realism and steady long-term effort', hi: 'सहनशक्ति, अनुशासन, यथार्थवाद और स्थिर दीर्घकालिक प्रयास' },
        cautions: { en: 'pessimism, delays, self-doubt and a tendency to carry burdens alone', hi: 'निराशावाद, देरी, आत्म-संदेह और अकेले बोझ उठाने की प्रवृत्ति' },
        advice: { en: 'Trust the slow path; Saturn rewards consistency, and what you build patiently will last.', hi: 'धीमे मार्ग पर भरोसा रखें; शनि निरंतरता का फल देते हैं, और जो आप धैर्य से बनाएँगे वह टिकेगा।' }
    },
    rahu: {
        name: { en: 'Rahu', hi: 'राहु' },
        nature: 'shadow',
        exalt: 'taurus', debil: 'scorpio', own: [],
        friends: ['mercury', 'venus', 'saturn'], enemies: ['sun', 'moon', 'mars'],
        essence: { en: 'the shadow planet of ambition, obsession and worldly desire', hi: 'महत्वाकांक्षा, जुनून और सांसारिक इच्छाओं का छाया ग्रह' },
        onLagna: { en: 'an unconventional, ambitious and magnetic personality that others find hard to fully read', hi: 'एक अपरंपरागत, महत्वाकांक्षी और चुंबकीय व्यक्तित्व, जिसे दूसरे पूरी तरह समझ नहीं पाते' },
        body: { en: 'unusual or striking features and a nervous, restless energy', hi: 'असामान्य या प्रभावशाली नैन-नक्श और बेचैन, चंचल ऊर्जा' },
        strengths: { en: 'ambition, innovation and the ability to thrive in foreign or modern environments', hi: 'महत्वाकांक्षा, नवाचार और विदेशी या आधुनिक परिवेश में फलने-फूलने की क्षमता' },
        cautions: { en: 'confusion, restlessness, illusions and the temptation of shortcuts', hi: 'भ्रम, बेचैनी, मृगतृष्णा और शॉर्टकट का प्रलोभन' },
        advice: { en: 'Aim high but stay grounded; clarity of intention keeps Rahu\'s ambition from turning into confusion.', hi: 'ऊँचा लक्ष्य रखें पर ज़मीन से जुड़े रहें; इरादे की स्पष्टता राहु की महत्वाकांक्षा को भ्रम में बदलने से रोकती है।' }
    },
    ketu: {
        name: { en: 'Ketu', hi: 'केतु' },
        nature: 'shadow',
        exalt: 'scorpio', debil: 'taurus', own: [],
        friends: ['mars', 'venus', 'saturn'], enemies: ['sun', 'moon'],
        essence: { en: 'the shadow planet of detachment, intuition and past-life wisdom', hi: 'वैराग्य, अंतर्ज्ञान और पूर्व-जन्म के ज्ञान का छाया ग्रह' },
        onLagna: { en: 'an introspective, intuitive and somewhat detached personality that questions the ordinary', hi: 'एक अंतर्मुखी, अंतर्ज्ञानी और कुछ हद तक विरक्त व्यक्तित्व, जो साधारण बातों पर प्रश्न उठाता है' },
        body: { en: 'a lean frame, a faraway look and a sensitivity that shows in the body', hi: 'दुबला शरीर, दूर देखती-सी दृष्टि और ऐसी संवेदनशीलता जो शरीर में झलकती है' },
        strengths: { en: 'intuition, spiritual insight and the ability to let go', hi: 'अंतर्ज्ञान, आध्यात्मिक अंतर्दृष्टि और छोड़ देने की क्षमता' },
        cautions: { en: 'aimlessness, self-doubt and disconnection from practical matters', hi: 'दिशाहीनता, आत्म-संदेह और व्यावहारिक मामलों से कटाव' },
        advice: { en: 'Stay engaged with the material world even as you seek meaning; grounding gives your intuition a purpose.', hi: 'अर्थ की खोज करते हुए भी भौतिक संसार से जुड़े रहें; ज़मीनी जुड़ाव आपके अंतर्ज्ञान को उद्देश्य देता है।' }
    }
};

// ---------------------------------------------------------------------------
// Signs
// ---------------------------------------------------------------------------
const SIGNS = {
    aries: { name: { en: 'Aries', hi: 'मेष' }, lord: 'mars', element: 'fire', quality: 'movable', persona: { en: 'direct, courageous and quick to act', hi: 'स्पष्टवादी, साहसी और तुरंत कार्य करने वाला' } },
    taurus: { name: { en: 'Taurus', hi: 'वृषभ' }, lord: 'venus', element: 'earth', quality: 'fixed', persona: { en: 'steady, patient and fond of comfort and beauty', hi: 'स्थिर, धैर्यवान और सुख-सौंदर्य का प्रेमी' } },
    gemini: { name: { en: 'Gemini', hi: 'मिथुन' }, lord: 'mercury', element: 'air', quality: 'dual', persona: { en: 'curious, witty and endlessly communicative', hi: 'जिज्ञासु, हाज़िरजवाब और संवाद-प्रिय' } },
    cancer: { name: { en: 'Cancer', hi: 'कर्क' }, lord: 'moon', element: 'water', quality: 'movable', persona: { en: 'caring, intuitive and deeply attached to home and family', hi: 'देखभाल करने वाला, अंतर्ज्ञानी और घर-परिवार से गहराई से जुड़ा' } },
    leo: { name: { en: 'Leo', hi: 'सिंह' }, lord: 'sun', element: 'fire', quality: 'fixed', persona: { en: 'proud, warm-hearted and born to lead', hi: 'स्वाभिमानी, उदार-हृदय और नेतृत्व के लिए जन्मा' } },
    virgo: { name: { en: 'Virgo', hi: 'कन्या' }, lord: 'mercury', element: 'earth', quality: 'dual', persona: { en: 'analytical, practical and attentive to detail', hi: 'विश्लेषणात्मक, व्यावहारिक और बारीकियों पर ध्यान देने वाला' } },
    libra: { name: { en: 'Libra', hi: 'तुला' }, lord: 'venus', element: 'air', quality: 'movable', persona: { en: 'balanced, diplomatic and drawn to harmony and fairness', hi: 'संतुलित, कूटनीतिक और सामंजस्य व न्याय की ओर आकर्षित' } },
    scorpio: { name: { en: 'Scorpio', hi: 'वृश्चिक' }, lord: 'mars', element: 'water', quality: 'fixed', persona: { en: 'intense, private and fiercely determined', hi: 'गहन, गोपनीय और अत्यंत दृढ़-संकल्पी' } },
    sagittarius: { name: { en: 'Sagittarius', hi: 'धनु' }, lord: 'jupiter', element: 'fire', quality: 'dual', persona: { en: 'optimistic, philosophical and freedom-loving', hi: 'आशावादी, दार्शनिक और स्वतंत्रता-प्रेमी' } },
    capricorn: { name: { en: 'Capricorn', hi: 'मकर' }, lord: 'saturn', element: 'earth', quality: 'movable', persona: { en: 'disciplined, ambitious and patient in the pursuit of goals', hi: 'अनुशासित, महत्वाकांक्षी और लक्ष्य-प्राप्ति में धैर्यवान' } },
    aquarius: { name: { en: 'Aquarius', hi: 'कुंभ' }, lord: 'saturn', element: 'air', quality: 'fixed', persona: { en: 'independent, humanitarian and original in thought', hi: 'स्वतंत्र, मानवतावादी और मौलिक विचारों वाला' } },
    pisces: { name: { en: 'Pisces', hi: 'मीन' }, lord: 'jupiter', element: 'water', quality: 'dual', persona: { en: 'compassionate, imaginative and spiritually inclined', hi: 'करुणामय, कल्पनाशील और आध्यात्मिक झुकाव वाला' } }
};

const ELEMENTS = {
    fire: { en: 'fire', hi: 'अग्नि तत्व', trait: { en: 'energy, initiative and a need to act', hi: 'ऊर्जा, पहल और कर्म की आवश्यकता' } },
    earth: { en: 'earth', hi: 'पृथ्वी तत्व', trait: { en: 'practicality, patience and a love of tangible results', hi: 'व्यावहारिकता, धैर्य और ठोस परिणामों का प्रेम' } },
    air: { en: 'air', hi: 'वायु तत्व', trait: { en: 'ideas, communication and social connection', hi: 'विचार, संवाद और सामाजिक जुड़ाव' } },
    water: { en: 'water', hi: 'जल तत्व', trait: { en: 'feeling, intuition and emotional depth', hi: 'भावना, अंतर्ज्ञान और भावनात्मक गहराई' } }
};

const QUALITIES = {
    movable: { en: 'movable', hi: 'चर', trait: { en: 'you like to start things and keep moving', hi: 'आप चीज़ें शुरू करना और आगे बढ़ते रहना पसंद करते हैं' } },
    fixed: { en: 'fixed', hi: 'स्थिर', trait: { en: 'you hold your ground and see things through', hi: 'आप अपनी जगह पर डटे रहते हैं और काम को अंत तक ले जाते हैं' } },
    dual: { en: 'dual', hi: 'द्विस्वभाव', trait: { en: 'you adapt easily and can see both sides of a question', hi: 'आप आसानी से ढल जाते हैं और किसी प्रश्न के दोनों पक्ष देख सकते हैं' } }
};

// ---------------------------------------------------------------------------
// Houses (generic themes) + ordinals
// ---------------------------------------------------------------------------
const HOUSES = {
    1: { en: 'the self, body, personality and the overall direction of life', hi: 'स्वयं, शरीर, व्यक्तित्व और जीवन की समग्र दिशा' },
    2: { en: 'wealth, family, speech and accumulated resources', hi: 'धन, परिवार, वाणी और संचित संसाधन' },
    3: { en: 'courage, siblings, communication and self-effort', hi: 'साहस, भाई-बहन, संवाद और स्व-प्रयास' },
    4: { en: 'home, mother, property, comfort and inner peace', hi: 'घर, माता, संपत्ति, सुख और आंतरिक शांति' },
    5: { en: 'intelligence, children, creativity and past merit', hi: 'बुद्धि, संतान, रचनात्मकता और पूर्व-पुण्य' },
    6: { en: 'obstacles, service, competition, debts and disease', hi: 'बाधाएँ, सेवा, प्रतिस्पर्धा, ऋण और रोग' },
    7: { en: 'marriage, partnerships and dealings with others', hi: 'विवाह, साझेदारी और दूसरों के साथ व्यवहार' },
    8: { en: 'longevity, transformation, hidden matters and sudden events', hi: 'दीर्घायु, रूपांतरण, गुप्त विषय और आकस्मिक घटनाएँ' },
    9: { en: 'fortune, dharma, higher learning, father and guidance', hi: 'भाग्य, धर्म, उच्च शिक्षा, पिता और मार्गदर्शन' },
    10: { en: 'career, status, authority and public reputation', hi: 'करियर, प्रतिष्ठा, अधिकार और सार्वजनिक छवि' },
    11: { en: 'gains, income, friends and the fulfilment of desires', hi: 'लाभ, आय, मित्र और इच्छाओं की पूर्ति' },
    12: { en: 'expenses, foreign lands, isolation, sleep and liberation', hi: 'व्यय, विदेश, एकांत, निद्रा और मोक्ष' }
};

const ORDINALS = {
    en: ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'],
    hi: ['', 'प्रथम', 'द्वितीय', 'तृतीय', 'चतुर्थ', 'पंचम', 'षष्ठ', 'सप्तम', 'अष्टम', 'नवम', 'दशम', 'एकादश', 'द्वादश']
};

/** Generic (domain-independent) house category used for the chart overview. */
function genericCategory(house) {
    if ([1, 4, 5, 7, 9, 10].includes(house)) return 'kendra-trikona';
    if ([3, 11].includes(house)) return 'upachaya';
    if ([6, 8, 12].includes(house)) return 'dusthana';
    return 'maraka'; // 2
}

// Score used for the overall verdict (higher = stronger). Weights are
// calibrated so that random charts centre near zero; see TONE_THRESHOLDS.
const CATEGORY_SCORE = {
    'kendra-trikona': 1.5, upachaya: 0.5, dhana: 1.5, labha: 1.5, maraka: -1,
    dusthana: -2, roga: -2, ayu: -1.5, vyaya: -2
};

// Average factor score at/above which a domain reads as "strong", and at/below
// which it reads as "challenging"; everything in between is "balanced".
const TONE_THRESHOLDS = { strong: 0.6, challenging: -0.3 };

// Two variants per category, picked deterministically per chart.
const CATEGORY_TEXT = {
    'kendra-trikona': {
        en: [
            'This is an angular or trinal house, one of the strongest positions in a chart, so this lord works from a place of real strength and gives steady, visible results.',
            'Angular and trinal houses are the pillars of a horoscope, and a lord placed here is well supported, which makes its promises easier to realise.'
        ],
        hi: [
            'यह केंद्र या त्रिकोण भाव है, जो कुंडली की सबसे मज़बूत स्थितियों में से एक है, इसलिए यह स्वामी पूरी शक्ति से कार्य करता है और स्थिर, दृश्यमान परिणाम देता है।',
            'केंद्र और त्रिकोण भाव कुंडली के स्तंभ हैं, और यहाँ स्थित स्वामी को अच्छा सहारा मिलता है, जिससे उसके वादे पूरे होना आसान हो जाता है।'
        ]
    },
    upachaya: {
        en: [
            'This is an upachaya, a house of growth, where results are modest at first but keep improving with age and effort.',
            'Upachaya houses reward persistence; what starts slowly here tends to grow stronger year after year.'
        ],
        hi: [
            'यह उपचय भाव है, वृद्धि का भाव, जहाँ परिणाम शुरू में साधारण होते हैं पर उम्र और प्रयास के साथ लगातार बेहतर होते जाते हैं।',
            'उपचय भाव निरंतरता का फल देते हैं; यहाँ जो धीरे शुरू होता है, वह साल-दर-साल मज़बूत होता जाता है।'
        ]
    },
    dusthana: {
        en: [
            'This is a dusthana, a challenging house, so the results come with some struggle, delay or hidden complications that must be handled with care.',
            'Dusthana houses test their occupants; a lord placed here delivers its gifts only after obstacles are faced and overcome.'
        ],
        hi: [
            'यह दुःस्थान है, एक चुनौतीपूर्ण भाव, इसलिए परिणाम कुछ संघर्ष, देरी या छिपी जटिलताओं के साथ आते हैं, जिन्हें सावधानी से संभालना होता है।',
            'दुःस्थान अपने निवासियों की परीक्षा लेते हैं; यहाँ स्थित स्वामी अपने फल बाधाओं का सामना करने और उन्हें पार करने के बाद ही देता है।'
        ]
    },
    maraka: {
        en: [
            'This is a maraka house, which classical texts link to wealth and partnerships but also to life-force, so its gains should be matched with attention to health and relationships.',
            'Maraka houses give material results, yet the old texts advise care with health and close relationships when an important lord sits here.'
        ],
        hi: [
            'यह मारक भाव है, जिसे शास्त्र धन और साझेदारी से जोड़ते हैं पर जीवन-शक्ति से भी; इसलिए इसके लाभों के साथ स्वास्थ्य और संबंधों पर ध्यान देना आवश्यक है।',
            'मारक भाव भौतिक फल देते हैं, फिर भी जब कोई महत्वपूर्ण स्वामी यहाँ बैठा हो तो शास्त्र स्वास्थ्य और निकट संबंधों में सावधानी की सलाह देते हैं।'
        ]
    },
    dhana: {
        en: ['This is the dhana house itself, the seat of accumulated wealth, so this lord speaks directly about savings and family resources.'],
        hi: ['यह स्वयं धन भाव है, संचित संपत्ति का स्थान, इसलिए यह स्वामी सीधे बचत और पारिवारिक संसाधनों के बारे में बताता है।']
    },
    labha: {
        en: ['This is the labha house, the house of gains, so this lord connects directly with income and the fulfilment of ambitions.'],
        hi: ['यह लाभ भाव है, आय का भाव, इसलिए यह स्वामी सीधे आमदनी और महत्वाकांक्षाओं की पूर्ति से जुड़ता है।']
    },
    roga: {
        en: ['This is the roga house of disease and struggle, so whatever sits here is tested through health, debts or rivals and must be managed proactively.'],
        hi: ['यह रोग भाव है, बीमारी और संघर्ष का स्थान, इसलिए जो भी यहाँ है उसकी परीक्षा स्वास्थ्य, ऋण या विरोधियों के माध्यम से होती है और उसे सक्रिय रूप से संभालना होता है।']
    },
    ayu: {
        en: ['This is the ayu house of longevity and transformation, where results tend to be deep, sudden and long-lasting.'],
        hi: ['यह आयु भाव है, दीर्घायु और रूपांतरण का स्थान, जहाँ परिणाम गहरे, अचानक और दीर्घकालिक होते हैं।']
    },
    vyaya: {
        en: ['This is the vyaya house of loss, isolation and hospitalisation, so its effects work quietly in the background and ask for rest and awareness.'],
        hi: ['यह व्यय भाव है, हानि, एकांत और अस्पताल-वास का स्थान, इसलिए इसके प्रभाव पृष्ठभूमि में चुपचाप काम करते हैं और विश्राम व सजगता माँगते हैं।']
    }
};

// ---------------------------------------------------------------------------
// Dignity / relation of a planet to the sign it occupies
// ---------------------------------------------------------------------------
const DIGNITY_SCORE = { exalted: 2, own: 1.5, friend: 0.5, neutral: 0, enemy: -1, debilitated: -2 };

// EN entries are appositive phrases ("Here it is <phrase>"); HI entries are
// complete sentences that follow the placement sentence.
const DIGNITY_TEXT = {
    exalted: { en: 'exalted, its strongest possible dignity, which magnifies every good quality it carries', hi: 'यहाँ यह उच्च राशि में है, जो इसकी सर्वोच्च गरिमा है और इसके हर अच्छे गुण को कई गुना बढ़ा देती है।' },
    own: { en: 'in its own sign, where it feels completely at home and expresses its qualities fully', hi: 'यहाँ यह अपनी ही राशि में है, जहाँ यह पूरी तरह सहज है और अपने गुणों को पूर्ण रूप से व्यक्त करता है।' },
    friend: { en: 'in a friendly sign, which supports it and lets it work smoothly', hi: 'यहाँ यह मित्र राशि में है, जो इसे सहयोग देती है और सहजता से कार्य करने देती है।' },
    neutral: { en: 'in a neutral sign, where it works steadily without special help or hindrance', hi: 'यहाँ यह सम राशि में है, जहाँ यह बिना विशेष सहायता या बाधा के स्थिर रूप से कार्य करता है।' },
    enemy: { en: 'in an enemy sign, which makes it uncomfortable and asks for extra effort before its results appear', hi: 'यहाँ यह शत्रु राशि में है, जो इसे असहज बनाती है और परिणाम दिखने से पहले अतिरिक्त प्रयास माँगती है।' },
    debilitated: { en: 'debilitated, its weakest dignity, so its natural qualities need conscious effort and support to shine', hi: 'यहाँ यह नीच राशि में है, जो इसकी सबसे कमज़ोर स्थिति है, इसलिए इसके स्वाभाविक गुणों को चमकने के लिए सचेत प्रयास और सहारे की ज़रूरत है।' }
};

// Short noun forms for inline use (Navamsa lists, verdict labels).
const DIGNITY_SHORT = {
    exalted: { en: 'exalted', hi: 'उच्च राशि' },
    own: { en: 'in its own sign', hi: 'स्वराशि' },
    friend: { en: 'in a friendly sign', hi: 'मित्र राशि' },
    neutral: { en: 'in a neutral sign', hi: 'सम राशि' },
    enemy: { en: 'in an enemy sign', hi: 'शत्रु राशि' },
    debilitated: { en: 'debilitated', hi: 'नीच राशि' }
};

// ---------------------------------------------------------------------------
// Yogas
// ---------------------------------------------------------------------------
const YOGA_SCORE = { raja_yoga: 1.5, dhana_yoga: 1.5, vipreet_raja_yoga: 1, general: 0 };

const YOGA_TEXT = {
    raja_yoga: {
        name: { en: 'Raja Yoga', hi: 'राज योग' },
        en: 'Together these two planets form a Raja Yoga for your Lagna, a union of an angular-house lord with a trinal-house lord. This is one of the most respected combinations in Vedic astrology and points to authority, status, recognition and a clear rise in life.',
        hi: 'ये दोनों ग्रह मिलकर आपके लग्न के लिए राज योग बनाते हैं, जो एक केंद्र भाव के स्वामी और एक त्रिकोण भाव के स्वामी का मिलन है। यह वैदिक ज्योतिष के सबसे सम्मानित संयोजनों में से एक है और अधिकार, प्रतिष्ठा, सम्मान और जीवन में स्पष्ट उन्नति की ओर संकेत करता है।'
    },
    dhana_yoga: {
        name: { en: 'Dhana Yoga', hi: 'धन योग' },
        en: 'Together these planets form a Dhana Yoga for your Lagna, linking the houses of wealth and fortune. Such a combination supports the accumulation of money and resources and often brings gains from more than one source.',
        hi: 'ये ग्रह मिलकर आपके लग्न के लिए धन योग बनाते हैं, जो धन और भाग्य के भावों को जोड़ता है। ऐसा संयोजन धन और संसाधनों के संचय में सहायक है और प्रायः एक से अधिक स्रोतों से लाभ लाता है।'
    },
    vipreet_raja_yoga: {
        name: { en: 'Vipreet Raja Yoga', hi: 'विपरीत राज योग' },
        en: 'Together these planets form a Vipreet Raja Yoga for your Lagna, a combination of the lords of the difficult houses. It works in reverse: setbacks, rivals or crises become the very stepping stones to success, and gains often arrive unexpectedly.',
        hi: 'ये ग्रह मिलकर आपके लग्न के लिए विपरीत राज योग बनाते हैं, जो कठिन भावों के स्वामियों का संयोजन है। यह उल्टे ढंग से काम करता है: असफलताएँ, विरोधी या संकट ही सफलता की सीढ़ी बन जाते हैं, और लाभ प्रायः अप्रत्याशित रूप से आते हैं।'
    },
    general: {
        name: null,
        en: 'For your Lagna these two lords do not form a named Raja or Dhana Yoga, so their combined effect is best read through the blend of their natures described above rather than through a special yoga.',
        hi: 'आपके लग्न के लिए ये दोनों स्वामी कोई नामित राज या धन योग नहीं बनाते, इसलिए इनके संयुक्त प्रभाव को किसी विशेष योग के बजाय ऊपर बताए गए इनके स्वभावों के मेल से समझना उचित है।'
    }
};

const YOGAKARAKA_TEXT = {
    en: 'One of these planets is the Yogakaraka for your Lagna, ruling both an angular and a trinal house, which amplifies the promise of this combination considerably.',
    hi: 'इनमें से एक ग्रह आपके लग्न का योगकारक है, जो एक केंद्र और एक त्रिकोण दोनों भावों का स्वामी है, जिससे इस संयोजन का वादा काफ़ी बढ़ जाता है।'
};

const CLASSICAL_YOGAS = {
    sun_mercury: { name: { en: 'Budh-Aditya Yoga', hi: 'बुध-आदित्य योग' }, en: 'This pairing is the classical Budh-Aditya Yoga, celebrated for sharp intelligence, eloquence, learning and success in fields that reward the mind.', hi: 'यह युग्म क्लासिक बुध-आदित्य योग है, जो तीक्ष्ण बुद्धि, वाक्पटुता, विद्या और बौद्धिक क्षेत्रों में सफलता के लिए प्रसिद्ध है।' },
    moon_mars: { name: { en: 'Chandra-Mangal Yoga', hi: 'चंद्र-मंगल योग' }, en: 'This pairing is the classical Chandra-Mangal Yoga, known for earning capacity, enterprise and the drive to build wealth through one\'s own effort.', hi: 'यह युग्म क्लासिक चंद्र-मंगल योग है, जो अर्जन-क्षमता, उद्यमशीलता और स्वयं के प्रयास से धन बनाने की प्रेरणा के लिए जाना जाता है।' },
    moon_jupiter: { name: { en: 'Gajakesari Yoga', hi: 'गजकेसरी योग' }, en: 'This pairing is the classical Gajakesari Yoga, one of the most auspicious combinations, giving wisdom, reputation, lasting prosperity and respect in society.', hi: 'यह युग्म क्लासिक गजकेसरी योग है, सबसे शुभ संयोजनों में से एक, जो ज्ञान, कीर्ति, स्थायी समृद्धि और समाज में सम्मान देता है।' },
    mars_jupiter: { name: { en: 'Guru-Mangal Yoga', hi: 'गुरु-मंगल योग' }, en: 'This pairing is the classical Guru-Mangal Yoga, blending wisdom with courage and favouring leadership, protective roles and righteous action.', hi: 'यह युग्म क्लासिक गुरु-मंगल योग है, जो ज्ञान को साहस से जोड़ता है और नेतृत्व, संरक्षण की भूमिकाओं व धर्म-सम्मत कर्म के लिए अनुकूल है।' }
};

// ---------------------------------------------------------------------------
// Domain wording
// ---------------------------------------------------------------------------
const DOMAINS = {
    career: {
        title: { en: 'Career & Profession', hi: 'करियर और व्यवसाय' },
        theme: { en: 'your career, profession and public standing', hi: 'आपके करियर, व्यवसाय और सार्वजनिक प्रतिष्ठा' },
        areasKey: 'careerAreas',
        angleKey: 'careerAngle',
        houses: [10],
        lordKeys: { 10: 'tenthLord' },
        houseLabel: { 10: { en: 'the 10th house of career and status', hi: 'करियर और प्रतिष्ठा का दशम भाव' } },
        roleLabel: { 10: { en: '10th lord', hi: 'दशमेश' } },
        yogaTable: { 10: 'tenthHouseConjunctionYogas' },
        areasIntro: { en: 'In matters of work this points towards', hi: 'कार्य-क्षेत्र में यह संकेत करता है' },
        guidance: {
            en: [
                'Choose work that lets your strongest planets express themselves, and be patient with the areas the chart marks as slow; in career, timing matters as much as talent.',
                'Build your professional identity around the fields your chart repeatedly highlights, and treat the weaker factors as skills to develop rather than as limits.'
            ],
            hi: [
                'ऐसा काम चुनें जिसमें आपके सबसे मज़बूत ग्रह स्वयं को व्यक्त कर सकें, और जिन क्षेत्रों को कुंडली धीमा बताती है उनमें धैर्य रखें; करियर में समय का महत्व प्रतिभा जितना ही है।',
                'अपनी व्यावसायिक पहचान उन क्षेत्रों के इर्द-गिर्द बनाएँ जिन्हें आपकी कुंडली बार-बार रेखांकित करती है, और कमज़ोर कारकों को सीमाएँ नहीं बल्कि विकसित करने योग्य कौशल समझें।'
            ]
        }
    },
    marriage: {
        title: { en: 'Marriage & Relationships', hi: 'विवाह और संबंध' },
        theme: { en: 'your marriage, spouse and close partnerships', hi: 'आपके विवाह, जीवनसाथी और निकट साझेदारियों' },
        areasKey: 'marriageAreas',
        angleKey: 'domainAngle',
        houses: [7],
        lordKeys: { 7: 'seventhLord' },
        houseLabel: { 7: { en: 'the 7th house of marriage and partnership', hi: 'विवाह और साझेदारी का सप्तम भाव' } },
        roleLabel: { 7: { en: '7th lord', hi: 'सप्तमेश' } },
        yogaTable: { 7: 'seventhHouseConjunctionYogas' },
        areasIntro: { en: 'For married life this suggests', hi: 'वैवाहिक जीवन के लिए यह संकेत करता है' },
        guidance: {
            en: [
                'A good marriage in the chart is a promise, not a guarantee; it is fulfilled through patience, honest communication and respect for the partner\'s nature as shown by the 7th house.',
                'Let the qualities your 7th house asks for guide both your choice of partner and how you treat them; the chart rewards maturity in relationships more than luck.'
            ],
            hi: [
                'कुंडली में अच्छा विवाह एक वादा है, गारंटी नहीं; यह धैर्य, ईमानदार संवाद और सप्तम भाव द्वारा दर्शाए गए साथी के स्वभाव के सम्मान से पूरा होता है।',
                'आपका सप्तम भाव जिन गुणों की माँग करता है, उन्हें साथी के चयन और उसके साथ व्यवहार दोनों में मार्गदर्शक बनाएँ; कुंडली संबंधों में भाग्य से अधिक परिपक्वता का फल देती है।'
            ]
        }
    },
    money: {
        title: { en: 'Wealth & Finance', hi: 'धन और वित्त' },
        theme: { en: 'your wealth, income and financial security', hi: 'आपके धन, आय और आर्थिक सुरक्षा' },
        areasKey: 'moneyAreas',
        angleKey: 'domainAngle',
        houses: [2, 11],
        lordKeys: { 2: 'secondLord', 11: 'eleventhLord' },
        houseLabel: {
            2: { en: 'the 2nd house of wealth and savings', hi: 'धन और बचत का द्वितीय भाव' },
            11: { en: 'the 11th house of gains and income', hi: 'लाभ और आय का एकादश भाव' }
        },
        roleLabel: { 2: { en: '2nd lord', hi: 'द्वितीयेश' }, 11: { en: '11th lord', hi: 'एकादशेश' } },
        yogaTable: { 2: 'secondHouseConjunctionYogas', 11: 'eleventhHouseConjunctionYogas' },
        areasIntro: { en: 'Financially this points towards', hi: 'आर्थिक दृष्टि से यह संकेत करता है' },
        guidance: {
            en: [
                'Earn through the channels your chart favours, save through the discipline your 2nd house asks for, and avoid the kind of risk the weaker factors warn against.',
                'Wealth in a chart grows when income (11th house) and retention (2nd house) work together; strengthen whichever of the two is weaker in your horoscope.'
            ],
            hi: [
                'उन माध्यमों से कमाएँ जिन्हें आपकी कुंडली अनुकूल बताती है, उस अनुशासन से बचत करें जिसकी माँग आपका द्वितीय भाव करता है, और उस प्रकार के जोखिम से बचें जिसके प्रति कमज़ोर कारक सावधान करते हैं।',
                'कुंडली में धन तब बढ़ता है जब आय (एकादश भाव) और संचय (द्वितीय भाव) साथ मिलकर काम करें; इन दोनों में से जो आपकी कुंडली में कमज़ोर है, उसे मज़बूत करें।'
            ]
        }
    },
    health: {
        title: { en: 'Health & Wellbeing', hi: 'स्वास्थ्य और कल्याण' },
        theme: { en: 'your health, vitality and long-term wellbeing', hi: 'आपके स्वास्थ्य, जीवन-शक्ति और दीर्घकालिक कल्याण' },
        areasKey: 'healthAreas',
        angleKey: 'domainAngle',
        houses: [6, 8, 12],
        lordKeys: { 6: 'sixthLord', 8: 'eighthLord', 12: 'twelfthLord' },
        houseLabel: {
            6: { en: 'the 6th house of disease and daily struggle', hi: 'रोग और दैनिक संघर्ष का षष्ठ भाव' },
            8: { en: 'the 8th house of longevity and chronic conditions', hi: 'दीर्घायु और पुरानी बीमारी का अष्टम भाव' },
            12: { en: 'the 12th house of expenses, rest and hospitalisation', hi: 'व्यय, विश्राम और अस्पताल-वास का द्वादश भाव' }
        },
        roleLabel: { 6: { en: '6th lord', hi: 'षष्ठेश' }, 8: { en: '8th lord', hi: 'अष्टमेश' }, 12: { en: '12th lord', hi: 'द्वादशेश' } },
        yogaTable: { 6: 'sixthHouseConjunctionYogas', 8: 'eighthHouseConjunctionYogas', 12: 'twelfthHouseConjunctionYogas' },
        areasIntro: { en: 'For health this draws attention to', hi: 'स्वास्थ्य के लिए यह ध्यान दिलाता है' },
        guidance: {
            en: [
                'Treat the body parts and tendencies your chart highlights as areas for early, preventive care; regular check-ups and a steady routine turn most indications into non-events.',
                'A chart shows tendencies, not verdicts: good sleep, moderate food, exercise suited to your constitution and timely medical advice keep the difficult factors quiet.'
            ],
            hi: [
                'आपकी कुंडली जिन अंगों और प्रवृत्तियों को रेखांकित करती है, उन्हें समय रहते निवारक देखभाल के क्षेत्र मानें; नियमित जाँच और स्थिर दिनचर्या अधिकांश संकेतों को निष्प्रभावी बना देती है।',
                'कुंडली प्रवृत्तियाँ दिखाती है, फैसले नहीं: अच्छी नींद, संयमित भोजन, अपनी प्रकृति के अनुकूल व्यायाम और समय पर चिकित्सकीय सलाह कठिन कारकों को शांत रखते हैं।'
            ]
        }
    }
};

const DOMAIN_ORDER = ['career', 'marriage', 'money', 'health'];

module.exports = {
    PLANET_ORDER, SIGN_ORDER, PLANETS, SIGNS, ELEMENTS, QUALITIES, HOUSES, ORDINALS,
    genericCategory, CATEGORY_SCORE, TONE_THRESHOLDS, CATEGORY_TEXT, DIGNITY_SCORE, DIGNITY_TEXT, DIGNITY_SHORT,
    YOGA_SCORE, YOGA_TEXT, YOGAKARAKA_TEXT, CLASSICAL_YOGAS, DOMAINS, DOMAIN_ORDER
};
