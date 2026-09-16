/**
 * services/kundliNarrative/sentences.en.js
 *
 * English paragraph writers. Each function receives a plain "facts" object
 * built by the composer (index.js) and returns an array of 2-3 paragraphs.
 * All wording is deterministic: variants are chosen with `pick(list, seed)`
 * so the same chart always produces the same text.
 */

'use strict';

const D = require('./data');
const { pick, joinList, capFirst } = require('./util');

const L = 'en';
const P = (k) => D.PLANETS[k].name.en;
const S = (k) => D.SIGNS[k].name.en;
const ord = (n) => D.ORDINALS.en[n];
const theme = (h) => D.HOUSES[h].en;
const dignity = (d) => D.DIGNITY_TEXT[d].en;
const category = (c, seed) => pick(D.CATEGORY_TEXT[c].en, seed);
// Dataset "angle" strings are sometimes noun phrases and sometimes full clauses ("this is the primary house of ...").
const angleSentence = (angle) => (/^this /i.test(angle.en) ? `In practical terms, ${angle.en.replace(/\.$/, '')}.` : `In practical terms this points to ${angle.en}.`);

function flagSentences(planet, flags = {}) {
    const out = [];
    if (flags.retrograde) out.push(`${P(planet)} is retrograde in your chart, which turns its energy inward: its results come in a delayed, reflective or unconventional way, and its lessons tend to repeat until they are fully learned.`);
    if (flags.combust) out.push(`${P(planet)} is also combust, sitting very close to the Sun, which dims some of its natural expression and asks you to develop its qualities consciously.`);
    return out.join(' ');
}

function natureNote(planet, seed) {
    const n = D.PLANETS[planet].nature;
    if (n === 'benefic') return pick([
        'As a natural benefic it tends to smooth this area of life and attract help at the right time.',
        'Being a natural benefic, it softens difficulties here and draws support from others.'
    ], seed);
    if (n === 'malefic') return pick([
        'As a natural malefic it adds intensity and drive, but it also demands discipline so that its energy builds rather than disrupts.',
        'Being a natural malefic, it brings ambition and toughness here, and asks for restraint so that its force stays constructive.'
    ], seed);
    return pick([
        'As a shadow planet it brings unconventional, sometimes unpredictable results here, with sudden rises and unexpected turns.',
        'Being a shadow planet, it works in unusual ways here, producing gains and setbacks that do not follow the ordinary script.'
    ], seed);
}

function relationToLordSentence(planet, houseLord, rel) {
    if (rel === 'self') return `It also rules this very house, so it sits in its own territory and its results are direct and undiluted.`;
    if (rel === 'friend') return `It is a friend of ${P(houseLord)}, the lord of this house, so it is welcomed here and works in harmony with the house's own agenda.`;
    if (rel === 'enemy') return `It is at odds with ${P(houseLord)}, the lord of this house, which creates some friction between what the house wants and what this planet wants; results come, but with adjustment.`;
    return `It is neutral towards ${P(houseLord)}, the lord of this house, so it neither clashes with nor especially boosts the house's own agenda.`;
}

const W = {};

// ---------------------------------------------------------------------------
// Chart overview
// ---------------------------------------------------------------------------
W.glance = (f) => {
    const seed = `glance:${f.lagna}:${f.moonSign}`;
    const sign = D.SIGNS[f.lagna];
    const el = D.ELEMENTS[sign.element];
    const q = D.QUALITIES[sign.quality];
    const whose = f.name ? `${f.name}'s` : 'your';

    const p1 = `This reading is based on ${whose} birth chart, which rises in ${S(f.lagna)} Lagna with ${P(f.lagnaLord)} as the lagna lord. ${S(f.lagna)} rising makes you ${sign.persona.en}. It is a ${el.en} sign of ${q.en} quality, which brings ${el.trait.en} into your basic temperament, and ${q.trait.en}.`;

    const parts2 = [];
    if (f.moonSign) parts2.push(`Your Moon sits in ${S(f.moonSign)}, so your emotional mind is ${D.SIGNS[f.moonSign].persona.en}; this is the sign that governs your moods, instincts and the way you feel safe.`);
    if (f.nakshatra) {
        parts2.push(`Your birth star is ${f.nakshatra}${f.nakshatraLord ? `, ruled by ${f.nakshatraLord}` : ''}.`);
        if (f.nakshatraLord) parts2.push(`The ruler of the birth star sets the tone of your first major planetary period and returns as a recurring theme whenever its dasha operates.`);
    }
    if (f.mangalDosh === true) parts2.push('The chart also shows Mangal Dosha, which is discussed further in the marriage section.');
    const p2 = parts2.length ? parts2.join(' ') : `The Moon sign and birth star were not available from the calculation, so this reading rests on the Lagna and the planetary houses.`;

    const total = f.kendraCount + f.trikonaCount + f.dusthanaCount + f.otherCount;
    let shape;
    if (f.kendraCount + f.trikonaCount >= 5) shape = 'a large share of the planets sit in angular and trinal houses, the strongest positions of a horoscope, which gives the chart a solid, well-supported foundation';
    else if (f.dusthanaCount >= 4) shape = 'many planets fall in the difficult 6th, 8th and 12th houses, which makes this a chart that grows through struggle, service and inner transformation rather than through easy fortune';
    else shape = 'the planets are spread fairly evenly between strong, growing and challenging houses, which gives a balanced chart where effort in the right direction is rewarded';
    const p3 = `Looking at the chart as a whole, ${shape}. ${f.planetsInH1.length ? `${joinList(f.planetsInH1.map(P), L)} ${f.planetsInH1.length > 1 ? 'rise' : 'rises'} with the Lagna and ${f.planetsInH1.length > 1 ? 'have' : 'has'} a direct say in your personality.` : 'No planet rises with the Lagna, so your personality is expressed mainly through the rising sign and its lord.'} ${pick(['The sections below take each area of life in turn, starting with the Lagna itself.', 'Each area of life is examined below, beginning with the Lagna and its lord.'], seed)}`;

    return [p1, p2, p3];
};

W.ascendant = (f) => {
    const seed = `asc:${f.lagna}:${f.lordHouse}`;
    const sign = D.SIGNS[f.lagna];
    const p1 = `The 1st house, or Lagna, is the doorway of the horoscope: it describes your body, temperament, self-image and the general direction your life takes. With ${S(f.lagna)} rising you come across as ${sign.persona.en}, and ${D.QUALITIES[sign.quality].trait.en}. ${P(f.lord)}, the ruler of ${S(f.lagna)}, therefore becomes your lagna lord, the single most important planet for your vitality and self-confidence.`;

    let placement;
    if (f.lordHouse === 1) placement = `Your lagna lord ${P(f.lord)} stays in the 1st house itself, ${dignity(f.lordDignity)}. A lagna lord in its own house is a classical mark of a strong constitution, self-reliance and the ability to recover from setbacks on your own strength.`;
    else placement = `Your lagna lord ${P(f.lord)} is placed in the ${ord(f.lordHouse)} house, the house of ${theme(f.lordHouse)}, ${dignity(f.lordDignity)}. This links your identity and physical vitality to ${theme(f.lordHouse)}: these matters draw your attention naturally and become the arena where you prove yourself.`;
    const p2 = `${placement} ${category(f.category, seed)} ${flagSentences(f.lord, f.lordFlags)}`.trim();

    let p3;
    if (f.planetsInH1.length === 0) p3 = `No planet occupies your 1st house. This keeps your personality relatively uncomplicated: it is expressed chiefly through ${S(f.lagna)} and through the placement of ${P(f.lord)} described above, without another planet colouring your appearance or manner. ${D.PLANETS[f.lord].advice.en}`;
    else p3 = `${joinList(f.planetsInH1.map(P), L)} ${f.planetsInH1.length > 1 ? 'occupy' : 'occupies'} your 1st house, so your personality is shaped as much by ${f.planetsInH1.length > 1 ? 'these planets' : 'this planet'} as by your rising sign. ${f.planetsInH1.length > 1 ? 'Each is' : 'It is'} examined in its own section below. ${D.PLANETS[f.lord].advice.en}`;

    return [p1, p2, p3];
};

W.planetInFirst = (f) => {
    const seed = `p1:${f.planet}:${f.lagna}`;
    const pl = D.PLANETS[f.planet];
    const p1 = `${P(f.planet)}, ${pl.essence.en}, rises with your Lagna in ${S(f.lagna)}. On the ascendant it gives ${pl.onLagna.en}. Here it is ${dignity(f.dignity)}. ${flagSentences(f.planet, f.flags)}`.trim();

    const p2 = `${capFirst(pl.strengths.en)} become defining features of how you approach life, and people tend to notice this planet in you before anything else. Because it sits in the 1st house it also touches the physical body, lending ${pl.body.en}. ${f.others.length ? `It shares the house with ${joinList(f.others.map(P), L)}, so its expression is blended with ${f.others.length > 1 ? 'their' : 'that planet\'s'} qualities rather than standing alone.` : pick(['Being the only planet on the ascendant, it colours your personality without competition.', 'As the sole occupant of the Lagna, its stamp on your character is clear and unmixed.'], seed)}`;

    const p3 = `${f.isLagnaLord ? `Since ${P(f.planet)} is also your lagna lord, this placement is doubly significant: a lord in its own house is a mark of self-made strength and resilience. ` : ''}The side to watch is ${pl.cautions.en}. ${pl.advice.en}`;

    return [p1, p2, p3];
};

// ---------------------------------------------------------------------------
// Domain sections
// ---------------------------------------------------------------------------
W.domainLagna = (f) => {
    const dm = D.DOMAINS[f.domain];
    const seed = `dl:${f.domain}:${f.lord}:${f.lordHouse}`;
    let placement;
    if (f.lordHouse === 1) placement = `Your lagna lord ${P(f.lord)} sits in the 1st house itself, which means ${dm.theme.en} ${pick(['rest squarely on your own personality, initiative and physical energy', 'depend first and foremost on you: your image, your effort and your stamina'], seed)}.`;
    else placement = `Your lagna lord ${P(f.lord)} is in the ${ord(f.lordHouse)} house, so ${dm.theme.en} ${pick(['are powered by', 'draw their energy from', 'are closely tied to'], seed)} ${theme(f.lordHouse)}.`;
    const p1 = `In ${f.domain} readings the lagna lord shows how your own personality and effort feed into ${dm.theme.en}. ${placement} ${angleSentence(f.angle)} ${category(f.category, seed)}`;

    let p2;
    if (f.planetsInH1.length === 0) p2 = `With no planet in the 1st house, ${dm.theme.en} are guided by ${P(f.lord)} and by the houses discussed next, without the extra push or pull of a rising planet. This usually means a clearer, more predictable path in this area, shaped by the choices you make rather than by strong inborn compulsions.`;
    else {
        const bits = f.planetsInH1.map((x) => `${P(x.planet)} inclines you towards ${joinList(x.areas.en, L)}`);
        p2 = `The ${f.planetsInH1.length > 1 ? 'planets' : 'planet'} rising with your Lagna also ${f.planetsInH1.length > 1 ? 'leave their' : 'leaves its'} mark on ${dm.theme.en}. ${capFirst(bits.join('; '))}. Because ${f.planetsInH1.length > 1 ? 'these planets sit' : 'this planet sits'} on the ascendant, ${f.planetsInH1.length > 1 ? 'their' : 'its'} influence shows up as personal inclination: ${pick(['it is the kind of path you are drawn to on your own, not one imposed by circumstances', 'you gravitate towards it naturally rather than being pushed into it'], seed)}.`;
    }
    return [p1, p2];
};

W.domainHouse = (f) => {
    const dm = D.DOMAINS[f.domain];
    const seed = `dh:${f.domain}:${f.house}:${f.lord}:${f.lordHouse}`;
    const label = dm.houseLabel[f.house].en;
    const sign = D.SIGNS[f.sign];
    const p1 = `Your ${ord(f.house)} house, ${label.replace(/^the \d+(st|nd|rd|th) house of /, 'the house of ')}, falls in ${S(f.sign)}, ruled by ${P(f.lord)}. ${S(f.sign)} on this house colours ${dm.theme.en} with an approach that is ${sign.persona.en}, and ${P(f.lord)} becomes your ${dm.roleLabel[f.house].en}, the planet whose condition decides how this area unfolds. ${f.isYogakaraka ? `${P(f.lord)} is also the Yogakaraka for your Lagna, ruling both an angular and a trinal house, which makes it one of the most auspicious planets in your whole chart.` : ''}`.trim();

    let placement;
    if (f.lordHouse === f.house) placement = `${P(f.lord)} stays in its own house, the ${ord(f.house)}, and therefore in its own sign, where it is completely at home. A house lord sitting in its own house is a strong and self-contained position: ${dm.theme.en} are protected and develop on their own strength.`;
    else if (f.lordHouse === 1) placement = `${P(f.lord)} is placed in your 1st house, right on the ascendant, ${dignity(f.dignity)}. This brings ${dm.theme.en} into the centre of your identity. ${angleSentence(f.angle)}`;
    else placement = `${P(f.lord)}, as lord of this house, is placed in the ${ord(f.lordHouse)} house of ${theme(f.lordHouse)}, ${dignity(f.dignity)}. This ties ${dm.theme.en} to ${theme(f.lordHouse)}. ${angleSentence(f.angle)}`;
    const p2 = `${placement} ${category(f.category, seed)} ${flagSentences(f.lord, f.flags)}`.trim();

    let p3;
    if (f.planets.length === 0) p3 = `No planet sits in this house. That is not a weakness in itself: it simply means the results depend on ${P(f.lord)} and on the planets that aspect the house rather than on a direct occupant, which usually makes this area steadier and less eventful. ${D.PLANETS[f.lord].advice.en}`;
    else p3 = `${joinList(f.planets.map(P), L)} ${f.planets.length > 1 ? 'occupy' : 'occupies'} this house directly, ${f.domain === 'health' ? 'which means health asks for active, ongoing attention rather than being taken for granted.' : `which makes ${dm.theme.en} a prominent, active theme in your life.`} ${f.planets.length > 1 ? 'Each of these planets is' : 'This planet is'} examined in its own section below. ${D.PLANETS[f.lord].advice.en}`;

    return [p1, p2, p3];
};

W.domainPlanet = (f) => {
    const dm = D.DOMAINS[f.domain];
    const seed = `dp:${f.domain}:${f.planet}:${f.house}`;
    const pl = D.PLANETS[f.planet];
    const label = dm.houseLabel[f.house].en;

    const p1 = `${P(f.planet)}, ${pl.essence.en}, occupies your ${ord(f.house)} house, ${label.replace(/^the \d+(st|nd|rd|th) house of /, 'the house of ')}. Here it is ${dignity(f.dignity)}, and it brings ${f.traits.en} directly into ${dm.theme.en}. ${relationToLordSentence(f.planet, f.houseLord, f.relationToHouseLord)} ${flagSentences(f.planet, f.flags)}`.trim();

    const p2 = `${dm.areasIntro.en} ${joinList(f.areas.en, L)}. ${natureNote(f.planet, seed)} ${pick([
        `Because it sits in the house itself rather than merely ruling it, its influence on ${dm.theme.en} is immediate and visible to others.`,
        `An occupant of the house acts more directly than its ruler, so this planet's effect on ${dm.theme.en} is felt early and openly.`
    ], seed)}`;

    const p3 = `${capFirst(pl.strengths.en)} are your assets in this area; the tendencies to watch are ${pl.cautions.en}. ${pl.advice.en}`;

    return [p1, p2, p3];
};

W.conjunction = (f) => {
    const dm = D.DOMAINS[f.domain];
    const seed = `cj:${f.domain}:${f.a}:${f.b}:${f.house}`;
    const label = dm.houseLabel[f.house] ? dm.houseLabel[f.house].en.replace(/^the \d+(st|nd|rd|th) house of /, 'the house of ') : `the house of ${theme(f.house)}`;
    const rel = {
        friend: `Since ${P(f.a)} and ${P(f.b)} are natural friends, they cooperate, and their combined influence tends to feel harmonious and mutually supportive.`,
        neutral: `${P(f.a)} and ${P(f.b)} are neutral to each other, so their energies coexist without much friction, each contributing its own flavour.`,
        enemy: `${P(f.a)} and ${P(f.b)} are natural enemies, so this pairing carries inner tension: their combined gifts are real, but they demand balance and self-awareness to be enjoyed.`
    }[f.relation];
    const p1 = `${P(f.a)} and ${P(f.b)} sit together in your ${ord(f.house)} house, ${label}. ${P(f.a)} brings ${f.traitsA.en}, while ${P(f.b)} contributes ${f.traitsB.en}. ${rel}`;

    const p2 = `For ${dm.theme.en} this combination blends ${f.areaA.en} with ${f.areaB.en}, a mixed path that draws on both planets. ${pick([
        'A conjunction is the closest relationship two planets can have, so neither works alone here: every result carries the signature of both.',
        'When two planets share a house they act as a single blended force, so the results in this area always show both natures at once.'
    ], seed)}`;

    const yogaBits = [];
    if (f.classical) yogaBits.push(D.CLASSICAL_YOGAS[f.classical].en);
    yogaBits.push(D.YOGA_TEXT[f.yogaType].en);
    if (f.yogakarakaInvolved && f.yogaType !== 'general') yogaBits.push(D.YOGAKARAKA_TEXT.en);
    const p3 = yogaBits.join(' ');

    return [p1, p2, p3];
};

W.navamsa = (f) => {
    const dm = D.DOMAINS[f.domain];
    const seed = `nv:${f.domain}:${f.d9Lagna}`;
    const p1 = `The Navamsa, or D-9 chart, is the chart of inner strength: it shows whether the promises of the birth chart hold up over time, and it is read with special care for ${dm.theme.en}. Your Navamsa rises in ${S(f.d9Lagna)}, which gives the second half of life an undertone that is ${D.SIGNS[f.d9Lagna].persona.en}.`;

    const bits = f.entries.map((e) => `your ${e.roleLabel.en} ${P(e.planet)} moves to ${S(e.sign)}, where it is ${D.DIGNITY_SHORT[e.dignity].en}, and falls in the ${ord(e.house)} house of the Navamsa, ${e.category === 'kendra-trikona' ? 'a strong angular or trinal position' : e.category === 'upachaya' ? 'a growing position that improves with age' : e.category === 'dusthana' ? 'a testing position that asks for patience' : 'a position linked to material results'}`);
    const p2 = `In the Navamsa, ${bits.join('; ')}.`;

    const p3 = {
        strong: pick([
            `On balance the Navamsa confirms the promise of the birth chart for ${dm.theme.en}: the key lords keep their strength in D-9, which means the good indications are likely to hold and mature with time.`,
            `The D-9 placements are supportive, so what the birth chart promises for ${dm.theme.en} has a firm inner foundation and tends to grow rather than fade.`
        ], seed),
        balanced: pick([
            `The Navamsa gives a mixed verdict for ${dm.theme.en}: some lords keep their strength while others weaken, so the birth chart's promises are real but will need consistent effort to be fully realised.`,
            `In D-9 the picture for ${dm.theme.en} is neither fully strong nor weak; the promises hold, but they ripen through effort and good timing rather than on their own.`
        ], seed),
        challenging: pick([
            `The Navamsa qualifies the birth chart's promise for ${dm.theme.en}: the key lords lose some strength in D-9, so results may come later or in a smaller measure than first indicated, and steady effort matters more than luck.`,
            `In D-9 the lords governing ${dm.theme.en} are under some strain, which suggests that this area asks for patience, realistic expectations and sustained work before its rewards arrive.`
        ], seed)
    }[f.tone];

    return [p1, p2, p3];
};

W.conclusion = (f) => {
    const dm = D.DOMAINS[f.domain];
    const seed = `cc:${f.domain}:${f.tone}:${f.score}`;
    let p1;
    if (f.tone === 'strong') p1 = `Taken together, the factors governing ${dm.theme.en} are well placed. ${f.strongest.en} This gives you a solid foundation, and the natural course of life is likely to support you in this area more often than it resists you.${f.weakest ? ` ${f.weakest.en}` : ''}`;
    else if (f.tone === 'balanced') p1 = `Taken together, the factors governing ${dm.theme.en} show a balanced picture, with real strengths as well as areas that ask for care. ${f.strongest.en}${f.weakest ? ` ${f.weakest.en}` : ''} Your results will depend on how consciously you build on the first and manage the second.`;
    else p1 = `Taken together, the factors governing ${dm.theme.en} ask for patience and deliberate effort.${f.weakest ? ` ${f.weakest.en}` : ''} ${f.strongest.en} This does not deny good results; it means they are earned through persistence, good timing and the right guidance rather than handed over easily.`;

    const yogaLine = f.yogas.length ? `The chart also carries ${joinList(f.yogas.map((y) => y.en), L)} in this area, which ${f.yogas.length > 1 ? 'add' : 'adds'} a layer of special promise that can lift results well beyond the ordinary when the right planetary periods arrive.` : '';
    const p2 = `${yogaLine} ${pick(dm.guidance.en, seed)}`.trim();

    const p3 = pick([
        'Remember that a birth chart shows tendencies and timing, not fixed fate; the planetary periods (dasha) and transits decide when each promise becomes active. For a personal discussion of timing and remedies, you can talk to one of our astrologers in the app.',
        'A horoscope describes the terrain, not the journey; when each indication comes alive depends on the running dasha and transits. To go deeper into timing and remedies for your chart, you can consult one of our astrologers in the app.'
    ], seed);

    return [p1, p2, p3];
};

module.exports = W;
