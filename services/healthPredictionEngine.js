/**
 * healthPredictionEngine.js
 *
 * Fast, deterministic lookup/composition engine over the Health Astrology
 * Dataset (data/astrology/health/*.json). Mirrors moneyPredictionEngine.js,
 * but uses THREE significator houses - 6th (Roga/disease), 8th (Ayu/chronic-
 * longevity), and 12th (Vyaya/hospitalization) - instead of one or two.
 * NO AI/LLM calls happen here - every prediction comes purely from our own
 * precomputed dataset via O(1) key look-ups.
 *
 * Factors covered:
 *   1. Lagna lord + the house it occupies                 -> lagnaLordInHouse.json
 *   2. 6th lord (Roga) + its house                          -> sixthLordInHouse.json
 *   2b. 8th lord (Ayu) + its house                            -> eighthLordInHouse.json
 *   2c. 12th lord (Vyaya) + its house                         -> twelfthLordInHouse.json
 *   3. Planets sitting in the 1st house                     -> planetInHouse1.json
 *   4. Planets sitting in the 6th house                      -> planetInHouse6.json
 *   4b. Planets sitting in the 8th house                      -> planetInHouse8.json
 *   4c. Planets sitting in the 12th house                     -> planetInHouse12.json
 *   5. Conjunctions + classical/lagna-aware Yogas in the      -> conjunctions.json,
 *        1st, 6th, 8th, and 12th house                            classicalPairYogas.json,
 *                                                                  firstHouseConjunctionYogas.json,
 *                                                                  sixthHouseConjunctionYogas.json,
 *                                                                  eighthHouseConjunctionYogas.json,
 *                                                                  twelfthHouseConjunctionYogas.json
 *   6. Lagna/6th/8th/12th lords' placement in Navamsa (D-9),  -> lagnaLordInNavamsa(House).json,
 *        by SIGN and by HOUSE NUMBER                              sixthLordInNavamsa(House).json,
 *                                                                  eighthLordInNavamsa(House).json,
 *                                                                  twelfthLordInNavamsa(House).json
 *
 * Usage:
 *   const { analyzeHealth } = require('./services/healthPredictionEngine');
 *   const result = analyzeHealth({
 *     lagna: 'aries',
 *     lagnaLordHouse: 6,
 *     sixthLordHouse: 1,
 *     eighthLordHouse: 8,
 *     twelfthLordHouse: 12,
 *     planetsInHouse1: ['mars'],
 *     planetsInHouse6: ['mercury'],
 *     planetsInHouse8: ['saturn'],
 *     planetsInHouse12: ['jupiter'],
 *     conjunctions: [ { planets: ['saturn', 'jupiter'], house: 8 } ],
 *     navamsaLagnaSign: 'cancer',
 *     lagnaLordNavamsaSign: 'leo',
 *     sixthLordNavamsaSign: 'virgo',
 *     eighthLordNavamsaSign: 'scorpio',
 *     twelfthLordNavamsaSign: 'pisces'
 *   });
 */

'use strict';

const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'astrology', 'health');

const planets = require(path.join(DATA_DIR, 'planets.json'));
const rashis = require(path.join(DATA_DIR, 'rashis.json'));
const houses = require(path.join(DATA_DIR, 'houses.json'));
const lagnaBase = require(path.join(DATA_DIR, 'lagnaBase.json'));
const lagnaLordInHouse = require(path.join(DATA_DIR, 'lagnaLordInHouse.json'));
const sixthLordInHouse = require(path.join(DATA_DIR, 'sixthLordInHouse.json'));
const eighthLordInHouse = require(path.join(DATA_DIR, 'eighthLordInHouse.json'));
const twelfthLordInHouse = require(path.join(DATA_DIR, 'twelfthLordInHouse.json'));
const planetInHouse1 = require(path.join(DATA_DIR, 'planetInHouse1.json'));
const planetInHouse6 = require(path.join(DATA_DIR, 'planetInHouse6.json'));
const planetInHouse8 = require(path.join(DATA_DIR, 'planetInHouse8.json'));
const planetInHouse12 = require(path.join(DATA_DIR, 'planetInHouse12.json'));
const conjunctions = require(path.join(DATA_DIR, 'conjunctions.json'));
const classicalPairYogas = require(path.join(DATA_DIR, 'classicalPairYogas.json'));
const firstHouseConjunctionYogas = require(path.join(DATA_DIR, 'firstHouseConjunctionYogas.json'));
const sixthHouseConjunctionYogas = require(path.join(DATA_DIR, 'sixthHouseConjunctionYogas.json'));
const eighthHouseConjunctionYogas = require(path.join(DATA_DIR, 'eighthHouseConjunctionYogas.json'));
const twelfthHouseConjunctionYogas = require(path.join(DATA_DIR, 'twelfthHouseConjunctionYogas.json'));
const lagnaLordInNavamsa = require(path.join(DATA_DIR, 'lagnaLordInNavamsa.json'));
const sixthLordInNavamsa = require(path.join(DATA_DIR, 'sixthLordInNavamsa.json'));
const eighthLordInNavamsa = require(path.join(DATA_DIR, 'eighthLordInNavamsa.json'));
const twelfthLordInNavamsa = require(path.join(DATA_DIR, 'twelfthLordInNavamsa.json'));
const lagnaLordInNavamsaHouse = require(path.join(DATA_DIR, 'lagnaLordInNavamsaHouse.json'));
const sixthLordInNavamsaHouse = require(path.join(DATA_DIR, 'sixthLordInNavamsaHouse.json'));
const eighthLordInNavamsaHouse = require(path.join(DATA_DIR, 'eighthLordInNavamsaHouse.json'));
const twelfthLordInNavamsaHouse = require(path.join(DATA_DIR, 'twelfthLordInNavamsaHouse.json'));

const VALID_PLANETS = new Set(Object.keys(planets));
const VALID_RASHIS = new Set(Object.keys(rashis));

function conjunctionKey(a, b) {
    const order = (p) => (planets[p] && planets[p].order) || 99;
    const [x, y] = [a, b].sort((p, q) => order(p) - order(q));
    return `${x}_${y}`;
}

function computeNavamsaHouse(navamsaLagnaSign, planetNavamsaSign) {
    if (!VALID_RASHIS.has(navamsaLagnaSign) || !VALID_RASHIS.has(planetNavamsaSign)) return null;
    const lagnaOrder = rashis[navamsaLagnaSign].order;
    const planetOrder = rashis[planetNavamsaSign].order;
    return ((planetOrder - lagnaOrder + 12) % 12) + 1;
}

// ---------------------------------------------------------------------------
// In-memory inverted index for fast full-text search across the whole dataset.
// ---------------------------------------------------------------------------

const ALL_TABLES = {
    lagnaLordInHouse,
    sixthLordInHouse,
    eighthLordInHouse,
    twelfthLordInHouse,
    planetInHouse1,
    planetInHouse6,
    planetInHouse8,
    planetInHouse12,
    conjunctions,
    classicalPairYogas,
    firstHouseConjunctionYogas,
    sixthHouseConjunctionYogas,
    eighthHouseConjunctionYogas,
    twelfthHouseConjunctionYogas,
    lagnaLordInNavamsa,
    sixthLordInNavamsa,
    eighthLordInNavamsa,
    twelfthLordInNavamsa,
    lagnaLordInNavamsaHouse,
    sixthLordInNavamsaHouse,
    eighthLordInNavamsaHouse,
    twelfthLordInNavamsaHouse
};

const searchIndex = new Map();

function tokenize(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2);
}

function buildSearchIndex() {
    Object.entries(ALL_TABLES).forEach(([tableName, table]) => {
        Object.entries(table).forEach(([key, row]) => {
            const location = `${tableName}:${key}`;
            const words = new Set([
                ...tokenize(row.text && row.text.en),
                ...tokenize(row.text && row.text.hi)
            ]);
            words.forEach((word) => {
                if (!searchIndex.has(word)) searchIndex.set(word, new Set());
                searchIndex.get(word).add(location);
            });
        });
    });
}
buildSearchIndex();

function searchHealthDataset(query, { limit = 20 } = {}) {
    const words = tokenize(query);
    if (words.length === 0) return [];

    let matchingLocations = null;
    words.forEach((word) => {
        const locs = searchIndex.get(word) || new Set();
        matchingLocations = matchingLocations === null ? new Set(locs) : intersect(matchingLocations, locs);
    });

    const results = [];
    for (const location of matchingLocations || []) {
        const [tableName, key] = location.split(':');
        results.push({ table: tableName, ...ALL_TABLES[tableName][key] });
        if (results.length >= limit) break;
    }
    return results;
}

function intersect(setA, setB) {
    const out = new Set();
    for (const item of setA) if (setB.has(item)) out.add(item);
    return out;
}

// ---------------------------------------------------------------------------
// Reference getters (O(1))
// ---------------------------------------------------------------------------

function getLagnaBase(lagna) {
    if (!VALID_RASHIS.has(lagna)) return null;
    return lagnaBase[lagna];
}

function getPlanetMeta(planet) { return planets[planet] || null; }
function getRashiMeta(rashi) { return rashis[rashi] || null; }

// ---------------------------------------------------------------------------
// Core composition: analyzeHealth(input) -> full bilingual health reading
// ---------------------------------------------------------------------------

/**
 * @param {Object} input
 * @param {string} input.lagna                       rashi key, e.g. 'aries'
 * @param {number} input.lagnaLordHouse              1-12: house the Lagna lord sits in (D-1)
 * @param {number} input.sixthLordHouse              1-12: house the 6th lord sits in (D-1)
 * @param {number} input.eighthLordHouse             1-12: house the 8th lord sits in (D-1)
 * @param {number} input.twelfthLordHouse            1-12: house the 12th lord sits in (D-1)
 * @param {string[]} [input.planetsInHouse1]         graha keys sitting in the 1st house
 * @param {string[]} [input.planetsInHouse6]         graha keys sitting in the 6th house
 * @param {string[]} [input.planetsInHouse8]         graha keys sitting in the 8th house
 * @param {string[]} [input.planetsInHouse12]        graha keys sitting in the 12th house
 * @param {Array} [input.conjunctions]               array of either [planetA, planetB] or
 *                                                     { planets: [planetA, planetB], house?: 1|6|8|12|other }.
 *                                                     house 1, 6, 8, or 12 triggers lagna-aware Yoga detection.
 * @param {string} [input.navamsaLagnaSign]          rashi key: the Navamsa chart's own Ascendant sign
 * @param {string} [input.lagnaLordNavamsaSign]      rashi key: sign the Lagna lord occupies in D-9
 * @param {string} [input.sixthLordNavamsaSign]      rashi key: sign the 6th lord occupies in D-9
 * @param {string} [input.eighthLordNavamsaSign]     rashi key: sign the 8th lord occupies in D-9
 * @param {string} [input.twelfthLordNavamsaSign]    rashi key: sign the 12th lord occupies in D-9
 */
function analyzeHealth(input = {}) {
    const errors = [];
    const {
        lagna,
        lagnaLordHouse,
        sixthLordHouse,
        eighthLordHouse,
        twelfthLordHouse,
        planetsInHouse1 = [],
        planetsInHouse6 = [],
        planetsInHouse8 = [],
        planetsInHouse12 = [],
        conjunctions: conjunctionInputs = [],
        navamsaLagnaSign,
        lagnaLordNavamsaSign,
        sixthLordNavamsaSign,
        eighthLordNavamsaSign,
        twelfthLordNavamsaSign
    } = input;

    if (!VALID_RASHIS.has(lagna)) errors.push(`Invalid or missing "lagna". Expected one of: ${[...VALID_RASHIS].join(', ')}`);
    if (!Number.isInteger(lagnaLordHouse) || lagnaLordHouse < 1 || lagnaLordHouse > 12) errors.push('Invalid or missing "lagnaLordHouse" (expected 1-12)');
    if (!Number.isInteger(sixthLordHouse) || sixthLordHouse < 1 || sixthLordHouse > 12) errors.push('Invalid or missing "sixthLordHouse" (expected 1-12)');
    if (!Number.isInteger(eighthLordHouse) || eighthLordHouse < 1 || eighthLordHouse > 12) errors.push('Invalid or missing "eighthLordHouse" (expected 1-12)');
    if (!Number.isInteger(twelfthLordHouse) || twelfthLordHouse < 1 || twelfthLordHouse > 12) errors.push('Invalid or missing "twelfthLordHouse" (expected 1-12)');

    planetsInHouse1.forEach((p) => { if (!VALID_PLANETS.has(p)) errors.push(`Invalid planet in planetsInHouse1: ${p}`); });
    planetsInHouse6.forEach((p) => { if (!VALID_PLANETS.has(p)) errors.push(`Invalid planet in planetsInHouse6: ${p}`); });
    planetsInHouse8.forEach((p) => { if (!VALID_PLANETS.has(p)) errors.push(`Invalid planet in planetsInHouse8: ${p}`); });
    planetsInHouse12.forEach((p) => { if (!VALID_PLANETS.has(p)) errors.push(`Invalid planet in planetsInHouse12: ${p}`); });

    const normalizedConjunctions = conjunctionInputs.map((c) => (Array.isArray(c) ? { planets: c, house: undefined } : c));
    normalizedConjunctions.forEach((c) => {
        const pair = c && c.planets;
        if (!Array.isArray(pair) || pair.length !== 2 || !VALID_PLANETS.has(pair[0]) || !VALID_PLANETS.has(pair[1])) {
            errors.push(`Invalid conjunction entry: ${JSON.stringify(c)}`);
        }
    });

    [navamsaLagnaSign, lagnaLordNavamsaSign, sixthLordNavamsaSign, eighthLordNavamsaSign, twelfthLordNavamsaSign].forEach((sign) => {
        if (sign !== undefined && !VALID_RASHIS.has(sign)) errors.push(`Invalid rashi for navamsa sign: ${sign}`);
    });

    if (errors.length) {
        return { success: false, errors };
    }

    const base = getLagnaBase(lagna);
    const sections = [];

    // 1. Lagna lord placement (D-1)
    sections.push({ section: 'lagnaLordPlacement', ...lagnaLordInHouse[`${base.lagnaLord}_${lagnaLordHouse}`] });

    // 2. 6th, 8th & 12th lord placement (D-1)
    sections.push({ section: 'sixthLordPlacement', ...sixthLordInHouse[`${base.sixthLord}_${sixthLordHouse}`] });
    sections.push({ section: 'eighthLordPlacement', ...eighthLordInHouse[`${base.eighthLord}_${eighthLordHouse}`] });
    sections.push({ section: 'twelfthLordPlacement', ...twelfthLordInHouse[`${base.twelfthLord}_${twelfthLordHouse}`] });

    // 3-4. Planets in 1st, 6th, 8th, 12th house
    planetsInHouse1.forEach((p) => sections.push({ section: 'planetInHouse1', ...planetInHouse1[p] }));
    planetsInHouse6.forEach((p) => sections.push({ section: 'planetInHouse6', ...planetInHouse6[p] }));
    planetsInHouse8.forEach((p) => sections.push({ section: 'planetInHouse8', ...planetInHouse8[p] }));
    planetsInHouse12.forEach((p) => sections.push({ section: 'planetInHouse12', ...planetInHouse12[p] }));

    // 5. Conjunctions - generic meaning + classical (lagna-independent) named Yoga
    //    + lagna-aware Raja/Dhana/Vipreet-Raja Yoga when the conjunction is in H1, H6, H8 or H12.
    const HOUSE_YOGA_TABLES = { 1: firstHouseConjunctionYogas, 6: sixthHouseConjunctionYogas, 8: eighthHouseConjunctionYogas, 12: twelfthHouseConjunctionYogas };
    const HOUSE_YOGA_SECTION = { 1: 'firstHouseYoga', 6: 'sixthHouseYoga', 8: 'eighthHouseYoga', 12: 'twelfthHouseYoga' };
    normalizedConjunctions.forEach(({ planets: pair, house }) => {
        const [a, b] = pair;
        const key = conjunctionKey(a, b);

        sections.push({ section: 'conjunction', ...conjunctions[key] });
        sections.push({ section: 'classicalPairYoga', ...classicalPairYogas[key] });

        if (house === 1 || house === 6 || house === 8 || house === 12) {
            sections.push({ section: HOUSE_YOGA_SECTION[house], ...HOUSE_YOGA_TABLES[house][`${lagna}_${key}`] });
        }
    });

    // 6. Lagna/6th/8th/12th lords' placement in Navamsa (D-9) - by sign, and by house-number
    if (lagnaLordNavamsaSign) {
        sections.push({ section: 'lagnaLordNavamsaSign', ...lagnaLordInNavamsa[`${base.lagnaLord}_${lagnaLordNavamsaSign}`] });
        if (navamsaLagnaSign) {
            const house = computeNavamsaHouse(navamsaLagnaSign, lagnaLordNavamsaSign);
            sections.push({ section: 'lagnaLordNavamsaHouse', navamsaHouseComputed: house, ...lagnaLordInNavamsaHouse[`${base.lagnaLord}_${house}`] });
        }
    }
    if (sixthLordNavamsaSign) {
        sections.push({ section: 'sixthLordNavamsaSign', ...sixthLordInNavamsa[`${base.sixthLord}_${sixthLordNavamsaSign}`] });
        if (navamsaLagnaSign) {
            const house = computeNavamsaHouse(navamsaLagnaSign, sixthLordNavamsaSign);
            sections.push({ section: 'sixthLordNavamsaHouse', navamsaHouseComputed: house, ...sixthLordInNavamsaHouse[`${base.sixthLord}_${house}`] });
        }
    }
    if (eighthLordNavamsaSign) {
        sections.push({ section: 'eighthLordNavamsaSign', ...eighthLordInNavamsa[`${base.eighthLord}_${eighthLordNavamsaSign}`] });
        if (navamsaLagnaSign) {
            const house = computeNavamsaHouse(navamsaLagnaSign, eighthLordNavamsaSign);
            sections.push({ section: 'eighthLordNavamsaHouse', navamsaHouseComputed: house, ...eighthLordInNavamsaHouse[`${base.eighthLord}_${house}`] });
        }
    }
    if (twelfthLordNavamsaSign) {
        sections.push({ section: 'twelfthLordNavamsaSign', ...twelfthLordInNavamsa[`${base.twelfthLord}_${twelfthLordNavamsaSign}`] });
        if (navamsaLagnaSign) {
            const house = computeNavamsaHouse(navamsaLagnaSign, twelfthLordNavamsaSign);
            sections.push({ section: 'twelfthLordNavamsaHouse', navamsaHouseComputed: house, ...twelfthLordInNavamsaHouse[`${base.twelfthLord}_${house}`] });
        }
    }

    const combinedText = {
        en: sections.map((s) => s.text.en).join('\n\n'),
        hi: sections.map((s) => s.text.hi).join('\n\n')
    };

    return { success: true, input, base, sections, combinedText };
}

module.exports = {
    analyzeHealth,
    searchHealthDataset,
    getLagnaBase,
    getPlanetMeta,
    getRashiMeta,
    computeNavamsaHouse,
    tables: {
        planets,
        rashis,
        houses,
        lagnaBase,
        lagnaLordInHouse,
        sixthLordInHouse,
        eighthLordInHouse,
        twelfthLordInHouse,
        planetInHouse1,
        planetInHouse6,
        planetInHouse8,
        planetInHouse12,
        conjunctions,
        classicalPairYogas,
        firstHouseConjunctionYogas,
        sixthHouseConjunctionYogas,
        eighthHouseConjunctionYogas,
        twelfthHouseConjunctionYogas,
        lagnaLordInNavamsa,
        sixthLordInNavamsa,
        eighthLordInNavamsa,
        twelfthLordInNavamsa,
        lagnaLordInNavamsaHouse,
        sixthLordInNavamsaHouse,
        eighthLordInNavamsaHouse,
        twelfthLordInNavamsaHouse
    }
};
