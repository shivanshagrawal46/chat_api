/**
 * services/kundliNarrative/vocab.js
 *
 * Bilingual vocabulary for the rewritten report.
 *
 * The old phrase bank described placements. This one describes EVIDENCE: every
 * scoring reason the analysis layer produces has a phrase here, so a sentence
 * can say why a planet is strong instead of merely asserting that it is.
 *
 * Reused from the previous version: planet/sign/house/element vocabulary in
 * data.js. Added here: reason phrases, strength bands, dasha wording,
 * nakshatra profiles, aspect wording and remedies.
 */

'use strict';

// ---------------------------------------------------------------------------
// Why a planet or house scored the way it did.
// {planet} and {house} are substituted by the composer.
// ---------------------------------------------------------------------------
const REASONS = {
    exalted: { en: '{planet} is exalted, the strongest dignity a planet can hold', hi: '{planet} उच्च राशि में है, जो किसी ग्रह की सर्वोच्च गरिमा है' },
    moolatrikona: { en: '{planet} sits in its moolatrikona, its favourite working ground', hi: '{planet} अपने मूलत्रिकोण में है, जो इसका सबसे अनुकूल कार्यक्षेत्र है' },
    own_sign: { en: '{planet} is in its own sign, completely at home', hi: '{planet} अपनी ही राशि में है, पूरी तरह सहज' },
    debilitated: { en: '{planet} is debilitated, its weakest dignity', hi: '{planet} नीच राशि में है, इसकी सबसे कमज़ोर स्थिति' },
    neecha_bhanga: { en: 'that debilitation is cancelled (Neecha Bhanga), so the weakness lifts with time', hi: 'यह नीचता भंग हो रही है (नीच भंग), इसलिए कमज़ोरी समय के साथ दूर होती है' },
    friendly_sign: { en: '{planet} occupies a friendly sign that supports it', hi: '{planet} मित्र राशि में है जो इसका साथ देती है' },
    enemy_sign: { en: '{planet} sits in an enemy sign and has to work harder for its results', hi: '{planet} शत्रु राशि में है और इसे परिणामों के लिए अधिक मेहनत करनी पड़ती है' },
    combust: { en: '{planet} is combust, burnt by its closeness to the Sun', hi: '{planet} अस्त है, सूर्य के निकट होने से इसका बल घट गया है' },
    retrograde: { en: '{planet} is retrograde, which turns it inward and makes it unusually persistent', hi: '{planet} वक्री है, जिससे यह अंतर्मुखी और असामान्य रूप से दृढ़ हो जाता है' },
    vargottama: { en: '{planet} is vargottama, holding the same sign in the Navamsa, which doubles its reliability', hi: '{planet} वर्गोत्तम है, नवांश में भी वही राशि रखता है, जिससे इसकी विश्वसनीयता दोगुनी हो जाती है' },
    in_trikona: { en: 'it occupies the {house}, a trine and one of the most fortunate places in a chart', hi: 'यह {house} में है, जो त्रिकोण है और कुंडली के सबसे भाग्यशाली स्थानों में से एक' },
    in_kendra: { en: 'it occupies the {house}, an angle, which gives it visible influence', hi: 'यह {house} में है, जो केंद्र है और इसे प्रत्यक्ष प्रभाव देता है' },
    in_dusthana: { en: 'it falls in the {house}, a difficult house, so its results arrive through struggle or delay', hi: 'यह {house} में पड़ता है, जो कठिन भाव है, इसलिए इसके फल संघर्ष या देरी से आते हैं' },
    in_upachaya: { en: 'it sits in the {house}, a growing house that improves steadily with age', hi: 'यह {house} में है, जो उपचय भाव है और उम्र के साथ लगातार बेहतर होता है' },
    digbala: { en: 'it holds directional strength (digbala) in this house, its best possible position', hi: 'इसे इस भाव में दिग्बल प्राप्त है, जो इसकी सर्वोत्तम स्थिति है' },
    benefic_aspect: { en: 'benefic {from} aspect it, which protects and smooths its work', hi: 'शुभ ग्रह {from} इस पर दृष्टि डालते हैं, जो इसकी रक्षा करते हैं और कार्य सरल बनाते हैं' },
    malefic_aspect: { en: 'malefic {from} aspect it, adding pressure and friction', hi: 'क्रूर ग्रह {from} इस पर दृष्टि डालते हैं, जिससे दबाव और टकराव बढ़ता है' },
    shadbala: { en: 'its six-fold strength (Shadbala) is {shadbalaWord} compared with the rest of your chart', hi: 'इसका षड्बल आपकी शेष कुंडली की तुलना में {shadbalaWord} है' },
    sav: { en: 'the house carries {bindus} Ashtakavarga bindus, which is {savWord}', hi: 'इस भाव में {bindus} अष्टकवर्ग बिंदु हैं, जो {savWord} है' },
    lord_strength: { en: 'its lord {lord} is {lordWord} in this chart', hi: 'इसका स्वामी {lord} इस कुंडली में {lordWord} है' },
    lord_well_placed: { en: 'the lord sits in the {lordHouse}, a supportive position', hi: 'स्वामी {lordHouse} में है, जो सहायक स्थिति है' },
    lord_in_dusthana: { en: 'the lord has fallen into the {lordHouse}, which drains the house it rules', hi: 'स्वामी {lordHouse} में चला गया है, जिससे उसका अपना भाव कमज़ोर होता है' },
    benefic_occupant: { en: '{planet} sits inside it and protects its matters', hi: '{planet} इसके भीतर बैठकर इसके विषयों की रक्षा करता है' },
    malefic_occupant: { en: '{planet} occupies it and keeps its matters under pressure', hi: '{planet} इसमें स्थित है और इसके विषयों पर दबाव बनाए रखता है' },
    papakartari: { en: 'it is hemmed between malefics on both sides (papakartari), which squeezes it', hi: 'यह दोनों ओर क्रूर ग्रहों से घिरा है (पापकर्तरी), जो इसे दबाता है' },
    shubhakartari: { en: 'benefics flank it on both sides (shubhakartari), a quiet but real protection', hi: 'दोनों ओर शुभ ग्रह हैं (शुभकर्तरी), जो एक मौन पर वास्तविक सुरक्षा है' },
    avastha_deepta: { en: 'it is in Deepta avastha, blazing and confident', hi: 'यह दीप्त अवस्था में है, तेजस्वी और आत्मविश्वासी' },
    avastha_swastha: { en: 'it is in Swastha avastha, settled and comfortable', hi: 'यह स्वस्थ अवस्था में है, स्थिर और सहज' },
    avastha_vikla: { en: 'it is in Vikala avastha, hampered and not at full capacity', hi: 'यह विकल अवस्था में है, बाधित और पूर्ण क्षमता पर नहीं' },
    avastha_kope: { en: 'it is in Kopa avastha, agitated and reactive', hi: 'यह कोप अवस्था में है, उद्विग्न और प्रतिक्रियाशील' },
    avastha_khala: { en: 'it is in Khala avastha, restless and hard to settle', hi: 'यह खल अवस्था में है, बेचैन और कठिनाई से स्थिर होने वाला' },
    avastha_shanta: { en: 'it is in Shanta avastha, calm and steady', hi: 'यह शांत अवस्था में है, शांत और स्थिर' },
    avastha_mudita: { en: 'it is in Mudita avastha, pleased and well-disposed', hi: 'यह मुदित अवस्था में है, प्रसन्न और अनुकूल' },
    avastha_deena: { en: 'it is in Deena avastha, depleted and in need of support', hi: 'यह दीन अवस्था में है, क्षीण और सहारे की आवश्यकता में' },
    avastha_peedita: { en: 'it is in Peedita avastha, afflicted and under strain', hi: 'यह पीड़ित अवस्था में है, पीड़ित और दबाव में' },
    avastha_shakta: { en: 'it is in Shakta avastha, capable and able to act', hi: 'यह शक्त अवस्था में है, समर्थ और कार्य करने योग्य' }
};

const SAV_WORD = {
    high: { en: 'well above average and a real sign of capacity', hi: 'औसत से काफ़ी ऊपर और वास्तविक क्षमता का संकेत' },
    above_average: { en: 'a little above average', hi: 'औसत से कुछ ऊपर' },
    average: { en: 'about average', hi: 'लगभग औसत' },
    low: { en: 'below average, so this house needs conscious support', hi: 'औसत से नीचे, इसलिए इस भाव को सचेत सहारे की आवश्यकता है' }
};

const STRENGTH_WORD = {
    strong: { en: 'strong', hi: 'मज़बूत' },
    moderate: { en: 'moderately placed', hi: 'मध्यम स्थिति में' },
    weak: { en: 'weak', hi: 'कमज़ोर' }
};

const SHADBALA_WORD = {
    high: { en: 'among the highest', hi: 'सर्वाधिक में से' },
    mid: { en: 'middling', hi: 'मध्यम' },
    low: { en: 'among the lowest', hi: 'सबसे कम में से' }
};

const BAND_WORD = {
    strong: { en: 'strong', hi: 'मज़बूत' },
    mixed: { en: 'mixed', hi: 'मिश्रित' },
    challenging: { en: 'demanding', hi: 'चुनौतीपूर्ण' }
};

// ---------------------------------------------------------------------------
// Functional nature of a planet for the given lagna
// ---------------------------------------------------------------------------
const FUNCTIONAL = {
    yogakaraka: {
        en: 'the Yogakaraka for your Lagna, ruling both an angle and a trine, which makes it the single most auspicious planet you have',
        hi: 'आपके लग्न का योगकारक, जो एक केंद्र और एक त्रिकोण दोनों का स्वामी है, और इसी कारण आपका सबसे शुभ ग्रह है'
    },
    benefic: { en: 'a functional benefic for your Lagna', hi: 'आपके लग्न के लिए कार्यकारी शुभ ग्रह' },
    mixed: { en: 'mixed in function for your Lagna, ruling one helpful and one difficult house', hi: 'आपके लग्न के लिए मिश्रित स्वभाव का, जो एक शुभ और एक कठिन भाव दोनों का स्वामी है' },
    neutral: { en: 'functionally neutral for your Lagna', hi: 'आपके लग्न के लिए कार्यकारी रूप से सम' },
    malefic: { en: 'a functional malefic for your Lagna', hi: 'आपके लग्न के लिए कार्यकारी पाप ग्रह' },
    shadow: { en: 'a shadow planet, which owns no sign and works through whatever it touches', hi: 'छाया ग्रह, जिसका कोई स्वामित्व नहीं और जो जिससे जुड़ता है उसी के माध्यम से कार्य करता है' }
};

// ---------------------------------------------------------------------------
// Vimshottari dasha - what a period of each planet typically brings,
// split by whether that planet is strong or weak in THIS chart.
// ---------------------------------------------------------------------------
const DASHA_TEXT = {
    sun: {
        years: 6,
        strong: { en: 'recognition from people in authority, a rise in designation, and support from the father or from government and institutional channels', hi: 'अधिकारियों से सम्मान, पद में उन्नति, और पिता या सरकारी व संस्थागत माध्यमों से सहयोग' },
        weak: { en: 'friction with superiors, bruised pride, and a period where status has to be rebuilt rather than simply enjoyed', hi: 'वरिष्ठों से टकराव, आहत स्वाभिमान, और ऐसा समय जब प्रतिष्ठा भोगने के बजाय दोबारा बनानी पड़ती है' },
        health: { en: 'eyes, heart and blood pressure', hi: 'आँखें, हृदय और रक्तचाप' }
    },
    moon: {
        years: 10,
        strong: { en: 'emotional settledness, public goodwill, gains through women and the general public, and comfort at home', hi: 'भावनात्मक स्थिरता, जनता का स्नेह, स्त्रियों व आम लोगों से लाभ, और घर में सुख' },
        weak: { en: 'mood swings, restlessness, changes of residence and concern about the mother', hi: 'मनोदशा में उतार-चढ़ाव, बेचैनी, निवास परिवर्तन और माता को लेकर चिंता' },
        health: { en: 'sleep, digestion and mental calm', hi: 'नींद, पाचन और मानसिक शांति' }
    },
    mars: {
        years: 7,
        strong: { en: 'decisive action, property and land matters settling in your favour, competitive wins, and physical energy', hi: 'निर्णायक कार्य, भूमि-संपत्ति के मामलों का पक्ष में सुलझना, प्रतिस्पर्धा में जीत, और शारीरिक ऊर्जा' },
        weak: { en: 'haste, disputes, accidents or surgery, and money going out faster than it comes in', hi: 'जल्दबाज़ी, विवाद, दुर्घटना या शल्यक्रिया, और आय से अधिक व्यय' },
        health: { en: 'blood, inflammation and injury', hi: 'रक्त, सूजन और चोट' }
    },
    mercury: {
        years: 17,
        strong: { en: 'education, trade, writing and communication all opening up, often with several income streams at once', hi: 'शिक्षा, व्यापार, लेखन और संवाद के अवसर खुलना, प्रायः एक साथ कई आय-स्रोतों के साथ' },
        weak: { en: 'scattered attention, contracts that disappoint, and nervous strain from overthinking', hi: 'बिखरा ध्यान, निराश करने वाले अनुबंध, और अधिक सोचने से स्नायविक तनाव' },
        health: { en: 'nerves, skin and speech', hi: 'स्नायु, त्वचा और वाणी' }
    },
    jupiter: {
        years: 16,
        strong: { en: 'the classic growth period: promotion, marriage or children, teaching and advisory work, and steady accumulation of wealth', hi: 'उन्नति का क्लासिक काल: पदोन्नति, विवाह या संतान, शिक्षण व परामर्श कार्य, और धन का स्थिर संचय' },
        weak: { en: 'over-optimism, opportunities let slip, weight and liver concerns, and advice that proves costly', hi: 'अति-आशावाद, अवसरों का हाथ से निकलना, वज़न व यकृत की चिंता, और महँगी साबित होने वाली सलाह' },
        health: { en: 'liver, weight and sugar levels', hi: 'यकृत, वज़न और शर्करा' }
    },
    venus: {
        years: 20,
        strong: { en: 'the longest and often most enjoyable period: marriage, vehicles, comfort, artistic and financial work, and visible refinement of lifestyle', hi: 'सबसे लंबा और प्रायः सबसे सुखद काल: विवाह, वाहन, सुख-सुविधा, कलात्मक व वित्तीय कार्य, और जीवनशैली में स्पष्ट निखार' },
        weak: { en: 'indulgence, relationship complications, and expenditure that runs well ahead of income', hi: 'भोग-विलास, संबंधों में जटिलता, और आय से बहुत आगे निकलता व्यय' },
        health: { en: 'kidneys, reproductive health and sugar', hi: 'गुर्दे, प्रजनन स्वास्थ्य और शर्करा' }
    },
    saturn: {
        years: 19,
        strong: { en: 'slow but durable construction: a senior position earned by service, land and long-term assets, and authority that lasts because it was worked for', hi: 'धीमा पर टिकाऊ निर्माण: सेवा से अर्जित वरिष्ठ पद, भूमि व दीर्घकालिक संपत्ति, और परिश्रम से पाया स्थायी अधिकार' },
        weak: { en: 'delay, heavy responsibility carried alone, chronic low-grade health trouble and periods of isolation', hi: 'देरी, अकेले उठाया भारी दायित्व, लंबी चलने वाली छोटी स्वास्थ्य समस्याएँ और एकाकीपन के दौर' },
        health: { en: 'joints, teeth, nerves and low mood', hi: 'जोड़, दाँत, स्नायु और उदासी' }
    },
    rahu: {
        years: 18,
        strong: { en: 'sudden expansion, foreign connections, technology and media, and success along unconventional routes', hi: 'अचानक विस्तार, विदेशी संपर्क, तकनीक व मीडिया, और अपरंपरागत मार्गों से सफलता' },
        weak: { en: 'confusion, shortcuts that backfire, reputation risk and health complaints that resist diagnosis', hi: 'भ्रम, उल्टे पड़ने वाले शॉर्टकट, प्रतिष्ठा का जोखिम और निदान में न आने वाली स्वास्थ्य शिकायतें' },
        health: { en: 'anxiety and hard-to-diagnose complaints', hi: 'चिंता और कठिनाई से पहचानी जाने वाली शिकायतें' }
    },
    ketu: {
        years: 7,
        strong: { en: 'sharp intuition, research and specialist skill, spiritual depth, and unexpected gains that arrive without being chased', hi: 'तीक्ष्ण अंतर्ज्ञान, शोध व विशेषज्ञता, आध्यात्मिक गहराई, और बिना प्रयास मिलने वाले अप्रत्याशित लाभ' },
        weak: { en: 'detachment that reads as drift, sudden endings, and a sense of working without recognition', hi: 'दिशाहीनता जैसा लगने वाला वैराग्य, अचानक अंत, और बिना पहचान काम करने का अनुभव' },
        health: { en: 'infections, skin and unexplained symptoms', hi: 'संक्रमण, त्वचा और अस्पष्ट लक्षण' }
    }
};

// Antardasha relationship between the two period lords.
const DASHA_RELATION = {
    supportive: { en: 'The two period lords sit in a supportive angle from each other, so the sub-period works with the main period rather than against it.', hi: 'दोनों दशा-स्वामी एक-दूसरे से अनुकूल कोण पर हैं, इसलिए अंतर्दशा महादशा के विरुद्ध नहीं बल्कि उसके साथ काम करती है।' },
    strained: { en: 'The two period lords fall in a strained 6-8 or 2-12 relationship from each other, which is why this stretch can feel like pulling in two directions at once.', hi: 'दोनों दशा-स्वामी एक-दूसरे से 6-8 या 2-12 के तनावपूर्ण संबंध में हैं, इसीलिए यह दौर दो दिशाओं में एक साथ खिंचने जैसा लग सकता है।' },
    neutral: { en: 'The two period lords are neutrally placed from each other, so the sub-period neither lifts nor blocks the main period much.', hi: 'दोनों दशा-स्वामी एक-दूसरे से सम स्थिति में हैं, इसलिए अंतर्दशा महादशा को न विशेष उठाती है न रोकती है।' }
};

// ---------------------------------------------------------------------------
// Yoga descriptions, keyed by the detector's yoga key prefix.
// ---------------------------------------------------------------------------
const YOGA_TEXT = {
    mahapurusha_mars: { en: 'one of the five Mahapurusha ("great person") yogas, formed when Mars holds its own or exaltation sign in an angle. It gives physical courage, command, and a reputation for getting difficult things done.', hi: 'पाँच महापुरुष योगों में से एक, जो मंगल के अपनी या उच्च राशि में केंद्र में होने पर बनता है। यह शारीरिक साहस, नेतृत्व और कठिन कार्य पूरे करने की प्रतिष्ठा देता है।' },
    mahapurusha_mercury: { en: 'one of the five Mahapurusha yogas, formed by a dignified Mercury in an angle. It gives a quick analytical mind, persuasive speech, and success in trade, writing and anything requiring intelligence.', hi: 'पाँच महापुरुष योगों में से एक, जो बुध के गरिमापूर्ण रूप से केंद्र में होने पर बनता है। यह तीव्र विश्लेषणात्मक बुद्धि, प्रभावशाली वाणी, और व्यापार, लेखन व बौद्धिक कार्यों में सफलता देता है।' },
    mahapurusha_jupiter: { en: 'one of the five Mahapurusha yogas, formed by a dignified Jupiter in an angle. It gives moral authority, respect, and the role of guide or adviser to others.', hi: 'पाँच महापुरुष योगों में से एक, जो गुरु के गरिमापूर्ण रूप से केंद्र में होने पर बनता है। यह नैतिक अधिकार, सम्मान, और दूसरों के मार्गदर्शक की भूमिका देता है।' },
    mahapurusha_venus: { en: 'one of the five Mahapurusha yogas, formed by a dignified Venus in an angle. It gives beauty, comfort, vehicles, artistic talent and a genuinely pleasant married life.', hi: 'पाँच महापुरुष योगों में से एक, जो शुक्र के गरिमापूर्ण रूप से केंद्र में होने पर बनता है। यह सौंदर्य, सुख, वाहन, कलात्मक प्रतिभा और सुखद वैवाहिक जीवन देता है।' },
    mahapurusha_saturn: { en: 'one of the five Mahapurusha yogas, formed by a dignified Saturn in an angle. It gives authority earned through sustained work, influence over large groups or workforces, and a rise that holds because it was built slowly.', hi: 'पाँच महापुरुष योगों में से एक, जो शनि के गरिमापूर्ण रूप से केंद्र में होने पर बनता है। यह निरंतर परिश्रम से अर्जित अधिकार, बड़े समूहों पर प्रभाव, और धीरे बनने के कारण टिकने वाली उन्नति देता है।' },
    yogakaraka: { en: 'a Raja Yoga formed by your Yogakaraka alone. A single planet ruling both an angle and a trine carries the promise of status and authority by itself, without needing a second planet to help it.', hi: 'केवल आपके योगकारक से बना राज योग। एक ही ग्रह जो केंद्र और त्रिकोण दोनों का स्वामी हो, बिना किसी दूसरे ग्रह की सहायता के प्रतिष्ठा और अधिकार का वचन रखता है।' },
    dharma_karmadhipati: { en: 'the link between the lords of the 9th (fortune) and 10th (career). Classical texts rate this the strongest of the ordinary Raja Yogas because it joins luck to effort.', hi: 'नवम (भाग्य) और दशम (कर्म) के स्वामियों का संबंध। शास्त्र इसे सामान्य राज योगों में सर्वश्रेष्ठ मानते हैं क्योंकि यह भाग्य को पुरुषार्थ से जोड़ता है।' },
    raja: { en: 'a Raja Yoga formed by the connection of an angular lord with a trinal lord. Some version of this exists in most charts, so it is worth saying plainly that what makes yours count is that both planets are actually in good condition.', hi: 'केंद्र स्वामी और त्रिकोण स्वामी के संबंध से बना राज योग। इसका कोई न कोई रूप अधिकांश कुंडलियों में होता है, इसलिए स्पष्ट कहना उचित है कि आपके मामले में यह इसलिए मायने रखता है क्योंकि दोनों ग्रह वास्तव में अच्छी स्थिति में हैं।' },
    neecha_bhanga: { en: 'a debilitated planet whose weakness is cancelled and converted into strength. The classic signature of this yoga is a hard early phase followed by a rise that surprises people who knew you earlier.', hi: 'एक नीच ग्रह जिसकी कमज़ोरी भंग होकर शक्ति में बदल जाती है। इस योग की पहचान है कठिन आरंभिक दौर और उसके बाद ऐसी उन्नति जो पुराने परिचितों को चकित करे।' },
    vry: { en: 'the lord of a difficult house sits in another difficult house. It works in reverse: setbacks and rivals clear the way instead of blocking it, and gains often arrive right after a crisis.', hi: 'इसमें एक कठिन भाव का स्वामी दूसरे कठिन भाव में बैठा है। यह उल्टे ढंग से काम करता है: असफलताएँ और विरोधी मार्ग रोकने के बजाय खोल देते हैं, और लाभ प्रायः संकट के ठीक बाद आता है।' },
    parivartana: { en: 'a mutual exchange where each house lord sits in the other\'s house. An exchange binds two areas of life together permanently, so the two houses rise and fall as a pair.', hi: 'एक पारस्परिक अदला-बदली जिसमें दोनों भाव-स्वामी एक-दूसरे के भाव में बैठे हैं। अदला-बदली जीवन के दो क्षेत्रों को स्थायी रूप से जोड़ देती है, इसलिए दोनों भाव साथ उठते और गिरते हैं।' },
    dhana: { en: 'a wealth combination linking the lords of the houses of income and accumulation. These pay out specifically during the planetary periods of the planets involved rather than continuously.', hi: 'आय और संचय के भावों के स्वामियों को जोड़ने वाला धन-संयोजन। इनका फल निरंतर नहीं, बल्कि विशेष रूप से संबंधित ग्रहों की दशा में मिलता है।' },
    lakshmi: { en: 'in its strict form this needs Venus and the 9th lord both dignified and both well placed. It is genuinely uncommon and points to wealth that arrives with reputation rather than at its expense.', hi: 'अपने कठोर रूप में इसके लिए शुक्र और नवमेश दोनों का गरिमापूर्ण और सुस्थित होना आवश्यक है। यह वास्तव में दुर्लभ है और ऐसे धन का संकेत देता है जो प्रतिष्ठा के साथ आता है, उसकी कीमत पर नहीं।' },
    gaja_kesari: { en: 'Jupiter in an angle from the Moon. It is a genuinely helpful combination for judgement and reputation, though it is common enough that it should be read as a supporting strength rather than a headline.', hi: 'चंद्रमा से केंद्र में गुरु। यह विवेक और प्रतिष्ठा के लिए सचमुच सहायक संयोजन है, यद्यपि यह इतना सामान्य है कि इसे मुख्य विशेषता नहीं बल्कि सहायक शक्ति मानना चाहिए।' },
    adhi: { en: 'all three natural benefics falling in the 6th, 7th and 8th from the Moon. This is rare and classically associated with a commanding, well-regarded position in life.', hi: 'तीनों स्वाभाविक शुभ ग्रहों का चंद्रमा से षष्ठ, सप्तम और अष्टम में होना। यह दुर्लभ है और शास्त्रों में प्रतिष्ठित, प्रभावशाली स्थिति से जोड़ा जाता है।' },
    sunapha: { en: 'planets in the 2nd from the Moon, which supports self-earned wealth and a good name.', hi: 'चंद्रमा से द्वितीय में ग्रह, जो स्वअर्जित धन और अच्छी प्रतिष्ठा का समर्थन करता है।' },
    anapha: { en: 'planets in the 12th from the Moon, which supports health, comfort and an even temperament.', hi: 'चंद्रमा से द्वादश में ग्रह, जो स्वास्थ्य, सुख और संतुलित स्वभाव का समर्थन करता है।' },
    durudhara: { en: 'planets flanking the Moon on both sides, which supports wealth, vehicles and generosity.', hi: 'चंद्रमा के दोनों ओर ग्रह, जो धन, वाहन और उदारता का समर्थन करता है।' },
    chandra_mangal: { en: 'the Moon with Mars. It is a money-making combination, but a mixed one: it sharpens financial instinct while shortening the temper.', hi: 'चंद्रमा के साथ मंगल। यह धन बनाने वाला संयोजन है, पर मिश्रित: यह वित्तीय समझ तेज़ करता है और साथ ही स्वभाव को उग्र।' },
    budha_aditya: { en: 'Sun and Mercury together, which sharpens intelligence and speech. Worth knowing, though Mercury is never far from the Sun so roughly half of all charts carry it.', hi: 'सूर्य और बुध का साथ होना, जो बुद्धि और वाणी को तीक्ष्ण करता है। जानने योग्य, यद्यपि बुध सूर्य से कभी दूर नहीं होता इसलिए लगभग आधी कुंडलियों में यह मिलता है।' },
    // difficult
    kemadruma: { en: 'the Moon standing alone with no planet on either side and none of the classical cancellations applying. It shows periods of emotional isolation and a mind that has to find its own support.', hi: 'चंद्रमा दोनों ओर बिना किसी ग्रह के अकेला और कोई क्लासिक भंग लागू नहीं। यह भावनात्मक एकाकीपन के दौर और ऐसे मन को दर्शाता है जिसे अपना सहारा स्वयं खोजना पड़ता है।' },
    shakata: { en: 'Jupiter in a difficult house from the Moon while the Moon is not in an angle. The classical image is a cartwheel: fortune rises and falls in cycles rather than climbing steadily.', hi: 'चंद्रमा से कठिन भाव में गुरु और चंद्रमा का केंद्र में न होना। शास्त्रीय उपमा गाड़ी के पहिये की है: भाग्य लगातार चढ़ने के बजाय चक्र में उठता-गिरता है।' },
    grahan: { en: 'a luminary sitting with a lunar node. It clouds the matters of that planet and asks for extra clarity where it falls.', hi: 'एक ज्योतिष्पिंड का राहु या केतु के साथ होना। यह उस ग्रह के विषयों पर धुंध डालता है और जहाँ पड़ता है वहाँ अतिरिक्त स्पष्टता माँगता है।' },
    guru_chandal: { en: 'Jupiter with Rahu. It can distort judgement and complicate dealings with teachers and advisers, though a strong Jupiter turns the same combination into unorthodox brilliance.', hi: 'गुरु के साथ राहु। यह विवेक को विकृत कर सकता है और गुरुजनों व सलाहकारों से व्यवहार जटिल बना सकता है, यद्यपि बलवान गुरु इसी संयोजन को अपरंपरागत प्रतिभा में बदल देता है।' },
    angarak: { en: 'Mars with Rahu. It raises the temperature: quick anger, accident risk and impulsive decisions, but also explosive drive when aimed at a real target.', hi: 'मंगल के साथ राहु। यह तीव्रता बढ़ाता है: शीघ्र क्रोध, दुर्घटना का जोखिम और आवेगी निर्णय, पर सही लक्ष्य पर लगने पर विस्फोटक ऊर्जा भी।' },
    vish: { en: 'also called Punarphoo, this is the Moon with Saturn. Its signature is delay and repetition: things have to be done more than once before they hold.', hi: 'जिसे पुनर्फू भी कहते हैं, यह चंद्रमा के साथ शनि है। इसकी पहचान है देरी और पुनरावृत्ति: काम टिकने से पहले एक से अधिक बार करने पड़ते हैं।' },
    daridra: { en: 'the lord of gains fallen into a difficult house. It does not mean poverty; it means income leaks and gains need deliberate protection.', hi: 'लाभेश का कठिन भाव में गिरना। इसका अर्थ निर्धनता नहीं; इसका अर्थ है कि आय में रिसाव होता है और लाभ को सचेत रूप से बचाना पड़ता है।' },
    kaal_sarp: { en: 'every planet hemmed between Rahu and Ketu. It is worth flagging honestly that this combination appears in no classical text; it is a modern addition, and many serious astrologers do not use it. Where it is used, it is read as delayed but eventually decisive results.', hi: 'सभी ग्रहों का राहु और केतु के बीच आ जाना। ईमानदारी से बताना उचित है कि यह संयोजन किसी शास्त्रीय ग्रंथ में नहीं है; यह आधुनिक जोड़ है और कई गंभीर ज्योतिषी इसे नहीं मानते। जहाँ माना जाता है, वहाँ इसे विलंबित पर अंततः निर्णायक परिणामों के रूप में पढ़ा जाता है।' }
};


/**
 * Bilingual yoga names. The detector works in English; the Hindi report needs
 * the Devanagari form, otherwise Hindi paragraphs carry English yoga labels.
 * Keys are matched against the detector's yoga key, longest prefix first.
 */
const YOGA_NAMES = {
    mahapurusha_mars: { en: 'Ruchaka Yoga', hi: 'रुचक योग' },
    mahapurusha_mercury: { en: 'Bhadra Yoga', hi: 'भद्र योग' },
    mahapurusha_jupiter: { en: 'Hamsa Yoga', hi: 'हंस योग' },
    mahapurusha_venus: { en: 'Malavya Yoga', hi: 'मालव्य योग' },
    mahapurusha_saturn: { en: 'Sasa Yoga', hi: 'शश योग' },
    yogakaraka: { en: 'Yogakaraka Raja Yoga', hi: 'योगकारक राज योग' },
    dharma_karmadhipati: { en: 'Dharma-Karmadhipati Yoga', hi: 'धर्म-कर्माधिपति योग' },
    neecha_bhanga: { en: 'Neecha Bhanga Raja Yoga', hi: 'नीच भंग राज योग' },
    raja: { en: 'Raja Yoga', hi: 'राज योग' },
    vry_harsha: { en: 'Harsha (Viparita Raja) Yoga', hi: 'हर्ष (विपरीत राज) योग' },
    vry_sarala: { en: 'Sarala (Viparita Raja) Yoga', hi: 'सरल (विपरीत राज) योग' },
    vry_vimala: { en: 'Vimala (Viparita Raja) Yoga', hi: 'विमल (विपरीत राज) योग' },
    parivartana: { en: 'Parivartana Yoga', hi: 'परिवर्तन योग' },
    dhana: { en: 'Dhana Yoga', hi: 'धन योग' },
    lakshmi: { en: 'Lakshmi Yoga', hi: 'लक्ष्मी योग' },
    gaja_kesari: { en: 'Gaja Kesari Yoga', hi: 'गजकेसरी योग' },
    sunapha: { en: 'Sunapha Yoga', hi: 'सुनफा योग' },
    anapha: { en: 'Anapha Yoga', hi: 'अनफा योग' },
    durudhara: { en: 'Durudhara Yoga', hi: 'दुरुधरा योग' },
    adhi: { en: 'Adhi Yoga', hi: 'अधि योग' },
    chandra_mangal: { en: 'Chandra-Mangal Yoga', hi: 'चंद्र-मंगल योग' },
    budha_aditya: { en: 'Budha-Aditya Yoga', hi: 'बुध-आदित्य योग' },
    kemadruma: { en: 'Kemadruma Yoga', hi: 'केमद्रुम योग' },
    shakata: { en: 'Shakata Yoga', hi: 'शकट योग' },
    grahan: { en: 'Grahan Yoga', hi: 'ग्रहण योग' },
    guru_chandal: { en: 'Guru Chandal Yoga', hi: 'गुरु चांडाल योग' },
    angarak: { en: 'Angarak Yoga', hi: 'अंगारक योग' },
    vish: { en: 'Vish Yoga (Punarphoo)', hi: 'विष योग (पुनर्फू)' },
    daridra: { en: 'Daridra Yoga', hi: 'दरिद्र योग' },
    kaal_sarp: { en: 'Kaal Sarp Yoga', hi: 'काल सर्प योग' }
};

/** Resolve a detector yoga key + its English name into the requested language. */
function yogaName(key, fallbackEn, l) {
    if (l === 'en') return fallbackEn;
    const k = String(key || '');
    if (YOGA_NAMES[k]) return YOGA_NAMES[k][l];
    // Longest matching prefix, so parivartana_2_11 and dhana_2_11 resolve.
    const hit = Object.keys(YOGA_NAMES)
        .filter((n) => k.startsWith(n))
        .sort((a, b) => b.length - a.length)[0];
    if (hit) {
        // Preserve the Maha/Khala/Dainya qualifier on exchanges.
        const q = /^(Maha|Khala|Dainya) /.exec(fallbackEn || '');
        const qh = q ? ({ Maha: 'महा ', Khala: 'खल ', Dainya: 'दैन्य ' })[q[1]] : '';
        const partial = /^Partial (Anshik) /.test(fallbackEn || '') ? 'आंशिक ' : '';
        return partial + qh + YOGA_NAMES[hit][l];
    }
    return fallbackEn;
}

// ---------------------------------------------------------------------------
// Remedies, per planet. Deliberately conservative: mantra, charity and
// discipline first; gemstones carry an explicit caution.
// ---------------------------------------------------------------------------
const REMEDIES = {
    sun: { mantra: { en: 'Om hraam hreem hraum sah suryaya namah', hi: 'ॐ ह्रां ह्रीं ह्रौं सः सूर्याय नमः' }, day: { en: 'Sunday', hi: 'रविवार' }, charity: { en: 'wheat, jaggery and copper', hi: 'गेहूँ, गुड़ और ताँबा' }, habit: { en: 'offer water to the rising sun and make a habit of finishing what you start', hi: 'उगते सूर्य को जल दें और जो शुरू करें उसे पूरा करने की आदत बनाएँ' } },
    moon: { mantra: { en: 'Om shraam shreem shraum sah chandraya namah', hi: 'ॐ श्रां श्रीं श्रौं सः चंद्राय नमः' }, day: { en: 'Monday', hi: 'सोमवार' }, charity: { en: 'rice, milk and white cloth', hi: 'चावल, दूध और सफ़ेद वस्त्र' }, habit: { en: 'protect your sleep and keep contact with your mother or a maternal figure', hi: 'अपनी नींद की रक्षा करें और माता या मातृ-तुल्य व्यक्ति से संपर्क बनाए रखें' } },
    mars: { mantra: { en: 'Om kraam kreem kraum sah bhaumaya namah', hi: 'ॐ क्रां क्रीं क्रौं सः भौमाय नमः' }, day: { en: 'Tuesday', hi: 'मंगलवार' }, charity: { en: 'red lentils, jaggery and copper', hi: 'मसूर दाल, गुड़ और ताँबा' }, habit: { en: 'burn the excess energy in physical exercise rather than in argument', hi: 'अतिरिक्त ऊर्जा को बहस के बजाय व्यायाम में लगाएँ' } },
    mercury: { mantra: { en: 'Om braam breem braum sah budhaya namah', hi: 'ॐ ब्रां ब्रीं ब्रौं सः बुधाय नमः' }, day: { en: 'Wednesday', hi: 'बुधवार' }, charity: { en: 'green moong dal and green cloth', hi: 'हरी मूँग दाल और हरा वस्त्र' }, habit: { en: 'finish one skill before starting the next, and keep your word in small things', hi: 'अगला कौशल शुरू करने से पहले एक पूरा करें, और छोटी बातों में भी वचन निभाएँ' } },
    jupiter: { mantra: { en: 'Om graam greem graum sah gurave namah', hi: 'ॐ ग्रां ग्रीं ग्रौं सः गुरवे नमः' }, day: { en: 'Thursday', hi: 'गुरुवार' }, charity: { en: 'turmeric, chana dal and books', hi: 'हल्दी, चना दाल और पुस्तकें' }, habit: { en: 'keep learning something formally, and give honest advice even when it costs you', hi: 'कुछ न कुछ विधिवत सीखते रहें, और हानि होने पर भी ईमानदार सलाह दें' } },
    venus: { mantra: { en: 'Om draam dreem draum sah shukraya namah', hi: 'ॐ द्रां द्रीं द्रौं सः शुक्राय नमः' }, day: { en: 'Friday', hi: 'शुक्रवार' }, charity: { en: 'white clothes, ghee and curd', hi: 'सफ़ेद वस्त्र, घी और दही' }, habit: { en: 'keep comfort from turning into excess, and treat your partner with the courtesy you give guests', hi: 'सुख को अति में न बदलने दें, और जीवनसाथी से वही शिष्टाचार रखें जो अतिथि से रखते हैं' } },
    saturn: { mantra: { en: 'Om praam preem praum sah shanaischaraya namah', hi: 'ॐ प्रां प्रीं प्रौं सः शनैश्चराय नमः' }, day: { en: 'Saturday', hi: 'शनिवार' }, charity: { en: 'black sesame, mustard oil and iron', hi: 'काला तिल, सरसों का तेल और लोहा' }, habit: { en: 'serve people who cannot repay you, and keep your commitments even when they become inconvenient', hi: 'ऐसे लोगों की सेवा करें जो बदला न दे सकें, और असुविधा होने पर भी अपने वचन निभाएँ' } },
    rahu: { mantra: { en: 'Om bhraam bhreem bhraum sah rahave namah', hi: 'ॐ भ्रां भ्रीं भ्रौं सः राहवे नमः' }, day: { en: 'Saturday', hi: 'शनिवार' }, charity: { en: 'urad dal, coconut and blankets', hi: 'उड़द दाल, नारियल और कंबल' }, habit: { en: 'avoid shortcuts and keep your paperwork and promises clean', hi: 'शॉर्टकट से बचें और अपने कागज़ात व वचन स्पष्ट रखें' } },
    ketu: { mantra: { en: 'Om sraam sreem sraum sah ketave namah', hi: 'ॐ स्रां स्रीं स्रौं सः केतवे नमः' }, day: { en: 'Thursday', hi: 'गुरुवार' }, charity: { en: 'sesame, blankets and multi-coloured cloth', hi: 'तिल, कंबल और रंग-बिरंगा वस्त्र' }, habit: { en: 'stay engaged with practical matters even when you feel like withdrawing', hi: 'मन हटने पर भी व्यावहारिक कार्यों से जुड़े रहें' } }
};

const GEMSTONE_CAUTION = {
    en: 'Gemstones are deliberately left out of this list. A stone amplifies whatever the planet is already doing, so the wrong one strengthens a difficulty instead of easing it. If you want to consider one, have it checked against your full chart first.',
    hi: 'इस सूची में रत्न जानबूझकर नहीं दिए गए हैं। रत्न ग्रह जो कर रहा है उसी को बढ़ाता है, इसलिए ग़लत रत्न कठिनाई को कम करने के बजाय बढ़ा देता है। यदि रत्न पर विचार करना हो तो पहले अपनी पूरी कुंडली से उसकी जाँच करवाएँ।'
};

module.exports = {
    REASONS, SAV_WORD, STRENGTH_WORD, SHADBALA_WORD, BAND_WORD,
    FUNCTIONAL, DASHA_TEXT, DASHA_RELATION, YOGA_TEXT, YOGA_NAMES, yogaName, REMEDIES, GEMSTONE_CAUTION
};
