# Kundli Report – Narrative Output

`POST /api/kundli-report/full` now returns a **topic-wise narrative report** instead of
the flat list of dataset rows. Every topic is 2–3 flowing paragraphs, in English and
Hindi, written the way an astrologer would explain the chart. **No AI is used** – the
text is composed deterministically by `services/kundliNarrative/` from the chart facts,
so the same birth details always produce the same report, instantly.

## Request

Unchanged. Body = birth details incl. `lat`/`lon` (see the comment block at the top of
`routes/kundli-report.js`).

Query params:

| Param | Effect |
|---|---|
| `domains=career,money` | Only these life areas (default: all four). |
| `lang=en` or `lang=hi` | Return one language only (every `{en, hi}` pair collapses to a string / array). Cuts payload by roughly half. |
| `includeSections=1` | Also return the **old** raw output under `predictions` (flat table rows per engine). |
| `includeChart=1` | Also return the normalised chart. |
| `includeInputs=1` | Also return the raw engine inputs (debug). |

## Response shape

```jsonc
{
  "success": true,
  "basicDetails": { "lagna": "...", "moonSign": "...", "nakshatra": "...", ... },
  "summary": { "lagnaSign": "aries", "navamsaLagnaSign": "cancer", "planetHouses": {...}, "conjunctions": [...] },
  "report": {
    "languages": ["en", "hi"],
    "overview": { "title": {"en": "Chart Overview", "hi": "कुंडली परिचय"}, "topics": [ ...Topic ] },
    "career":   { "key": "career", "title": {...}, "tone": "strong|balanced|challenging",
                  "score": 1.23, "summary": {"en": "...", "hi": "..."},
                  "yogas": [ {"en": "Raja Yoga", "hi": "राज योग"} ],
                  "factors": [ { "type": "lord|occupant|conjunction|navamsa", "label": {"en","hi"}, "score": 1.5 } ],
                  "topics": [ ...Topic ] },
    "marriage": { ...same... }, "money": { ...same... }, "health": { ...same... }
  }
}
```

A **Topic**:

```jsonc
{
  "id": "planet_venus_house_10",          // stable id, see list below
  "type": "glance|house|planet|lagna|conjunction|navamsa|conclusion",
  "title": { "en": "Venus in your 10th House", "hi": "आपके दशम भाव में शुक्र" },
  "paragraphs": { "en": ["...", "...", "..."], "hi": ["...", "...", "..."] },
  "text": { "en": "para\n\npara\n\npara", "hi": "..." },   // same paragraphs joined
  "meta": { "planet": "venus", "house": 10 }                // small hints for icons / navigation
}
```

## Topic order

**overview**

1. `glance` – chart at a glance (Lagna, Moon sign, nakshatra, spread of planets, Mangal Dosha if reported).
2. `house_1` – the Ascendant: rising sign, lagna lord and where it sits, what occupies the 1st house.
3. `planet_<p>_house_1` – one topic per planet in the 1st house.

**career / marriage / money / health** (same skeleton, different houses)

1. `lagna` – how the lagna lord and the planets rising with it feed this area.
2. `house_<n>` – for each significator house (career 10; marriage 7; money 2, 11; health 6, 8, 12):
   the sign on it, its lord, where the lord sits, its dignity, what occupies it.
3. `planet_<p>_house_<n>` – one topic per planet in that house (dignity, relation to the house lord,
   retrograde/combust, the fields / spouse traits / income channels / body areas it points to, guidance).
4. `conjunction_<a>_<b>_house_<n>` – one per pair of planets sharing the 1st house or a significator house:
   blend of natures, mutual friendship, classical named yoga (Budh-Aditya, Gajakesari, …) and the
   lagna-aware Raja / Dhana / Vipreet-Raja Yoga classification.
5. `navamsa` – D-9 placement of the lagna lord and the domain lords (dignity + D-9 house) and what it means.
6. `conclusion` – overall verdict: the strongest support, the area needing most care, yogas present,
   domain guidance, and a closing note pointing to the in-app astrologers for timing/remedies.

## Tone / score

Each factor (lord placement, occupant, conjunction, Navamsa placement) gets a small signed score from
house category (kendra/trikona, upachaya, dusthana…), dignity (exalted…debilitated), yoga type,
friendship and retrograde/combust flags. `score` is the **average per factor**; `tone` is
`strong` (≥ 0.6), `challenging` (≤ −0.3) or `balanced`. Weights live in
`services/kundliNarrative/data.js` (`CATEGORY_SCORE`, `DIGNITY_SCORE`, `YOGA_SCORE`, `TONE_THRESHOLDS`).
On random charts this gives roughly 30% strong / 50% balanced / 20% challenging.

## Where the text comes from

| File | Role |
|---|---|
| `services/kundliNarrative/data.js` | Bilingual phrase bank: planet profiles, sign flavours, house themes, dignity wording, yoga descriptions, per-domain wording and guidance. |
| `services/kundliNarrative/sentences.en.js` / `sentences.hi.js` | Paragraph writers, one function per topic type. Sentence variants are chosen with a seeded hash of the chart facts, so wording varies between charts but is stable for the same chart. |
| `services/kundliNarrative/index.js` | Composer: walks the chart in the order above, builds a facts object per topic, calls both writers, computes factors/tone. |
| `data/astrology/<domain>/*.json` | Existing datasets, reused for: domain-specific planet traits and life-area lists (`planets.json`), house significations/angles (`houses.json`), house lords + Yogakaraka (`lagnaBase.json`), lagna-aware yoga classification (`*HouseConjunctionYogas.json`). |

To change wording, edit the phrase bank or the writers; to change which factors count or how strongly,
edit the score tables in `data.js`. The old engines (`services/*PredictionEngine.js`) are untouched and
still power `?includeSections=1`.

## Frontend notes

- Render `report.overview.topics` first, then one card/section per domain with `title`, `tone`,
  `summary`, and the expandable `topics`.
- Use `?lang=hi` / `?lang=en` when the app already knows the user's language to halve the payload.
- The old `predictions` object is no longer returned by default; pass `?includeSections=1` if a screen
  still depends on it.
