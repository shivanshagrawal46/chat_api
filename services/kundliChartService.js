/**
 * kundliChartService.js
 *
 * Talks to the external Kundli-calculation API
 * (http://64.227.131.149:3102/api/userSearcheds/kundali) and normalises its
 * (very large) response into the compact structure our deterministic
 * prediction engines need.
 *
 * The external API returns both the D-1 (Rashi) chart at `data.lagna.chart`
 * and the D-9 (Navamsa) chart at `data.navamsh.chart`, each as an array of 12
 * whole-sign houses: { house, sign, planets: [...] }. House 1's sign is the
 * ascendant of that chart. Planet keys and sign names are already lowercase
 * and line up 1:1 with our dataset keys (sun..ketu, aries..pisces), so no
 * translation table is required.
 *
 * Exposes:
 *   - buildRequestBody(input)  -> the POST body the external API expects
 *   - normalizeChart(apiData)  -> { lagnaSign, planetHouse, housePlanets,
 *                                    navamsaLagnaSign, planetNavamsaSign,
 *                                    conjunctions, planetFlags }
 *   - fetchFullKundliChart(input) -> { normalized, basicDetails, raw? }
 */

'use strict';

const KUNDLI_API_BASE = process.env.KUNDLI_API_BASE_URL || 'http://64.227.131.149:3102/api';
const KUNDLI_API_PATH = '/userSearcheds/kundali';
const KUNDLI_API_TIMEOUT_MS = parseInt(process.env.KUNDLI_API_TIMEOUT_MS || '20000', 10);

const VALID_RASHIS = new Set([
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
]);
const VALID_PLANETS = new Set(['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu']);

/**
 * Build the request body for the external Kundli API from a flexible input.
 * Accepts either explicit numeric parts (year/month/day/hour/minute) or
 * dateOfBirth ("YYYY-MM-DD" or ISO) + timeOfBirth ("HH:MM").
 */
function buildRequestBody(input = {}) {
    let { year, month, day, hour, minute, second } = input;

    if (year == null && input.dateOfBirth) {
        const d = new Date(input.dateOfBirth);
        if (!isNaN(d.getTime())) {
            year = d.getUTCFullYear();
            month = d.getUTCMonth() + 1;
            day = d.getUTCDate();
        }
    }
    if (hour == null && input.timeOfBirth) {
        const [hh, mm] = String(input.timeOfBirth).split(':');
        hour = parseInt(hh, 10);
        minute = parseInt(mm, 10);
    }

    return {
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        day: parseInt(day, 10),
        hour: parseInt(hour, 10) || 0,
        minute: parseInt(minute, 10) || 0,
        second: parseInt(second, 10) || 0,
        timezone: input.timezone || 'Asia/Kolkata',
        dst: input.dst || false,
        name: (input.name || input.fullName || '').trim(),
        gender: (input.gender || 'male').toLowerCase(),
        city: (input.city || input.placeOfBirth || '').trim(),
        lat: Number(input.lat != null ? input.lat : input.latitude),
        lon: Number(input.lon != null ? input.lon : input.longitude),
        save: input.save === true,
        jvk: input.jvk || input.userId || 'guest_user'
    };
}

/** Validate the parts of the request body that we truly require. */
function validateRequestBody(body) {
    const errors = [];
    if (!body.name || !String(body.name).trim()) errors.push('"name" is required and cannot be blank');
    if (!Number.isInteger(body.year) || body.year < 1000) errors.push('valid "year" (or dateOfBirth) is required');
    if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) errors.push('valid "month" (1-12) is required');
    if (!Number.isInteger(body.day) || body.day < 1 || body.day > 31) errors.push('valid "day" (1-31) is required');
    if (!Number.isFinite(body.lat) || body.lat < -90 || body.lat > 90) errors.push('valid "lat" (-90..90) is required');
    if (!Number.isFinite(body.lon) || body.lon < -180 || body.lon > 180) errors.push('valid "lon" (-180..180) is required');
    return errors;
}

/** Pull the 12-house whole-sign array out of a chart node (lagna or navamsh). */
function extractChartArray(chartNode) {
    if (!chartNode) return null;
    const arr = Array.isArray(chartNode.chart) ? chartNode.chart
        : Array.isArray(chartNode.houses) ? chartNode.houses
            : Array.isArray(chartNode) ? chartNode : null;
    return arr;
}

/**
 * Normalise the raw external API `data` object into the compact structure our
 * engines consume. Throws if the essential D-1 lagna chart is missing.
 */
function normalizeChart(apiData) {
    if (!apiData || typeof apiData !== 'object') {
        throw new Error('Kundli API returned no usable data object');
    }

    const d1 = extractChartArray(apiData.lagna);
    if (!Array.isArray(d1) || d1.length === 0) {
        throw new Error('Kundli API response missing D-1 (lagna) chart');
    }

    const planetHouse = {};   // planet -> D1 house number (1-12), counted from lagna
    const housePlanets = {};  // house number -> [planets]
    for (let h = 1; h <= 12; h++) housePlanets[h] = [];

    let lagnaSign = null;
    d1.forEach((row, idx) => {
        const house = Number(row.house != null ? row.house : idx + 1);
        const sign = String(row.sign || row.rashi || '').toLowerCase();
        if (house === 1 && VALID_RASHIS.has(sign)) lagnaSign = sign;
        const planets = Array.isArray(row.planets) ? row.planets : (row.planet ? [row.planet].flat() : []);
        planets.forEach((p) => {
            const pk = String(p).toLowerCase();
            if (VALID_PLANETS.has(pk)) {
                planetHouse[pk] = house;
                housePlanets[house].push(pk);
            }
        });
    });

    if (!lagnaSign) {
        // fallback to basicDetails.lagna
        const bd = String(apiData.basicDetails?.lagna || '').toLowerCase();
        if (VALID_RASHIS.has(bd)) lagnaSign = bd;
    }
    if (!lagnaSign) throw new Error('Could not determine lagna sign from Kundli API response');

    // ---- D-9 (Navamsa) ----
    const d9 = extractChartArray(apiData.navamsh);
    let navamsaLagnaSign = null;
    const planetNavamsaSign = {};

    if (Array.isArray(d9) && d9.length) {
        d9.forEach((row, idx) => {
            const house = Number(row.house != null ? row.house : idx + 1);
            const sign = String(row.sign || row.rashi || '').toLowerCase();
            if (house === 1 && VALID_RASHIS.has(sign)) navamsaLagnaSign = sign;
            const planets = Array.isArray(row.planets) ? row.planets : (row.planet ? [row.planet].flat() : []);
            planets.forEach((p) => {
                const pk = String(p).toLowerCase();
                if (VALID_PLANETS.has(pk)) planetNavamsaSign[pk] = sign;
            });
        });
    }
    // Prefer explicit planetDetails signs if present (cleaner than chart arrays)
    const navDetails = apiData.navamsh?.planetDetails;
    if (Array.isArray(navDetails)) {
        navDetails.forEach((p) => {
            const pk = String(p.planet || p.name || '').toLowerCase();
            const sign = String(p.sign || '').toLowerCase();
            if (VALID_PLANETS.has(pk) && VALID_RASHIS.has(sign)) planetNavamsaSign[pk] = sign;
        });
    }

    // ---- Planet flags (retro/combust/exalted/debilitated) from D-1 planetDetails ----
    const planetFlags = {};
    const d1Details = apiData.lagna?.planetDetails;
    if (Array.isArray(d1Details)) {
        d1Details.forEach((p) => {
            const pk = String(p.name || p.planet || '').toLowerCase();
            if (!VALID_PLANETS.has(pk)) return;
            planetFlags[pk] = {
                retrograde: !!p.retrograde,
                combust: !!p.combust,
                exalted: !!p.exalted,
                debilitated: !!p.debilitated
            };
        });
    }

    // ---- Conjunctions: any house holding 2+ planets -> all unique pairs, tagged with house ----
    const conjunctions = [];
    for (let h = 1; h <= 12; h++) {
        const ps = housePlanets[h];
        for (let i = 0; i < ps.length; i++) {
            for (let j = i + 1; j < ps.length; j++) {
                conjunctions.push({ planets: [ps[i], ps[j]], house: h });
            }
        }
    }

    return {
        lagnaSign,
        planetHouse,
        housePlanets,
        navamsaLagnaSign,
        planetNavamsaSign,
        conjunctions,
        planetFlags
    };
}

/**
 * Fetch a full kundli chart from the external API and return the normalised
 * structure plus a compact copy of basicDetails.
 * @param {Object} input   birth details incl. coordinates (see buildRequestBody)
 * @param {Object} [opts]  { includeRaw?: boolean }
 */
async function fetchFullKundliChart(input = {}, opts = {}) {
    const body = buildRequestBody(input);
    const validationErrors = validateRequestBody(body);
    if (validationErrors.length) {
        const err = new Error('Invalid birth details: ' + validationErrors.join('; '));
        err.code = 'VALIDATION';
        err.details = validationErrors;
        throw err;
    }

    const url = `${KUNDLI_API_BASE}${KUNDLI_API_PATH}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), KUNDLI_API_TIMEOUT_MS);

    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } catch (err) {
        clearTimeout(timeoutId);
        const e = new Error(`Kundli API request failed: ${err.message}`);
        e.code = 'UPSTREAM_UNREACHABLE';
        throw e;
    }
    clearTimeout(timeoutId);

    const rawText = await res.text();
    if (!res.ok) {
        const e = new Error(`Kundli API returned HTTP ${res.status}`);
        e.code = 'UPSTREAM_ERROR';
        e.status = res.status;
        e.bodySnippet = rawText.slice(0, 300);
        throw e;
    }

    let json;
    try {
        json = JSON.parse(rawText);
    } catch (parseErr) {
        const e = new Error('Kundli API returned invalid JSON');
        e.code = 'UPSTREAM_BAD_JSON';
        throw e;
    }

    const apiData = json.data ?? json;
    const normalized = normalizeChart(apiData);

    const bd = apiData.basicDetails || {};
    const basicDetails = {
        lagna: bd.lagna,
        lagnaLord: bd.lagnaLord,
        moonSign: bd.moonSign,
        rashi: bd.rashi,
        rashiLord: bd.rashiLord,
        nakshatra: bd.nakshatra,
        nakshatraLord: bd.nakshatraLord,
        pada: bd.pada,
        gana: bd.gana,
        nadi: bd.nadi,
        varna: bd.varna,
        yoni: bd.yoni,
        mangalDosh: bd.mangalDosh,
        ayanamsha: bd.ayanamsha,
        timezone: bd.timezone,
        latitude: bd.latitude,
        longitude: bd.longitude
    };

    const result = { requestBody: body, basicDetails, normalized };
    if (opts.includeRaw) result.raw = apiData;
    return result;
}

module.exports = {
    buildRequestBody,
    validateRequestBody,
    normalizeChart,
    fetchFullKundliChart,
    KUNDLI_API_BASE
};
