/**
 * data/astrology/nakshatras.js
 *
 * The 27 nakshatras, bilingual, keyed by a normalised name so the upstream
 * API's spelling can be matched however it arrives.
 *
 * Why this matters for the report: the Moon's nakshatra (and its pada) is the
 * single most individuating factor available short of exact degrees. Twelve
 * lagnas give twelve openings; 27 nakshatras x 4 padas give 108, and the
 * nakshatra also fixes the Vimshottari dasha sequence, so two people with the
 * same rising sign still read very differently.
 *
 * Degree spans are sidereal from 0 Aries and are exact by construction:
 * nakshatra k spans [(k-1) * 13 deg 20', k * 13 deg 20').
 *
 * Confidence note: name, span, lord, deity, symbol, gana, nadi and yoni are
 * well attested. The career / relationship / body-part columns vary between
 * modern sources and are written here as tendencies, not claims.
 */

'use strict';

const NAK_SPAN = 360 / 27; // 13.3333... degrees

/** Normalise any spelling the API might send: "Uttara Ashadha", "Uttarashadha", "Uthiraadam". */
function nakKey(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z]/g, '');
}

const LIST = [
    {
        n: 1, name: { en: 'Ashwini', hi: 'अश्विनी' }, lord: 'ketu', deity: 'Ashvini Kumaras',
        symbol: { en: "a horse's head", hi: 'घोड़े का सिर' }, gana: 'deva', nadi: 'aadi', yoni: 'horse',
        signature: { en: 'quick, pioneering and eager to heal or fix what is broken', hi: 'तेज़, अग्रणी और जो टूटा है उसे ठीक करने को तत्पर' },
        career: { en: 'medicine and surgery, sport, transport and anything that rewards speed', hi: 'चिकित्सा व शल्यक्रिया, खेल, परिवहन और जहाँ गति का महत्व हो' },
        marriage: { en: 'quick to be drawn in and quick to decide, which works best with a steadier partner', hi: 'शीघ्र आकर्षित और शीघ्र निर्णय लेने वाला, जो स्थिर साथी के साथ सर्वोत्तम रहता है' },
        health: { en: 'the head: headaches and nervous strain', hi: 'सिर: सिरदर्द और स्नायविक तनाव' }
    },
    {
        n: 2, name: { en: 'Bharani', hi: 'भरणी' }, lord: 'venus', deity: 'Yama',
        symbol: { en: 'the womb', hi: 'योनि' }, gana: 'manushya', nadi: 'madhya', yoni: 'elephant',
        signature: { en: 'intense, enduring and able to carry heavy things without complaint', hi: 'तीव्र, सहनशील और भारी बोझ बिना शिकायत उठाने में सक्षम' },
        career: { en: 'childcare, entertainment and media, law, and work involving life transitions', hi: 'शिशु-देखभाल, मनोरंजन व मीडिया, विधि, और जीवन के संक्रमण से जुड़े कार्य' },
        marriage: { en: 'deep passion with a possessive streak; letting go is the lesson', hi: 'गहरा अनुराग पर अधिकार-भाव के साथ; छोड़ना सीखना ही सबक है' },
        health: { en: 'the reproductive system and the eyes', hi: 'प्रजनन तंत्र और आँखें' }
    },
    {
        n: 3, name: { en: 'Krittika', hi: 'कृत्तिका' }, lord: 'sun', deity: 'Agni',
        symbol: { en: 'a blade or flame', hi: 'धार या ज्वाला' }, gana: 'rakshasa', nadi: 'antya', yoni: 'sheep',
        signature: { en: 'sharp, honest to the point of bluntness, and good at cutting through nonsense', hi: 'तीक्ष्ण, कठोरता की हद तक स्पष्टवादी, और व्यर्थ को काट देने में निपुण' },
        career: { en: 'surgery, law, teaching, defence and skilled work with fire or metal', hi: 'शल्यक्रिया, विधि, शिक्षण, रक्षा और अग्नि या धातु से जुड़े कुशल कार्य' },
        marriage: { en: 'slow to commit but fiercely loyal afterwards; the plain speaking needs softening', hi: 'प्रतिबद्ध होने में धीमा पर उसके बाद अत्यंत निष्ठावान; स्पष्टवादिता को कोमल करना आवश्यक' },
        health: { en: 'the face, throat and stomach acidity', hi: 'चेहरा, गला और अम्लता' }
    },
    {
        n: 4, name: { en: 'Rohini', hi: 'रोहिणी' }, lord: 'moon', deity: 'Brahma',
        symbol: { en: 'an ox-cart', hi: 'बैलगाड़ी' }, gana: 'manushya', nadi: 'antya', yoni: 'serpent',
        signature: { en: 'magnetic, artistic and able to make things grow, whether money, plants or people', hi: 'आकर्षक, कलात्मक और चीज़ों को बढ़ाने में सक्षम, चाहे धन हो, पौधे हों या लोग' },
        career: { en: 'banking and finance, agriculture, fashion and beauty, and luxury goods', hi: 'बैंकिंग व वित्त, कृषि, फैशन व सौंदर्य, और विलासिता की वस्तुएँ' },
        marriage: { en: 'classically the most favoured birth star for marriage; watch only for possessiveness', hi: 'विवाह के लिए शास्त्रों में सर्वाधिक अनुकूल नक्षत्र; केवल अधिकार-भाव से सावधान रहें' },
        health: { en: 'the throat and thyroid', hi: 'गला और थायरॉइड' }
    },
    {
        n: 5, name: { en: 'Mrigashira', hi: 'मृगशिरा' }, lord: 'mars', deity: 'Soma',
        symbol: { en: "a deer's head", hi: 'हिरण का सिर' }, gana: 'deva', nadi: 'madhya', yoni: 'serpent',
        signature: { en: 'curious and restless, always searching for something just out of reach', hi: 'जिज्ञासु और चंचल, सदा कुछ ऐसा खोजता जो पहुँच से थोड़ा बाहर हो' },
        career: { en: 'research, writing, design, property and astrology', hi: 'शोध, लेखन, डिज़ाइन, संपत्ति और ज्योतिष' },
        marriage: { en: 'needs mental stimulation as much as affection; boredom is the real risk', hi: 'स्नेह जितनी ही बौद्धिक उत्तेजना चाहिए; ऊब ही असली जोखिम है' },
        health: { en: 'sinuses, coughs and the urinary tract', hi: 'साइनस, खाँसी और मूत्र मार्ग' }
    },
    {
        n: 6, name: { en: 'Ardra', hi: 'आर्द्रा' }, lord: 'rahu', deity: 'Rudra',
        symbol: { en: 'a teardrop', hi: 'अश्रु-बिंदु' }, gana: 'manushya', nadi: 'aadi', yoni: 'dog',
        signature: { en: 'stormy and incisive, someone who is changed permanently by what they go through', hi: 'तूफ़ानी और तीक्ष्ण, जो अपने अनुभवों से स्थायी रूप से बदल जाता है' },
        career: { en: 'software and IT, electrical engineering, film and psychology', hi: 'सॉफ़्टवेयर व आईटी, विद्युत अभियांत्रिकी, फ़िल्म और मनोविज्ञान' },
        marriage: { en: 'early relationships tend to be turbulent; the lasting one usually comes later', hi: 'आरंभिक संबंध प्रायः उथल-पुथल भरे; टिकने वाला संबंध सामान्यतः बाद में आता है' },
        health: { en: 'the chest, breathing and anxiety', hi: 'छाती, श्वास और चिंता' }
    },
    {
        n: 7, name: { en: 'Punarvasu', hi: 'पुनर्वसु' }, lord: 'jupiter', deity: 'Aditi',
        symbol: { en: 'a quiver of arrows', hi: 'तरकश' }, gana: 'deva', nadi: 'aadi', yoni: 'cat',
        signature: { en: 'resilient and forgiving, with a gift for starting again after a setback', hi: 'लचीला और क्षमाशील, असफलता के बाद फिर से शुरू करने की क्षमता के साथ' },
        career: { en: 'teaching and publishing, hospitality, travel and architecture', hi: 'शिक्षण व प्रकाशन, आतिथ्य, यात्रा और वास्तुकला' },
        marriage: { en: 'gives second chances readily; reconciliation after distance is a recurring pattern', hi: 'सहज ही दूसरा अवसर देता है; दूरी के बाद पुनर्मिलन बार-बार दोहराया जाने वाला क्रम है' },
        health: { en: 'the lungs and ears', hi: 'फेफड़े और कान' }
    },
    {
        n: 8, name: { en: 'Pushya', hi: 'पुष्य' }, lord: 'saturn', deity: 'Brihaspati',
        symbol: { en: "a cow's udder", hi: 'गौ का थन' }, gana: 'deva', nadi: 'madhya', yoni: 'sheep',
        signature: { en: 'nourishing and dutiful, the person others lean on without being asked', hi: 'पोषक और कर्तव्यनिष्ठ, वह व्यक्ति जिस पर लोग बिना कहे भरोसा करते हैं' },
        career: { en: 'food and dairy, education, public service, property and caregiving', hi: 'खाद्य व डेयरी, शिक्षा, लोकसेवा, संपत्ति और देखभाल' },
        marriage: { en: 'family comes first; among the steadiest birth stars for a settled married life', hi: 'परिवार सर्वोपरि; स्थिर वैवाहिक जीवन के लिए सबसे भरोसेमंद नक्षत्रों में' },
        health: { en: 'the chest and lungs', hi: 'छाती और फेफड़े' }
    },
    {
        n: 9, name: { en: 'Ashlesha', hi: 'आश्लेषा' }, lord: 'mercury', deity: 'the Nagas',
        symbol: { en: 'a coiled serpent', hi: 'कुंडली मारे सर्प' }, gana: 'rakshasa', nadi: 'antya', yoni: 'cat',
        signature: { en: 'penetrating and private, able to read people far faster than they realise', hi: 'भेदक और गोपनीय, लोगों को उनकी कल्पना से कहीं तेज़ पढ़ लेने वाला' },
        career: { en: 'pharmacy and chemistry, law, research, psychology and the occult', hi: 'औषधि व रसायन, विधि, शोध, मनोविज्ञान और गूढ़ विद्या' },
        marriage: { en: 'guarded; opens fully only to a partner who has earned real trust', hi: 'सतर्क; केवल उस साथी के सामने पूरी तरह खुलता है जिसने सच्चा विश्वास अर्जित किया हो' },
        health: { en: 'digestion, joints and nervous tension', hi: 'पाचन, जोड़ और स्नायविक तनाव' }
    },
    {
        n: 10, name: { en: 'Magha', hi: 'मघा' }, lord: 'ketu', deity: 'the Pitris',
        symbol: { en: 'a royal throne', hi: 'राजसिंहासन' }, gana: 'rakshasa', nadi: 'antya', yoni: 'rat',
        signature: { en: 'dignified and conscious of lineage, carrying something inherited from the family line', hi: 'गरिमामय और वंश के प्रति सजग, कुल से मिली किसी विरासत को साथ लिए' },
        career: { en: 'government and administration, law, heritage work and astrology', hi: 'शासन व प्रशासन, विधि, विरासत-कार्य और ज्योतिष' },
        marriage: { en: 'values family background and tradition in a match', hi: 'संबंध में कुल-परंपरा और पृष्ठभूमि को महत्व देता है' },
        health: { en: 'the heart and upper back', hi: 'हृदय और ऊपरी पीठ' }
    },
    {
        n: 11, name: { en: 'Purva Phalguni', hi: 'पूर्वा फाल्गुनी' }, lord: 'venus', deity: 'Bhaga',
        symbol: { en: 'the front legs of a bed', hi: 'शय्या के अगले पाए' }, gana: 'manushya', nadi: 'madhya', yoni: 'rat',
        signature: { en: 'warm, pleasure-loving and generous, with a real talent for enjoying life', hi: 'स्नेही, सुख-प्रिय और उदार, जीवन का आनंद लेने की सच्ची कला के साथ' },
        career: { en: 'performing arts, beauty, events, hospitality and jewellery', hi: 'प्रदर्शन कला, सौंदर्य, आयोजन, आतिथ्य और आभूषण' },
        marriage: { en: 'romantic and affectionate; happiest with a partner who values comfort equally', hi: 'रोमांटिक और स्नेही; ऐसे साथी के साथ सबसे सुखी जो सुख को समान महत्व दे' },
        health: { en: 'the heart and blood pressure', hi: 'हृदय और रक्तचाप' }
    },
    {
        n: 12, name: { en: 'Uttara Phalguni', hi: 'उत्तरा फाल्गुनी' }, lord: 'sun', deity: 'Aryaman',
        symbol: { en: 'the back legs of a bed', hi: 'शय्या के पिछले पाए' }, gana: 'manushya', nadi: 'aadi', yoni: 'cow',
        signature: { en: 'reliable and generous, the one who keeps an agreement after others have forgotten it', hi: 'भरोसेमंद और उदार, जो वचन तब भी निभाता है जब दूसरे भूल चुके हों' },
        career: { en: 'counselling, banking, teaching, charity and organised professional work', hi: 'परामर्श, बैंकिंग, शिक्षण, परोपकार और संगठित व्यावसायिक कार्य' },
        marriage: { en: 'one of the strongest birth stars for a durable, contract-honouring marriage', hi: 'टिकाऊ, वचन निभाने वाले विवाह के लिए सबसे मज़बूत नक्षत्रों में से एक' },
        health: { en: 'the intestines and bones', hi: 'आँतें और अस्थियाँ' }
    },
    {
        n: 13, name: { en: 'Hasta', hi: 'हस्त' }, lord: 'moon', deity: 'Savitar',
        symbol: { en: 'an open hand', hi: 'खुला हाथ' }, gana: 'deva', nadi: 'aadi', yoni: 'buffalo',
        signature: { en: 'dexterous and practical, someone whose hands and wits both work quickly', hi: 'निपुण और व्यावहारिक, जिसके हाथ और बुद्धि दोनों तेज़ चलते हैं' },
        career: { en: 'crafts and jewellery, accounting, healing by touch, comedy and precision work', hi: 'शिल्प व आभूषण, लेखांकन, स्पर्श-चिकित्सा, हास्य और सूक्ष्म कार्य' },
        marriage: { en: 'practical rather than dramatic in love; suits a partner who values competence', hi: 'प्रेम में नाटकीय नहीं व्यावहारिक; ऐसे साथी के अनुकूल जो योग्यता को महत्व दे' },
        health: { en: 'the hands and digestion', hi: 'हाथ और पाचन' }
    },
    {
        n: 14, name: { en: 'Chitra', hi: 'चित्रा' }, lord: 'mars', deity: 'Tvashtar',
        symbol: { en: 'a bright jewel', hi: 'उज्ज्वल रत्न' }, gana: 'rakshasa', nadi: 'madhya', yoni: 'tiger',
        signature: { en: 'striking and design-minded, drawn to making things that look right', hi: 'आकर्षक और सौंदर्य-दृष्टि वाला, ऐसी चीज़ें बनाने को प्रेरित जो सुंदर लगें' },
        career: { en: 'architecture and design, fashion, photography and cosmetic or reconstructive work', hi: 'वास्तुकला व डिज़ाइन, फैशन, फोटोग्राफ़ी और सौंदर्य या पुनर्निर्माण कार्य' },
        marriage: { en: 'magnetic attraction that needs substance beneath it to last', hi: 'चुंबकीय आकर्षण जिसे टिकने के लिए नीचे ठोस आधार चाहिए' },
        health: { en: 'the kidneys and lower back', hi: 'गुर्दे और कमर' }
    },
    {
        n: 15, name: { en: 'Swati', hi: 'स्वाति' }, lord: 'rahu', deity: 'Vayu',
        symbol: { en: 'a young shoot in the wind', hi: 'पवन में झूलता नवांकुर' }, gana: 'deva', nadi: 'antya', yoni: 'buffalo',
        signature: { en: 'independent and adaptable, needing room to move more than anything else', hi: 'स्वतंत्र और अनुकूलनीय, जिसे सबसे अधिक चाहिए तो चलने की जगह' },
        career: { en: 'business and trade, aviation, journalism, diplomacy and technology', hi: 'व्यापार, विमानन, पत्रकारिता, कूटनीति और तकनीक' },
        marriage: { en: 'admires ambition but resists being confined; needs a partner who allows space', hi: 'महत्वाकांक्षा की सराहना करता है पर बंधन का विरोध; ऐसा साथी चाहिए जो स्थान दे' },
        health: { en: 'the skin, bladder and wind-related complaints', hi: 'त्वचा, मूत्राशय और वात-संबंधी शिकायतें' }
    },
    {
        n: 16, name: { en: 'Vishakha', hi: 'विशाखा' }, lord: 'jupiter', deity: 'Indra-Agni',
        symbol: { en: 'a triumphal arch', hi: 'विजय-तोरण' }, gana: 'rakshasa', nadi: 'antya', yoni: 'tiger',
        signature: { en: 'goal-driven and competitive, willing to wait a long time for the thing wanted', hi: 'लक्ष्य-केंद्रित और प्रतिस्पर्धी, इच्छित वस्तु के लिए लंबा प्रतीक्षा करने को तैयार' },
        career: { en: 'politics, broadcasting, fashion, sport and any field with a visible scoreboard', hi: 'राजनीति, प्रसारण, फैशन, खेल और ऐसा कोई क्षेत्र जहाँ परिणाम दिखे' },
        marriage: { en: 'ambition can crowd out the relationship unless deliberately balanced', hi: 'जब तक सचेत संतुलन न हो, महत्वाकांक्षा संबंध को पीछे धकेल सकती है' },
        health: { en: 'the lower abdomen and liver', hi: 'निचला उदर और यकृत' }
    },
    {
        n: 17, name: { en: 'Anuradha', hi: 'अनुराधा' }, lord: 'saturn', deity: 'Mitra',
        symbol: { en: 'a lotus', hi: 'कमल' }, gana: 'deva', nadi: 'madhya', yoni: 'deer',
        signature: { en: 'devoted and cooperative, with a real gift for keeping friendships alive', hi: 'समर्पित और सहयोगी, मित्रता निभाने की सच्ची कला के साथ' },
        career: { en: 'management, counselling, psychology, research and organisational work', hi: 'प्रबंधन, परामर्श, मनोविज्ञान, शोध और संगठनात्मक कार्य' },
        marriage: { en: 'builds love on friendship, which is why these bonds tend to last', hi: 'प्रेम को मित्रता पर बनाता है, इसीलिए ये संबंध टिकते हैं' },
        health: { en: 'the bowels and hips', hi: 'आँत और कूल्हे' }
    },
    {
        n: 18, name: { en: 'Jyeshtha', hi: 'ज्येष्ठा' }, lord: 'mercury', deity: 'Indra',
        symbol: { en: 'a protective amulet', hi: 'रक्षा-कवच' }, gana: 'rakshasa', nadi: 'aadi', yoni: 'deer',
        signature: { en: 'senior in bearing and protective of others, often carrying responsibility early', hi: 'स्वभाव से वरिष्ठ और दूसरों का रक्षक, प्रायः कम आयु में ही दायित्व उठाने वाला' },
        career: { en: 'government, law enforcement, journalism and positions of oversight', hi: 'शासन, विधि-प्रवर्तन, पत्रकारिता और निगरानी के पद' },
        marriage: { en: 'intense and needs a partner of comparable depth; control is the thing to watch', hi: 'गहन, समान गहराई वाला साथी चाहिए; नियंत्रण की प्रवृत्ति पर ध्यान दें' },
        health: { en: 'the colon and nervous strain', hi: 'बृहदान्त्र और स्नायविक तनाव' }
    },
    {
        n: 19, name: { en: 'Mula', hi: 'मूल' }, lord: 'ketu', deity: 'Nirriti',
        symbol: { en: 'a bunch of tied roots', hi: 'बँधी हुई जड़ें' }, gana: 'rakshasa', nadi: 'aadi', yoni: 'dog',
        signature: { en: 'investigative and unafraid to dig to the root of a thing, however uncomfortable', hi: 'अन्वेषी और किसी भी बात की जड़ तक जाने से न डरने वाला, चाहे असहज ही क्यों न हो' },
        career: { en: 'medicine and dentistry, research and investigation, astrology, mining and pharmacy', hi: 'चिकित्सा व दंत-चिकित्सा, शोध व अन्वेषण, ज्योतिष, खनन और औषधि' },
        marriage: { en: 'spiritually intense; early relationships often end so that a truer one can begin', hi: 'आध्यात्मिक रूप से गहन; आरंभिक संबंध प्रायः समाप्त होते हैं ताकि सच्चा संबंध आरंभ हो सके' },
        health: { en: 'the hips and sciatic region', hi: 'कूल्हे और नितंब-स्नायु क्षेत्र' }
    },
    {
        n: 20, name: { en: 'Purva Ashadha', hi: 'पूर्वाषाढ़ा' }, lord: 'venus', deity: 'the water goddesses',
        symbol: { en: 'a winnowing basket', hi: 'सूप' }, gana: 'manushya', nadi: 'madhya', yoni: 'monkey',
        signature: { en: 'persuasive and hard to defeat in an argument, with real conviction behind the charm', hi: 'प्रभावशाली और वाद-विवाद में कठिनाई से हारने वाला, आकर्षण के पीछे सच्ची दृढ़ता के साथ' },
        career: { en: 'teaching, law, shipping and water-related trade, writing and performance', hi: 'शिक्षण, विधि, जल-परिवहन व व्यापार, लेखन और प्रदर्शन' },
        marriage: { en: 'proud and not quick to yield; a partner who negotiates gently does best', hi: 'स्वाभिमानी और शीघ्र न झुकने वाला; कोमलता से बात करने वाला साथी सबसे उपयुक्त' },
        health: { en: 'the thighs and fluid retention', hi: 'जाँघें और जल-संचय' }
    },
    {
        n: 21, name: { en: 'Uttara Ashadha', hi: 'उत्तराषाढ़ा' }, lord: 'sun', deity: 'the Vishvadevas',
        symbol: { en: "an elephant's tusk", hi: 'हाथी का दाँत' }, gana: 'manushya', nadi: 'antya', yoni: 'mongoose',
        signature: { en: 'steady and unshakeable once committed, winning by lasting longer than the opposition', hi: 'प्रतिबद्ध होने के बाद अडिग, विरोध से अधिक टिककर जीतने वाला' },
        career: { en: 'law, government, defence, athletics and long-horizon construction work', hi: 'विधि, शासन, रक्षा, खेल और दीर्घकालिक निर्माण कार्य' },
        marriage: { en: 'commits slowly and permanently; one of the best birth stars for a lasting marriage', hi: 'धीरे पर स्थायी रूप से प्रतिबद्ध; टिकाऊ विवाह के लिए सर्वोत्तम नक्षत्रों में' },
        health: { en: 'the thighs, knees and arteries', hi: 'जाँघें, घुटने और धमनियाँ' }
    },
    {
        n: 22, name: { en: 'Shravana', hi: 'श्रवण' }, lord: 'moon', deity: 'Vishnu',
        symbol: { en: 'an ear', hi: 'कान' }, gana: 'deva', nadi: 'antya', yoni: 'monkey',
        signature: { en: 'a genuine listener who learns by hearing and builds a reputation for good counsel', hi: 'सच्चा श्रोता जो सुनकर सीखता है और अच्छी सलाह के लिए प्रतिष्ठा बनाता है' },
        career: { en: 'teaching, languages, music and broadcasting, counselling and advisory work', hi: 'शिक्षण, भाषाएँ, संगीत व प्रसारण, परामर्श और सलाहकार कार्य' },
        marriage: { en: 'traditional and family-minded; listens well, which carries a marriage a long way', hi: 'परंपरागत और परिवार-प्रिय; अच्छा सुनता है, जो विवाह को बहुत दूर तक ले जाता है' },
        health: { en: 'the ears and digestion', hi: 'कान और पाचन' }
    },
    {
        n: 23, name: { en: 'Dhanishta', hi: 'धनिष्ठा' }, lord: 'mars', deity: 'the eight Vasus',
        symbol: { en: 'a drum', hi: 'मृदंग' }, gana: 'rakshasa', nadi: 'madhya', yoni: 'lion',
        signature: { en: 'rhythmic, ambitious and prosperous, with a strong sense of timing', hi: 'लयबद्ध, महत्वाकांक्षी और समृद्ध, समय की प्रबल समझ के साथ' },
        career: { en: 'music, property, gemstones, finance and athletics', hi: 'संगीत, संपत्ति, रत्न, वित्त और खेल' },
        marriage: { en: 'career can take the front seat early on; marriage settles better once that is balanced', hi: 'आरंभ में करियर आगे रह सकता है; संतुलन बनने पर विवाह अधिक स्थिर होता है' },
        health: { en: 'the back and blood pressure', hi: 'पीठ और रक्तचाप' }
    },
    {
        n: 24, name: { en: 'Shatabhisha', hi: 'शतभिषा' }, lord: 'rahu', deity: 'Varuna',
        symbol: { en: 'an empty circle', hi: 'रिक्त वृत्त' }, gana: 'rakshasa', nadi: 'aadi', yoni: 'horse',
        signature: { en: 'secretive, unconventional and drawn to healing what others cannot diagnose', hi: 'गोपनीय, अपरंपरागत और ऐसे रोगों को ठीक करने की ओर प्रवृत्त जिन्हें दूसरे पहचान न सकें' },
        career: { en: 'medicine and radiology, technology and space, pharmaceuticals and aviation', hi: 'चिकित्सा व रेडियोलॉजी, तकनीक व अंतरिक्ष, औषधि और विमानन' },
        marriage: { en: 'independent and private; needs a partner comfortable with solitude', hi: 'स्वतंत्र और एकांतप्रिय; ऐसा साथी चाहिए जो एकांत से सहज हो' },
        health: { en: 'chronic and hidden complaints', hi: 'पुरानी और छिपी शिकायतें' }
    },
    {
        n: 25, name: { en: 'Purva Bhadrapada', hi: 'पूर्व भाद्रपद' }, lord: 'jupiter', deity: 'Aja Ekapada',
        symbol: { en: 'a two-faced man', hi: 'द्विमुख पुरुष' }, gana: 'manushya', nadi: 'aadi', yoni: 'lion',
        signature: { en: 'intense and idealistic, capable of great effort and equally sudden detachment', hi: 'तीव्र और आदर्शवादी, महान परिश्रम और उतने ही अचानक वैराग्य दोनों में सक्षम' },
        career: { en: 'research, psychiatry, the occult, ecology and work others avoid', hi: 'शोध, मनोरोग-चिकित्सा, गूढ़ विद्या, पर्यावरण और वे कार्य जिनसे दूसरे बचते हैं' },
        marriage: { en: 'swings between deep involvement and withdrawal; consistency is the work', hi: 'गहरी संलग्नता और दूरी के बीच झूलता है; निरंतरता ही साधना है' },
        health: { en: 'the sides of the body and nervous strain', hi: 'शरीर के पार्श्व और स्नायविक तनाव' }
    },
    {
        n: 26, name: { en: 'Uttara Bhadrapada', hi: 'उत्तर भाद्रपद' }, lord: 'saturn', deity: 'Ahir Budhnya',
        symbol: { en: 'the serpent of the deep', hi: 'गहराई का सर्प' }, gana: 'manushya', nadi: 'madhya', yoni: 'cow',
        signature: { en: 'calm, deep and quietly wise, with more going on beneath the surface than shows', hi: 'शांत, गहन और मौन-ज्ञानी, जितना दिखता है उससे कहीं अधिक भीतर चलता हुआ' },
        career: { en: 'philosophy and counselling, yoga, archives and history, and long research', hi: 'दर्शन व परामर्श, योग, अभिलेख व इतिहास, और दीर्घ शोध' },
        marriage: { en: 'steady and forgiving; one of the classical birth stars favoured for marriage', hi: 'स्थिर और क्षमाशील; विवाह के लिए शास्त्रों में अनुकूल माने गए नक्षत्रों में' },
        health: { en: 'the feet and joints', hi: 'पैर और जोड़' }
    },
    {
        n: 27, name: { en: 'Revati', hi: 'रेवती' }, lord: 'mercury', deity: 'Pushan',
        symbol: { en: 'a pair of fish', hi: 'मीन-युग्म' }, gana: 'deva', nadi: 'antya', yoni: 'elephant',
        signature: { en: 'gentle, guiding and protective, the one who sees others safely to where they are going', hi: 'कोमल, मार्गदर्शक और रक्षक, जो दूसरों को सुरक्षित उनके गंतव्य तक पहुँचाता है' },
        career: { en: 'transport and shipping, music, childcare, astrology and caregiving', hi: 'परिवहन व नौवहन, संगीत, शिशु-देखभाल, ज्योतिष और सेवा-कार्य' },
        marriage: { en: 'nurturing and accommodating; needs a partner who does not mistake kindness for weakness', hi: 'पोषक और समायोजनशील; ऐसा साथी चाहिए जो कोमलता को दुर्बलता न समझे' },
        health: { en: 'the feet and digestion', hi: 'पैर और पाचन' }
    }
];

// Index by every reasonable spelling of the name.
const BY_KEY = {};
for (const nk of LIST) {
    BY_KEY[nakKey(nk.name.en)] = nk;
}
// Common alternative spellings the upstream API may send.
const ALIASES = {
    aswini: 'ashwini', ashvini: 'ashwini', bharanee: 'bharani', kritika: 'krittika',
    karthigai: 'krittika', mrigashirsha: 'mrigashira', mrigasira: 'mrigashira',
    mrigshira: 'mrigashira', aradra: 'ardra', thiruvaathirai: 'ardra',
    punarpoosam: 'punarvasu', pushyami: 'pushya', poosam: 'pushya',
    aslesha: 'ashlesha', ayilyam: 'ashlesha', makam: 'magha',
    pubba: 'purvaphalguni', pooram: 'purvaphalguni', purvafalguni: 'purvaphalguni',
    uttaraphalgani: 'uttaraphalguni', uthiram: 'uttaraphalguni', uttara: 'uttaraphalguni',
    hastham: 'hasta', atham: 'hasta', chithirai: 'chitra', chitta: 'chitra',
    svati: 'swati', chothi: 'swati', visakam: 'vishakha', vishaka: 'vishakha',
    anusham: 'anuradha', anizham: 'anuradha', jyestha: 'jyeshtha', kettai: 'jyeshtha',
    moola: 'mula', moolam: 'mula', purvashadha: 'purvaashadha', pooraadam: 'purvaashadha',
    purvaashada: 'purvaashadha', uttarashadha: 'uttaraashadha', uthiraadam: 'uttaraashadha',
    uttaraashada: 'uttaraashadha', sravana: 'shravana', thiruvonam: 'shravana',
    dhanishtha: 'dhanishta', avittam: 'dhanishta', sravishta: 'dhanishta',
    satabhisha: 'shatabhisha', shatataraka: 'shatabhisha', chathayam: 'shatabhisha',
    purvabhadra: 'purvabhadrapada', poorattathi: 'purvabhadrapada',
    uttarabhadra: 'uttarabhadrapada', uthirattathi: 'uttarabhadrapada',
    revathi: 'revati'
};

/** Look up a nakshatra by any spelling. Returns null when unknown. */
function getNakshatra(name) {
    if (!name) return null;
    const k = nakKey(name);
    if (BY_KEY[k]) return BY_KEY[k];
    if (ALIASES[k] && BY_KEY[ALIASES[k]]) return BY_KEY[ALIASES[k]];
    return null;
}

/** Nakshatra + pada from a sidereal longitude, if degrees are ever available. */
function fromLongitude(lon) {
    const L = ((Number(lon) % 360) + 360) % 360;
    const idx = Math.floor(L / NAK_SPAN);
    const pada = Math.floor((L % NAK_SPAN) / (NAK_SPAN / 4)) + 1;
    return { nakshatra: LIST[idx], pada, navamsaSignIndex: Math.floor(L / (NAK_SPAN / 4)) % 12 };
}

module.exports = { LIST, getNakshatra, fromLongitude, nakKey, NAK_SPAN };
