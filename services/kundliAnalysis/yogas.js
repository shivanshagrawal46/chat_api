/**
 * services/kundliAnalysis/yogas.js
 *
 * Yoga and dosha detection with RARITY GATING.
 *
 * The old engine announced "Raja Yoga" on almost every chart. That is not a
 * bug in the lookup - it is what the naive rule produces. Published analyses
 * of large birth samples put a kendra-trikona Raja Yoga in ~97.5% of charts,
 * Budha-Aditya in ~50% (Mercury never strays more than 28 degrees from the
 * Sun) and Gaja Kesari in ~33%. Announcing those as special is exactly why
 * every reading felt identical.
 *
 * So each yoga here carries:
 *   - a strict formation test (conjunction/exchange counts for more than a
 *     one-way aspect, and strength gates apply)
 *   - `prevalence`: roughly how often it occurs, used to compute notability
 *   - `strength`: 0-100 from the participating planets
 *
 * The composer then shows only the few highest-notability yogas instead of
 * listing everything, so a chart with a genuine Malavya Yoga reads very
 * differently from one that merely has Sun and Mercury in the same sign.
 *
 * Every entry records `classical: false` where the combination has no basis in
 * Brihat Parashara Hora Shastra (Kaal Sarp in particular), so the app can
 * disclaim it.
 */

'use strict';

const {
    PLANETS, GRAHAS_7, SIGN_LORD, NATURAL_BENEFIC,
    KENDRA, TRIKONA, DUSTHANA, houseFrom
} = require('../kundliExtract');
const { EXALT_SIGN } = require('./strength');

const OWN_SIGNS = {
    sun: ['leo'], moon: ['cancer'], mars: ['aries', 'scorpio'],
    mercury: ['gemini', 'virgo'], jupiter: ['sagittarius', 'pisces'],
    venus: ['taurus', 'libra'], saturn: ['capricorn', 'aquarius']
};

const MAHAPURUSHA = {
    mars: { name: 'Ruchaka', theme: 'courage' },
    mercury: { name: 'Bhadra', theme: 'intellect' },
    jupiter: { name: 'Hamsa', theme: 'wisdom' },
    venus: { name: 'Malavya', theme: 'comfort' },
    saturn: { name: 'Sasa', theme: 'authority' }
};

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * @param {Object} chart    output of extractRichChart
 * @param {Object} scores   output of scoreChart
 */
function detectYogas(chart, scores) {
    const found = [];
    const P = chart.planets;
    const S = scores.planets;
    const lagna = chart.lagnaSign;
    const moonSign = chart.moonSign;

    const strengthOf = (...keys) => {
        const vals = keys.map((k) => (S[k] ? S[k].score : 50));
        return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
    };
    const houseOf = (k) => (P[k] ? P[k].house : null);
    const signOf = (k) => (P[k] ? P[k].sign : null);
    const lordOf = (h) => (chart.houses[h] ? chart.houses[h].lord : null);
    const fromMoon = (k) => (moonSign && signOf(k) ? houseFrom(moonSign, signOf(k)) : null);
    const conjunct = (a, b) => houseOf(a) && houseOf(a) === houseOf(b);
    const aspects = (a, b) => (P[b] && (P[b].aspectedBy || []).includes(a));
    const mutualAspect = (a, b) => aspects(a, b) && aspects(b, a);

    const push = (y) => {
        // notability = how much this deserves to be highlighted
        const rarity = 1 - (y.prevalence != null ? y.prevalence : 0.3);
        const strengthFactor = (y.strength != null ? y.strength : 50) / 100;
        y.notability = round1(rarity * strengthFactor * 100);
        found.push(y);
    };

    // ---------------------------------------------------------------------
    // 1. Pancha Mahapurusha - own or exaltation sign, in a kendra from lagna
    // ---------------------------------------------------------------------
    for (const [p, meta] of Object.entries(MAHAPURUSHA)) {
        const pl = P[p];
        if (!pl || !pl.sign || !pl.house) continue;
        const dignified = OWN_SIGNS[p].includes(pl.sign) || EXALT_SIGN[p] === pl.sign;
        if (!dignified || !KENDRA.includes(pl.house)) continue;

        const afflicted = pl.combust || (pl.aspectedBy || []).some((a) => a === 'rahu' || a === 'ketu');
        push({
            key: 'mahapurusha_' + p,
            name: meta.name + ' Yoga',
            category: 'mahapurusha',
            planets: [p],
            house: pl.house,
            theme: meta.theme,
            strength: strengthOf(p) - (afflicted ? 15 : 0),
            afflicted,
            prevalence: 0.06,
            classical: true,
            detail: { sign: pl.sign, exalted: EXALT_SIGN[p] === pl.sign }
        });
    }

    // ---------------------------------------------------------------------
    // 2. Raja Yogas - STRICTLY gated
    // ---------------------------------------------------------------------
    // A yogakaraka (one planet ruling both a pure kendra and a pure trikona)
    // forms the yoga by itself and is genuinely meaningful.
    for (const p of GRAHAS_7) {
        if (!P[p] || !P[p].isYogakaraka) continue;
        const st = strengthOf(p);
        // Half the lagnas have a yogakaraka at all, so owning the title is not
        // itself remarkable - only a yogakaraka that is actually strong is.
        if (st < 62) continue;
        push({
            key: 'yogakaraka_' + p,
            name: 'Yogakaraka Raja Yoga',
            category: 'raja',
            planets: [p],
            house: P[p].house,
            strength: st,
            prevalence: 0.18,
            classical: true,
            detail: { ownedHouses: P[p].ownedHouses }
        });
    }

    // Dharma-Karmadhipati: 9th and 10th lords linked. Rated the strongest
    // of the ordinary Raja Yogas.
    const l9 = lordOf(9);
    const l10 = lordOf(10);
    if (l9 && l10 && l9 !== l10) {
        let link = null;
        if (conjunct(l9, l10)) link = 'conjunction';
        else if (signOf(l9) && signOf(l10) && SIGN_LORD[signOf(l9)] === l10 && SIGN_LORD[signOf(l10)] === l9) link = 'exchange';
        else if (mutualAspect(l9, l10)) link = 'mutual_aspect';
        if (link) {
            const st = strengthOf(l9, l10);
            push({
                key: 'dharma_karmadhipati',
                name: 'Dharma-Karmadhipati Yoga',
                category: 'raja',
                planets: [l9, l10],
                link,
                house: link === 'conjunction' ? houseOf(l9) : null,
                strength: st,
                prevalence: link === 'mutual_aspect' ? 0.22 : 0.09,
                classical: true
            });
        }
    }

    // General kendra-trikona Raja Yoga: only reported when the connection is a
    // conjunction or an exchange (not a one-way aspect), both lords are at
    // least moderately strong, and the meeting point is not a dusthana.
    const kendraLords = new Set([1, 4, 7, 10].map(lordOf).filter(Boolean));
    const trikonaLords = new Set([1, 5, 9].map(lordOf).filter(Boolean));
    const seenPair = new Set();
    const rajaCandidates = [];
    for (const a of kendraLords) {
        for (const b of trikonaLords) {
            if (a === b) continue;
            const pair = [a, b].sort().join('_');
            if (seenPair.has(pair)) continue;
            seenPair.add(pair);

            let link = null;
            if (conjunct(a, b)) link = 'conjunction';
            else if (signOf(a) && signOf(b) && SIGN_LORD[signOf(a)] === b && SIGN_LORD[signOf(b)] === a) link = 'exchange';
            if (!link) continue;

            const meetHouse = link === 'conjunction' ? houseOf(a) : null;
            if (meetHouse && DUSTHANA.includes(meetHouse)) continue;
            const st = strengthOf(a, b);
            // Both lords must genuinely be in good shape. A "Raja Yoga" formed
            // by two weak or afflicted lords promises nothing in practice.
            if (st < 60) continue;

            rajaCandidates.push({
                key: 'raja_' + pair,
                name: 'Raja Yoga',
                category: 'raja',
                planets: [a, b],
                link,
                house: meetHouse,
                strength: st,
                prevalence: link === 'exchange' ? 0.12 : 0.3,
                classical: true
            });
        }
    }
    // Only the single best general Raja Yoga is worth naming.
    rajaCandidates.sort((x, y) => y.strength - x.strength).slice(0, 1).forEach(push);

    // Neecha Bhanga Raja Yoga
    for (const p of GRAHAS_7) {
        const nb = S[p] && S[p].neechaBhanga;
        if (!nb || !nb.rajaYoga) continue;
        push({
            key: 'neecha_bhanga_' + p,
            name: 'Neecha Bhanga Raja Yoga',
            category: 'raja',
            planets: [p],
            house: houseOf(p),
            strength: strengthOf(p),
            prevalence: 0.08,
            classical: true,
            detail: { reasons: nb.reasons.map((r) => r.code), dispositor: nb.dispositor }
        });
    }

    // ---------------------------------------------------------------------
    // 3. Viparita Raja Yogas - a dusthana lord sitting in a dusthana
    // ---------------------------------------------------------------------
    const VRY = { 6: 'Harsha', 8: 'Sarala', 12: 'Vimala' };
    for (const [h, name] of Object.entries(VRY)) {
        const lord = lordOf(Number(h));
        if (!lord) continue;
        const lh = houseOf(lord);
        if (!lh || !DUSTHANA.includes(lh)) continue;
        // Classical caveat: the yoga is diluted if the dusthana lord is tied
        // to the lords of 1/5/9/10.
        const goodLords = [1, 5, 9, 10].map(lordOf).filter((x) => x && x !== lord);
        const tied = goodLords.some((g) => conjunct(lord, g) || mutualAspect(lord, g));
        push({
            key: 'vry_' + name.toLowerCase(),
            name: name + ' (Viparita Raja) Yoga',
            category: 'viparita',
            planets: [lord],
            house: lh,
            diluted: tied,
            strength: strengthOf(lord) - (tied ? 12 : 0),
            prevalence: 0.16,
            classical: true,
            detail: { dusthanaLordOf: Number(h) }
        });
    }

    // ---------------------------------------------------------------------
    // 4. Parivartana (exchange) yogas
    // ---------------------------------------------------------------------
    const MAHA_HOUSES = [1, 2, 4, 5, 7, 9, 10, 11];
    for (let a = 1; a <= 12; a++) {
        for (let b = a + 1; b <= 12; b++) {
            const la = lordOf(a);
            const lb = lordOf(b);
            if (!la || !lb || la === lb) continue;
            if (houseOf(la) !== b || houseOf(lb) !== a) continue;

            let type, prevalence;
            if (DUSTHANA.includes(a) || DUSTHANA.includes(b)) { type = 'Dainya'; prevalence = 0.2; }
            else if (a === 3 || b === 3) { type = 'Khala'; prevalence = 0.1; }
            else if (MAHA_HOUSES.includes(a) && MAHA_HOUSES.includes(b)) { type = 'Maha'; prevalence = 0.07; }
            else { type = 'Khala'; prevalence = 0.1; }

            push({
                key: `parivartana_${a}_${b}`,
                name: type + ' Parivartana Yoga',
                category: 'parivartana',
                planets: [la, lb],
                houses: [a, b],
                type,
                strength: strengthOf(la, lb),
                prevalence,
                classical: true
            });
        }
    }

    // ---------------------------------------------------------------------
    // 5. Dhana yogas - links between the lords of 1, 2, 5, 9, 11.
    //
    // Deliberately strict. The loose rule (any link, including a one-way or
    // mutual aspect, between any of these five lords) fires more than once per
    // chart on average, which is why wealth yogas used to appear in every
    // report. We require a conjunction or an exchange, a real strength floor,
    // and we deduplicate by PLANET PAIR so one pair of planets that happens to
    // rule several of these houses produces a single yoga, not three.
    // ---------------------------------------------------------------------
    const dhanaHouses = [1, 2, 5, 9, 11];
    const seenDhanaPair = new Set();
    const dhanaCandidates = [];
    for (const a of dhanaHouses) {
        for (const b of dhanaHouses) {
            if (a >= b) continue;
            const la = lordOf(a);
            const lb = lordOf(b);
            if (!la || !lb || la === lb) continue;
            const pairKey = [la, lb].sort().join('_');
            if (seenDhanaPair.has(pairKey)) continue;

            let link = null;
            if (conjunct(la, lb)) link = 'conjunction';
            else if (signOf(la) && signOf(lb) && SIGN_LORD[signOf(la)] === lb && SIGN_LORD[signOf(lb)] === la) link = 'exchange';
            if (!link) continue;

            const st = strengthOf(la, lb);
            if (st < 56) continue;
            const meetHouse = link === 'conjunction' ? houseOf(la) : null;
            if (meetHouse && DUSTHANA.includes(meetHouse)) continue;

            seenDhanaPair.add(pairKey);
            dhanaCandidates.push({
                key: `dhana_${a}_${b}`,
                name: 'Dhana Yoga',
                category: 'dhana',
                planets: [la, lb],
                houses: [a, b],
                link,
                house: meetHouse,
                strength: st,
                prevalence: link === 'exchange' ? 0.08 : 0.22,
                classical: true
            });
        }
    }
    // At most the two best wealth combinations.
    dhanaCandidates.sort((x, y) => y.strength - x.strength).slice(0, 2).forEach(push);

    // Lakshmi Yoga (strict Phaladeepika reading: Venus AND the 9th lord both
    // dignified and both in a kendra or trikona). Genuinely rare.
    if (l9 && P.venus && P[l9]) {
        const dignified = (k) => P[k] && (OWN_SIGNS[k] || []).concat(EXALT_SIGN[k] ? [EXALT_SIGN[k]] : []).includes(P[k].sign);
        const wellPlaced = (k) => P[k] && (KENDRA.includes(P[k].house) || TRIKONA.includes(P[k].house));
        if (dignified('venus') && wellPlaced('venus') && dignified(l9) && wellPlaced(l9)) {
            push({
                key: 'lakshmi',
                name: 'Lakshmi Yoga',
                category: 'dhana',
                planets: ['venus', l9],
                strength: strengthOf('venus', l9),
                prevalence: 0.02,
                classical: true
            });
        }
    }

    // ---------------------------------------------------------------------
    // 6. Lunar yogas
    // ---------------------------------------------------------------------
    if (moonSign) {
        // Gaja Kesari - very common, so we apply the strict BPHS conditions.
        const jFromMoon = fromMoon('jupiter');
        if (jFromMoon && KENDRA.includes(jFromMoon)) {
            const j = P.jupiter;
            const strict = j && !j.combust && !j.debilitated && j.house !== 6;
            if (strict) {
                push({
                    key: 'gaja_kesari',
                    name: 'Gaja Kesari Yoga',
                    category: 'lunar',
                    planets: ['jupiter', 'moon'],
                    strength: strengthOf('jupiter', 'moon'),
                    // ~1 in 3 charts by the bare rule; still common when strict.
                    prevalence: 0.25,
                    classical: true
                });
            }
        }

        // Sunapha / Anapha / Durudhara / Kemadruma
        const inFromMoon = (n) => GRAHAS_7.filter((p) => p !== 'moon' && p !== 'sun' && fromMoon(p) === n);
        const second = inFromMoon(2);
        const twelfth = inFromMoon(12);
        if (second.length && twelfth.length) {
            push({ key: 'durudhara', name: 'Durudhara Yoga', category: 'lunar', planets: second.concat(twelfth), strength: strengthOf('moon'), prevalence: 0.22, classical: true });
        } else if (second.length) {
            push({ key: 'sunapha', name: 'Sunapha Yoga', category: 'lunar', planets: second, strength: strengthOf('moon'), prevalence: 0.3, classical: true });
        } else if (twelfth.length) {
            push({ key: 'anapha', name: 'Anapha Yoga', category: 'lunar', planets: twelfth, strength: strengthOf('moon'), prevalence: 0.3, classical: true });
        } else {
            // Kemadruma - but the classical cancellations fire very often, so
            // we only report it when every one of them fails.
            const cancels = [];
            if (GRAHAS_7.some((p) => p !== 'moon' && KENDRA.includes(houseOf(p)))) cancels.push('planet_in_kendra_from_lagna');
            if (GRAHAS_7.some((p) => p !== 'moon' && KENDRA.includes(fromMoon(p)))) cancels.push('planet_in_kendra_from_moon');
            if (KENDRA.includes(houseOf('moon'))) cancels.push('moon_in_kendra');
            if (['jupiter', 'venus'].some((b) => conjunct('moon', b) || aspects(b, 'moon'))) cancels.push('benefic_with_moon');
            if (P.moon && (P.moon.vargottam || P.moon.exalted)) cancels.push('moon_strong_in_navamsa');
            if (!cancels.length) {
                push({ key: 'kemadruma', name: 'Kemadruma Yoga', category: 'difficult', planets: ['moon'], strength: 100 - strengthOf('moon'), prevalence: 0.04, classical: true, negative: true });
            }
        }

        // Adhi Yoga - all three benefics in the 6th, 7th, 8th from the Moon.
        const benefics = ['jupiter', 'mercury', 'venus'];
        const inAdhi = benefics.filter((b) => [6, 7, 8].includes(fromMoon(b)));
        if (inAdhi.length === 3) {
            push({ key: 'adhi', name: 'Adhi Yoga', category: 'lunar', planets: benefics, strength: strengthOf(...benefics), prevalence: 0.02, classical: true });
        }

        // Shakata - Jupiter in 6/8/12 from the Moon AND the Moon not in a
        // kendra from lagna (the qualifier most calculators drop).
        if ([6, 8, 12].includes(jFromMoon) && !KENDRA.includes(houseOf('moon'))) {
            push({ key: 'shakata', name: 'Shakata Yoga', category: 'difficult', planets: ['jupiter', 'moon'], strength: 100 - strengthOf('jupiter', 'moon'), prevalence: 0.1, classical: true, negative: true });
        }

        // Chandra-Mangal - conjunction only (the defensible strict rule).
        if (conjunct('moon', 'mars')) {
            push({ key: 'chandra_mangal', name: 'Chandra-Mangal Yoga', category: 'dhana', planets: ['moon', 'mars'], house: houseOf('moon'), strength: strengthOf('moon', 'mars'), prevalence: 0.08, classical: true, mixed: true });
        }
    }

    // ---------------------------------------------------------------------
    // 7. Solar yoga - Budha-Aditya. Occurs in roughly half of all charts, so
    //    it is recorded but deliberately given a very low notability, and is
    //    suppressed outright when Mercury is combust (which negates it).
    // ---------------------------------------------------------------------
    if (conjunct('sun', 'mercury') && P.mercury && !P.mercury.combust) {
        push({
            key: 'budha_aditya',
            name: 'Budha-Aditya Yoga',
            category: 'solar',
            planets: ['sun', 'mercury'],
            house: houseOf('sun'),
            strength: strengthOf('sun', 'mercury'),
            prevalence: 0.5,
            classical: true
        });
    }

    // ---------------------------------------------------------------------
    // 8. Difficult combinations
    // ---------------------------------------------------------------------
    // Grahan (eclipse) yoga - a luminary with a node.
    for (const lum of ['sun', 'moon']) {
        for (const node of ['rahu', 'ketu']) {
            if (!conjunct(lum, node)) continue;
            push({
                key: `grahan_${lum}_${node}`,
                name: 'Grahan Yoga',
                category: 'difficult',
                planets: [lum, node],
                house: houseOf(lum),
                strength: 100 - strengthOf(lum),
                prevalence: 0.12,
                classical: true,
                negative: true
            });
        }
    }
    if (conjunct('jupiter', 'rahu')) {
        push({ key: 'guru_chandal', name: 'Guru Chandal Yoga', category: 'difficult', planets: ['jupiter', 'rahu'], house: houseOf('jupiter'), strength: 100 - strengthOf('jupiter'), prevalence: 0.07, classical: true, negative: true });
    }
    if (conjunct('mars', 'rahu')) {
        push({ key: 'angarak', name: 'Angarak Yoga', category: 'difficult', planets: ['mars', 'rahu'], house: houseOf('mars'), strength: 100 - strengthOf('mars'), prevalence: 0.07, classical: true, negative: true });
    }
    if (conjunct('moon', 'saturn')) {
        push({ key: 'vish', name: 'Vish Yoga (Punarphoo)', category: 'difficult', planets: ['moon', 'saturn'], house: houseOf('moon'), strength: 100 - strengthOf('moon'), prevalence: 0.07, classical: true, negative: true });
    }
    // Daridra - the 11th lord (gains) fallen into a dusthana.
    const l11 = lordOf(11);
    if (l11 && DUSTHANA.includes(houseOf(l11))) {
        push({ key: 'daridra', name: 'Daridra Yoga', category: 'difficult', planets: [l11], house: houseOf(l11), strength: 100 - strengthOf(l11), prevalence: 0.2, classical: true, negative: true });
    }

    // Kaal Sarp - all seven classical planets on one side of the nodal axis.
    // Explicitly marked non-classical: it appears in no classical text.
    if (P.rahu && P.ketu && P.rahu.house && P.ketu.house) {
        const rh = P.rahu.house;
        const kh = P.ketu.house;
        const arcHouses = [];
        for (let i = 0, h = rh; i < 12; i++, h = (h % 12) + 1) {
            if (h === kh) break;
            arcHouses.push(h);
        }
        const inside = GRAHAS_7.filter((p) => arcHouses.includes(houseOf(p)));
        const outside = GRAHAS_7.filter((p) => !arcHouses.includes(houseOf(p)) && houseOf(p) !== rh && houseOf(p) !== kh);
        const onAxis = GRAHAS_7.filter((p) => houseOf(p) === rh || houseOf(p) === kh);
        if (outside.length === 0 && inside.length + onAxis.length === 7) {
            const partial = onAxis.length > 0;
            push({
                key: 'kaal_sarp',
                name: (partial ? 'Partial (Anshik) ' : '') + 'Kaal Sarp Yoga',
                category: 'difficult',
                planets: ['rahu', 'ketu'],
                house: rh,
                partial,
                strength: 55,
                prevalence: partial ? 0.12 : 0.04,
                classical: false,           // not found in BPHS - the app should disclaim it
                negative: true
            });
        }
    }

    // Sort: most notable first.
    found.sort((a, b) => b.notability - a.notability);

    const positive = found.filter((y) => !y.negative);
    const negative = found.filter((y) => y.negative);

    return {
        all: found,
        positive,
        negative,
        // What the report should actually highlight.
        headline: positive.filter((y) => y.notability >= 25).slice(0, 4),
        headlineNegative: negative.filter((y) => y.notability >= 25).slice(0, 3)
    };
}

module.exports = { detectYogas, MAHAPURUSHA, OWN_SIGNS };
