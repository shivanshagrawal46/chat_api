/**
 * kundliExtract.js
 *
 * Deep extraction of the external Kundli API response.
 *
 * The upstream API returns ~3.6 MB per chart. The old `normalizeChart` used
 * only the D-1 and D-9 house arrays (about 2% of it), which is why every
 * report read the same. This module pulls out everything an astrologer would
 * actually look at:
 *
 *   - per planet: exact degree, nakshatra + pada, sub-lord, retrograde,
 *     combust, exalted/debilitated/own/moolatrikona, vargottama, compound
 *     relationship with its sign lord, avastha, the houses it aspects,
 *     its Shadbala total and its D-9 / D-10 placement
 *   - per house: sign, lord, occupants, aspecting planets and the
 *     Sarvashtakavarga bindu count (a real, chart-specific strength number)
 *   - Vimshottari dasha: the full mahadasha/antardasha tree, resolved into
 *     the period running RIGHT NOW plus what comes next
 *   - Jaimini chara karakas, the doshas the API flags, the yogas it detects,
 *     Bhava Chalit house positions and the panchadha (five-fold) friendship
 *     matrix
 *
 * Nothing here interprets - it only normalises. Interpretation lives in
 * services/kundliNarrative/.
 */

'use strict';

const SIGNS = [
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
];
const PLANETS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];
const GRAHAS_7 = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];

const SIGN_SET = new Set(SIGNS);
const PLANET_SET = new Set(PLANETS);

const SIGN_LORD = {
    aries: 'mars', taurus: 'venus', gemini: 'mercury', cancer: 'moon',
    leo: 'sun', virgo: 'mercury', libra: 'venus', scorpio: 'mars',
    sagittarius: 'jupiter', capricorn: 'saturn', aquarius: 'saturn', pisces: 'jupiter'
};

const signIndex = (s) => SIGNS.indexOf(s);

/** House (1-12) of `sign` counted from `fromSign`, whole-sign. */
function houseFrom(fromSign, sign) {
    const a = signIndex(fromSign);
    const b = signIndex(sign);
    if (a < 0 || b < 0) return null;
    return ((b - a + 12) % 12) + 1;
}

/** The sign occupying house `h` counted from `fromSign`. */
function signAtHouse(fromSign, h) {
    const a = signIndex(fromSign);
    if (a < 0) return null;
    return SIGNS[(a + h - 1) % 12];
}

const lower = (v) => String(v == null ? '' : v).trim().toLowerCase();
const asSign = (v) => (SIGN_SET.has(lower(v)) ? lower(v) : null);
const asPlanet = (v) => (PLANET_SET.has(lower(v)) ? lower(v) : null);

/**
 * Parse the API's degree strings into decimal degrees within the sign.
 * Seen formats: "00°23'20''", "02° 51' 00''", "09°58'54", "13°24'40''".
 */
function parseDegree(str) {
    if (typeof str === 'number' && Number.isFinite(str)) return str;
    const nums = String(str || '').match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length === 0) return null;
    const d = parseFloat(nums[0]) || 0;
    const m = nums.length > 1 ? parseFloat(nums[1]) || 0 : 0;
    const s = nums.length > 2 ? parseFloat(nums[2]) || 0 : 0;
    const val = d + m / 60 + s / 3600;
    return Number.isFinite(val) ? Math.round(val * 1000) / 1000 : null;
}

/** Parse the API's "DD-MM-YYYY, HH:mm:ss" timestamps. */
function parseApiDate(str) {
    const m = String(str || '').match(/^(\d{2})-(\d{2})-(\d{4})(?:,\s*(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = m;
    const dt = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss));
    return isNaN(dt.getTime()) ? null : dt;
}

/** Extract the 12-house whole-sign array from a chart node. */
function chartArray(node) {
    if (!node) return null;
    if (Array.isArray(node)) return node;
    if (Array.isArray(node.chart)) return node.chart;
    if (Array.isArray(node.houses)) return node.houses;
    return null;
}

/** sign -> planets[] and planet -> sign, from a divisional chart array. */
function readDivisional(node) {
    const arr = chartArray(node);
    const planetSign = {};
    let lagnaSign = null;
    if (!Array.isArray(arr)) return { planetSign, lagnaSign };
    arr.forEach((row, i) => {
        const house = Number(row.house != null ? row.house : i + 1);
        const sign = asSign(row.sign || row.rashi);
        if (house === 1 && sign) lagnaSign = sign;
        const list = Array.isArray(row.planets) ? row.planets : [];
        list.forEach((p) => {
            const pk = asPlanet(p);
            if (pk && sign) planetSign[pk] = sign;
        });
    });
    // planetDetails is cleaner when present
    const details = node && node.planetDetails;
    if (Array.isArray(details)) {
        details.forEach((d) => {
            const pk = asPlanet(d.planet || d.name);
            const sign = asSign(d.sign);
            if (pk && sign) planetSign[pk] = sign;
        });
    }
    return { planetSign, lagnaSign };
}

// ---------------------------------------------------------------------------
// Vimshottari dasha
// ---------------------------------------------------------------------------
/**
 * The API gives each dasha entry's END date. Convert the maha/antar tree into
 * explicit {planet, start, end} spans and resolve which is running on `now`.
 */
function buildDasha(vimNode, now) {
    const v = (vimNode && (vimNode.vimshottari || vimNode)) || null;
    if (!v || !Array.isArray(v.mahaDasha)) return null;

    const seqStart = parseApiDate(v.start);
    const maha = [];
    let cursor = seqStart;
    for (const row of v.mahaDasha) {
        const planet = asPlanet(row.planet);
        const end = parseApiDate(row.date);
        if (!planet || !end) continue;
        maha.push({ planet, start: cursor, end });
        cursor = end;
    }

    // antardashas keyed by their mahadasha lord
    const antarByMaha = {};
    if (Array.isArray(v.antarDasha)) {
        for (const block of v.antarDasha) {
            const mp = asPlanet(block.mahaDashaPlanet);
            if (!mp || !Array.isArray(block.dasha)) continue;
            const parent = maha.find((m) => m.planet === mp);
            let c = parent ? parent.start : null;
            const rows = [];
            for (const sub of block.dasha) {
                const planet = asPlanet(sub.planet);
                const end = parseApiDate(sub.date);
                if (!planet || !end) continue;
                rows.push({ planet, start: c, end });
                c = end;
            }
            antarByMaha[mp] = rows;
        }
    }

    const inSpan = (s) => s.start && s.end && now >= s.start && now < s.end;
    const currentMaha = maha.find(inSpan) || null;
    const currentAntar = currentMaha ? (antarByMaha[currentMaha.planet] || []).find(inSpan) || null : null;

    // Next few antardashas inside the current mahadasha, then the next mahadasha.
    const upcoming = [];
    if (currentMaha) {
        const rows = antarByMaha[currentMaha.planet] || [];
        const idx = currentAntar ? rows.indexOf(currentAntar) : -1;
        if (idx >= 0) {
            for (const r of rows.slice(idx + 1, idx + 4)) {
                upcoming.push({ level: 'antar', maha: currentMaha.planet, planet: r.planet, start: r.start, end: r.end });
            }
        }
        const mi = maha.indexOf(currentMaha);
        if (mi >= 0 && maha[mi + 1]) {
            const nm = maha[mi + 1];
            upcoming.push({ level: 'maha', planet: nm.planet, start: nm.start, end: nm.end });
        }
    }

    return {
        sequenceStart: seqStart,
        mahaDashas: maha,
        current: currentMaha
            ? {
                maha: currentMaha.planet,
                mahaStart: currentMaha.start,
                mahaEnd: currentMaha.end,
                antar: currentAntar ? currentAntar.planet : null,
                antarStart: currentAntar ? currentAntar.start : null,
                antarEnd: currentAntar ? currentAntar.end : null
            }
            : null,
        upcoming
    };
}

// ---------------------------------------------------------------------------
// Functional nature of each planet for a given lagna (Parashari)
// ---------------------------------------------------------------------------
const TRIKONA = [1, 5, 9];
const KENDRA = [1, 4, 7, 10];
const DUSTHANA = [6, 8, 12];
const NATURAL_BENEFIC = new Set(['jupiter', 'venus', 'moon', 'mercury']);

/**
 * Which houses each graha rules for this lagna, plus its functional nature
 * (Parashari / Laghu Parashari).
 *
 * Rules applied:
 *   - Yogakaraka: owns one of the pure kendras {4,7,10} AND one of the pure
 *     trikonas {5,9}. House 1 is excluded from BOTH sets here, because it is
 *     simultaneously kendra and trikona - counting it would wrongly make every
 *     lagna lord a yogakaraka.
 *   - Trikona lordship (5, 9) is strongly auspicious and outweighs a
 *     simultaneous dusthana lordship, but a planet holding both is reported as
 *     "mixed" rather than plainly benefic, which is more honest than either
 *     extreme.
 *   - Trishadaya lordship (3, 11) and dusthana lordship (6, 8, 12) are
 *     inauspicious.
 *   - Kendradhipati dosha: a NATURAL BENEFIC owning a pure kendra loses
 *     benefic power; a NATURAL MALEFIC owning one loses malefic power. The
 *     classical severity order is Jupiter > Venus > Mercury > Moon.
 *   - Lords of 2 and 7 are flagged as maraka (they act on longevity in their
 *     own periods); this is a flag, not a penalty.
 *
 * Rahu/Ketu own no sign; they act through their dispositor and their house.
 */
const PURE_KENDRA = [4, 7, 10];
const PURE_TRIKONA = [5, 9];
const KENDRADHIPATI_SEVERITY = { jupiter: 1.5, venus: 1.2, mercury: 1.0, moon: 0.8 };

function functionalNatures(lagnaSign) {
    const ownedHouses = {};
    for (const p of GRAHAS_7) ownedHouses[p] = [];
    for (let h = 1; h <= 12; h++) {
        const lord = SIGN_LORD[signAtHouse(lagnaSign, h)];
        ownedHouses[lord].push(h);
    }

    const nature = {};
    for (const p of GRAHAS_7) {
        const owned = ownedHouses[p];
        const isYogakaraka = owned.some((h) => PURE_KENDRA.includes(h)) && owned.some((h) => PURE_TRIKONA.includes(h));

        let score = 0;
        if (owned.includes(1)) score += 2;                                   // lagna lord is always auspicious
        if (owned.some((h) => PURE_TRIKONA.includes(h))) score += 2;         // 5th / 9th
        if (owned.some((h) => DUSTHANA.includes(h))) score -= 2;             // 6th / 8th / 12th
        if (owned.some((h) => h === 3 || h === 11)) score -= 1.5;            // trishadaya
        if (owned.some((h) => PURE_KENDRA.includes(h))) {
            score += NATURAL_BENEFIC.has(p) ? -KENDRADHIPATI_SEVERITY[p] : 1;
        }

        let value;
        if (isYogakaraka) value = 'yogakaraka';
        else if (score >= 2) value = 'benefic';
        else if (score >= 0.5) value = 'mixed';
        else if (score > -0.5) value = 'neutral';
        else value = 'malefic';

        nature[p] = {
            ownedHouses: owned,
            functional: value,
            functionalScore: Math.round(score * 100) / 100,
            isYogakaraka,
            isMaraka: owned.includes(2) || owned.includes(7),
            kendradhipatiDosha: NATURAL_BENEFIC.has(p) && owned.some((h) => PURE_KENDRA.includes(h))
        };
    }
    for (const p of ['rahu', 'ketu']) {
        nature[p] = {
            ownedHouses: [], functional: 'shadow', functionalScore: 0,
            isYogakaraka: false, isMaraka: false, kendradhipatiDosha: false
        };
    }
    return nature;
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------
/**
 * @param {Object} apiData  the external API's `data` object
 * @param {Object} [opts]   { now?: Date }
 */
function extractRichChart(apiData, opts = {}) {
    if (!apiData || typeof apiData !== 'object') {
        throw new Error('Kundli API returned no usable data object');
    }
    const now = opts.now instanceof Date ? opts.now : new Date();
    const bd = apiData.basicDetails || {};

    // ---- D-1 house array: sign per house + occupants ----
    const d1 = chartArray(apiData.lagna);
    if (!Array.isArray(d1) || d1.length === 0) {
        throw new Error('Kundli API response missing D-1 (lagna) chart');
    }

    const houseSign = {};
    const housePlanets = {};
    const planetHouse = {};
    for (let h = 1; h <= 12; h++) housePlanets[h] = [];

    let lagnaSign = null;
    d1.forEach((row, i) => {
        const house = Number(row.house != null ? row.house : i + 1);
        const sign = asSign(row.sign || row.rashi);
        if (house >= 1 && house <= 12 && sign) houseSign[house] = sign;
        if (house === 1 && sign) lagnaSign = sign;
        const list = Array.isArray(row.planets) ? row.planets : [];
        list.forEach((p) => {
            const pk = asPlanet(p);
            if (pk && house >= 1 && house <= 12) {
                planetHouse[pk] = house;
                housePlanets[house].push(pk);
            }
        });
    });

    if (!lagnaSign) lagnaSign = asSign(bd.lagna);
    if (!lagnaSign) throw new Error('Could not determine lagna sign from Kundli API response');
    for (let h = 1; h <= 12; h++) if (!houseSign[h]) houseSign[h] = signAtHouse(lagnaSign, h);

    // ---- Bhava Chalit (planets can fall in a different bhava) ----
    const chalitHouse = {};
    const chalitArr = chartArray(apiData.chalit);
    if (Array.isArray(chalitArr)) {
        chalitArr.forEach((row, i) => {
            const house = Number(row.house != null ? row.house : i + 1);
            (Array.isArray(row.planets) ? row.planets : []).forEach((p) => {
                const pk = asPlanet(p);
                if (pk) chalitHouse[pk] = house;
            });
        });
    }

    // ---- Per-planet detail rows ----
    const details = {};
    let lagnaDetail = null;
    if (Array.isArray(apiData.lagna && apiData.lagna.planetDetails)) {
        for (const row of apiData.lagna.planetDetails) {
            const nameRaw = lower(row.name || row.planet);
            if (nameRaw === 'lagna' || nameRaw === 'ascendant') { lagnaDetail = row; continue; }
            const pk = asPlanet(nameRaw);
            if (pk) details[pk] = row;
        }
    }

    // ---- Avasthas ----
    const avastha = {};
    if (Array.isArray(apiData.lagna && apiData.lagna.planetAwastha)) {
        for (const row of apiData.lagna.planetAwastha) {
            const pk = asPlanet(row.name || row.planet);
            if (pk) {
                avastha[pk] = {
                    baladi: row.baladi || null,
                    sayanadi: row.sayanadi || null,
                    deepthadi: row.deeptthadi || row.deepthadi || null,
                    lajjitadi: row.lajjitadi || null
                };
            }
        }
    }

    // ---- Aspects (precomputed by the API) ----
    const aspectHouses = {};
    const aspectPlanets = {};
    const aspectedBy = {};
    for (const p of PLANETS) { aspectHouses[p] = []; aspectPlanets[p] = []; aspectedBy[p] = []; }
    const dr = apiData.dristhi || {};
    if (dr.house && typeof dr.house === 'object') {
        for (const [p, arr] of Object.entries(dr.house)) {
            const pk = asPlanet(p);
            if (pk && Array.isArray(arr)) aspectHouses[pk] = arr.map(Number).filter((n) => n >= 1 && n <= 12);
        }
    }
    if (dr.d1 && typeof dr.d1 === 'object') {
        for (const [p, arr] of Object.entries(dr.d1)) {
            const pk = asPlanet(p);
            if (!pk || !Array.isArray(arr)) continue;
            // API lists, for each planet, the planets that aspect IT.
            const sources = arr.map(asPlanet).filter(Boolean);
            aspectedBy[pk] = sources;
            for (const s of sources) if (!aspectPlanets[s].includes(pk)) aspectPlanets[s].push(pk);
        }
    }

    // ---- Ashtakavarga ----
    const av = apiData.ashtakvarg || {};
    const sav = Array.isArray(av.total) ? av.total.map(Number) : null;
    const bav = {};
    for (const p of GRAHAS_7) if (Array.isArray(av[p])) bav[p] = av[p].map(Number);

    // ---- Shadbala ----
    const shadbala = {};
    const power = apiData.power || {};
    const rupaParts = ['uchchabal', 'kendrabal', 'driskonabal', 'digbal', 'yugmabal', 'saptvargbal', 'divaratibal', 'pakshabal', 'kaalbal'];
    for (const p of GRAHAS_7) {
        let total = 0;
        let seen = 0;
        for (const part of rupaParts) {
            const node = power[part];
            if (!node || node[p] == null) continue;
            const val = parseDegree(node[p]); // values look like "57'47\"" = minutes/seconds of a rupa
            if (val != null) { total += val; seen++; }
        }
        if (seen) shadbala[p] = Math.round(total * 100) / 100;
    }
    const shadbalaValues = Object.values(shadbala);
    const shadbalaMax = shadbalaValues.length ? Math.max(...shadbalaValues) : 0;

    // ---- Divisional charts we care about ----
    const d9 = readDivisional(apiData.navamsh);
    const d10 = readDivisional(apiData.dashamsha);
    const d7 = readDivisional(apiData.saptamsha);
    const d12 = readDivisional(apiData.dwadashamsha);

    // ---- Functional natures for this lagna ----
    const natures = functionalNatures(lagnaSign);

    // ---- Assemble planets ----
    const moonSignFromChart = (() => {
        for (let h = 1; h <= 12; h++) if (housePlanets[h].includes('moon')) return houseSign[h];
        return null;
    })();

    const planets = {};
    for (const p of PLANETS) {
        const det = details[p] || {};
        const sign = asSign(det.sign) || (planetHouse[p] ? houseSign[planetHouse[p]] : null);
        const house = planetHouse[p] || (sign ? houseFrom(lagnaSign, sign) : null);
        const nak = det.nakshatra || {};
        const d9Sign = d9.planetSign[p] || null;
        const d10Sign = d10.planetSign[p] || null;

        planets[p] = {
            key: p,
            sign,
            signLord: sign ? SIGN_LORD[sign] : null,
            house,
            chalitHouse: chalitHouse[p] != null ? chalitHouse[p] : house,
            degree: parseDegree(det.degree),
            nakshatra: nak.name || null,
            nakshatraPada: nak.charan != null ? Number(nak.charan) : null,
            nakshatraLord: asPlanet(det.nakshatraLord),
            subLord: asPlanet(det.subLord),
            retrograde: !!det.retrograde,
            combust: !!det.combust,
            exalted: !!det.exalted,
            debilitated: !!det.debilitated,
            ownSign: !!det.ownSign,
            moolTrikona: !!det.moolTrikona,
            vargottam: !!det.vargottam,
            signRelation: typeof det.relation === 'number' ? det.relation : null,
            avastha: avastha[p] || null,
            aspectsHouses: aspectHouses[p],
            aspectsPlanets: aspectPlanets[p],
            aspectedBy: aspectedBy[p],
            shadbala: shadbala[p] != null ? shadbala[p] : null,
            shadbalaRatio: shadbala[p] != null && shadbalaMax ? Math.round((shadbala[p] / shadbalaMax) * 100) / 100 : null,
            ownedHouses: natures[p].ownedHouses,
            functional: natures[p].functional,
            isYogakaraka: natures[p].isYogakaraka,
            naturalBenefic: NATURAL_BENEFIC.has(p),
            d9Sign,
            d9House: d9Sign && d9.lagnaSign ? houseFrom(d9.lagnaSign, d9Sign) : null,
            d9Vargottam: !!det.vargottam,
            d10Sign,
            d10House: d10Sign && d10.lagnaSign ? houseFrom(d10.lagnaSign, d10Sign) : null,
            bav: bav[p] || null
        };
    }

    // ---- Assemble houses ----
    const houses = {};
    for (let h = 1; h <= 12; h++) {
        const sign = houseSign[h];
        const lord = SIGN_LORD[sign];
        const aspectingPlanets = PLANETS.filter((p) => aspectHouses[p].includes(h));
        houses[h] = {
            house: h,
            sign,
            signLord: lord,
            lord,
            lordHouse: planets[lord] ? planets[lord].house : null,
            occupants: housePlanets[h].slice(),
            aspectedBy: aspectingPlanets,
            benefics: housePlanets[h].filter((p) => NATURAL_BENEFIC.has(p)),
            malefics: housePlanets[h].filter((p) => !NATURAL_BENEFIC.has(p)),
            sav: sav ? sav[h - 1] : null
        };
    }

    // ---- Conjunctions (pairs sharing a house) ----
    const conjunctions = [];
    for (let h = 1; h <= 12; h++) {
        const ps = housePlanets[h];
        for (let i = 0; i < ps.length; i++) {
            for (let j = i + 1; j < ps.length; j++) {
                conjunctions.push({ planets: [ps[i], ps[j]], house: h, sign: houseSign[h] });
            }
        }
    }

    // ---- Dasha ----
    const dasha = buildDasha(apiData.vimshottari, now);

    // ---- Doshas the API flags ----
    const yesNo = (v) => {
        const s = lower(v);
        if (s === 'yes' || s === 'true') return true;
        if (s === 'no' || s === 'false') return false;
        return null;
    };
    const doshas = {
        mangal: yesNo(bd.mangalDosh),
        rahu: yesNo(bd.rahuDosh),
        ketu: yesNo(bd.ketuDosh),
        shani: yesNo(bd.shanidosh)
    };

    // ---- Yogas the API detects ----
    const apiYogas = Array.isArray(apiData.yogas)
        ? apiData.yogas
            .filter((y) => yesNo(y.value) === true)
            .map((y) => ({ name: String(y.name || '').trim(), effect: y.prabhav || null }))
        : [];

    // ---- Jaimini chara karakas ----
    const karakas = {};
    if (apiData.Karaka && apiData.Karaka.char && typeof apiData.Karaka.char === 'object') {
        for (const [role, p] of Object.entries(apiData.Karaka.char)) {
            const pk = asPlanet(p);
            if (pk) karakas[role] = pk;
        }
    }

    // ---- Panchadha (compound) friendship matrix ----
    const panchadha = {};
    const pm = apiData.grahMatri && apiData.grahMatri.panchadha;
    if (pm && typeof pm === 'object') {
        for (const [p, arr] of Object.entries(pm)) {
            const pk = asPlanet(p);
            if (!pk || !Array.isArray(arr)) continue;
            panchadha[pk] = {};
            GRAHAS_7.forEach((other, i) => {
                if (other !== pk && typeof arr[i] === 'number') panchadha[pk][other] = arr[i];
            });
        }
    }

    const moonSign = asSign(bd.moonSign) || asSign(bd.rashi) || moonSignFromChart;

    return {
        // identity
        lagnaSign,
        lagnaLord: SIGN_LORD[lagnaSign],
        lagnaDegree: lagnaDetail ? parseDegree(lagnaDetail.degree) : null,
        lagnaNakshatra: lagnaDetail && lagnaDetail.nakshatra
            ? { name: lagnaDetail.nakshatra.name || null, pada: lagnaDetail.nakshatra.charan != null ? Number(lagnaDetail.nakshatra.charan) : null, lord: asPlanet(lagnaDetail.nakshatraLord) }
            : null,
        moonSign,
        moonNakshatra: {
            name: bd.nakshatra || (planets.moon && planets.moon.nakshatra) || null,
            pada: bd.pada != null ? Number(bd.pada) : (planets.moon ? planets.moon.nakshatraPada : null),
            lord: asPlanet(bd.nakshatraLord) || (planets.moon ? planets.moon.nakshatraLord : null)
        },
        sunSign: planets.sun ? planets.sun.sign : null,

        // core structures
        planets,
        houses,
        conjunctions,
        sav,
        savTotal: sav ? sav.reduce((a, b) => a + b, 0) : null,

        // timing
        dasha,

        // divisionals
        navamsaLagnaSign: d9.lagnaSign,
        dashamsaLagnaSign: d10.lagnaSign,
        d7: d7.planetSign,
        d12: d12.planetSign,

        // extras
        karakas,
        doshas,
        apiYogas,
        panchadha,

        // panchang / matching attributes
        panchang: {
            tithi: bd.tithi || null,
            paksha: bd.paksha || null,
            yoga: bd.yoga || null,
            karan: bd.karan || null,
            gana: bd.gana || null,
            nadi: bd.nadi || null,
            yoni: bd.yoni || null,
            varna: bd.varna || null,
            vasya: bd.vasya || null,
            paya: bd.paya || null
        },

        // legacy-compatible fields (old engines still read these)
        planetHouse,
        housePlanets,
        planetNavamsaSign: d9.planetSign,
        planetFlags: Object.fromEntries(PLANETS.map((p) => [p, {
            retrograde: planets[p].retrograde,
            combust: planets[p].combust,
            exalted: planets[p].exalted,
            debilitated: planets[p].debilitated
        }]))
    };
}

module.exports = {
    extractRichChart,
    // helpers reused by the narrative layer
    SIGNS, PLANETS, GRAHAS_7, SIGN_LORD, NATURAL_BENEFIC,
    TRIKONA, KENDRA, DUSTHANA,
    houseFrom, signAtHouse, parseDegree, parseApiDate, functionalNatures
};
