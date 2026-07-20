/**
 * moneyPredictionEngine.js
 *
 * Fast, deterministic lookup/composition engine over the Money/Wealth
 * Astrology Dataset (data/astrology/money/*.json). Mirrors
 * careerPredictionEngine.js / marriagePredictionEngine.js, but uses BOTH the
 * 2nd house/2nd lord (Dhana - accumulated wealth) AND the 11th house/11th
 * lord (Labha - gains/income) as significators, instead of a single house.
 * NO AI/LLM calls happen here - every prediction comes purely from our own
 * precomputed dataset via O(1) key look-ups.
 *
 * Factors covered:
 *   1. Lagna lord + the house it occupies                -> lagnaLordInHouse.json
 *   2. 2nd lord (Dhana) + its house                        -> secondLordInHouse.json
 *   2b. 11th lord (Labha) + its house                       -> eleventhLordInHouse.json
 *   3. Planets sitting in the 1st house                    -> planetInHouse1.json
 *   4. Planets sitting in the 2nd house                    -> planetInHouse2.json
 *   4b. Planets sitting in the 11th house                   -> planetInHouse11.json
 *   5. Conjunctions + classical/lagna-aware Yogas in the    -> conjunctions.json,
 *        1st, 2nd, and 11th house                              classicalPairYogas.json,
 *                                                                firstHouseConjunctionYogas.json,
 *                                                                secondHouseConjunctionYogas.json,
 *                                                                eleventhHouseConjunctionYogas.json
 *   6. Lagna/2nd/11th lords' placement in Navamsa (D-9),    -> lagnaLordInNavamsa(House).json,
 *        by SIGN and by HOUSE NUMBER                            secondLordInNavamsa(House).json,
 *                                                                eleventhLordInNavamsa(House).json
 *
 * Usage:
 *   const { analyzeMoney } = require('./services/moneyPredictionEngine');
 *   const result = analyzeMoney({
 *     lagna: 'aries',
 *     lagnaLordHouse: 2,
 *     secondLordHouse: 11,
 *     eleventhLordHouse: 2,
 *     planetsInHouse1: ['mars'],
 *     planetsInHouse2: ['venus'],
 *     planetsInHouse11: ['saturn'],
 *     conjunctions: [ { planets: ['venus', 'saturn'], house: 2 } ],
 *     navamsaLagnaSign: 'cancer',
 *     lagnaLordNavamsaSign: 'leo',
 *     secondLordNavamsaSign: 'capricorn',
 *     eleventhLordNavamsaSign: 'aquarius'
 *   });
 */

'use strict';

const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'astrology', 'money');

const planets = require(path.join(DATA_DIR, 'planets.json'));
const rashis = require(path.join(DATA_DIR, 'rashis.json'));
const houses = require(path.join(DATA_DIR, 'houses.json'));
const lagnaBase = require(path.join(DATA_DIR, 'lagnaBase.json'));
const lagnaLordInHouse = require(path.join(DATA_DIR, 'lagnaLordInHouse.json'));
const secondLordInHouse = require(path.join(DATA_DIR, 'secondLordInHouse.json'));
const eleventhLordInHouse = require(path.join(DATA_DIR, 'eleventhLordInHouse.json'));
const planetInHouse1 = require(path.join(DATA_DIR, 'planetInHouse1.json'));
const planetInHouse2 = require(path.join(DATA_DIR, 'planetInHouse2.json'));
const planetInHouse11 = require(path.join(DATA_DIR, 'planetInHouse11.json'));
const conjunctions = require(path.join(DATA_DIR, 'conjunctions.json'));
const classicalPairYogas = require(path.join(DATA_DIR, 'classicalPairYogas.json'));
const firstHouseConjunctionYogas = require(path.join(DATA_DIR, 'firstHouseConjunctionYogas.json'));
const secondHouseConjunctionYogas = require(path.join(DATA_DIR, 'secondHouseConjunctionYogas.json'));
const eleventhHouseConjunctionYogas = require(path.join(DATA_DIR, 'eleventhHouseConjunctionYogas.json'));
const lagnaLordInNavamsa = require(path.join(DATA_DIR, 'lagnaLordInNavamsa.json'));
const secondLordInNavamsa = require(path.join(DATA_DIR, 'secondLordInNavamsa.json'));
const eleventhLordInNavamsa = require(path.join(DATA_DIR, 'eleventhLordInNavamsa.json'));
const lagnaLordInNavamsaHouse = require(path.join(DATA_DIR, 'lagnaLordInNavamsaHouse.json'));
const secondLordInNavamsaHouse = require(path.join(DATA_DIR, 'secondLordInNavamsaHouse.json'));
const eleventhLordInNavamsaHouse = require(path.join(DATA_DIR, 'eleventhLordInNavamsaHouse.json'));

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
    secondLordInHouse,
    eleventhLordInHouse,
    planetInHouse1,
    planetInHouse2,
    planetInHouse11,
    conjunctions,
    classicalPairYogas,
    firstHouseConjunctionYogas,
    secondHouseConjunctionYogas,
    eleventhHouseConjunctionYogas,
    lagnaLordInNavamsa,
    secondLordInNavamsa,
    eleventhLordInNavamsa,
    lagnaLordInNavamsaHouse,
    secondLordInNavamsaHouse,
    eleventhLordInNavamsaHouse
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

function searchMoneyDataset(query, { limit = 20 } = {}) {
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
// Core composition: analyzeMoney(input) -> full bilingual wealth reading
// ---------------------------------------------------------------------------

/**
 * @param {Object} input
 * @param {string} input.lagna                       rashi key, e.g. 'aries'
 * @param {number} input.lagnaLordHouse              1-12: house the Lagna lord sits in (D-1)
 * @param {number} input.secondLordHouse             1-12: house the 2nd lord sits in (D-1)
 * @param {number} input.eleventhLordHouse           1-12: house the 11th lord sits in (D-1)
 * @param {string[]} [input.planetsInHouse1]         graha keys sitting in the 1st house
 * @param {string[]} [input.planetsInHouse2]         graha keys sitting in the 2nd house
 * @param {string[]} [input.planetsInHouse11]        graha keys sitting in the 11th house
 * @param {Array} [input.conjunctions]               array of either [planetA, planetB] or
 *                                                     { planets: [planetA, planetB], house?: 1|2|11|other }.
 *                                                     house 1, 2, or 11 triggers lagna-aware Yoga detection.
 * @param {string} [input.navamsaLagnaSign]          rashi key: the Navamsa chart's own Ascendant sign
 * @param {string} [input.lagnaLordNavamsaSign]      rashi key: sign the Lagna lord occupies in D-9
 * @param {string} [input.secondLordNavamsaSign]     rashi key: sign the 2nd lord occupies in D-9
 * @param {string} [input.eleventhLordNavamsaSign]   rashi key: sign the 11th lord occupies in D-9
 */
function analyzeMoney(input = {}) {
    const errors = [];
    const {
        lagna,
        lagnaLordHouse,
        secondLordHouse,
        eleventhLordHouse,
        planetsInHouse1 = [],
        planetsInHouse2 = [],
        planetsInHouse11 = [],
        conjunctions: conjunctionInputs = [],
        navamsaLagnaSign,
        lagnaLordNavamsaSign,
        secondLordNavamsaSign,
        eleventhLordNavamsaSign
    } = input;

    if (!VALID_RASHIS.has(lagna)) errors.push(`Invalid or missing "lagna". Expected one of: ${[...VALID_RASHIS].join(', ')}`);
    if (!Number.isInteger(lagnaLordHouse) || lagnaLordHouse < 1 || lagnaLordHouse > 12) errors.push('Invalid or missing "lagnaLordHouse" (expected 1-12)');
    if (!Number.isInteger(secondLordHouse) || secondLordHouse < 1 || secondLordHouse > 12) errors.push('Invalid or missing "secondLordHouse" (expected 1-12)');
    if (!Number.isInteger(eleventhLordHouse) || eleventhLordHouse < 1 || eleventhLordHouse > 12) errors.push('Invalid or missing "eleventhLordHouse" (expected 1-12)');

    planetsInHouse1.forEach((p) => { if (!VALID_PLANETS.has(p)) errors.push(`Invalid planet in planetsInHouse1: ${p}`); });
    planetsInHouse2.forEach((p) => { if (!VALID_PLANETS.has(p)) errors.push(`Invalid planet in planetsInHouse2: ${p}`); });
    planetsInHouse11.forEach((p) => { if (!VALID_PLANETS.has(p)) errors.push(`Invalid planet in planetsInHouse11: ${p}`); });

    const normalizedConjunctions = conjunctionInputs.map((c) => (Array.isArray(c) ? { planets: c, house: undefined } : c));
    normalizedConjunctions.forEach((c) => {
        const pair = c && c.planets;
        if (!Array.isArray(pair) || pair.length !== 2 || !VALID_PLANETS.has(pair[0]) || !VALID_PLANETS.has(pair[1])) {
            errors.push(`Invalid conjunction entry: ${JSON.stringify(c)}`);
        }
    });

    [navamsaLagnaSign, lagnaLordNavamsaSign, secondLordNavamsaSign, eleventhLordNavamsaSign].forEach((sign) => {
        if (sign !== undefined && !VALID_RASHIS.has(sign)) errors.push(`Invalid rashi for navamsa sign: ${sign}`);
    });

    if (errors.length) {
        return { success: false, errors };
    }

    const base = getLagnaBase(lagna);
    const sections = [];

    // 1. Lagna lord placement (D-1)
    sections.push({ section: 'lagnaLordPlacement', ...lagnaLordInHouse[`${base.lagnaLord}_${lagnaLordHouse}`] });

    // 2. 2nd lord & 11th lord placement (D-1)
    sections.push({ section: 'secondLordPlacement', ...secondLordInHouse[`${base.secondLord}_${secondLordHouse}`] });
    sections.push({ section: 'eleventhLordPlacement', ...eleventhLordInHouse[`${base.eleventhLord}_${eleventhLordHouse}`] });

    // 3-4. Planets in 1st, 2nd, 11th house
    planetsInHouse1.forEach((p) => sections.push({ section: 'planetInHouse1', ...planetInHouse1[p] }));
    planetsInHouse2.forEach((p) => sections.push({ section: 'planetInHouse2', ...planetInHouse2[p] }));
    planetsInHouse11.forEach((p) => sections.push({ section: 'planetInHouse11', ...planetInHouse11[p] }));

    // 5. Conjunctions - generic meaning + classical (lagna-independent) named Yoga
    //    + lagna-aware Raja/Dhana/Vipreet-Raja Yoga when the conjunction is in H1, H2 or H11.
    const HOUSE_YOGA_TABLES = { 1: firstHouseConjunctionYogas, 2: secondHouseConjunctionYogas, 11: eleventhHouseConjunctionYogas };
    const HOUSE_YOGA_SECTION = { 1: 'firstHouseYoga', 2: 'secondHouseYoga', 11: 'eleventhHouseYoga' };
    normalizedConjunctions.forEach(({ planets: pair, house }) => {
        const [a, b] = pair;
        const key = conjunctionKey(a, b);

        sections.push({ section: 'conjunction', ...conjunctions[key] });
        sections.push({ section: 'classicalPairYoga', ...classicalPairYogas[key] });

        if (house === 1 || house === 2 || house === 11) {
            sections.push({ section: HOUSE_YOGA_SECTION[house], ...HOUSE_YOGA_TABLES[house][`${lagna}_${key}`] });
        }
    });

    // 6. Lagna/2nd/11th lords' placement in Navamsa (D-9) - by sign, and by house-number
    if (lagnaLordNavamsaSign) {
        sections.push({ section: 'lagnaLordNavamsaSign', ...lagnaLordInNavamsa[`${base.lagnaLord}_${lagnaLordNavamsaSign}`] });
        if (navamsaLagnaSign) {
            const house = computeNavamsaHouse(navamsaLagnaSign, lagnaLordNavamsaSign);
            sections.push({ section: 'lagnaLordNavamsaHouse', navamsaHouseComputed: house, ...lagnaLordInNavamsaHouse[`${base.lagnaLord}_${house}`] });
        }
    }
    if (secondLordNavamsaSign) {
        sections.push({ section: 'secondLordNavamsaSign', ...secondLordInNavamsa[`${base.secondLord}_${secondLordNavamsaSign}`] });
        if (navamsaLagnaSign) {
            const house = computeNavamsaHouse(navamsaLagnaSign, secondLordNavamsaSign);
            sections.push({ section: 'secondLordNavamsaHouse', navamsaHouseComputed: house, ...secondLordInNavamsaHouse[`${base.secondLord}_${house}`] });
        }
    }
    if (eleventhLordNavamsaSign) {
        sections.push({ section: 'eleventhLordNavamsaSign', ...eleventhLordInNavamsa[`${base.eleventhLord}_${eleventhLordNavamsaSign}`] });
        if (navamsaLagnaSign) {
            const house = computeNavamsaHouse(navamsaLagnaSign, eleventhLordNavamsaSign);
            sections.push({ section: 'eleventhLordNavamsaHouse', navamsaHouseComputed: house, ...eleventhLordInNavamsaHouse[`${base.eleventhLord}_${house}`] });
        }
    }

    const combinedText = {
        en: sections.map((s) => s.text.en).join('\n\n'),
        hi: sections.map((s) => s.text.hi).join('\n\n')
    };

    return { success: true, input, base, sections, combinedText };
}

module.exports = {
    analyzeMoney,
    searchMoneyDataset,
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
        secondLordInHouse,
        eleventhLordInHouse,
        planetInHouse1,
        planetInHouse2,
        planetInHouse11,
        conjunctions,
        classicalPairYogas,
        firstHouseConjunctionYogas,
        secondHouseConjunctionYogas,
        eleventhHouseConjunctionYogas,
        lagnaLordInNavamsa,
        secondLordInNavamsa,
        eleventhLordInNavamsa,
        lagnaLordInNavamsaHouse,
        secondLordInNavamsaHouse,
        eleventhLordInNavamsaHouse
    }
};
