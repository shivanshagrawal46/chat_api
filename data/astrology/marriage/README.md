# Marriage Astrology Dataset (Vedic / Parashari)

The marriage counterpart of the [Career Astrology Dataset](../career/README.md). **Identical technique and engineering** - the only structural change is that the **7th house / 7th lord** (marriage/spouse significator) is used in place of the 10th house / 10th lord (career significator). No AI/LLM is involved anywhere - every reading comes from O(1) JSON lookups.

Six factors covered:

1. **Lagna lord** (1st house lord) and the house it occupies
2. **7th lord** (marriage/spouse significator) and the house it occupies
3. **Planets sitting in the 1st house**
4. **Planets sitting in the 7th house** (includes a Mangal Dosha note when Mars is the occupant)
5. **Conjunctions in the 1st/7th house** - generic meaning + classical named Yogas (Budh-Aditya, Gajakesari, Chandra-Mangal, Guru-Mangal) + **lagna-aware Raja/Dhana/Vipreet-Raja Yoga detection**
6. **Both the Lagna lord's and 7th lord's placement in the D-9 (Navamsa) chart** - by sign AND by house-number. D-9 is classically considered the primary marriage chart, so this factor carries extra emphasis in the generated text.

## Files (mirrors `data/astrology/career/`)

| File | Rows | Description |
|---|---|---|
| `planets.json` | 9 | The 9 grahas, with **marriage-specific** traits (spouse nature, relationship style) instead of career fields |
| `rashis.json` | 12 | Same astronomical facts as the career dataset (sign lord, element, quality) |
| `houses.json` | 12 | The 12 bhavas, reframed for **marriage** relevance (e.g. 7th = marriage itself, 5th = romance/children, 8th = intimacy/longevity of the bond) |
| `lagnaBase.json` | 12 | For each lagna: lagna lord, **7th house sign/lord**, full house-lordship map, Yogakaraka planet |
| `lagnaLordInHouse.json` | 84 | 7 lords × 12 houses - Lagna lord placement, reframed for approach to relationships |
| `seventhLordInHouse.json` | 84 | 7 lords × 12 houses - 7th lord placement, reframed for marital experience |
| `planetInHouse1.json` | 9 | Each graha occupying the 1st house - marriage-relevant meaning |
| `planetInHouse7.json` | 9 | Each graha occupying the 7th house - marriage-relevant meaning (Mars entry includes a Mangal Dosha note) |
| `conjunctions.json` | 36 | Every planet pair conjunct - generic marriage-reframed meaning |
| `classicalPairYogas.json` | 36 | Lagna-independent named Yogas (Budh-Aditya, Gajakesari, Chandra-Mangal, Guru-Mangal), reframed for marriage |
| `firstHouseConjunctionYogas.json` | 432 | 12 lagnas × 36 pairs - lagna-aware Raja/Dhana/Vipreet-Raja Yoga for conjunctions in the **1st house** |
| `seventhHouseConjunctionYogas.json` | 432 | 12 lagnas × 36 pairs - lagna-aware Raja/Dhana/Vipreet-Raja Yoga for conjunctions in the **7th house** |
| `lagnaLordInNavamsa.json` / `seventhLordInNavamsa.json` | 84 + 84 | D-9 **sign** placement (strength via own/friend/neutral/enemy sign) |
| `lagnaLordInNavamsaHouse.json` / `seventhLordInNavamsaHouse.json` | 84 + 84 | D-9 **house number** (counted from Navamsa's own ascendant) |
| `index.json` | - | Auto-generated manifest |

**Total combination rows: 1,491** (plus 33 reference-metadata rows), all bilingual (English/Hindi).

## Regenerating

```bash
npm run generate:marriage-dataset
```

Re-runs `scripts/generateMarriageAstrologyDataset.js`. Edit the atomic tables (planet marriage traits, house meanings, Yoga rules) there and re-run - don't hand-edit the generated JSON.

## Querying a real chart

```js
const { analyzeMarriage } = require('./services/marriagePredictionEngine');

const result = analyzeMarriage({
  lagna: 'taurus',
  lagnaLordHouse: 1,
  seventhLordHouse: 7,
  planetsInHouse1: ['venus'],
  planetsInHouse7: ['mars', 'saturn'],
  conjunctions: [ { planets: ['mars', 'saturn'], house: 7 } ],
  navamsaLagnaSign: 'leo',
  lagnaLordNavamsaSign: 'libra',
  seventhLordNavamsaSign: 'capricorn'
});

console.log(result.combinedText.en);
console.log(result.combinedText.hi);
```

Exposed over HTTP via `routes/marriage-predictions.js`:

- `POST /api/marriage-predictions/analyze`
- `GET /api/marriage-predictions/lagna/:sign`
- `GET /api/marriage-predictions/reference/:table`
- `GET /api/marriage-predictions/search?q=keyword`

See the [career dataset README](../career/README.md) for the full rationale behind the compositional design, the Yoga-classification algorithm, and notes on scope (same rules apply here, just with 7 replacing 10).
