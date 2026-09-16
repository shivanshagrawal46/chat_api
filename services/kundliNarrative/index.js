/**
 * services/kundliNarrative/index.js
 *
 * Deterministic narrative composer for the full kundli report.
 *
 * Takes the normalised chart from kundliChartService (+ basicDetails from the
 * external API) and produces, for the chart overview and for each of the four
 * life areas (career, marriage, money, health), an ordered list of TOPICS.
 * Every topic is 2-3 flowing paragraphs in English AND Hindi, written the way
 * an astrologer would explain the chart:
 *
 *   overview : chart at a glance -> the Ascendant (1st house)
 *              -> one topic per planet sitting in the 1st house
 *   <domain> : how the Lagna feeds this area
 *              -> for each significator house of the domain:
 *                   the house + its lord  -> one topic per planet in it
 *              -> one topic per conjunction in the domain's houses (yogas)
 *              -> Navamsa (D-9) strength of the relevant lords
 *              -> overall verdict (strong / balanced / challenging) + guidance
 *
 * NO AI/LLM is involved. All text comes from the bilingual phrase bank in
 * data.js, the per-domain datasets under data/astrology/<domain>/ (planet
 * traits, life-area lists, house angles, lagna-aware yoga tables) and the
 * sentence writers in sentences.en.js / sentences.hi.js. Variant sentences are
 * chosen with a seeded hash so the same chart always yields the same text.
 */

'use strict';

const path = require('path');
const D = require('./data');
const EN = require('./sentences.en');
const HI = require('./sentences.hi');
const { pick, pickSome } = require('./util');

const DATA_ROOT = path.join(__dirname, '..', '..', 'data', 'astrology');

// Load each domain's dataset tables once (require() caches them).
const DS = {};
for (const dom of D.DOMAIN_ORDER) {
    const dir = path.join(DATA_ROOT, dom);
    const cfg = D.DOMAINS[dom];
    const yogaTables = { 1: require(path.join(dir, 'firstHouseConjunctionYogas.json')) };
    for (const h of cfg.houses) yogaTables[h] = require(path.join(dir, `${cfg.yogaTable[h]}.json`));
    DS[dom] = {
        planets: require(path.join(dir, 'planets.json')),
        houses: require(path.join(dir, 'houses.json')),
        lagnaBase: require(path.join(dir, 'lagnaBase.json')),
        yogaTables
    };
}

const WRITERS = { en: EN, hi: HI };
const SIGN_INDEX = Object.fromEntries(D.SIGN_ORDER.map((s, i) => [s, i]));

// ---------------------------------------------------------------------------
// Small chart helpers
// ---------------------------------------------------------------------------
function signAt(lagna, house) {
    return D.SIGN_ORDER[(SIGN_INDEX[lagna] + house - 1) % 12];
}

function houseOfSign(fromSign, sign) {
    return ((SIGN_INDEX[sign] - SIGN_INDEX[fromSign] + 12) % 12) + 1;
}

/** Dignity of a planet in a sign: exalted / own / debilitated / friend / neutral / enemy. */
function dignityIn(planet, sign, flags) {
    const pl = D.PLANETS[planet];
    if ((flags && flags.exalted) || pl.exalt === sign) return 'exalted';
    if ((flags && flags.debilitated) || pl.debil === sign) return 'debilitated';
    if (pl.own.includes(sign)) return 'own';
    const lord = D.SIGNS[sign].lord;
    if (lord === planet) return 'own';
    if (pl.friends.includes(lord)) return 'friend';
    if (pl.enemies.includes(lord)) return 'enemy';
    return 'neutral';
}

function relationBetween(a, b) {
    if (a === b) return 'self';
    if (D.PLANETS[a].friends.includes(b)) return 'friend';
    if (D.PLANETS[a].enemies.includes(b)) return 'enemy';
    return 'neutral';
}

/** Mutual relation for a conjunction pair (matches the dataset convention). */
function pairRelation(a, b) {
    const ab = relationBetween(a, b);
    const ba = relationBetween(b, a);
    if (ab === 'enemy' || ba === 'enemy') return 'enemy';
    if (ab === 'friend' && ba === 'friend') return 'friend';
    return 'neutral';
}

function conjKey(a, b) {
    const order = (p) => D.PLANET_ORDER.indexOf(p);
    const [x, y] = [a, b].sort((p, q) => order(p) - order(q));
    return `${x}_${y}`;
}

function sortPlanets(list) {
    return [...list].sort((a, b) => D.PLANET_ORDER.indexOf(a) - D.PLANET_ORDER.indexOf(b));
}

function bilingualAreas(planetRow, areasKey, n, seed, firstOnly) {
    const en = planetRow[areasKey].en;
    const hi = planetRow[areasKey].hi;
    const idx = firstOnly ? en.slice(0, n).map((_, i) => i) : pickSome(en.map((_, i) => i), n, seed);
    return { en: idx.map((i) => en[i]), hi: idx.map((i) => hi[i]) };
}

function normalizeSignName(v) {
    const s = String(v || '').trim().toLowerCase();
    return D.SIGN_ORDER.includes(s) ? s : null;
}

function planetKeyFromName(v) {
    const s = String(v || '').trim().toLowerCase();
    return D.PLANET_ORDER.includes(s) ? s : null;
}

function parseMangalDosh(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return /^(yes|true|present|manglik|high|partial)/i.test(v.trim()) ? true : /^(no|false|absent|none)/i.test(v.trim()) ? false : null;
    if (v && typeof v === 'object') {
        for (const k of ['present', 'hasDosh', 'isManglik', 'manglik', 'status']) {
            if (typeof v[k] === 'boolean') return v[k];
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Topic builder
// ---------------------------------------------------------------------------
function makeTopic(id, type, title, writerName, facts, meta = {}) {
    const paragraphs = {
        en: WRITERS.en[writerName](facts).filter(Boolean),
        hi: WRITERS.hi[writerName](facts).filter(Boolean)
    };
    return {
        id,
        type,
        title,
        paragraphs,
        text: { en: paragraphs.en.join('\n\n'), hi: paragraphs.hi.join('\n\n') },
        meta
    };
}

const ordEn = (n) => D.ORDINALS.en[n];
const ordHi = (n) => D.ORDINALS.hi[n];
const pEn = (k) => D.PLANETS[k].name.en;
const pHi = (k) => D.PLANETS[k].name.hi;
const coreEn = (lbl) => lbl.replace(/^the \d+(st|nd|rd|th) house of /, '');
const coreHi = (lbl) => lbl.replace(/ का \S+ भाव$/, '');
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Chart overview section
// ---------------------------------------------------------------------------
function buildOverview(n, bd, name) {
    const lagna = n.lagnaSign;
    const lagnaLord = D.SIGNS[lagna].lord;
    const flags = n.planetFlags || {};
    const h1 = sortPlanets(n.housePlanets[1] || []);

    let kendraCount = 0, trikonaCount = 0, dusthanaCount = 0, otherCount = 0;
    for (const [, h] of Object.entries(n.planetHouse)) {
        if ([1, 4, 7, 10].includes(h)) kendraCount++;
        else if ([5, 9].includes(h)) trikonaCount++;
        else if ([6, 8, 12].includes(h)) dusthanaCount++;
        else otherCount++;
    }

    const nakLordKey = planetKeyFromName(bd.nakshatraLord);
    const topics = [];

    topics.push(makeTopic('glance', 'glance',
        { en: 'Your Birth Chart at a Glance', hi: 'आपकी जन्म-कुंडली एक नज़र में' },
        'glance', {
            name,
            lagna, lagnaLord,
            moonSign: normalizeSignName(bd.moonSign) || normalizeSignName(bd.rashi),
            nakshatra: bd.nakshatra || null,
            nakshatraLord: bd.nakshatraLord || null,
            nakshatraLordHi: nakLordKey ? pHi(nakLordKey) : (bd.nakshatraLord || null),
            mangalDosh: parseMangalDosh(bd.mangalDosh),
            kendraCount, trikonaCount, dusthanaCount, otherCount,
            planetsInH1: h1
        }, { lagna, lagnaLord }));

    const lordHouse = n.planetHouse[lagnaLord];
    topics.push(makeTopic('house_1', 'house',
        { en: 'Your Ascendant (1st House)', hi: 'आपका लग्न (प्रथम भाव)' },
        'ascendant', {
            lagna, lord: lagnaLord, lordHouse,
            lordDignity: dignityIn(lagnaLord, signAt(lagna, lordHouse), flags[lagnaLord]),
            lordFlags: flags[lagnaLord] || {},
            category: D.genericCategory(lordHouse),
            planetsInH1: h1
        }, { house: 1, sign: lagna, lord: lagnaLord, lordHouse }));

    for (const p of h1) {
        topics.push(makeTopic(`planet_${p}_house_1`, 'planet',
            { en: `${pEn(p)} in your 1st House`, hi: `आपके प्रथम भाव में ${pHi(p)}` },
            'planetInFirst', {
                planet: p, lagna,
                dignity: dignityIn(p, lagna, flags[p]),
                flags: flags[p] || {},
                isLagnaLord: p === lagnaLord,
                others: h1.filter((x) => x !== p)
            }, { planet: p, house: 1 }));
    }

    return { title: { en: 'Chart Overview', hi: 'कुंडली परिचय' }, topics };
}

// ---------------------------------------------------------------------------
// Domain section
// ---------------------------------------------------------------------------
function buildDomain(dom, n) {
    const cfg = D.DOMAINS[dom];
    const ds = DS[dom];
    const lagna = n.lagnaSign;
    const base = ds.lagnaBase[lagna];
    const houseLords = base.houseLords;
    const flags = n.planetFlags || {};
    const lagnaLord = base.lagnaLord;
    const topics = [];
    const factors = []; // { score, label:{en,hi} }
    const yogasFound = []; // { en, hi }

    const domainCategory = (h) => ds.houses[String(h)].category;
    const angleOf = (h) => ds.houses[String(h)][cfg.angleKey];
    const traitsOf = (p) => ds.planets[p].traits;
    const areasOf = (p, k, seed) => bilingualAreas(ds.planets[p], cfg.areasKey, k, seed, dom === 'health');

    const lordFactor = (planet, house, roleEn, roleHi, catScore, dig, fl) => {
        let score = catScore + D.DIGNITY_SCORE[dig] * 0.5;
        if (fl.retrograde) score -= 0.5;
        if (fl.combust) score -= 0.5;
        factors.push({
            type: 'lord',
            score,
            label: {
                en: `your ${roleEn} ${pEn(planet)} in the ${ordEn(house)} house`,
                hi: `${ordHi(house)} भाव में स्थित आपके ${roleHi} ${pHi(planet)}`
            }
        });
    };

    // 1. Lagna lord + planets in the 1st house, seen through this domain
    const llHouse = n.planetHouse[lagnaLord];
    const llDig = dignityIn(lagnaLord, signAt(lagna, llHouse), flags[lagnaLord]);
    const h1 = sortPlanets(n.housePlanets[1] || []);
    lordFactor(lagnaLord, llHouse, 'lagna lord', 'लग्नेश', D.CATEGORY_SCORE[domainCategory(llHouse)], llDig, flags[lagnaLord] || {});
    topics.push(makeTopic('lagna', 'lagna',
        { en: `How your Lagna shapes ${cfg.title.en}`, hi: `${cfg.title.hi} पर लग्न का प्रभाव` },
        'domainLagna', {
            domain: dom, lord: lagnaLord, lordHouse: llHouse,
            category: domainCategory(llHouse),
            angle: angleOf(llHouse),
            planetsInH1: h1.map((p) => ({ planet: p, areas: areasOf(p, 2, `${dom}:h1:${p}:${lagna}`) }))
        }, { house: 1, lord: lagnaLord, lordHouse: llHouse }));

    // 2. Each significator house: the house + lord, then each occupant
    for (const h of cfg.houses) {
        const lord = houseLords[String(h)];
        const lordHouse = n.planetHouse[lord];
        const dig = dignityIn(lord, signAt(lagna, lordHouse), flags[lord]);
        const occupants = sortPlanets(n.housePlanets[h] || []);
        const isYogakaraka = base.yogakaraka === lord;
        const cat = domainCategory(lordHouse);
        lordFactor(lord, lordHouse, cfg.roleLabel[h].en, cfg.roleLabel[h].hi, D.CATEGORY_SCORE[cat] + (isYogakaraka ? 1 : 0), dig, flags[lord] || {});

        topics.push(makeTopic(`house_${h}`, 'house',
            { en: `Your ${ordEn(h)} House: ${capFirst(coreEn(cfg.houseLabel[h].en))}`, hi: `आपका ${ordHi(h)} भाव: ${coreHi(cfg.houseLabel[h].hi)}` },
            'domainHouse', {
                domain: dom, house: h, sign: signAt(lagna, h), lord, lordHouse,
                category: cat, angle: angleOf(lordHouse), dignity: dig,
                flags: flags[lord] || {}, isYogakaraka, planets: occupants
            }, { house: h, sign: signAt(lagna, h), lord, lordHouse, isYogakaraka }));

        for (const p of occupants) {
            const pdig = dignityIn(p, signAt(lagna, h), flags[p]);
            const nature = D.PLANETS[p].nature;
            let score = nature === 'benefic' ? 1 : -1;
            if (dom === 'health' && nature === 'benefic') score = -0.5;
            score += D.DIGNITY_SCORE[pdig] * 0.5;
            factors.push({ type: 'occupant', score, label: { en: `${pEn(p)} in your ${ordEn(h)} house`, hi: `आपके ${ordHi(h)} भाव में ${pHi(p)}` } });

            topics.push(makeTopic(`planet_${p}_house_${h}`, 'planet',
                { en: `${pEn(p)} in your ${ordEn(h)} House`, hi: `आपके ${ordHi(h)} भाव में ${pHi(p)}` },
                'domainPlanet', {
                    domain: dom, planet: p, house: h, dignity: pdig, flags: flags[p] || {},
                    houseLord: lord, relationToHouseLord: relationBetween(p, lord),
                    traits: traitsOf(p), areas: areasOf(p, 3, `${dom}:${p}:${h}:${lagna}`)
                }, { planet: p, house: h }));
        }
    }

    // 3. Conjunctions in the 1st house and in the domain's houses (with yogas)
    const relevant = new Set([1, ...cfg.houses]);
    for (const c of n.conjunctions || []) {
        if (!relevant.has(c.house)) continue;
        const [a, b] = sortPlanets(c.planets);
        const key = conjKey(a, b);
        const yogaRow = ds.yogaTables[c.house][`${lagna}_${key}`] || { yogaType: 'general', yogakarakaInvolved: false };
        const classical = D.CLASSICAL_YOGAS[key] ? key : null;
        const rel = pairRelation(a, b);

        let score = (D.YOGA_SCORE[yogaRow.yogaType] || 0) + D.CATEGORY_SCORE[domainCategory(c.house)] * 0.5;
        if (classical) score += 0.5;
        if (rel === 'enemy') score -= 1;
        if (rel === 'friend') score += 0.5;
        if (yogaRow.yogaType !== 'general') {
            const nm = D.YOGA_TEXT[yogaRow.yogaType].name;
            yogasFound.push({ en: nm.en, hi: nm.hi });
            factors.push({ type: 'conjunction', score, label: { en: `the ${nm.en} formed by ${pEn(a)} and ${pEn(b)}`, hi: `${pHi(a)} और ${pHi(b)} से बना ${nm.hi}` } });
        } else if (classical) {
            const nm = D.CLASSICAL_YOGAS[key].name;
            yogasFound.push({ en: nm.en, hi: nm.hi });
            factors.push({ type: 'conjunction', score, label: { en: `the ${nm.en} formed by ${pEn(a)} and ${pEn(b)}`, hi: `${pHi(a)} और ${pHi(b)} से बना ${nm.hi}` } });
        } else {
            factors.push({ type: 'conjunction', score, label: { en: `the ${pEn(a)}-${pEn(b)} pairing in the ${ordEn(c.house)} house`, hi: `${ordHi(c.house)} भाव में ${pHi(a)}-${pHi(b)} की युति` } });
        }

        const seed = `${dom}:cj:${key}:${c.house}:${lagna}`;
        const areaA = areasOf(a, 1, seed + ':a');
        const areaB = areasOf(b, 1, seed + ':b');
        topics.push(makeTopic(`conjunction_${key}_house_${c.house}`, 'conjunction',
            { en: `${pEn(a)} and ${pEn(b)} together in the ${ordEn(c.house)} House`, hi: `${ordHi(c.house)} भाव में ${pHi(a)} और ${pHi(b)} की युति` },
            'conjunction', {
                domain: dom, a, b, house: c.house, relation: rel,
                traitsA: traitsOf(a), traitsB: traitsOf(b),
                areaA: { en: areaA.en[0], hi: areaA.hi[0] }, areaB: { en: areaB.en[0], hi: areaB.hi[0] },
                classical, yogaType: yogaRow.yogaType, yogakarakaInvolved: !!yogaRow.yogakarakaInvolved
            }, { planets: [a, b], house: c.house, yogaType: yogaRow.yogaType, classicalYoga: classical }));
    }

    // 4. Navamsa strength of the lagna lord + domain lords
    if (n.navamsaLagnaSign) {
        const roles = [{ planet: lagnaLord, roleLabel: { en: 'lagna lord', hi: 'लग्नेश' } }];
        for (const h of cfg.houses) roles.push({ planet: houseLords[String(h)], roleLabel: cfg.roleLabel[h] });
        const seen = new Set();
        const entries = [];
        let navScore = 0;
        for (const r of roles) {
            const sign = n.planetNavamsaSign[r.planet];
            if (!sign || seen.has(r.planet)) continue;
            seen.add(r.planet);
            const house = houseOfSign(n.navamsaLagnaSign, sign);
            const dig = dignityIn(r.planet, sign);
            const cat = D.genericCategory(house);
            const s = D.DIGNITY_SCORE[dig] + D.CATEGORY_SCORE[cat] * 0.5;
            navScore += s;
            factors.push({ type: 'navamsa', score: s, label: { en: `${pEn(r.planet)} ${D.DIGNITY_SHORT[dig].en} in the Navamsa`, hi: `नवांश में ${D.DIGNITY_SHORT[dig].hi} में स्थित ${pHi(r.planet)}` } });
            entries.push({ roleLabel: r.roleLabel, planet: r.planet, sign, dignity: dig, house, category: cat });
        }
        if (entries.length) {
            const tone = navScore >= 2 ? 'strong' : navScore <= -1 ? 'challenging' : 'balanced';
            topics.push(makeTopic('navamsa', 'navamsa',
                { en: 'Navamsa (D-9) Strength', hi: 'नवांश (डी-9) की शक्ति' },
                'navamsa', { domain: dom, d9Lagna: n.navamsaLagnaSign, entries, tone },
                { navamsaLagna: n.navamsaLagnaSign, tone }));
        }
    }

    // 5. Overall verdict
    // Average score per factor so domains with more factors are not favoured.
    const total = factors.reduce((s, f) => s + f.score, 0);
    const score = Math.round((total / factors.length) * 100) / 100;
    const tone = score >= D.TONE_THRESHOLDS.strong ? 'strong' : score <= D.TONE_THRESHOLDS.challenging ? 'challenging' : 'balanced';
    const best = factors.reduce((a, b) => (b.score > a.score ? b : a), factors[0]);
    const worst = factors.reduce((a, b) => (b.score < a.score ? b : a), factors[0]);
    const strongest = {
        en: best.score > 0 ? `The strongest support comes from ${best.label.en}.` : `The steadiest factor here is ${best.label.en}.`,
        hi: best.score > 0 ? `सबसे मज़बूत सहारा है: ${best.label.hi}।` : `यहाँ सबसे स्थिर कारक है: ${best.label.hi}।`
    };
    const weakest = worst.score < 0 && worst !== best ? {
        en: `The area needing most care is ${worst.label.en}.`,
        hi: `सबसे अधिक सावधानी चाहिए: ${worst.label.hi}।`
    } : null;
    const uniqueYogas = yogasFound.filter((y, i, arr) => arr.findIndex((z) => z.en === y.en) === i);

    const conclusion = makeTopic('conclusion', 'conclusion',
        { en: `Overall ${cfg.title.en} Picture`, hi: `${cfg.title.hi}: समग्र निष्कर्ष` },
        'conclusion', { domain: dom, tone, score, strongest, weakest, yogas: uniqueYogas },
        { tone, score });
    topics.push(conclusion);

    return {
        key: dom,
        title: cfg.title,
        tone,
        score,
        summary: { en: conclusion.paragraphs.en[0], hi: conclusion.paragraphs.hi[0] },
        yogas: uniqueYogas,
        factors: factors.map((f) => ({ type: f.type, label: f.label, score: Math.round(f.score * 100) / 100 })),
        topics
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * @param {Object} normalized   output of kundliChartService.normalizeChart
 * @param {Object} [basicDetails] compact basicDetails from fetchFullKundliChart
 * @param {Object} [opts]        { domains?: string[], name?: string }
 */
function buildNarrativeReport(normalized, basicDetails = {}, opts = {}) {
    const domains = (opts.domains && opts.domains.length ? opts.domains : D.DOMAIN_ORDER)
        .filter((d) => D.DOMAIN_ORDER.includes(d));
    const report = {
        languages: ['en', 'hi'],
        overview: buildOverview(normalized, basicDetails || {}, (opts.name || '').trim())
    };
    for (const dom of D.DOMAIN_ORDER) {
        if (domains.includes(dom)) report[dom] = buildDomain(dom, normalized);
    }
    return report;
}

/** Collapse every { en, hi } pair in the report to a single language. */
function pickLanguage(value, lang) {
    if (Array.isArray(value)) return value.map((v) => pickLanguage(v, lang));
    if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 2 && keys.includes('en') && keys.includes('hi')) return value[lang];
        const out = {};
        for (const k of keys) out[k] = pickLanguage(value[k], lang);
        return out;
    }
    return value;
}

module.exports = { buildNarrativeReport, pickLanguage, dignityIn, signAt, houseOfSign };
