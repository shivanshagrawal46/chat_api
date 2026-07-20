/**
 * kundliReportService.js
 *
 * Glue layer: takes the normalised chart produced by kundliChartService and
 * maps it into the exact inputs each of our four deterministic prediction
 * engines expects, then runs all four to produce a single combined report.
 *
 * Mapping rules (all houses are whole-sign, counted from the lagna, exactly
 * as the engines assume):
 *   - lagna              = normalized.lagnaSign
 *   - <lord>House        = the D-1 house the relevant lord planet occupies
 *                          (planetHouse[lord]); the lord for each role comes
 *                          from the engine's own lagnaBase table.
 *   - planetsInHouseN    = housePlanets[N] for that domain's significator houses
 *   - conjunctions       = only those occurring in the domain's significator
 *                          houses (incl. the 1st), so each report stays focused
 *   - navamsaLagnaSign   = normalized.navamsaLagnaSign
 *   - <lord>NavamsaSign  = planetNavamsaSign[lord]  (engine derives D-9 house)
 *
 * Significator houses per domain:
 *   career   -> 10        (+1)
 *   marriage -> 7         (+1)
 *   money    -> 2, 11     (+1)
 *   health   -> 6, 8, 12  (+1)
 */

'use strict';

const careerEngine = require('./careerPredictionEngine');
const marriageEngine = require('./marriagePredictionEngine');
const moneyEngine = require('./moneyPredictionEngine');
const healthEngine = require('./healthPredictionEngine');

function filterConjunctions(conjunctions, relevantHouses) {
    const set = new Set(relevantHouses);
    return conjunctions.filter((c) => set.has(c.house));
}

function buildCareerInput(n) {
    const base = careerEngine.getLagnaBase(n.lagnaSign);
    return {
        lagna: n.lagnaSign,
        lagnaLordHouse: n.planetHouse[base.lagnaLord],
        tenthLordHouse: n.planetHouse[base.tenthLord],
        planetsInHouse1: n.housePlanets[1] || [],
        planetsInHouse10: n.housePlanets[10] || [],
        conjunctions: filterConjunctions(n.conjunctions, [1, 10]),
        navamsaLagnaSign: n.navamsaLagnaSign,
        lagnaLordNavamsaSign: n.planetNavamsaSign[base.lagnaLord],
        tenthLordNavamsaSign: n.planetNavamsaSign[base.tenthLord]
    };
}

function buildMarriageInput(n) {
    const base = marriageEngine.getLagnaBase(n.lagnaSign);
    return {
        lagna: n.lagnaSign,
        lagnaLordHouse: n.planetHouse[base.lagnaLord],
        seventhLordHouse: n.planetHouse[base.seventhLord],
        planetsInHouse1: n.housePlanets[1] || [],
        planetsInHouse7: n.housePlanets[7] || [],
        conjunctions: filterConjunctions(n.conjunctions, [1, 7]),
        navamsaLagnaSign: n.navamsaLagnaSign,
        lagnaLordNavamsaSign: n.planetNavamsaSign[base.lagnaLord],
        seventhLordNavamsaSign: n.planetNavamsaSign[base.seventhLord]
    };
}

function buildMoneyInput(n) {
    const base = moneyEngine.getLagnaBase(n.lagnaSign);
    return {
        lagna: n.lagnaSign,
        lagnaLordHouse: n.planetHouse[base.lagnaLord],
        secondLordHouse: n.planetHouse[base.secondLord],
        eleventhLordHouse: n.planetHouse[base.eleventhLord],
        planetsInHouse1: n.housePlanets[1] || [],
        planetsInHouse2: n.housePlanets[2] || [],
        planetsInHouse11: n.housePlanets[11] || [],
        conjunctions: filterConjunctions(n.conjunctions, [1, 2, 11]),
        navamsaLagnaSign: n.navamsaLagnaSign,
        lagnaLordNavamsaSign: n.planetNavamsaSign[base.lagnaLord],
        secondLordNavamsaSign: n.planetNavamsaSign[base.secondLord],
        eleventhLordNavamsaSign: n.planetNavamsaSign[base.eleventhLord]
    };
}

function buildHealthInput(n) {
    const base = healthEngine.getLagnaBase(n.lagnaSign);
    return {
        lagna: n.lagnaSign,
        lagnaLordHouse: n.planetHouse[base.lagnaLord],
        sixthLordHouse: n.planetHouse[base.sixthLord],
        eighthLordHouse: n.planetHouse[base.eighthLord],
        twelfthLordHouse: n.planetHouse[base.twelfthLord],
        planetsInHouse1: n.housePlanets[1] || [],
        planetsInHouse6: n.housePlanets[6] || [],
        planetsInHouse8: n.housePlanets[8] || [],
        planetsInHouse12: n.housePlanets[12] || [],
        conjunctions: filterConjunctions(n.conjunctions, [1, 6, 8, 12]),
        navamsaLagnaSign: n.navamsaLagnaSign,
        lagnaLordNavamsaSign: n.planetNavamsaSign[base.lagnaLord],
        sixthLordNavamsaSign: n.planetNavamsaSign[base.sixthLord],
        eighthLordNavamsaSign: n.planetNavamsaSign[base.eighthLord],
        twelfthLordNavamsaSign: n.planetNavamsaSign[base.twelfthLord]
    };
}

/**
 * Build all four engine inputs from a normalised chart and run the engines.
 * @param {Object} normalized  output of kundliChartService.normalizeChart
 * @param {Object} [opts]       { domains?: string[] } - subset to compute (default all)
 */
function buildFullReport(normalized, opts = {}) {
    const domains = opts.domains || ['career', 'marriage', 'money', 'health'];

    const inputs = {};
    const predictions = {};

    if (domains.includes('career')) {
        inputs.career = buildCareerInput(normalized);
        predictions.career = careerEngine.analyzeCareer(inputs.career);
    }
    if (domains.includes('marriage')) {
        inputs.marriage = buildMarriageInput(normalized);
        predictions.marriage = marriageEngine.analyzeMarriage(inputs.marriage);
    }
    if (domains.includes('money')) {
        inputs.money = buildMoneyInput(normalized);
        predictions.money = moneyEngine.analyzeMoney(inputs.money);
    }
    if (domains.includes('health')) {
        inputs.health = buildHealthInput(normalized);
        predictions.health = healthEngine.analyzeHealth(inputs.health);
    }

    return { engineInputs: inputs, predictions };
}

module.exports = {
    buildFullReport,
    buildCareerInput,
    buildMarriageInput,
    buildMoneyInput,
    buildHealthInput
};
