/**
 * careerPredictionEngine.js
 *
 * Fast, deterministic lookup/composition engine over the Career Astrology
 * Dataset (data/astrology/career/*.json). NO AI/LLM calls happen here -
 * every prediction is produced purely from our own precomputed dataset via
 * O(1) key look-ups (plus a couple of cheap O(1) arithmetic formulas for
 * lordship/Navamsa-house derivation).
 *
 * Factors covered (per the six-factor career-analysis technique):
 *   1. Lagna lord + the house it occupies              -> lagnaLordInHouse.json
 *   2. 10th lord + the house it occupies                -> tenthLordInHouse.json
 *   3. Planets sitting in the 1st house                 -> planetInHouse1.json
 *   4. Planets sitting in the 10th house                -> planetInHouse10.json
 *   5. Conjunctions + classical/lagna-aware Yogas        -> conjunctions.json,
 *        classicalPairYogas.json, firstHouseConjunctionYogas.json,
 *        tenthHouseConjunctionYogas.json
 *   6. Lagna lord's AND 10th lord's placement in the     -> lagnaLordInNavamsa.json,
 *        Navamsa (D-9), by SIGN and by HOUSE NUMBER         tenthLordInNavamsa.json,
 *        (counted from the Navamsa's own ascendant)         lagnaLordInNavamsaHouse.json,
 *                                                            tenthLordInNavamsaHouse.json
 *
 * Performance notes ("very very fast accessible and searchable in huge amount of data"):
 *   - All JSON tables are loaded ONCE at process start via require() (Node caches
 *     the parsed object in memory - no disk I/O or re-parsing on subsequent calls).
 *   - Every lookup is an O(1) plain-object key access. There is no scanning of
 *     arrays at query time, no matter how many charts are analysed per second.
 *   - A single combined in-memory inverted index is built once at load time over
 *     every bilingual text row across all tables, enabling fast full-text keyword
 *     search (see `searchCareerDataset`).
 *
 * Usage:
 *   const { analyzeCareer } = require('./services/careerPredictionEngine');
 *   const result = analyzeCareer({
 *     lagna: 'aries',
 *     lagnaLordHouse: 10,
 *     tenthLordHouse: 1,
 *     planetsInHouse1: ['mars'],
 *     planetsInHouse10: ['saturn', 'venus'],
 *     conjunctions: [ { planets: ['saturn', 'venus'], house: 10 } ],
 *     navamsaLagnaSign: 'cancer',
 *     lagnaLordNavamsaSign: 'leo',
 *     tenthLordNavamsaSign: 'capricorn'
 *   });
 */

'use strict';

const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'astrology', 'career');

// require() of JSON files is cached by Node's module system -> loaded from disk only once.
const planets = require(path.join(DATA_DIR, 'planets.json'));
const rashis = require(path.join(DATA_DIR, 'rashis.json'));
const houses = require(path.join(DATA_DIR, 'houses.json'));
const lagnaBase = require(path.join(DATA_DIR, 'lagnaBase.json'));
const lagnaLordInHouse = require(path.join(DATA_DIR, 'lagnaLordInHouse.json'));
const tenthLordInHouse = require(path.join(DATA_DIR, 'tenthLordInHouse.json'));
const planetInHouse1 = require(path.join(DATA_DIR, 'planetInHouse1.json'));
const planetInHouse10 = require(path.join(DATA_DIR, 'planetInHouse10.json'));
const conjunctions = require(path.join(DATA_DIR, 'conjunctions.json'));
const classicalPairYogas = require(path.join(DATA_DIR, 'classicalPairYogas.json'));
const firstHouseConjunctionYogas = require(path.join(DATA_DIR, 'firstHouseConjunctionYogas.json'));
const tenthHouseConjunctionYogas = require(path.join(DATA_DIR, 'tenthHouseConjunctionYogas.json'));
const lagnaLordInNavamsa = require(path.join(DATA_DIR, 'lagnaLordInNavamsa.json'));
const tenthLordInNavamsa = require(path.join(DATA_DIR, 'tenthLordInNavamsa.json'));
const lagnaLordInNavamsaHouse = require(path.join(DATA_DIR, 'lagnaLordInNavamsaHouse.json'));
const tenthLordInNavamsaHouse = require(path.join(DATA_DIR, 'tenthLordInNavamsaHouse.json'));

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
// Built exactly once when this module is first require()'d.
// ---------------------------------------------------------------------------

const ALL_TABLES = {
    lagnaLordInHouse,
    tenthLordInHouse,
    planetInHouse1,
    planetInHouse10,
    conjunctions,
    classicalPairYogas,
    firstHouseConjunctionYogas,
    tenthHouseConjunctionYogas,
    lagnaLordInNavamsa,
    tenthLordInNavamsa,
    lagnaLordInNavamsaHouse,
    tenthLordInNavamsaHouse
};

const searchIndex = new Map(); // word -> Set of "table:key" locations

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

/**
 * Fast keyword search over the entire career dataset (all combination tables).
 * O(1) per keyword lookup into the pre-built inverted index, then intersects results.
 */
function searchCareerDataset(query, { limit = 20 } = {}) {
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

function getPlanetMeta(planet) {
    return planets[planet] || null;
}

function getRashiMeta(rashi) {
    return rashis[rashi] || null;
}

// ---------------------------------------------------------------------------
// Core composition: analyzeCareer(input) -> full bilingual career reading
// ---------------------------------------------------------------------------

/**
 * @param {Object} input
 * @param {string} input.lagna                   rashi key, e.g. 'aries'
 * @param {number} input.lagnaLordHouse           1-12: house the Lagna lord sits in (D-1)
 * @param {number} input.tenthLordHouse           1-12: house the 10th lord sits in (D-1)
 * @param {string[]} [input.planetsInHouse1]      graha keys sitting in the 1st house
 * @param {string[]} [input.planetsInHouse10]     graha keys sitting in the 10th house
 * @param {Array} [input.conjunctions]            array of either [planetA, planetB] or
 *                                                 { planets: [planetA, planetB], house?: 1|10|other }.
 *                                                 When house is 1 or 10, lagna-aware Raja/Dhana/Vipreet-Raja
 *                                                 Yoga detection is applied (in addition to the generic
 *                                                 conjunction meaning and any classical pair-Yoga name).
 * @param {string} [input.navamsaLagnaSign]       rashi key: the Navamsa chart's own Ascendant sign -
 *                                                 required to compute Navamsa HOUSE numbers below.
 * @param {string} [input.lagnaLordNavamsaSign]   rashi key: sign the Lagna lord occupies in D-9
 * @param {string} [input.tenthLordNavamsaSign]   rashi key: sign the 10th lord occupies in D-9
 */
function analyzeCareer(input = {}) {
    const errors = [];
    const {
        lagna,
        lagnaLordHouse,
        tenthLordHouse,
        planetsInHouse1 = [],
        planetsInHouse10 = [],
        conjunctions: conjunctionInputs = [],
        navamsaLagnaSign,
        lagnaLordNavamsaSign,
        tenthLordNavamsaSign
    } = input;

    if (!VALID_RASHIS.has(lagna)) errors.push(`Invalid or missing "lagna". Expected one of: ${[...VALID_RASHIS].join(', ')}`);
    if (!Number.isInteger(lagnaLordHouse) || lagnaLordHouse < 1 || lagnaLordHouse > 12) errors.push('Invalid or missing "lagnaLordHouse" (expected 1-12)');
    if (!Number.isInteger(tenthLordHouse) || tenthLordHouse < 1 || tenthLordHouse > 12) errors.push('Invalid or missing "tenthLordHouse" (expected 1-12)');

    planetsInHouse1.forEach((p) => { if (!VALID_PLANETS.has(p)) errors.push(`Invalid planet in planetsInHouse1: ${p}`); });
    planetsInHouse10.forEach((p) => { if (!VALID_PLANETS.has(p)) errors.push(`Invalid planet in planetsInHouse10: ${p}`); });

    const normalizedConjunctions = conjunctionInputs.map((c) => (Array.isArray(c) ? { planets: c, house: undefined } : c));
    normalizedConjunctions.forEach((c) => {
        const pair = c && c.planets;
        if (!Array.isArray(pair) || pair.length !== 2 || !VALID_PLANETS.has(pair[0]) || !VALID_PLANETS.has(pair[1])) {
            errors.push(`Invalid conjunction entry: ${JSON.stringify(c)}`);
        }
    });

    [navamsaLagnaSign, lagnaLordNavamsaSign, tenthLordNavamsaSign].forEach((sign) => {
        if (sign !== undefined && !VALID_RASHIS.has(sign)) errors.push(`Invalid rashi for navamsa sign: ${sign}`);
    });

    if (errors.length) {
        return { success: false, errors };
    }

    const base = getLagnaBase(lagna);
    const sections = [];

    // 1. Lagna lord placement (D-1)
    sections.push({ section: 'lagnaLordPlacement', ...lagnaLordInHouse[`${base.lagnaLord}_${lagnaLordHouse}`] });

    // 2. 10th lord placement (D-1)
    sections.push({ section: 'tenthLordPlacement', ...tenthLordInHouse[`${base.tenthLord}_${tenthLordHouse}`] });

    // 3. Planets in 1st house
    planetsInHouse1.forEach((p) => sections.push({ section: 'planetInHouse1', ...planetInHouse1[p] }));

    // 4. Planets in 10th house
    planetsInHouse10.forEach((p) => sections.push({ section: 'planetInHouse10', ...planetInHouse10[p] }));

    // 5. Conjunctions - generic meaning + classical (lagna-independent) named Yoga
    //    + lagna-aware Raja/Dhana/Vipreet-Raja Yoga when the conjunction is in H1 or H10.
    normalizedConjunctions.forEach(({ planets: pair, house }) => {
        const [a, b] = pair;
        const key = conjunctionKey(a, b);

        sections.push({ section: 'conjunction', ...conjunctions[key] });
        sections.push({ section: 'classicalPairYoga', ...classicalPairYogas[key] });

        if (house === 1) {
            sections.push({ section: 'firstHouseYoga', ...firstHouseConjunctionYogas[`${lagna}_${key}`] });
        } else if (house === 10) {
            sections.push({ section: 'tenthHouseYoga', ...tenthHouseConjunctionYogas[`${lagna}_${key}`] });
        }
    });

    // 6. Lagna lord & 10th lord placement in Navamsa (D-9) - by sign, and by house-number
    //    (house-number requires navamsaLagnaSign to know the D-9 chart's own ascendant).
    if (lagnaLordNavamsaSign) {
        sections.push({ section: 'lagnaLordNavamsaSign', ...lagnaLordInNavamsa[`${base.lagnaLord}_${lagnaLordNavamsaSign}`] });
        if (navamsaLagnaSign) {
            const house = computeNavamsaHouse(navamsaLagnaSign, lagnaLordNavamsaSign);
            sections.push({ section: 'lagnaLordNavamsaHouse', navamsaHouseComputed: house, ...lagnaLordInNavamsaHouse[`${base.lagnaLord}_${house}`] });
        }
    }
    if (tenthLordNavamsaSign) {
        sections.push({ section: 'tenthLordNavamsaSign', ...tenthLordInNavamsa[`${base.tenthLord}_${tenthLordNavamsaSign}`] });
        if (navamsaLagnaSign) {
            const house = computeNavamsaHouse(navamsaLagnaSign, tenthLordNavamsaSign);
            sections.push({ section: 'tenthLordNavamsaHouse', navamsaHouseComputed: house, ...tenthLordInNavamsaHouse[`${base.tenthLord}_${house}`] });
        }
    }

    const combinedText = {
        en: sections.map((s) => s.text.en).join('\n\n'),
        hi: sections.map((s) => s.text.hi).join('\n\n')
    };

    return {
        success: true,
        input,
        base,
        sections,
        combinedText
    };
}

module.exports = {
    analyzeCareer,
    searchCareerDataset,
    getLagnaBase,
    getPlanetMeta,
    getRashiMeta,
    computeNavamsaHouse,
    // exported for admin/reference browsing
    tables: {
        planets,
        rashis,
        houses,
        lagnaBase,
        lagnaLordInHouse,
        tenthLordInHouse,
        planetInHouse1,
        planetInHouse10,
        conjunctions,
        classicalPairYogas,
        firstHouseConjunctionYogas,
        tenthHouseConjunctionYogas,
        lagnaLordInNavamsa,
        tenthLordInNavamsa,
        lagnaLordInNavamsaHouse,
        tenthLordInNavamsaHouse
    }
};
