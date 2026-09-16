/**
 * services/kundliAnalysis/strength.js
 *
 * Turns the extracted chart into NUMBERS: a strength score for every planet
 * and every house, plus the supporting reasons behind each score.
 *
 * Why this exists: the old report described placements but never weighed them,
 * so a debilitated combust 8th lord read the same as an exalted yogakaraka in
 * a kendra. Every sentence the narrative layer writes about strength now
 * traces back to a number computed here, and each number carries a list of
 * human-readable reasons so the text can explain itself.
 *
 * Scores are 0-100, centred near 50 for an average planet/house.
 */

'use strict';

const {
    GRAHAS_7, PLANETS, SIGN_LORD, NATURAL_BENEFIC,
    KENDRA, TRIKONA, DUSTHANA, houseFrom
} = require('../kundliExtract');

// Deep exaltation / debilitation signs (Parashari).
const EXALT_SIGN = {
    sun: 'aries', moon: 'taurus', mars: 'capricorn', mercury: 'virgo',
    jupiter: 'cancer', venus: 'pisces', saturn: 'libra', rahu: 'taurus', ketu: 'scorpio'
};
const DEBIL_SIGN = {
    sun: 'libra', moon: 'scorpio', mars: 'cancer', mercury: 'pisces',
    jupiter: 'capricorn', venus: 'virgo', saturn: 'aries', rahu: 'scorpio', ketu: 'taurus'
};
// The planet that is exalted in each sign (used for Neecha Bhanga test 2).
const EXALT_LORD_OF_SIGN = {};
for (const [p, s] of Object.entries(EXALT_SIGN)) if (!EXALT_LORD_OF_SIGN[s]) EXALT_LORD_OF_SIGN[s] = p;

/**
 * Deepthadi avastha -> strength multiplier. The API reports this directly.
 * Deepta (exalted) down to Khala/Kopa (agitated) is a real classical scale.
 */
const DEEPTHADI_SCORE = {
    deepta: 12, swastha: 8, mudita: 8, shanta: 6, shakta: 5,
    peedita: -6, deena: -6, vikla: -8, vikala: -8, khala: -10, kope: -10, kopa: -10
};

/**
 * Baladi avastha -> how much of its promise the planet can actually deliver.
 * BPHS 45.3-4: "One fourth, half, full, negligible and nil are the grades of
 * results" for infant / youth / adolescent / old / dead respectively.
 */
const BALADI_FACTOR = {
    bala: 0.25, kumara: 0.5, yuva: 1, vriddha: 0.125, mrita: 0
};

/**
 * Mean Sarvashtakavarga bindus per house in the upstream API payload.
 * Its total row includes the Ascendant ashtakavarga (337 + 49 = 386 over
 * twelve houses), so the average house carries ~32.2 bindus, not the 28.1 of
 * the classical seven-planet SAV. Scores are measured against this.
 */
const SAV_BASELINE = 32.2;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Neecha Bhanga (cancellation of debilitation).
 * Parashara's core conditions - we deliberately exclude the disputed
 * retrograde/D-9 grounds and report which condition fired.
 */
function neechaBhanga(chart, planetKey) {
    const p = chart.planets[planetKey];
    if (!p || !p.debilitated || !p.sign) return null;

    const dispositor = SIGN_LORD[p.sign];
    const exaltLord = EXALT_LORD_OF_SIGN[p.sign];
    const moonSign = chart.moonSign;
    const reasons = [];

    const inKendraFromLagna = (k) => chart.planets[k] && KENDRA.includes(chart.planets[k].house);
    const inKendraFromMoon = (k) => {
        if (!moonSign || !chart.planets[k] || !chart.planets[k].sign) return false;
        return KENDRA.includes(houseFrom(moonSign, chart.planets[k].sign));
    };

    if (dispositor && (inKendraFromLagna(dispositor) || inKendraFromMoon(dispositor))) {
        reasons.push({ code: 'dispositor_kendra', dispositor });
    }
    if (exaltLord && (inKendraFromLagna(exaltLord) || inKendraFromMoon(exaltLord))) {
        reasons.push({ code: 'exalt_lord_kendra', exaltLord });
    }
    if (dispositor && chart.planets[dispositor] && chart.planets[dispositor].house === p.house) {
        reasons.push({ code: 'with_dispositor', dispositor });
    }
    if (dispositor && (p.aspectedBy || []).includes(dispositor)) {
        reasons.push({ code: 'aspected_by_dispositor', dispositor });
    }
    // Mutual exchange between the debilitated planet and its dispositor
    if (dispositor && chart.planets[dispositor]) {
        const dsign = chart.planets[dispositor].sign;
        if (dsign && SIGN_LORD[dsign] === planetKey) reasons.push({ code: 'exchange_with_dispositor', dispositor });
    }

    if (!reasons.length) return null;
    // It becomes a true Raja Yoga only if the planet itself sits in a kendra or trikona.
    const rajaYoga = KENDRA.includes(p.house) || TRIKONA.includes(p.house);
    return { cancelled: true, reasons, rajaYoga, dispositor, exaltLord };
}

/**
 * Composite strength of one planet, 0-100, with the reasons that produced it.
 */
function planetStrength(chart, key) {
    const p = chart.planets[key];
    if (!p) return null;

    const reasons = [];
    let score = 50;
    const add = (delta, code, detail) => {
        if (!delta) return;
        score += delta;
        reasons.push({ code, delta: round1(delta), ...(detail || {}) });
    };

    // --- dignity in the rashi ---
    const nb = neechaBhanga(chart, key);
    if (p.exalted) add(22, 'exalted');
    else if (p.moolTrikona) add(18, 'moolatrikona');
    else if (p.ownSign) add(16, 'own_sign');
    else if (p.debilitated) {
        add(-24, 'debilitated');
        if (nb) add(20, 'neecha_bhanga', { rajaYoga: nb.rajaYoga });
    } else if (typeof p.signRelation === 'number') {
        // API's panchadha relation with the sign lord: -2..+2
        const map = { 2: 11, 1: 6, 0: 0, [-1]: -6, [-2]: -11 };
        const d = map[p.signRelation];
        if (d) add(d, d > 0 ? 'friendly_sign' : 'enemy_sign', { relation: p.signRelation });
    }

    // --- afflictions and boosts to the planet itself ---
    if (p.combust) add(key === 'venus' || key === 'saturn' ? -8 : -14, 'combust');
    if (p.retrograde && key !== 'rahu' && key !== 'ketu') add(6, 'retrograde');
    if (p.vargottam) add(10, 'vargottama');

    // --- house placement ---
    if (p.house) {
        if (TRIKONA.includes(p.house)) add(10, 'in_trikona', { house: p.house });
        else if (KENDRA.includes(p.house)) add(8, 'in_kendra', { house: p.house });
        else if (DUSTHANA.includes(p.house)) add(-14, 'in_dusthana', { house: p.house });
        else if (p.house === 11 || p.house === 3) add(4, 'in_upachaya', { house: p.house });
    }

    // --- directional strength (digbala) ---
    const DIGBALA_HOUSE = { jupiter: 1, mercury: 1, sun: 10, mars: 10, moon: 4, venus: 4, saturn: 7 };
    if (DIGBALA_HOUSE[key] === p.house) add(7, 'digbala');

    // --- aspects received ---
    const byBenefic = (p.aspectedBy || []).filter((a) => NATURAL_BENEFIC.has(a));
    const byMalefic = (p.aspectedBy || []).filter((a) => !NATURAL_BENEFIC.has(a));
    if (byBenefic.length) add(Math.min(10, byBenefic.length * 5), 'benefic_aspect', { from: byBenefic });
    if (byMalefic.length) add(-Math.min(10, byMalefic.length * 4), 'malefic_aspect', { from: byMalefic });

    // --- avastha (the API computes these) ---
    if (p.avastha) {
        const dk = String(p.avastha.deepthadi || '').toLowerCase();
        if (DEEPTHADI_SCORE[dk] != null) add(DEEPTHADI_SCORE[dk], 'avastha_' + dk);
    }

    // --- Shadbala as computed upstream ---
    if (p.shadbalaRatio != null) add((p.shadbalaRatio - 0.75) * 22, 'shadbala', { ratio: p.shadbalaRatio });

    // --- how much of the promise it can actually deliver ---
    let deliverable = 1;
    if (p.avastha) {
        const bk = String(p.avastha.baladi || '').toLowerCase();
        if (BALADI_FACTOR[bk] != null) deliverable = BALADI_FACTOR[bk];
    }

    const final = clamp(score, 0, 100);
    return {
        planet: key,
        score: round1(final),
        band: final >= 68 ? 'strong' : final >= 45 ? 'moderate' : 'weak',
        reasons,
        neechaBhanga: nb,
        deliverable,
        functional: p.functional,
        isYogakaraka: p.isYogakaraka
    };
}

/**
 * Composite strength of one house, 0-100.
 * Sarvashtakavarga is the anchor - it is a real per-chart number (usually
 * 25-37) and is the single best objective measure of a house's capacity.
 */
function houseStrength(chart, h, planetScores) {
    const H = chart.houses[h];
    if (!H) return null;

    const reasons = [];
    let score = 50;
    const add = (delta, code, detail) => {
        if (!delta) return;
        score += delta;
        reasons.push({ code, delta: round1(delta), ...(detail || {}) });
    };

    // --- Sarvashtakavarga ---
    // NOTE on the baseline: the classical seven-planet Sarvashtakavarga always
    // totals 337 bindus across the twelve houses (a mean of 28.1). The upstream
    // API's `total` row additionally includes the Ascendant's ashtakavarga, so
    // its rows total 386 and average 32.2 per house. Centring on 28 therefore
    // handed every house a free ~+9, which pushed almost every chart into the
    // "strong" band. We centre on the API's real mean instead.
    if (H.sav != null) {
        add((H.sav - SAV_BASELINE) * 2.2, 'sav', { bindus: H.sav });
    }

    // --- strength of the house lord, and where it sits ---
    const lordScore = planetScores[H.lord] ? planetScores[H.lord].score : null;
    if (lordScore != null) add((lordScore - 50) * 0.35, 'lord_strength', { lord: H.lord, lordScore });
    if (H.lordHouse) {
        if (TRIKONA.includes(H.lordHouse) || KENDRA.includes(H.lordHouse)) add(5, 'lord_well_placed', { lordHouse: H.lordHouse });
        else if (DUSTHANA.includes(H.lordHouse)) add(-10, 'lord_in_dusthana', { lordHouse: H.lordHouse });
    }

    // --- occupants ---
    for (const p of H.occupants) {
        const isBen = NATURAL_BENEFIC.has(p);
        const ps = planetScores[p] ? planetScores[p].score : 50;
        const weight = (ps - 50) / 50;                     // -1 .. +1
        add((isBen ? 7 : -5) + weight * 5, isBen ? 'benefic_occupant' : 'malefic_occupant', { planet: p });
    }

    // --- aspects on the house ---
    const aBen = H.aspectedBy.filter((p) => NATURAL_BENEFIC.has(p));
    const aMal = H.aspectedBy.filter((p) => !NATURAL_BENEFIC.has(p));
    if (aBen.length) add(Math.min(9, aBen.length * 4.5), 'benefic_aspect', { from: aBen });
    if (aMal.length) add(-Math.min(9, aMal.length * 3.5), 'malefic_aspect', { from: aMal });

    // --- papakartari: hemmed between malefics in the 12th and 2nd from it ---
    const prev = chart.houses[((h - 2 + 12) % 12) + 1];
    const next = chart.houses[(h % 12) + 1];
    const prevMal = prev && prev.occupants.some((p) => !NATURAL_BENEFIC.has(p));
    const nextMal = next && next.occupants.some((p) => !NATURAL_BENEFIC.has(p));
    if (prevMal && nextMal) add(-8, 'papakartari');
    const prevBen = prev && prev.occupants.some((p) => NATURAL_BENEFIC.has(p));
    const nextBen = next && next.occupants.some((p) => NATURAL_BENEFIC.has(p));
    if (prevBen && nextBen) add(8, 'shubhakartari');

    const final = clamp(score, 0, 100);
    return {
        house: h,
        score: round1(final),
        band: final >= 66 ? 'strong' : final >= 44 ? 'moderate' : 'weak',
        sav: H.sav,
        savBand: H.sav == null ? null : H.sav >= 32 ? 'high' : H.sav >= 28 ? 'above_average' : H.sav >= 25 ? 'average' : 'low',
        lord: H.lord,
        lordHouse: H.lordHouse,
        lordScore,
        occupants: H.occupants,
        aspectedBy: H.aspectedBy,
        reasons
    };
}

/** Score every planet and every house in one pass. */
function scoreChart(chart) {
    const planets = {};
    for (const p of PLANETS) planets[p] = planetStrength(chart, p);

    const houses = {};
    for (let h = 1; h <= 12; h++) houses[h] = houseStrength(chart, h, planets);

    // Rank so the narrative can name the genuinely strongest/weakest factors.
    const planetRanking = GRAHAS_7.slice().sort((a, b) => planets[b].score - planets[a].score);
    const houseRanking = Object.keys(houses).map(Number).sort((a, b) => houses[b].score - houses[a].score);

    return { planets, houses, planetRanking, houseRanking };
}

module.exports = {
    scoreChart, planetStrength, houseStrength, neechaBhanga,
    EXALT_SIGN, DEBIL_SIGN, EXALT_LORD_OF_SIGN
};
