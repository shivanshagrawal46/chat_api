/**
 * services/kundliAnalysis/index.js
 *
 * The analysis pass. Takes the extracted chart and produces every FACT the
 * narrative layer needs, already weighed and ranked:
 *
 *   - strength scores for all planets and all twelve houses (strength.js)
 *   - yogas and difficult combinations, rarity-gated (yogas.js)
 *   - the Vimshottari period running today, judged for this chart
 *   - a per-domain verdict (career / marriage / money / health) built from the
 *     real significator houses, their lords, occupants, aspects and bindus
 *   - the handful of factors that actually drive each verdict, so the report
 *     can say WHY instead of reciting placements
 *
 * Nothing here produces prose.
 */

'use strict';

const {
    PLANETS, GRAHAS_7, SIGN_LORD, NATURAL_BENEFIC,
    KENDRA, TRIKONA, DUSTHANA, houseFrom
} = require('../kundliExtract');
const { scoreChart } = require('./strength');
const { detectYogas } = require('./yogas');

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Domains and the houses that actually govern them.
 * Each significator house carries a weight - the 10th matters more to career
 * than the 6th does, and the 7th dominates marriage.
 */
const DOMAINS = {
    career: {
        houses: [{ h: 10, w: 1 }, { h: 6, w: 0.45 }, { h: 2, w: 0.3 }, { h: 11, w: 0.4 }],
        karaka: ['sun', 'saturn', 'mercury'],
        jaimini: 'Amatyakaraka',
        divisional: 'd10House'
    },
    marriage: {
        houses: [{ h: 7, w: 1 }, { h: 2, w: 0.35 }, { h: 4, w: 0.25 }, { h: 12, w: 0.3 }],
        karaka: ['venus', 'jupiter'],
        jaimini: 'Darakaraka',
        divisional: 'd9House'
    },
    money: {
        houses: [{ h: 2, w: 0.9 }, { h: 11, w: 1 }, { h: 9, w: 0.5 }, { h: 5, w: 0.35 }],
        karaka: ['jupiter', 'venus'],
        jaimini: null,
        divisional: null
    },
    health: {
        houses: [{ h: 1, w: 1 }, { h: 6, w: 0.7 }, { h: 8, w: 0.5 }, { h: 12, w: 0.4 }],
        karaka: ['sun', 'moon', 'mars'],
        jaimini: null,
        divisional: null
    }
};

/**
 * How the currently running dasha reads for this chart.
 * A period is judged by the lord's functional nature, its house, its strength
 * and how the antardasha lord sits relative to the mahadasha lord.
 */
function analyseDasha(chart, scores) {
    const d = chart.dasha;
    if (!d || !d.current) return null;
    const cur = d.current;
    const P = chart.planets;
    const S = scores.planets;

    const judge = (key) => {
        if (!key || !P[key]) return null;
        const pl = P[key];
        const st = S[key] ? S[key].score : 50;
        let score = (st - 50) * 0.6;
        const notes = [];

        if (pl.isYogakaraka) { score += 18; notes.push('yogakaraka'); }
        else if (pl.functional === 'benefic') { score += 10; notes.push('functional_benefic'); }
        else if (pl.functional === 'malefic') { score -= 10; notes.push('functional_malefic'); }
        else if (pl.functional === 'mixed') notes.push('mixed_lordship');

        if (pl.house) {
            if (TRIKONA.includes(pl.house)) { score += 10; notes.push('in_trikona'); }
            else if (KENDRA.includes(pl.house)) { score += 7; notes.push('in_kendra'); }
            else if (DUSTHANA.includes(pl.house)) { score -= 12; notes.push('in_dusthana'); }
        }
        // The nakshatra dispositor colours how the promise is actually delivered.
        const disp = pl.nakshatraLord;
        if (disp && S[disp]) score += (S[disp].score - 50) * 0.2;

        return {
            planet: key,
            score: round1(score),
            house: pl.house,
            ownedHouses: pl.ownedHouses,
            functional: pl.functional,
            strength: st,
            nakshatraLord: disp,
            notes
        };
    };

    const maha = judge(cur.maha);
    const antar = judge(cur.antar);

    // Relationship between the two lords matters as much as either alone.
    let relation = null;
    let relationDelta = 0;
    if (maha && antar && cur.maha !== cur.antar && P[cur.maha] && P[cur.antar]) {
        const mh = P[cur.maha].house;
        const ah = P[cur.antar].house;
        if (mh && ah) {
            const diff = ((ah - mh + 12) % 12) + 1;
            if ([1, 4, 7, 10, 5, 9].includes(diff)) { relation = 'supportive'; relationDelta = 8; }
            else if ([6, 8, 12, 2].includes(diff)) { relation = 'strained'; relationDelta = -8; }
            else { relation = 'neutral'; relationDelta = 0; }
        }
    }

    const combined = round1(((maha ? maha.score : 0) * 0.6) + ((antar ? antar.score : 0) * 0.4) + relationDelta);
    const tone = combined >= 8 ? 'favourable' : combined <= -8 ? 'testing' : 'mixed';

    return {
        maha, antar, relation, combined, tone,
        mahaStart: cur.mahaStart, mahaEnd: cur.mahaEnd,
        antarStart: cur.antarStart, antarEnd: cur.antarEnd,
        upcoming: (d.upcoming || []).map((u) => ({
            level: u.level,
            planet: u.planet,
            start: u.start,
            end: u.end,
            judged: judge(u.planet)
        }))
    };
}

/**
 * Per-domain verdict. The score is a weighted blend of the significator
 * houses, their lords and the natural karaka, so it genuinely differs between
 * charts instead of landing on "strong" for everyone.
 */
function analyseDomain(chart, scores, yogaResult, domainKey) {
    const cfg = DOMAINS[domainKey];
    const S = scores.planets;
    const H = scores.houses;
    const P = chart.planets;

    const factors = [];
    let weighted = 0;
    let weightSum = 0;

    for (const { h, w } of cfg.houses) {
        const hs = H[h];
        if (!hs) continue;
        weighted += hs.score * w;
        weightSum += w;
        factors.push({
            type: 'house',
            house: h,
            weight: w,
            score: hs.score,
            band: hs.band,
            sav: hs.sav,
            savBand: hs.savBand,
            lord: hs.lord,
            lordHouse: hs.lordHouse,
            lordScore: hs.lordScore,
            occupants: hs.occupants,
            aspectedBy: hs.aspectedBy,
            reasons: hs.reasons
        });
    }

    // Natural significator (karaka) of the domain.
    for (const k of cfg.karaka) {
        if (!S[k]) continue;
        const w = 0.35;
        weighted += S[k].score * w;
        weightSum += w;
        factors.push({
            type: 'karaka', planet: k, weight: w, score: S[k].score,
            band: S[k].band, house: P[k] ? P[k].house : null, reasons: S[k].reasons
        });
    }

    // Jaimini chara karaka, where the domain has one.
    if (cfg.jaimini && chart.karakas[cfg.jaimini]) {
        const jk = chart.karakas[cfg.jaimini];
        if (S[jk]) {
            const w = 0.2;
            weighted += S[jk].score * w;
            weightSum += w;
            factors.push({ type: 'jaimini', role: cfg.jaimini, planet: jk, weight: w, score: S[jk].score, band: S[jk].band });
        }
    }

    // Yogas that land on this domain's houses.
    const domainHouses = new Set(cfg.houses.map((x) => x.h));
    const relevantYogas = yogaResult.all.filter((y) => {
        if (y.house && domainHouses.has(y.house)) return true;
        if (Array.isArray(y.houses) && y.houses.some((h) => domainHouses.has(h))) return true;
        // A yoga formed by a lord of one of these houses counts too.
        return (y.planets || []).some((p) => P[p] && (P[p].ownedHouses || []).some((h) => domainHouses.has(h)));
    });

    // The base verdict comes from the houses and karakas that actually govern
    // this area. Yogas then ADJUST it within a bounded range - they are not
    // averaged in, because averaging several yogas at 50+ dragged every chart
    // upward and made almost everyone read "strong".
    const base = weightSum ? weighted / weightSum : 50;
    let yogaAdjust = 0;
    for (const y of relevantYogas.slice(0, 6)) {
        yogaAdjust += (y.negative ? -1 : 1) * (y.notability / 10);
        factors.push({
            type: 'yoga', yoga: y.key, name: y.name,
            score: y.negative ? 40 : Math.min(85, 50 + y.notability),
            notability: y.notability, negative: !!y.negative
        });
    }
    yogaAdjust = Math.max(-9, Math.min(9, yogaAdjust));

    const score = round1(Math.max(0, Math.min(100, base + yogaAdjust)));
    // Thresholds calibrated so the three verdicts actually divide the
    // population instead of labelling almost everyone "strong". Measured over
    // randomised charts this lands near 30% strong / 45% mixed / 25% difficult.
    const band = score >= 63 ? 'strong' : score >= 50 ? 'mixed' : 'challenging';

    // What actually drives this verdict, best and worst.
    const ranked = factors.slice().sort((a, b) => b.score - a.score);
    const supports = ranked.filter((f) => f.score >= 58).slice(0, 3);
    const strains = ranked.filter((f) => f.score <= 44).reverse().slice(0, 3);

    return {
        key: domainKey,
        score,
        band,
        factors,
        supports,
        strains,
        yogas: relevantYogas.filter((y) => !y.negative).slice(0, 3),
        challenges: relevantYogas.filter((y) => y.negative).slice(0, 2),
        primaryHouse: cfg.houses[0].h,
        houses: cfg.houses.map((x) => x.h),
        karakas: cfg.karaka
    };
}

/** Doshas, combining what the API flags with our own checks. */
function analyseDoshas(chart, scores, yogaResult) {
    const out = [];
    const P = chart.planets;

    if (chart.doshas.mangal) {
        const mh = P.mars ? P.mars.house : null;
        const severe = [7, 8].includes(mh);
        // Classical cancellations we can check from what we have.
        const cancels = [];
        if (P.mars && (P.mars.ownSign || P.mars.exalted || P.mars.moolTrikona)) cancels.push('mars_dignified');
        if (['cancer', 'leo', 'aries', 'scorpio'].includes(chart.lagnaSign)) cancels.push('lagna_protects');
        if (P.mars && (P.mars.aspectedBy || []).includes('jupiter')) cancels.push('jupiter_aspect');
        if (P.mars && P.mars.house && P.jupiter && P.jupiter.house === P.mars.house) cancels.push('with_jupiter');
        out.push({
            key: 'mangal', name: 'Mangal Dosha', house: mh,
            severity: cancels.length >= 2 ? 'cancelled' : severe ? 'strong' : 'moderate',
            cancellations: cancels, classical: true
        });
    }

    // Sade Sati needs Saturn's CURRENT transit sign, which the birth-chart
    // payload does not contain, so it is reported as not-determined rather
    // than guessed. (The natal Moon sign it is measured from is available.)
    out.push({ key: 'sade_sati', name: 'Sade Sati', status: 'not_computed', reason: 'needs_current_transit', moonSign: chart.moonSign, classical: true });

    for (const y of yogaResult.negative) {
        out.push({ key: y.key, name: y.name, house: y.house, notability: y.notability, classical: y.classical !== false, fromYoga: true });
    }
    return out;
}

/**
 * Full analysis.
 * @param {Object} chart  extractRichChart output
 */
function analyseChart(chart) {
    const scores = scoreChart(chart);
    const yogaResult = detectYogas(chart, scores);
    const dasha = analyseDasha(chart, scores);

    const domains = {};
    for (const key of Object.keys(DOMAINS)) {
        domains[key] = analyseDomain(chart, scores, yogaResult, key);
    }

    // Overall chart shape - used by the opening section.
    const kendraCount = GRAHAS_7.filter((p) => KENDRA.includes(chart.planets[p].house)).length;
    const trikonaCount = GRAHAS_7.filter((p) => TRIKONA.includes(chart.planets[p].house)).length;
    const dusthanaCount = GRAHAS_7.filter((p) => DUSTHANA.includes(chart.planets[p].house)).length;
    const avgPlanet = round1(GRAHAS_7.reduce((a, p) => a + scores.planets[p].score, 0) / GRAHAS_7.length);
    const savTotal = chart.savTotal;

    return {
        scores,
        yogas: yogaResult,
        dasha,
        domains,
        doshas: analyseDoshas(chart, scores, yogaResult),
        shape: {
            kendraCount, trikonaCount, dusthanaCount,
            avgPlanetStrength: avgPlanet,
            savTotal,
            // Sarvashtakavarga over all twelve houses sums to 337 in an average
            // chart; meaningfully above or below that says something real.
            savBand: savTotal == null ? null : savTotal >= 350 ? 'high' : savTotal >= 320 ? 'average' : 'low',
            strongestPlanet: scores.planetRanking[0],
            weakestPlanet: scores.planetRanking[scores.planetRanking.length - 1],
            strongestHouse: scores.houseRanking[0],
            weakestHouse: scores.houseRanking[scores.houseRanking.length - 1]
        }
    };
}

module.exports = { analyseChart, analyseDomain, analyseDasha, DOMAINS };
