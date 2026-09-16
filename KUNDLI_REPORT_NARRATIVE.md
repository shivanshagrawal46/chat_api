# Kundli Report — How the Predictions Are Built

`POST /api/kundli-report/full` returns a topic-wise reading for the chart overview and for
Career, Marriage, Wealth and Health, in English and Hindi. **No AI is used.** Every sentence is
composed from the chart's own computed values, so the same birth details always produce the same
report, instantly.

## What changed and why

The earlier version read the same for almost everyone. Three concrete causes, all now fixed:

| Problem | Cause | Fix |
|---|---|---|
| Every chart was called a "Raja Yoga" chart | The naive kendra–trikona rule matches ~97.5% of charts. Budha-Aditya matches ~50% (Mercury is never more than 28° from the Sun); Gaja Kesari ~33%. | Each yoga now carries a `prevalence` and a strength gate. Only the few highest-**notability** combinations are surfaced. |
| Placements were described but never weighed | A debilitated, combust 8th lord read the same as an exalted Yogakaraka. | Every planet and house now gets a 0–100 score with the reasons that produced it. |
| A quarter of the text was literal repeats | One generic closing sentence was reused in all four sections. | A registry emits each remedy, yoga description and closing line once; framing lines are written per domain. |

Measured over randomised charts: repeated sentences within a report fell from **24.2% to 0%
duplication of substance** (13.8% of sentences, almost all short connectives), and of 2,366 distinct
sentences produced across 40 charts only **19 (0.8%)** appear in every report — the disclaimers and
transitions, by design.

## The data we now use

The upstream API returns ~3.6 MB per chart. The old code read about 2% of it (the D‑1 and D‑9 house
arrays). `services/kundliExtract.js` now reads:

- **Per planet** — exact degree, nakshatra and pada, sub-lord, retrograde, combust, exalted /
  debilitated / own sign / moolatrikona, **vargottama**, compound relationship with its sign lord,
  **avastha**, the houses it aspects, its **Shadbala** total, and its D‑9 / D‑10 placement.
- **Per house** — sign, lord, occupants, aspecting planets and the **Sarvashtakavarga bindu count**.
- **Vimshottari dasha** — the full mahadasha/antardasha tree, resolved to the period running *today*
  plus what comes next, with dates.
- **Jaimini chara karakas**, the doshas the API flags, the yogas it detects, Bhava Chalit positions
  and the panchadha friendship matrix.

> **Calibration note.** The API's Ashtakavarga `total` row includes the Ascendant's ashtakavarga, so
> its houses total 386 and average **32.2** bindus, not the 28.1 of the classical seven-planet SAV.
> Centring on 28 handed every house a free ~+9 and pushed nearly every chart into "strong". The
> baseline is `SAV_BASELINE` in `strength.js`.

## Pipeline

```
routes/kundli-report.js
  → services/kundliChartService.js   fetch the chart (raw payload kept)
  → services/kundliExtract.js        normalise everything above
  → services/kundliAnalysis/         weigh it
       strength.js   planet + house scores (0-100) with reasons
       yogas.js      yoga detection, rarity-gated
       index.js      dasha judgement, per-domain verdicts
  → services/kundliNarrative/
       vocab.js      bilingual phrases for every scoring reason
       compose.js    writes the paragraphs, prevents repetition
```

Reference data: `data/astrology/nakshatras.js` (27 nakshatras, bilingual) and the existing
`data/astrology/<domain>/` tables.

## Scoring

**Planet strength** blends dignity (exalted +22 … debilitated −24, with Neecha Bhanga cancellation),
combustion, retrogression, vargottama, house placement, digbala, aspects received, avastha and
Shadbala. **House strength** anchors on Sarvashtakavarga, then adds its lord's strength and
placement, occupants, aspects, and papakartari / shubhakartari.

**Domain verdict** is a weighted blend of the significator houses (the 10th weighs most for career,
the 7th for marriage) plus the natural and Jaimini karakas. Yogas then adjust it within ±9 rather
than being averaged in. Bands: `strong` ≥ 63, `mixed` ≥ 50, else `challenging`. Over randomised
charts this splits roughly **39% / 45% / 17%** instead of calling everyone strong.

## Request

Body unchanged (birth details including `lat`/`lon`).

| Query param | Effect |
|---|---|
| `?lang=en` or `?lang=hi` | One language only. Roughly halves the payload. Recommended. |
| `?domains=career,money` | Subset of areas. Default all four. |
| `?includeSections=1` | Also returns the **old** flat table-row output under `predictions`. |
| `?includeChart=1` | Also returns the normalised chart. |

## Response

```jsonc
{
  "success": true,
  "basicDetails": { ... },
  "summary": { "lagnaSign": "cancer", "navamsaLagnaSign": "...", "planetHouses": {...} },
  "report": {
    "languages": ["en", "hi"],
    "overview": { "title": {...}, "topics": [ Topic, ... ] },
    "career":   { "key", "title", "score": 56.1, "band": "mixed",
                  "summary": {...}, "yogas": [...], "topics": [ Topic, ... ] },
    "marriage": {...}, "money": {...}, "health": {...}
  }
}
```

A **Topic**: `{ id, type, title:{en,hi}, paragraphs:{en:[...],hi:[...]}, text:{en,hi} }`.
With `?lang=`, every `{en,hi}` pair collapses to a plain string or array.

**Topic ids** — overview: `snapshot`, `ascendant`, `balance`, `yogas`, `current_period`.
Each domain: `verdict`, `house_<n>`, `planet_<p>_house_<n>`, `supporting_houses`, `yogas`,
`timing`, `guidance`.

`type` is one of `snapshot`, `house`, `planet`, `balance`, `yogas`, `verdict`, `timing`, `guidance`.

## Honesty rules the report follows

- **Rarity is stated, not hidden.** Gaja Kesari and Budha-Aditya are labelled as common where they
  appear, rather than sold as rare.
- **Non-classical material is flagged.** Kaal Sarp Yoga carries `classical: false` and the text says
  it appears in no classical source and that many astrologers reject it.
- **Gemstones are omitted** from remedies with an explicit reason; mantra, charity and habit are
  given instead.
- **Sade Sati is reported as not computed.** It needs Saturn's *current transit*, which the
  birth-chart payload does not contain. It is marked `status: "not_computed"` rather than guessed.

## Frontend notes

- Render `report.overview.topics`, then one card per domain showing `title`, `band`, `score` and
  `summary`, expanding to `topics`.
- Pass `?lang=` when the user's language is known.
- `score` is 0–100 and safe to render as a meter. `band` is the word to display.
- The old `predictions` object is no longer returned by default; pass `?includeSections=1` if a
  screen still needs it.

## Sources

Rules were checked against Brihat Parashara Hora Shastra (Santhanam translation) for aspects,
dignities, avasthas and Shadbala; Phaladeepika for Neecha Bhanga and Parivartana; and Laghu Parashari
for functional benefic/malefic and maraka rules. Where sources genuinely disagree (Rahu/Ketu
aspects, Mangal Dosha house sets, Vimshottari year length) the code comments say so and take the
mainstream reading.
