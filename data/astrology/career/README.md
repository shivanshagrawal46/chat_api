# Career Astrology Dataset (Vedic / Parashari)

**This is our own deterministic prediction database - there is no AI/LLM involved anywhere in this pipeline.** Every reading is produced purely by looking up pre-generated JSON tables (O(1) key access) and stitching the relevant rows together. Same input always gives the same, fast, explainable output.

Bilingual (English + Hindi) JSON knowledge base for career predictions, built around six classical Vedic astrology factors:

1. **Lagna lord** (1st house lord) and the house it occupies
2. **10th lord** (career/profession house lord) and the house it occupies
3. **Planets sitting in the 1st house**
4. **Planets sitting in the 10th house**
5. **Conjunctions of planets in the 10th house (and 1st house)** - including classical named Yogas (Budh-Aditya, Gajakesari, etc.) and **lagna-aware Raja / Dhana / Vipreet-Raja Yoga detection**
6. **Both the Lagna lord's and the 10th lord's placement in the D-9 (Navamsa) chart** - by sign AND by house-number (counted from the Navamsa's own ascendant)

## Why this isn't one giant hand-written file

A literal, fully-enumerated dataset covering every real chart combination would be many **billions of rows** - not storable or meaningfully hand-curatable. Instead, this dataset decomposes the problem into the **complete set of atomic factor-combinations** actually used by classical technique, and a chart's full reading is assembled at query time by combining the relevant rows (see `services/careerPredictionEngine.js`). This keeps the dataset:

- **Fast** - every table is a plain JSON object keyed for O(1) lookup (e.g. `tenthLordInHouse["saturn_10"]`). No scanning, no DB round-trip, no runtime AI calls.
- **Searchable** - a full-text inverted index is built once in memory over all rows (see `searchCareerDataset` in the engine).
- **Complete** - every one of the 7 classical house-lord planets × 12 houses (and all 9 grahas, incl. Rahu/Ketu, for house-1/house-10 occupation and conjunctions) is covered, for **all 12 lagnas** where lordship/Yoga classification is lagna-dependent.
- **Maintainable** - the astrological knowledge (planet traits, house significations, sign lordships/relationships, Yoga classification rules) lives in `scripts/generateCareerAstrologyDataset.js`. Improve the knowledge there and re-run the generator; don't hand-edit the generated JSON.

## Files

| File | Rows | Description |
|---|---|---|
| `planets.json` | 9 | The 9 grahas: names (EN/HI), career traits, natural career fields, friend/enemy relationships |
| `rashis.json` | 12 | The 12 rashis: names (EN/HI), sign lord, element, quality (movable/fixed/dual) |
| `houses.json` | 12 | The 12 bhavas: career-relevant significations and Kendra/Trikona/Upachaya/Dusthana category |
| `lagnaBase.json` | 12 | For each lagna: its lord, the 10th-house sign/lord, **full house-lordship map (1-12)**, and the **Yogakaraka** planet (if any) for that lagna |
| `lagnaLordInHouse.json` | 84 | 7 lords × 12 houses - meaning of "Lagna lord placed in house N" for career |
| `tenthLordInHouse.json` | 84 | 7 lords × 12 houses - meaning of "10th lord placed in house N" for career |
| `planetInHouse1.json` | 9 | Meaning of each graha occupying the 1st house |
| `planetInHouse10.json` | 9 | Meaning of each graha occupying the 10th house |
| `conjunctions.json` | 36 | Every unique pair of the 9 grahas conjunct together - generic meaning + friend/neutral/enemy tone |
| `classicalPairYogas.json` | 36 | Lagna-**independent** classical named Yogas (Budh-Aditya, Gajakesari, Chandra-Mangal, Guru-Mangal) for specific planet pairs; other pairs marked `hasClassicalName: false` |
| `firstHouseConjunctionYogas.json` | 432 | 12 lagnas × 36 pairs - lagna-**aware** Raja/Dhana/Vipreet-Raja Yoga classification for conjunctions occurring in the **1st house** |
| `tenthHouseConjunctionYogas.json` | 432 | 12 lagnas × 36 pairs - lagna-**aware** Raja/Dhana/Vipreet-Raja Yoga classification for conjunctions occurring in the **10th house** |
| `lagnaLordInNavamsa.json` | 84 | 7 lords × 12 signs - Lagna lord's D-9 **sign** placement (strength via own/friend/neutral/enemy sign) |
| `tenthLordInNavamsa.json` | 84 | 7 lords × 12 signs - 10th lord's D-9 **sign** placement (career-strength/sustainability) |
| `lagnaLordInNavamsaHouse.json` | 84 | 7 lords × 12 houses - Lagna lord's D-9 **house number** (counted from Navamsa's own ascendant) |
| `tenthLordInNavamsaHouse.json` | 84 | 7 lords × 12 houses - 10th lord's D-9 **house number** (counted from Navamsa's own ascendant) |
| `index.json` | - | Auto-generated manifest (row counts, generation timestamp) |

**Total combination rows: 1,491** (plus 33 reference-metadata rows), all bilingual.

## Yoga detection logic (lagna-aware)

For a given lagna, `computeHouseLordsForLagna()` derives which graha rules each of the 12 houses. `classifyYoga(houseLords, planetA, planetB)` then checks:

- **Raja Yoga**: one planet rules a Kendra house (1/4/7/10) and the other rules a Trikona house (1/5/9) → power, status, authority.
- **Dhana Yoga**: one planet rules a Dhana house (2/11) and the other rules a Dhana or Trikona house → wealth/financial success.
- **Vipreet Raja Yoga**: both planets rule *only* Dusthana houses (6/8/12), with no Kendra/Trikona involvement → success through reversal/adversity.
- **General**: none of the above → no classical named Yoga for this specific lagna; fall back to the generic conjunction meaning.

**Yogakaraka**: a planet that rules both a Kendra (4/7/10) and a Trikona (5/9) house for a given lagna (e.g. Saturn for Taurus/Libra, Mars for Cancer/Leo) is flagged in `lagnaBase.json`, and any Yoga involving it gets an extra "amplified" note.

This is layered on top of the lagna-**independent** `classicalPairYogas.json` (e.g. Sun+Mercury = Budh-Aditya Yoga regardless of lagna), so a single conjunction can surface both a universal classical Yoga name *and* a lagna-specific Raja/Dhana/Vipreet-Raja classification.

## Regenerating

```bash
npm run generate:career-dataset
```

Re-runs `scripts/generateCareerAstrologyDataset.js` and overwrites the JSON files here. Edit the atomic tables/rules in that script to refine or extend the knowledge - the generator recomposes every combination automatically.

## Querying a real chart

```js
const { analyzeCareer } = require('./services/careerPredictionEngine');

const result = analyzeCareer({
  lagna: 'taurus',
  lagnaLordHouse: 1,                                     // Venus (Lagna lord) sits in house 1
  tenthLordHouse: 10,                                    // Saturn (10th lord) sits in house 10
  planetsInHouse1: ['venus'],
  planetsInHouse10: ['mercury', 'saturn'],
  conjunctions: [ { planets: ['mercury', 'saturn'], house: 10 } ],  // triggers lagna-aware Yoga check
  navamsaLagnaSign: 'leo',                               // D-9 chart's own Ascendant sign
  lagnaLordNavamsaSign: 'libra',                          // Venus's D-9 sign
  tenthLordNavamsaSign: 'capricorn'                       // Saturn's D-9 sign
});

console.log(result.combinedText.en); // full English reading
console.log(result.combinedText.hi); // full Hindi reading
result.sections.forEach(s => console.log(s.section, '->', s.yogaType || ''));
```

`conjunctions` accepts either the old flat `['planetA','planetB']` form (generic meaning only) or `{ planets: [a,b], house: 1|10 }` - only `house: 1` or `house: 10` triggers the lagna-aware Yoga lookup tables.

Exposed over HTTP via `routes/career-predictions.js`:

- `POST /api/career-predictions/analyze` - full composed reading for a chart
- `GET /api/career-predictions/lagna/:sign` - quick reference (lagna lord, 10th lord, house-lordship map, Yogakaraka) for a given lagna
- `GET /api/career-predictions/reference/:table` - browse any raw table
- `GET /api/career-predictions/search?q=keyword` - fast full-text search across the whole dataset

## Feeding actual chart inputs

Your app already computes Lagna/house/planet placements via the external Kundli API (see `routes/aichat.js`, `fetchKundliDataForAI`). To use this dataset for a specific user:

- `lagna` = the ascendant sign returned by the Kundli API (lowercased rashi key)
- `lagnaLordHouse` / `tenthLordHouse` = which house contains the Lagna-lord/10th-lord planet, from the chart's `houses`/`planets`-per-house data
- `planetsInHouse1` / `planetsInHouse10` = the `planets` array of house 1 / house 10 from that chart data
- `conjunctions` = any pair of planets sharing the same house, tagged with that house number (1, 10, or omitted for other houses)
- `navamsaLagnaSign` / `lagnaLordNavamsaSign` / `tenthLordNavamsaSign` = from the D-9 (Navamsa) chart, if the Kundli API/provider returns one

## Notes on scope

- Only the 7 classical sign-owning grahas (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn) are used as **house lords** (Rahu/Ketu don't own signs in classical Parashari astrology).
- All 9 grahas (including Rahu/Ketu) are covered for **house occupation** (1st/10th) and **conjunctions**; Yoga classification via house-lordship naturally doesn't apply to Rahu/Ketu (they own no houses), so conjunctions involving them classify as `general` unless the other planet's lordship alone qualifies.
- Friend/neutral/enemy relationships follow the standard Parashari Naisargika Maitri (natural relationship) table; Rahu/Ketu are treated with Saturn-like affinities as a common simplification.
- Pancha Mahapurusha Yogas (Ruchaka, Bhadra, Hamsa, Malavya, Shasha) require exact exaltation/own-sign **degree** data for each planet, which isn't part of this simplified house-placement model - they are intentionally out of scope here.
