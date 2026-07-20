const express = require('express');
const router = express.Router();
const {
    analyzeMoney,
    searchMoneyDataset,
    getLagnaBase,
    tables
} = require('../services/moneyPredictionEngine');

// POST /api/money-predictions/analyze
// Body: {
//   lagna, lagnaLordHouse, secondLordHouse, eleventhLordHouse,
//   planetsInHouse1?, planetsInHouse2?, planetsInHouse11?,
//   conjunctions?: [ { planets: [planetA, planetB], house?: 1|2|11 } ],  // house 1/2/11 triggers lagna-aware Yoga detection
//   navamsaLagnaSign?, lagnaLordNavamsaSign?, secondLordNavamsaSign?, eleventhLordNavamsaSign?
// }
// Returns a bilingual (English/Hindi) wealth reading composed via fast O(1) dataset lookups (no AI involved).
router.post('/analyze', (req, res) => {
    try {
        const result = analyzeMoney(req.body || {});
        if (!result.success) {
            return res.status(400).json({ error: 'Invalid input', details: result.errors });
        }
        res.json(result);
    } catch (error) {
        console.error('Error analyzing money/wealth chart:', error);
        res.status(500).json({ error: 'Failed to analyze money/wealth chart' });
    }
});

// GET /api/money-predictions/lagna/:sign
// Quick reference: lagna lord, 2nd house sign/lord, 11th house sign/lord, house-lordship map, Yogakaraka.
router.get('/lagna/:sign', (req, res) => {
    const base = getLagnaBase(req.params.sign.toLowerCase());
    if (!base) {
        return res.status(404).json({ error: 'Unknown lagna sign. Use one of the 12 rashi names (e.g. aries, taurus, ...).' });
    }
    res.json({ success: true, base });
});

// GET /api/money-predictions/reference/:table
// Browse a raw reference table, e.g. /reference/planets, /reference/rashis, /reference/houses,
// /reference/lagnaLordInHouse, /reference/secondLordInHouse, /reference/eleventhLordInHouse,
// /reference/planetInHouse1, /reference/planetInHouse2, /reference/planetInHouse11,
// /reference/conjunctions, /reference/classicalPairYogas,
// /reference/firstHouseConjunctionYogas, /reference/secondHouseConjunctionYogas, /reference/eleventhHouseConjunctionYogas,
// /reference/lagnaLordInNavamsa, /reference/secondLordInNavamsa, /reference/eleventhLordInNavamsa,
// /reference/lagnaLordInNavamsaHouse, /reference/secondLordInNavamsaHouse, /reference/eleventhLordInNavamsaHouse
router.get('/reference/:table', (req, res) => {
    const table = tables[req.params.table];
    if (!table) {
        return res.status(404).json({
            error: 'Unknown reference table',
            availableTables: Object.keys(tables)
        });
    }
    res.json({ success: true, table: req.params.table, data: table });
});

// GET /api/money-predictions/search?q=keyword
// Fast full-text search across the whole combination dataset via a pre-built inverted index.
router.get('/search', (req, res) => {
    const { q, limit } = req.query;
    if (!q || !q.trim()) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const results = searchMoneyDataset(q, { limit: limit ? parseInt(limit, 10) : 20 });
    res.json({ success: true, query: q, count: results.length, results });
});

module.exports = router;
