/**
 * services/kundliNarrative/compose.js
 *
 * Writes the report from the analysis.
 *
 * Two rules drive everything here:
 *
 * 1. EVERY CLAIM CARRIES ITS EVIDENCE. The old report asserted that a planet
 *    was good or bad; this one says which house it rules, where it sits, what
 *    dignity it holds, how many Ashtakavarga bindus the house carries, and
 *    what that adds up to out of 100. Numbers and names differ in every chart,
 *    so two readings cannot collapse into the same text.
 *
 * 2. NOTHING IS SAID TWICE. A Registry tracks what has already been written.
 *    A planet's remedy, a house's category explanation and a yoga description
 *    are each emitted once per report, and variant sentences rotate. The
 *    previous version repeated a quarter of its own text.
 */

'use strict';

const D = require('./data');
const V = require('./vocab');
const { getNakshatra } = require('../../data/astrology/nakshatras');
const { KENDRA, TRIKONA, DUSTHANA } = require('../kundliExtract');

const LANGS = ['en', 'hi'];

/**
 * Paragraphs are assembled from optional clauses, so an empty clause can leave a
 * double space or a space before punctuation. Tidy that once, centrally.
 */
function tidy(text) {
    return String(text || '')
        .replace(/[ 	]{2,}/g, ' ')
        .replace(/s+([,.;।])/g, '$1')
        .replace(/([.।])+/g, '$1')
        .trim();
}

// ---------------------------------------------------------------------------
// Small bilingual helpers
// ---------------------------------------------------------------------------
const P = (k, l) => (D.PLANETS[k] ? D.PLANETS[k].name[l] : k);
const YN = (y, l) => V.yogaName(y.key, y.name, l);
const S = (k, l) => (D.SIGNS[k] ? D.SIGNS[k].name[l] : k);
const ORD = (n, l) => (D.ORDINALS[l][n] || String(n));
const houseLabel = (n, l) => (l === 'en' ? `${ORD(n, 'en')} house` : `${ORD(n, 'hi')} भाव`);
const houseTheme = (n, l) => (D.HOUSES[n] ? D.HOUSES[n][l] : '');

function joinList(items, l) {
    const a = (items || []).filter(Boolean);
    if (!a.length) return '';
    if (a.length === 1) return a[0];
    const conj = l === 'hi' ? 'और' : 'and';
    return `${a.slice(0, -1).join(', ')} ${conj} ${a[a.length - 1]}`;
}

function fmtDate(d, l) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    const mEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const mHi = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्तूबर', 'नवंबर', 'दिसंबर'];
    const m = l === 'hi' ? mHi[d.getUTCMonth()] : mEn[d.getUTCMonth()];
    return `${m} ${d.getUTCFullYear()}`;
}

/**
 * Look up a yoga's explanation, but only the FIRST time that yoga appears in a
 * report. A combination such as Daridra Yoga can be relevant to career, money
 * and health at once; explaining it three times is what made the old report
 * feel padded. Later mentions get the name alone.
 */
function yogaDescription(yogaKey, reg, l) {
    const desc = V.YOGA_TEXT[yogaKey]
        || V.YOGA_TEXT[yogaKey.replace(/_[a-z0-9]+$/, '')]
        || V.YOGA_TEXT[yogaKey.split('_')[0]];
    if (!desc) return null;
    if (!reg.first('yoga_desc_' + yogaKey + '_' + l)) return null;
    return desc[l];
}

/** Render a scoring reason into a readable clause. */
function reasonPhrase(reason, ctx, l) {
    const tpl = V.REASONS[reason.code];
    if (!tpl) return null;
    let s = tpl[l];
    s = s.replace('{planet}', P(reason.planet || ctx.planet, l));
    s = s.replace('{house}', houseLabel(reason.house || ctx.house, l));
    s = s.replace('{lordHouse}', houseLabel(reason.lordHouse || 0, l));
    s = s.replace('{lord}', P(reason.lord || ctx.lord, l));
    s = s.replace('{from}', joinList((reason.from || []).map((x) => P(x, l)), l));
    s = s.replace('{bindus}', String(reason.bindus != null ? reason.bindus : ''));
    s = s.replace('{savWord}', (V.SAV_WORD[ctx.savBand] || V.SAV_WORD.average)[l]);
    s = s.replace('{lordWord}', (V.STRENGTH_WORD[ctx.lordBand] || V.STRENGTH_WORD.moderate)[l]);
    s = s.replace('{shadbalaWord}', (V.SHADBALA_WORD[ctx.shadbalaBand] || V.SHADBALA_WORD.mid)[l]);
    return s;
}

/** Pick the N most influential reasons and turn them into a sentence. */
function reasonsSentence(reasons, ctx, l, max = 3) {
    const sorted = (reasons || [])
        .filter((r) => V.REASONS[r.code])
        .sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0))
        .slice(0, max);
    const parts = sorted.map((r) => reasonPhrase(r, ctx, l)).filter(Boolean);
    if (!parts.length) return '';
    const stop = l === 'hi' ? '।' : '.';
    const lead = l === 'hi' ? parts[0] : parts[0][0].toUpperCase() + parts[0].slice(1);
    return parts.length === 1
        ? `${lead}${stop}`
        : `${lead}, ${parts.slice(1).join(', ')}${stop}`;
}

/**
 * Per-domain closing lines. The previous version reused one generic sentence in
 * all four sections, which is why a quarter of the report was literal repeats.
 */
const DOMAIN_LINES = {
    career: {
        routedThrough: { en: 'In practice that is where your professional openings and your setbacks will both originate.', hi: 'व्यवहार में आपके व्यावसायिक अवसर और रुकावटें दोनों वहीं से आएँगी।' },
        dashaOwns: { en: 'That puts your working life directly under this period rather than at its edge.', hi: 'इससे आपका कार्य-जीवन इस दशा के किनारे नहीं, सीधे उसके अधीन आ जाता है।' },
        dashaQuiet: { en: 'Career therefore moves on its own momentum during this stretch rather than being pushed by the period.', hi: 'इसलिए इस दौर में करियर दशा के धक्के से नहीं, अपनी ही गति से चलता है।' },
        effort: { en: 'Effort spent here returns more than effort spent anywhere else in your working life.', hi: 'यहाँ लगाया गया परिश्रम आपके कार्य-जीवन में कहीं और लगाए परिश्रम से अधिक फल देता है।' }
    },
    marriage: {
        routedThrough: { en: 'In practice that is the channel through which a partner arrives and through which married life takes its shape.', hi: 'व्यवहार में यही वह माध्यम है जिससे जीवनसाथी आता है और वैवाहिक जीवन आकार लेता है।' },
        dashaOwns: { en: 'Relationship matters are therefore live during this period rather than dormant.', hi: 'इसलिए इस दशा में संबंध के विषय सुप्त नहीं, सक्रिय रहते हैं।' },
        dashaQuiet: { en: 'Relationship matters therefore tend to stay settled during this stretch rather than being stirred up by it.', hi: 'इसलिए इस दौर में संबंध के विषय उथल-पुथल के बजाय स्थिर बने रहते हैं।' },
        effort: { en: 'Attention paid here does more for the relationship than anything else you could work on.', hi: 'यहाँ दिया गया ध्यान संबंध के लिए किसी अन्य प्रयास से अधिक करता है।' }
    },
    money: {
        routedThrough: { en: 'In practice that is the channel through which money reaches you, and also where it tends to leak away.', hi: 'व्यवहार में यही वह माध्यम है जिससे धन आपके पास आता है, और यहीं से रिसता भी है।' },
        dashaOwns: { en: 'Income and expenditure are therefore both unusually responsive to this period.', hi: 'इसलिए आय और व्यय दोनों इस दशा के प्रति असामान्य रूप से संवेदनशील हैं।' },
        dashaQuiet: { en: 'Finances therefore follow their existing pattern through this stretch rather than turning sharply.', hi: 'इसलिए इस दौर में वित्तीय स्थिति तेज़ मोड़ लेने के बजाय अपने मौजूदा ढर्रे पर चलती है।' },
        effort: { en: 'Closing this gap is worth more than chasing one more source of income.', hi: 'इस कमी को भरना एक और आय-स्रोत खोजने से अधिक मूल्यवान है।' }
    },
    health: {
        routedThrough: { en: 'In practice that is the area most likely to show itself as a physical symptom first.', hi: 'व्यवहार में यही वह क्षेत्र है जो सबसे पहले शारीरिक लक्षण के रूप में प्रकट होता है।' },
        dashaOwns: { en: 'Your constitution is therefore directly engaged by this period, which is reason enough for regular check-ups through it.', hi: 'इसलिए इस दशा में आपकी शारीरिक प्रकृति सीधे जुड़ी है, और यही नियमित जाँच का पर्याप्त कारण है।' },
        dashaQuiet: { en: 'Health therefore stays in the background during this stretch, provided existing habits are kept up.', hi: 'इसलिए इस दौर में स्वास्थ्य पृष्ठभूमि में रहता है, बशर्ते मौजूदा आदतें बनी रहें।' },
        effort: { en: 'Preventive attention here is worth considerably more than treatment later.', hi: 'यहाँ की निवारक देखभाल बाद के उपचार से कहीं अधिक मूल्यवान है।' }
    }
};

/** Rotated so an empty house does not read identically three times over. */
const EMPTY_HOUSE_VARIANTS = [
    { en: ' No planet occupies it, so its results follow its lord and the planets that aspect it.', hi: ' इसमें कोई ग्रह नहीं है, इसलिए इसके फल इसके स्वामी और इस पर दृष्टि डालने वाले ग्रहों पर निर्भर हैं।' },
    { en: ' It stands empty, which is no weakness in itself: an empty house simply takes its cue from its ruler.', hi: ' यह रिक्त है, जो अपने आप में कमज़ोरी नहीं: रिक्त भाव केवल अपने स्वामी का अनुसरण करता है।' },
    { en: ' No planet sits here, so this house is quieter than most and its affairs move with its lord.', hi: ' यहाँ कोई ग्रह नहीं बैठा, इसलिए यह भाव अपेक्षाकृत शांत रहता है और इसके विषय इसके स्वामी के साथ चलते हैं।' }
];

// ---------------------------------------------------------------------------
// Registry - stops the report repeating itself
// ---------------------------------------------------------------------------
class Registry {
    constructor() { this.seen = new Set(); }
    /** True the first time a key is offered, false afterwards. */
    first(key) {
        if (this.seen.has(key)) return false;
        this.seen.add(key);
        return true;
    }
    /** Choose the first unused variant, falling back to rotating. */
    variant(key, options) {
        for (let i = 0; i < options.length; i++) {
            const k = `${key}#${i}`;
            if (!this.seen.has(k)) { this.seen.add(k); return options[i]; }
        }
        return options[this.seen.size % options.length];
    }
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
/** A full evidence sentence about one planet. */
function planetEvidence(chart, analysis, key, l, opts = {}) {
    const pl = chart.planets[key];
    const sc = analysis.scores.planets[key];
    if (!pl || !sc) return '';

    const owns = (pl.ownedHouses || []).map((h) => ORD(h, l));
    const ownsPhrase = owns.length
        ? (l === 'en'
            ? `rules your ${joinList(owns, l)} house${owns.length > 1 ? 's' : ''} and `
            : `आपके ${joinList(owns, l)} भाव का स्वामी है और `)
        : '';

    const seat = pl.house
        ? (l === 'en'
            ? `sits in the ${ORD(pl.house, l)} house${pl.sign ? ` in ${S(pl.sign, l)}` : ''}`
            : `${ORD(pl.house, l)} भाव में${pl.sign ? ` ${S(pl.sign, l)} राशि में` : ''} स्थित है`)
        : '';

    const scoreClause = l === 'en'
        ? `It scores ${sc.score} out of 100 for strength in this chart, which reads as ${V.STRENGTH_WORD[sc.band].en}.`
        : `इस कुंडली में इसका बल ${sc.score}/100 है, जो ${V.STRENGTH_WORD[sc.band].hi} मानी जाती है।`;

    const first = l === 'en'
        ? `${P(key, l)} ${ownsPhrase}${seat}.`
        : `${P(key, l)} ${ownsPhrase}${seat}।`;

    const why = opts.skipReasons ? '' : reasonsSentence(sc.reasons, { planet: key, house: pl.house }, l, opts.maxReasons || 3);

    return [first, scoreClause, why].filter(Boolean).join(' ');
}

/** A full evidence sentence about one house. */
function houseEvidence(chart, analysis, h, l, reg) {
    const H = chart.houses[h];
    const hs = analysis.scores.houses[h];
    if (!H || !hs) return '';

    const savClause = H.sav != null
        ? (l === 'en'
            ? ` It carries ${H.sav} Sarvashtakavarga bindus, ${V.SAV_WORD[hs.savBand].en}.`
            : ` इसमें ${H.sav} सर्वाष्टकवर्ग बिंदु हैं, जो ${V.SAV_WORD[hs.savBand].hi} है।`)
        : '';

    const occ = H.occupants.length
        ? (l === 'en'
            ? ` ${joinList(H.occupants.map((p) => P(p, l)), l)} ${H.occupants.length > 1 ? 'occupy' : 'occupies'} it.`
            : ` ${joinList(H.occupants.map((p) => P(p, l)), l)} इसमें स्थित ${H.occupants.length > 1 ? 'हैं' : 'है'}।`)
        : (reg ? reg.variant('empty_house_' + l, EMPTY_HOUSE_VARIANTS)[l] : EMPTY_HOUSE_VARIANTS[0][l]);

    const asp = H.aspectedBy.length
        ? (l === 'en'
            ? ` ${joinList(H.aspectedBy.map((p) => P(p, l)), l)} aspect${H.aspectedBy.length > 1 ? '' : 's'} the house.`
            : ` ${joinList(H.aspectedBy.map((p) => P(p, l)), l)} इस भाव पर दृष्टि डालते हैं।`)
        : '';

    const head = l === 'en'
        ? `Your ${ORD(h, l)} house, which governs ${houseTheme(h, l)}, falls in ${S(H.sign, l)} and is ruled by ${P(H.lord, l)}.`
        : `आपका ${ORD(h, l)} भाव, जो ${houseTheme(h, l)} का प्रतिनिधित्व करता है, ${S(H.sign, l)} राशि में है और इसका स्वामी ${P(H.lord, l)} है।`;

    const verdict = l === 'en'
        ? ` Overall the house scores ${hs.score} out of 100, which is ${V.STRENGTH_WORD[hs.band].en}.`
        : ` कुल मिलाकर इस भाव का बल ${hs.score}/100 है, जो ${V.STRENGTH_WORD[hs.band].hi} है।`;

    return head + savClause + occ + asp + verdict;
}

// ---------------------------------------------------------------------------
// OVERVIEW SECTION
// ---------------------------------------------------------------------------
function buildOverview(chart, analysis, reg, name) {
    const topics = [];
    const add = (id, type, titleEn, titleHi, paras) => {
        const out = { en: [], hi: [] };
        for (const l of LANGS) out[l] = paras.map((fn) => tidy(fn(l))).filter((s) => s);
        topics.push({
            id, type,
            title: { en: titleEn, hi: titleHi },
            paragraphs: out,
            text: { en: out.en.join('\n\n'), hi: out.hi.join('\n\n') }
        });
    };

    const lagna = chart.lagnaSign;
    const sign = D.SIGNS[lagna];
    const nak = getNakshatra(chart.moonNakshatra && chart.moonNakshatra.name);
    const shape = analysis.shape;

    // --- 1. Snapshot ---
    add('snapshot', 'snapshot', 'Your Chart at a Glance', 'आपकी कुंडली एक नज़र में', [
        (l) => {
            const whose = name ? (l === 'en' ? `${name}'s` : `${name} की`) : (l === 'en' ? 'your' : 'आपकी');
            return l === 'en'
                ? `This reading is built from ${whose} birth chart, which rises in ${S(lagna, l)} with ${P(chart.lagnaLord, l)} as the Lagna lord. ${S(lagna, l)} rising makes you ${sign.persona.en}.`
                : `यह विश्लेषण ${whose} जन्म-कुंडली से बना है, जिसका लग्न ${S(lagna, l)} है और लग्नेश ${P(chart.lagnaLord, l)} हैं। ${S(lagna, l)} लग्न आपको ${sign.persona.hi} बनाता है।`;
        },
        (l) => {
            if (!nak) return '';
            const pada = chart.moonNakshatra.pada;
            return l === 'en'
                ? `Your Moon sits in ${S(chart.moonSign, l)} in ${nak.name.en} nakshatra${pada ? `, pada ${pada}` : ''}, ruled by ${P(nak.lord, l)}. That birth star gives you a mind that is ${nak.signature.en}. It also fixes your Vimshottari dasha sequence, which is why the timing section below is specific to you rather than to everyone born in the same year.`
                : `आपका चंद्रमा ${S(chart.moonSign, l)} राशि में ${nak.name.hi} नक्षत्र${pada ? `, ${pada} चरण` : ''} में है, जिसके स्वामी ${P(nak.lord, l)} हैं। यह जन्म-नक्षत्र आपको ऐसा मन देता है जो ${nak.signature.hi} है। यही आपकी विंशोत्तरी दशा का क्रम भी तय करता है, इसीलिए नीचे दिया समय-विश्लेषण आपके लिए विशिष्ट है, उसी वर्ष जन्मे सभी लोगों के लिए नहीं।`;
        },
        (l) => {
            const strong = analysis.scores.planets[shape.strongestPlanet];
            const weak = analysis.scores.planets[shape.weakestPlanet];
            const savLine = chart.savTotal != null
                ? (l === 'en'
                    ? ` Across all twelve houses your chart carries ${chart.savTotal} Ashtakavarga bindus, which is ${shape.savBand === 'high' ? 'above the usual range' : shape.savBand === 'low' ? 'below the usual range' : 'within the usual range'}.`
                    : ` बारहों भावों में आपकी कुंडली में कुल ${chart.savTotal} अष्टकवर्ग बिंदु हैं, जो सामान्य सीमा से ${shape.savBand === 'high' ? 'ऊपर' : shape.savBand === 'low' ? 'नीचे' : 'भीतर'} है।`)
                : '';
            return l === 'en'
                ? `Weighing every planet, ${P(shape.strongestPlanet, l)} comes out strongest in your chart at ${strong.score} out of 100, and ${P(shape.weakestPlanet, l)} weakest at ${weak.score}. ${shape.kendraCount} of the seven main planets sit in angles and ${shape.dusthanaCount} in the difficult sixth, eighth and twelfth houses.${savLine}`
                : `सभी ग्रहों को तौलने पर आपकी कुंडली में ${P(shape.strongestPlanet, l)} सबसे बलवान है, ${strong.score}/100, और ${P(shape.weakestPlanet, l)} सबसे कमज़ोर, ${weak.score}/100। सात मुख्य ग्रहों में से ${shape.kendraCount} केंद्र में हैं और ${shape.dusthanaCount} कठिन षष्ठ, अष्टम व द्वादश भावों में।${savLine}`;
        }
    ]);

    // --- 2. Ascendant and its lord ---
    add('ascendant', 'house', 'Your Ascendant and Its Lord', 'आपका लग्न और लग्नेश', [
        (l) => houseEvidence(chart, analysis, 1, l, reg),
        (l) => planetEvidence(chart, analysis, chart.lagnaLord, l),
        (l) => {
            const f = chart.planets[chart.lagnaLord].functional;
            return l === 'en'
                ? `As Lagna lord it is ${V.FUNCTIONAL[f] ? V.FUNCTIONAL[f].en : 'the anchor of your vitality'}, and its condition sets the baseline for your health, confidence and general momentum in life.`
                : `लग्नेश होने के नाते यह ${V.FUNCTIONAL[f] ? V.FUNCTIONAL[f].hi : 'आपकी जीवन-शक्ति का आधार'} है, और इसकी स्थिति आपके स्वास्थ्य, आत्मविश्वास और जीवन की समग्र गति का आधार तय करती है।`;
        }
    ]);

    // --- 3. Strengths and weaknesses, named ---
    add('balance', 'balance', 'Where Your Chart Is Strong and Where It Is Not', 'आपकी कुंडली कहाँ मज़बूत है और कहाँ नहीं', [
        (l) => {
            const top = analysis.scores.planetRanking.slice(0, 3);
            const bits = top.map((p) => `${P(p, l)} (${analysis.scores.planets[p].score})`);
            return l === 'en'
                ? `Ranked by strength, your three best-placed planets are ${joinList(bits, l)}. These are the parts of life that tend to work without being forced, and the planetary periods of these planets are the ones worth building plans around.`
                : `बल के क्रम में आपके तीन सर्वोत्तम ग्रह हैं ${joinList(bits, l)}। जीवन के ये पक्ष बिना अधिक प्रयास के चलते हैं, और इन्हीं ग्रहों की दशाओं के आसपास योजनाएँ बनाना उचित है।`;
        },
        (l) => {
            const bottom = analysis.scores.planetRanking.slice(-2);
            const bits = bottom.map((p) => `${P(p, l)} (${analysis.scores.planets[p].score})`);
            const weakest = analysis.scores.planets[bottom[bottom.length - 1]];
            const whyRaw = reasonsSentence(weakest.reasons.filter((r) => (r.delta || 0) < 0), { planet: weakest.planet }, l, 2);
            // Lead with the planet's name so the clause does not open on a bare pronoun.
            const why = whyRaw ? (l === 'en' ? `For ${P(weakest.planet, l)}, ${whyRaw[0].toLowerCase()}${whyRaw.slice(1)}` : `${P(weakest.planet, l)} के लिए: ${whyRaw}`) : '';
            return l === 'en'
                ? `The two that need the most support are ${joinList(bits, l)}. ${why} These are not verdicts; they mark the areas where effort has to be conscious rather than automatic.`
                : `जिन दो को सबसे अधिक सहारे की आवश्यकता है वे हैं ${joinList(bits, l)}। ${why} ये फ़ैसले नहीं हैं; ये उन क्षेत्रों को चिह्नित करते हैं जहाँ प्रयास स्वतः नहीं, सचेत रूप से करना होगा।`;
        },
        (l) => {
            const sh = analysis.scores.houses[shape.strongestHouse];
            const wh = analysis.scores.houses[shape.weakestHouse];
            return l === 'en'
                ? `Among the houses, your ${ORD(shape.strongestHouse, l)} (${houseTheme(shape.strongestHouse, l)}) is the strongest at ${sh.score}, while the ${ORD(shape.weakestHouse, l)} (${houseTheme(shape.weakestHouse, l)}) is the weakest at ${wh.score}.`
                : `भावों में आपका ${ORD(shape.strongestHouse, l)} भाव (${houseTheme(shape.strongestHouse, l)}) सबसे मज़बूत है, ${sh.score}, और ${ORD(shape.weakestHouse, l)} भाव (${houseTheme(shape.weakestHouse, l)}) सबसे कमज़ोर, ${wh.score}।`;
        }
    ]);

    // --- 4. Yogas, honestly ranked ---
    const head = analysis.yogas.headline;
    add('yogas', 'yogas', 'The Combinations That Actually Stand Out', 'वे योग जो वास्तव में उल्लेखनीय हैं', [
        (l) => {
            if (!head.length) {
                return l === 'en'
                    ? 'Your chart does not carry a standout classical yoga strong enough to headline, and it is worth being straight about that rather than inflating a common combination into something rare. Most charts contain some form of Raja Yoga; what decides results is the condition of the planets involved, which is covered area by area below.'
                    : 'आपकी कुंडली में कोई ऐसा प्रमुख शास्त्रीय योग नहीं है जो विशेष उल्लेख के योग्य हो, और किसी सामान्य संयोजन को दुर्लभ बताकर बढ़ा-चढ़ाकर कहने के बजाय यह स्पष्ट कहना उचित है। अधिकांश कुंडलियों में किसी न किसी रूप में राज योग होता है; परिणाम संबंधित ग्रहों की स्थिति से तय होते हैं, जिसकी चर्चा नीचे क्षेत्रवार की गई है।';
            }
            const y = head[0];
            const desc = yogaDescription(y.key, reg, l);
            return l === 'en'
                ? `The clearest combination in your chart is ${YN(y, l)}, ${desc || 'which stands out on both rarity and strength.'}`
                : `आपकी कुंडली का सबसे स्पष्ट योग है ${YN(y, l)}, ${desc || 'जो दुर्लभता और बल दोनों में उल्लेखनीय है।'}`;
        },
        (l) => {
            if (head.length < 2) return '';
            const rest = head.slice(1).map((y) => YN(y, l));
            return l === 'en'
                ? `Alongside it your chart also forms ${joinList(rest, l)}. These are ranked by how uncommon and how strong each one actually is, not simply by whether the placement technically exists.`
                : `इसके साथ आपकी कुंडली में ${joinList(rest, l)} भी बनते हैं। इन्हें इस आधार पर क्रमित किया गया है कि प्रत्येक वास्तव में कितना दुर्लभ और कितना बलवान है, न कि केवल इस आधार पर कि स्थिति तकनीकी रूप से बन रही है।`;
        },
        (l) => {
            const neg = analysis.yogas.headlineNegative;
            if (!neg.length) return '';
            const first = neg[0];
            const desc = yogaDescription(first.key, reg, l);
            const caveat = first.classical === false
                ? (l === 'en' ? ' This combination is a modern addition and appears in no classical text, so treat it as informational rather than decisive.' : ' यह संयोजन आधुनिक है और किसी शास्त्रीय ग्रंथ में नहीं मिलता, इसलिए इसे निर्णायक नहीं, केवल सूचनात्मक मानें।')
                : '';
            return l === 'en'
                ? `On the difficult side your chart shows ${joinList(neg.map((y) => YN(y, l)), l)}${desc ? `. The first of these is ${desc}` : '.'}${caveat}`
                : `कठिन पक्ष में आपकी कुंडली में ${joinList(neg.map((y) => YN(y, l)), l)} दिखाई देता है${desc ? `। इनमें पहला है ${desc}` : '।'}${caveat}`;
        }
    ]);

    // --- 5. The period running now ---
    if (analysis.dasha && analysis.dasha.maha) {
        const dz = analysis.dasha;
        add('current_period', 'timing', 'The Period You Are Running Now', 'अभी चल रही दशा', [
            (l) => {
                const m = dz.maha.planet;
                const a = dz.antar ? dz.antar.planet : null;
                const span = `${fmtDate(dz.mahaStart, l)} – ${fmtDate(dz.mahaEnd, l)}`;
                const sub = a && dz.antarEnd
                    ? (l === 'en'
                        ? ` Within it you are in the ${P(a, l)} sub-period, which runs until ${fmtDate(dz.antarEnd, l)}.`
                        : ` इसके भीतर आप ${P(a, l)} की अंतर्दशा में हैं, जो ${fmtDate(dz.antarEnd, l)} तक चलती है।`)
                    : '';
                return l === 'en'
                    ? `You are currently in the ${P(m, l)} Mahadasha, the ${V.DASHA_TEXT[m].years}-year period that runs ${span}.${sub}`
                    : `आप इस समय ${P(m, l)} की महादशा में हैं, ${V.DASHA_TEXT[m].years} वर्ष की यह दशा ${span} तक चलती है।${sub}`;
            },
            (l) => {
                const m = dz.maha.planet;
                const sc = analysis.scores.planets[m];
                const strongSide = sc.score >= 55;
                const body = V.DASHA_TEXT[m][strongSide ? 'strong' : 'weak'][l];
                const evid = l === 'en'
                    ? `${P(m, l)} scores ${sc.score} in your chart${chart.planets[m].house ? ` and sits in your ${ORD(chart.planets[m].house, l)} house` : ''}, so this period leans towards ${body}`
                    : `आपकी कुंडली में ${P(m, l)} का बल ${sc.score} है${chart.planets[m].house ? ` और यह आपके ${ORD(chart.planets[m].house, l)} भाव में है` : ''}, इसलिए यह दशा ${body} की ओर झुकती है`;
                return `${evid}.`;
            },
            (l) => {
                const rel = dz.relation ? V.DASHA_RELATION[dz.relation] : null;
                const toneWord = { favourable: { en: 'broadly favourable', hi: 'मोटे तौर पर अनुकूल' }, mixed: { en: 'mixed', hi: 'मिश्रित' }, testing: { en: 'testing', hi: 'परीक्षा लेने वाला' } }[dz.tone];
                const next = dz.upcoming && dz.upcoming.length ? dz.upcoming[0] : null;
                const nextLine = next
                    ? (l === 'en'
                        ? ` The next shift comes when ${P(next.planet, l)} takes over the sub-period around ${fmtDate(next.start, l)}.`
                        : ` अगला बदलाव तब आएगा जब ${fmtDate(next.start, l)} के आसपास ${P(next.planet, l)} की अंतर्दशा आरंभ होगी।`)
                    : '';
                return l === 'en'
                    ? `${rel ? rel.en + ' ' : ''}Taken together this stretch reads as ${toneWord.en} for you.${nextLine}`
                    : `${rel ? rel.hi + ' ' : ''}कुल मिलाकर यह दौर आपके लिए ${toneWord.hi} है।${nextLine}`;
            }
        ]);
    }

    return { title: { en: 'Chart Overview', hi: 'कुंडली परिचय' }, topics };
}

// ---------------------------------------------------------------------------
// DOMAIN SECTION
// ---------------------------------------------------------------------------
const DOMAIN_META = {
    career: {
        title: { en: 'Career & Profession', hi: 'करियर और व्यवसाय' },
        subject: { en: 'your work, profession and public standing', hi: 'आपके कार्य, व्यवसाय और सार्वजनिक प्रतिष्ठा' }
    },
    marriage: {
        title: { en: 'Marriage & Relationships', hi: 'विवाह और संबंध' },
        subject: { en: 'your marriage and close partnerships', hi: 'आपके विवाह और निकट संबंधों' }
    },
    money: {
        title: { en: 'Wealth & Finance', hi: 'धन और वित्त' },
        subject: { en: 'your income, savings and financial security', hi: 'आपकी आय, बचत और आर्थिक सुरक्षा' }
    },
    health: {
        title: { en: 'Health & Vitality', hi: 'स्वास्थ्य और जीवन-शक्ति' },
        subject: { en: 'your health, stamina and long-term wellbeing', hi: 'आपके स्वास्थ्य, सहनशक्ति और दीर्घकालिक कल्याण' }
    }
};

function buildDomain(chart, analysis, reg, key) {
    const meta = DOMAIN_META[key];
    const dom = analysis.domains[key];
    const topics = [];
    const add = (id, type, titleEn, titleHi, paras, extra) => {
        const out = { en: [], hi: [] };
        for (const l of LANGS) out[l] = paras.map((fn) => tidy(fn(l))).filter((s) => s);
        if (!out.en.length) return;
        topics.push({
            id, type,
            title: { en: titleEn, hi: titleHi },
            paragraphs: out,
            text: { en: out.en.join('\n\n'), hi: out.hi.join('\n\n') },
            ...(extra || {})
        });
    };

    const primary = dom.primaryHouse;

    // --- Verdict ---
    add('verdict', 'verdict', `Where ${meta.title.en} Stands`, `${meta.title.hi}: स्थिति`, [
        (l) => {
            const band = V.BAND_WORD[dom.band][l];
            return l === 'en'
                ? `Weighing the houses that govern ${meta.subject.en}, their lords, the natural significators and the combinations that touch them, this area of your chart scores ${dom.score} out of 100, which reads as ${band}.`
                : `${meta.subject.hi} को नियंत्रित करने वाले भावों, उनके स्वामियों, स्वाभाविक कारकों और उन्हें छूने वाले योगों को तौलने पर आपकी कुंडली का यह क्षेत्र ${dom.score}/100 अंक पाता है, जो ${band} है।`;
        },
        (l) => {
            if (!dom.supports.length) return '';
            const bits = dom.supports.map((f) => {
                if (f.type === 'house') return l === 'en' ? `your ${ORD(f.house, l)} house at ${f.score}` : `आपका ${ORD(f.house, l)} भाव (${f.score})`;
                if (f.type === 'karaka') return l === 'en' ? `${P(f.planet, l)} as its natural significator at ${f.score}` : `स्वाभाविक कारक ${P(f.planet, l)} (${f.score})`;
                if (f.type === 'yoga') return l === 'en' ? `the ${f.name}` : V.yogaName(f.yoga, f.name, l);
                if (f.type === 'jaimini') return l === 'en' ? `${P(f.planet, l)} as your ${f.role}` : `आपका ${f.role} ${P(f.planet, l)}`;
                return '';
            }).filter(Boolean);
            return l === 'en'
                ? `What holds this area up: ${joinList(bits, l)}.`
                : `इस क्षेत्र को जो सहारा देता है: ${joinList(bits, l)}।`;
        },
        (l) => {
            if (!dom.strains.length) {
                return l === 'en'
                    ? 'Nothing in this part of the chart stands out as a serious drag, which is itself worth noting.'
                    : 'कुंडली के इस भाग में कोई गंभीर बाधा नहीं दिखती, जो अपने आप में उल्लेखनीय है।';
            }
            const bits = dom.strains.map((f) => {
                if (f.type === 'house') return l === 'en' ? `your ${ORD(f.house, l)} house at ${f.score}` : `आपका ${ORD(f.house, l)} भाव (${f.score})`;
                if (f.type === 'karaka') return l === 'en' ? `a weak ${P(f.planet, l)} at ${f.score}` : `कमज़ोर ${P(f.planet, l)} (${f.score})`;
                if (f.type === 'yoga') return l === 'en' ? `the ${f.name}` : V.yogaName(f.yoga, f.name, l);
                if (f.type === 'jaimini') return l === 'en' ? `${P(f.planet, l)} as your ${f.role}` : `आपका ${f.role} ${P(f.planet, l)}`;
                return '';
            }).filter(Boolean);
            return l === 'en'
                ? `What pulls against it: ${joinList(bits, l)}. ${DOMAIN_LINES[key].effort.en}`
                : `जो इसके विरुद्ध खींचता है: ${joinList(bits, l)}। ${DOMAIN_LINES[key].effort.hi}`;
        }
    ], { score: dom.score, band: dom.band });

    // --- The main significator house, in detail ---
    add(`house_${primary}`, 'house',
        `Your ${ORD(primary, 'en')} House, the Core of This Area`,
        `आपका ${ORD(primary, 'hi')} भाव, इस क्षेत्र का केंद्र`, [
        (l) => houseEvidence(chart, analysis, primary, l, reg),
        (l) => {
            const lord = chart.houses[primary].lord;
            return planetEvidence(chart, analysis, lord, l);
        },
        (l) => {
            const lord = chart.houses[primary].lord;
            const lh = chart.planets[lord].house;
            if (!lh) return '';
            return l === 'en'
                ? `Because the lord of this house sits in the ${ORD(lh, l)}, the matters of ${meta.subject.en} are routed through ${houseTheme(lh, l)}. ${DOMAIN_LINES[key].routedThrough.en}`
                : `चूँकि इस भाव का स्वामी ${ORD(lh, l)} भाव में है, ${meta.subject.hi} के विषय ${houseTheme(lh, l)} के माध्यम से आते हैं। ${DOMAIN_LINES[key].routedThrough.hi}`;
        }
    ]);

    // --- Each occupant of the main house ---
    for (const p of chart.houses[primary].occupants) {
        add(`planet_${p}_house_${primary}`, 'planet',
            `${P(p, 'en')} in Your ${ORD(primary, 'en')} House`,
            `आपके ${ORD(primary, 'hi')} भाव में ${P(p, 'hi')}`, [
            (l) => planetEvidence(chart, analysis, p, l),
            (l) => {
                const pl = D.PLANETS[p];
                return l === 'en'
                    ? `Sitting directly in this house, ${P(p, l)} colours ${meta.subject.en} with ${pl.strengths.en}. The tendency to watch is ${pl.cautions.en}.`
                    : `सीधे इस भाव में बैठकर ${P(p, l)} ${meta.subject.hi} को ${pl.strengths.hi} का रंग देता है। सावधानी की प्रवृत्ति है ${pl.cautions.hi}।`;
            }
        ]);
    }

    // --- Supporting houses, condensed into one topic ---
    const others = dom.houses.filter((h) => h !== primary);
    if (others.length) {
        add('supporting_houses', 'house',
            'The Supporting Houses', 'सहायक भाव', [
            (l) => {
                const bits = others.map((h) => {
                    const hs = analysis.scores.houses[h];
                    return l === 'en'
                        ? `the ${ORD(h, l)} (${houseTheme(h, l)}) at ${hs.score}, ruled by ${P(hs.lord, l)} from your ${ORD(hs.lordHouse, l)} house`
                        : `${ORD(h, l)} भाव (${houseTheme(h, l)}) ${hs.score} अंक, स्वामी ${P(hs.lord, l)} जो आपके ${ORD(hs.lordHouse, l)} भाव में है`;
                });
                return l === 'en'
                    ? `Beyond the main house, this area also draws on ${joinList(bits, l)}.`
                    : `मुख्य भाव के अतिरिक्त यह क्षेत्र ${joinList(bits, l)} पर भी निर्भर करता है।`;
            },
            (l) => {
                const best = others.map((h) => analysis.scores.houses[h]).sort((a, b) => b.score - a.score)[0];
                if (!best) return '';
                return l === 'en'
                    ? `Of these, the ${ORD(best.house, l)} is the most supportive. ${reasonsSentence(best.reasons, { savBand: best.savBand, lord: best.lord, lordBand: best.lordScore >= 60 ? 'strong' : best.lordScore >= 45 ? 'moderate' : 'weak' }, l, 2)}`
                    : `इनमें ${ORD(best.house, l)} भाव सबसे सहायक है। ${reasonsSentence(best.reasons, { savBand: best.savBand, lord: best.lord, lordBand: best.lordScore >= 60 ? 'strong' : best.lordScore >= 45 ? 'moderate' : 'weak' }, l, 2)}`;
            }
        ]);
    }

    // --- Yogas specific to this area ---
    if (dom.yogas.length || dom.challenges.length) {
        add('yogas', 'yogas', 'Combinations Affecting This Area', 'इस क्षेत्र को प्रभावित करने वाले योग', [
            (l) => {
                if (!dom.yogas.length) return '';
                const y = dom.yogas[0];
                const desc = yogaDescription(y.key, reg, l);
                const planets = joinList((y.planets || []).map((p) => P(p, l)), l);
                return l === 'en'
                    ? `${YN(y, l)} applies here, formed by ${planets}${desc ? ` - ${desc}` : '.'}`
                    : `यहाँ ${YN(y, l)} लागू होता है, जो ${planets} से बनता है${desc ? ` - ${desc}` : '।'}`;
            },
            (l) => {
                if (dom.yogas.length < 2) return '';
                return l === 'en'
                    ? `${joinList(dom.yogas.slice(1).map((y) => YN(y, l)), l)} also touch${dom.yogas.length === 2 ? 'es' : ''} this part of the chart.`
                    : `${joinList(dom.yogas.slice(1).map((y) => YN(y, l)), l)} भी कुंडली के इस भाग को छूते हैं।`;
            },
            (l) => {
                if (!dom.challenges.length) return '';
                const c = dom.challenges[0];
                const desc = yogaDescription(c.key, reg, l);
                return l === 'en'
                    ? (desc ? `Working against it is ${YN(c, l)} - ${desc}` : '')
                    : (desc ? `इसके विरुद्ध कार्य कर रहा है ${YN(c, l)} - ${desc}` : '');
            }
        ]);
    }

    // --- Timing for this area ---
    if (analysis.dasha && analysis.dasha.maha) {
        const dz = analysis.dasha;
        add('timing', 'timing', 'Timing: What This Period Means Here', 'समय: यह दशा यहाँ क्या कहती है', [
            (l) => {
                const m = dz.maha.planet;
                const mp = chart.planets[m];
                const owns = (mp.ownedHouses || []);
                const relevant = owns.filter((h) => dom.houses.includes(h));
                const inArea = dom.houses.includes(mp.house);
                let link;
                if (relevant.length) {
                    link = l === 'en'
                        ? `${P(m, l)}, the lord of your current Mahadasha, also rules your ${joinList(relevant.map((h) => ORD(h, l)), l)} house, which is directly part of this area. ${DOMAIN_LINES[key].dashaOwns.en}`
                        : `${P(m, l)}, जो आपकी वर्तमान महादशा के स्वामी हैं, आपके ${joinList(relevant.map((h) => ORD(h, l)), l)} भाव के भी स्वामी हैं, जो सीधे इसी क्षेत्र का भाग है। ${DOMAIN_LINES[key].dashaOwns.hi}`;
                } else if (inArea) {
                    link = l === 'en'
                        ? `${P(m, l)}, the lord of your current Mahadasha, sits in your ${ORD(mp.house, l)} house, one of the houses governing this area, so the period touches it directly.`
                        : `${P(m, l)}, जो आपकी वर्तमान महादशा के स्वामी हैं, आपके ${ORD(mp.house, l)} भाव में हैं, जो इस क्षेत्र को नियंत्रित करने वाले भावों में से एक है, इसलिए यह दशा इसे सीधे प्रभावित करती है।`;
                } else {
                    link = l === 'en'
                        ? `${P(m, l)}, the lord of your current Mahadasha, neither rules nor occupies the houses that govern this area. ${DOMAIN_LINES[key].dashaQuiet.en}`
                        : `${P(m, l)}, जो आपकी वर्तमान महादशा के स्वामी हैं, इस क्षेत्र को नियंत्रित करने वाले भावों के न स्वामी हैं न उनमें स्थित। ${DOMAIN_LINES[key].dashaQuiet.hi}`;
                }
                return link;
            },
            (l) => {
                const a = dz.antar ? dz.antar.planet : null;
                if (!a) return '';
                const ap = chart.planets[a];
                const owns = (ap.ownedHouses || []).filter((h) => dom.houses.includes(h));
                const until = fmtDate(dz.antarEnd, l);
                if (owns.length) {
                    return l === 'en'
                        ? `The running sub-period belongs to ${P(a, l)}, which rules your ${joinList(owns.map((h) => ORD(h, l)), l)} house here, so this specific window until ${until} is when this area is most active.`
                        : `चल रही अंतर्दशा ${P(a, l)} की है, जो यहाँ आपके ${joinList(owns.map((h) => ORD(h, l)), l)} भाव के स्वामी हैं, इसलिए ${until} तक की यह अवधि इस क्षेत्र के लिए सबसे सक्रिय है।`;
                }
                return l === 'en'
                    ? `The sub-period until ${until} belongs to ${P(a, l)}, which does not directly govern ${meta.subject.en}, so expect steady rather than dramatic movement here during it.`
                    : `${until} तक की अंतर्दशा ${P(a, l)} की है, जो ${meta.subject.hi} को सीधे नियंत्रित नहीं करते, इसलिए इस अवधि में नाटकीय नहीं बल्कि स्थिर गति की अपेक्षा रखें।`;
            },
            (l) => {
                const up = (dz.upcoming || []).filter((u) => {
                    const p = chart.planets[u.planet];
                    return p && ((p.ownedHouses || []).some((h) => dom.houses.includes(h)) || dom.houses.includes(p.house));
                });
                if (!up.length) return '';
                const u = up[0];
                return l === 'en'
                    ? `Looking ahead, the ${P(u.planet, l)} period beginning around ${fmtDate(u.start, l)} connects to this area again and is the next window worth planning around.`
                    : `आगे देखें तो ${fmtDate(u.start, l)} के आसपास आरंभ होने वाली ${P(u.planet, l)} की दशा फिर इस क्षेत्र से जुड़ती है और यही अगली योजना-योग्य अवधि है।`;
            }
        ]);
    }

    // --- Practical guidance aimed at the weakest real factor ---
    const weakFactor = dom.strains.find((f) => f.type === 'karaka' || f.type === 'house');
    const weakPlanet = weakFactor
        ? (weakFactor.planet || (weakFactor.house ? analysis.scores.houses[weakFactor.house].lord : null))
        : null;
    add('guidance', 'guidance', 'What To Do About It', 'इसके लिए क्या करें', [
        (l) => {
            if (!weakPlanet || !V.REMEDIES[weakPlanet]) {
                return l === 'en'
                    ? `Nothing in this area is weak enough to need targeted correction. The useful discipline is simply to keep using the strengths named above during the periods of the planets that carry them.`
                    : `इस क्षेत्र में कुछ भी इतना कमज़ोर नहीं कि विशेष उपाय चाहिए। उपयोगी अनुशासन बस इतना है कि ऊपर बताई गई शक्तियों का उपयोग उन्हीं ग्रहों की दशाओं में करते रहें।`;
            }
            const r = V.REMEDIES[weakPlanet];
            // The same planet is often the weak link in more than one area.
            // Spell the remedy out once, then simply point back to it.
            if (!reg.first('remedy_' + weakPlanet + '_' + l)) {
                return l === 'en'
                    ? `${P(weakPlanet, l)} is the weak link here too, so the same support described earlier applies to this area as well.`
                    : `यहाँ भी कमज़ोर कड़ी ${P(weakPlanet, l)} ही है, इसलिए ऊपर बताया गया वही उपाय इस क्षेत्र पर भी लागू होता है।`;
            }
            return l === 'en'
                ? `The factor most worth strengthening here is ${P(weakPlanet, l)}. The traditional support is the mantra "${r.mantra.en}", observed on ${r.day.en}, with charity of ${r.charity.en}. More practically: ${r.habit.en}.`
                : `यहाँ सबसे अधिक बल देने योग्य कारक है ${P(weakPlanet, l)}। परंपरागत उपाय है मंत्र "${r.mantra.hi}", ${r.day.hi} को, और ${r.charity.hi} का दान। व्यावहारिक रूप से: ${r.habit.hi}।`;
        },
        (l) => {
            if (!weakPlanet) return '';
            // Emitted once per report, not per domain.
            if (!reg.first('gemstone_caution')) return '';
            return V.GEMSTONE_CAUTION[l];
        },
        (l) => {
            // Said once for the whole report, not once in every section.
            if (!reg.first('closing_note_' + l)) return '';
            return l === 'en'
                ? 'A chart shows tendency and timing, not a fixed outcome. The periods named above say when each area is most responsive; what you do inside those windows is what decides the result. To read your own questions against these periods, you can speak to one of our astrologers in the app.'
                : 'कुंडली प्रवृत्ति और समय दिखाती है, निश्चित परिणाम नहीं। ऊपर बताई दशाएँ बताती हैं कि प्रत्येक क्षेत्र कब सबसे अधिक ग्रहणशील है; उन अवधियों में आप क्या करते हैं, वही परिणाम तय करता है। इन दशाओं के संदर्भ में अपने प्रश्नों पर विचार के लिए आप ऐप में हमारे ज्योतिषी से बात कर सकते हैं।';
        }
    ]);

    return {
        key,
        title: meta.title,
        score: dom.score,
        band: dom.band,
        summary: {
            en: topics[0] ? topics[0].paragraphs.en[0] : '',
            hi: topics[0] ? topics[0].paragraphs.hi[0] : ''
        },
        yogas: dom.yogas.map((y) => ({ key: y.key, name: { en: y.name, hi: V.yogaName(y.key, y.name, 'hi') }, notability: y.notability })),
        topics
    };
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------
function composeReport(chart, analysis, opts = {}) {
    const reg = new Registry();
    const name = (opts.name || '').trim();
    const domains = (opts.domains && opts.domains.length ? opts.domains : ['career', 'marriage', 'money', 'health']);

    const report = {
        languages: LANGS,
        overview: buildOverview(chart, analysis, reg, name)
    };
    for (const k of ['career', 'marriage', 'money', 'health']) {
        if (domains.includes(k)) report[k] = buildDomain(chart, analysis, reg, k);
    }
    return report;
}

module.exports = { composeReport, Registry };
