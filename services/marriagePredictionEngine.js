/**
 * marriagePredictionEngine.js
 *
 * Fast, deterministic lookup/composition engine over the Marriage Astrology
 * Dataset (data/astrology/marriage/*.json). This is the marriage counterpart
 * of careerPredictionEngine.js - identical technique, with the 7th house/7th
 * lord (marriage significator) used in place of the 10th house/10th lord.
 * NO AI/LLM calls happen here - every prediction comes purely from our own
 * precomputed dataset via O(1) key look-ups.
 *
 * Factors covered:
 *   1. Lagna lord + the house it occupies              -> lagnaLordInHouse.json
 *   2. 7th lord (marriage significator) + its house      -> seventhLordInHouse.json
 *   3. Planets sitting in the 1st house                 -> planetInHouse1.json
 *   4. Planets sitting in the 7th house                 -> planetInHouse7.json
 *   5. Conjunctions + classical/lagna-aware Yogas         -> conjunctions.json,
 *        in the 1st/7th house                                classicalPairYogas.json,
 *                                                            firstHouseConjunctionYogas.json,
 *                                                            seventhHouseConjunctionYogas.json
 *   6. Lagna lord's AND 7th lord's placement in the      -> lagnaLordInNavamsa.json,
 *        Navamsa (D-9), by SIGN and by HOUSE NUMBER          seventhLordInNavamsa.json,
 *        (counted from the Navamsa's own ascendant)          lagnaLordInNavamsaHouse.json,
 *                                                            seventhLordInNavamsaHouse.json
 *
 * Usage:
 *   const { analyzeMarriage } = require('./services/marriagePredictionEngine');
 *   const result = analyzeMarriage({
 *     lagna: 'aries',
 *     lagnaLordHouse: 7,
 *     seventhLordHouse: 1,
 *     planetsInHouse1: ['venus'],
 *     planetsInHouse7: ['mars', 'saturn'],
 *     conjunctions: [ { planets: ['mars', 'saturn'], house: 7 } ],
 *     navamsaLagnaSign: 'cancer',
 *     lagnaLordNavamsaSign: 'leo',
 *     seventhLordNavamsaSign: 'capricorn'
 *   });
 */

'use strict';

const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'astrology', 'marriage');

// require() of JSON files is cached by Node's module system -> loaded from disk only once.
const planets = require(path.join(DATA_DIR, 'planets.json'));
const rashis = require(path.join(DATA_DIR, 'rashis.json'));
const houses = require(path.join(DATA_DIR, 'houses.json'));
const lagnaBase = require(path.join(DATA_DIR, 'lagnaBase.json'));
const lagnaLordInHouse = require(path.join(DATA_DIR, 'lagnaLordInHouse.json'));
const seventhLordInHouse = require(path.join(DATA_DIR, 'seventhLordInHouse.json'));
const planetInHouse1 = require(path.join(DATA_DIR, 'planetInHouse1.json'));
const planetInHouse7 = require(path.join(DATA_DIR, 'planetInHouse7.json'));
const conjunctions = require(path.join(DATA_DIR, 'conjunctions.json'));
const classicalPairYogas = require(path.join(DATA_DIR, 'classicalPairYogas.json'));
const firstHouseConjunctionYogas = require(path.join(DATA_DIR, 'firstHouseConjunctionYogas.json'));
const seventhHouseConjunctionYogas = require(path.join(DATA_DIR, 'seventhHouseConjunctionYogas.json'));
const lagnaLordInNavamsa = require(path.join(DATA_DIR, 'lagnaLordInNavamsa.json'));
const seventhLordInNavamsa = require(path.join(DATA_DIR, 'seventhLordInNavamsa.json'));
const lagnaLordInNavamsaHouse = require(path.join(DATA_DIR, 'lagnaLordInNavamsaHouse.json'));
const seventhLordInNavamsaHouse = require(path.join(DATA_DIR, 'seventhLordInNavamsaHouse.json'));

const VALID_PLANETS = new Set(Object.keys(planets));
const VALID_RASHIS = new Set(Object.keys(rashis));

function conjunctionKey(a, b) {
    const order = (p) => (planets[p] && planets[p].order) || 99;
    const [x, y] = [a, b].sort((p, q) => order(p) - order(q));
    return `${x}_${y}`;
}

/**
 * Navamsa (D-9) HOUSE number of a planet, counted from the Navamsa's own Ascendant.
 * Both signs are rashi keys (e.g. 'cancer'). O(1) arithmetic, no lookup needed.
 */
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
    seventhLordInHouse,
    planetInHouse1,
    planetInHouse7,
    conjunctions,
    classicalPairYogas,
    firstHouseConjunctionYogas,
    seventhHouseConjunctionYogas,
    lagnaLordInNavamsa,
    seventhLordInNavamsa,
    lagnaLordInNavamsaHouse,
    seventhLordInNavamsaHouse
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

function searchMarriageDataset(query, { limit = 20 } = {}) {
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
// Core composition: analyzeMarriage(input) -> full bilingual marriage reading
// ---------------------------------------------------------------------------

/**
 * @param {Object} input
 * @param {string} input.lagna                    rashi key, e.g. 'aries'
 * @param {number} input.lagnaLordHouse           1-12: house the Lagna lord sits in (D-1)
 * @param {number} input.seventhLordHouse         1-12: house the 7th lord sits in (D-1)
 * @param {string[]} [input.planetsInHouse1]      graha keys sitting in the 1st house
 * @param {string[]} [input.planetsInHouse7]      graha keys sitting in the 7th house
 * @param {Array} [input.conjunctions]            array of either [planetA, planetB] or
 *                                                  { planets: [planetA, planetB], house?: 1|7|other }.
 *                                                  house 1 or 7 triggers lagna-aware Yoga detection.
 * @param {string} [input.navamsaLagnaSign]       rashi key: the Navamsa chart's own Ascendant sign
 * @param {string} [input.lagnaLordNavamsaSign]   rashi key: sign the Lagna lord occupies in D-9
 * @param {string} [input.seventhLordNavamsaSign] rashi key: sign the 7th lord occupies in D-9
 */
function analyzeMarriage(input = {}) {
    const errors = [];
    const {
        lagna,
        lagnaLordHouse,
        seventhLordHouse,
        planetsInHouse1 = [],
        planetsInHouse7 = [],
        conjunctions: conjunctionInputs = [],
        navamsaLagnaSign,
        lagnaLordNavamsaSign,
        seventhLordNavamsaSign
    } = input;

    if (!VALID_RASHIS.has(lagna)) errors.push(`Invalid or missing "lagna". Expected one of: ${[...VALID_RASHIS].join(', ')}`);
    if (!Number.isInteger(lagnaLordHouse) || lagnaLordHouse < 1 || lagnaLordHouse > 12) errors.push('Invalid or missing "lagnaLordHouse" (expected 1-12)');
    if (!Number.isInteger(seventhLordHouse) || seventhLordHouse < 1 || seventhLordHouse > 12) errors.push('Invalid or missing "seventhLordHouse" (expected 1-12)');

    planetsInHouse1.forEach((p) => { if (!VALID_PLANETS.has(p)) errors.push(`Invalid planet in planetsInHouse1: ${p}`); });
    planetsInHouse7.forEach((p) => { if (!VALID_PLANETS.has(p)) errors.push(`Invalid planet in planetsInHouse7: ${p}`); });

    const normalizedConjunctions = conjunctionInputs.map((c) => (Array.isArray(c) ? { planets: c, house: undefined } : c));
    normalizedConjunctions.forEach((c) => {
        const pair = c && c.planets;
        if (!Array.isArray(pair) || pair.length !== 2 || !VALID_PLANETS.has(pair[0]) || !VALID_PLANETS.has(pair[1])) {
            errors.push(`Invalid conjunction entry: ${JSON.stringify(c)}`);
        }
    });

    [navamsaLagnaSign, lagnaLordNavamsaSign, seventhLordNavamsaSign].forEach((sign) => {
        if (sign !== undefined && !VALID_RASHIS.has(sign)) errors.push(`Invalid rashi for navamsa sign: ${sign}`);
    });

    if (errors.length) {
        return { success: false, errors };
    }

    const base = getLagnaBase(lagna);
    const sections = [];

    // 1. Lagna lord placement (D-1)
    sections.push({ section: 'lagnaLordPlacement', ...lagnaLordInHouse[`${base.lagnaLord}_${lagnaLordHouse}`] });

    // 2. 7th lord placement (D-1)
    sections.push({ section: 'seventhLordPlacement', ...seventhLordInHouse[`${base.seventhLord}_${seventhLordHouse}`] });

    // 3. Planets in 1st house
    planetsInHouse1.forEach((p) => sections.push({ section: 'planetInHouse1', ...planetInHouse1[p] }));

    // 4. Planets in 7th house
    planetsInHouse7.forEach((p) => sections.push({ section: 'planetInHouse7', ...planetInHouse7[p] }));

    // 5. Conjunctions - generic meaning + classical (lagna-independent) named Yoga
    //    + lagna-aware Raja/Dhana/Vipreet-Raja Yoga when the conjunction is in H1 or H7.
    normalizedConjunctions.forEach(({ planets: pair, house }) => {
        const [a, b] = pair;
        const key = conjunctionKey(a, b);

        sections.push({ section: 'conjunction', ...conjunctions[key] });
        sections.push({ section: 'classicalPairYoga', ...classicalPairYogas[key] });

        if (house === 1) {
            sections.push({ section: 'firstHouseYoga', ...firstHouseConjunctionYogas[`${lagna}_${key}`] });
        } else if (house === 7) {
            sections.push({ section: 'seventhHouseYoga', ...seventhHouseConjunctionYogas[`${lagna}_${key}`] });
        }
    });

    // 6. Lagna lord & 7th lord placement in Navamsa (D-9) - by sign, and by house-number
    if (lagnaLordNavamsaSign) {
        sections.push({ section: 'lagnaLordNavamsaSign', ...lagnaLordInNavamsa[`${base.lagnaLord}_${lagnaLordNavamsaSign}`] });
        if (navamsaLagnaSign) {
            const house = computeNavamsaHouse(navamsaLagnaSign, lagnaLordNavamsaSign);
            sections.push({ section: 'lagnaLordNavamsaHouse', navamsaHouseComputed: house, ...lagnaLordInNavamsaHouse[`${base.lagnaLord}_${house}`] });
        }
    }
    if (seventhLordNavamsaSign) {
        sections.push({ section: 'seventhLordNavamsaSign', ...seventhLordInNavamsa[`${base.seventhLord}_${seventhLordNavamsaSign}`] });
        if (navamsaLagnaSign) {
            const house = computeNavamsaHouse(navamsaLagnaSign, seventhLordNavamsaSign);
            sections.push({ section: 'seventhLordNavamsaHouse', navamsaHouseComputed: house, ...seventhLordInNavamsaHouse[`${base.seventhLord}_${house}`] });
        }
    }

    const combinedText = {
        en: sections.map((s) => s.text.en).join('\n\n'),
        hi: sections.map((s) => s.text.hi).join('\n\n')
    };

    return { success: true, input, base, sections, combinedText };
}

module.exports = {
    analyzeMarriage,
    searchMarriageDataset,
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
        seventhLordInHouse,
        planetInHouse1,
        planetInHouse7,
        conjunctions,
        classicalPairYogas,
        firstHouseConjunctionYogas,
        seventhHouseConjunctionYogas,
        lagnaLordInNavamsa,
        seventhLordInNavamsa,
        lagnaLordInNavamsaHouse,
        seventhLordInNavamsaHouse
    }
};
