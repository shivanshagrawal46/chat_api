const express = require('express');
const router = express.Router();
const {
    analyzeMarriage,
    searchMarriageDataset,
    getLagnaBase,
    tables
} = require('../services/marriagePredictionEngine');

// POST /api/marriage-predictions/analyze
// Body: {
//   lagna, lagnaLordHouse, seventhLordHouse,
//   planetsInHouse1?, planetsInHouse7?,
//   conjunctions?: [ { planets: [planetA, planetB], house?: 1|7 } ],  // house 1/7 triggers lagna-aware Yoga detection
//   navamsaLagnaSign?, lagnaLordNavamsaSign?, seventhLordNavamsaSign?
// }
// Returns a bilingual (English/Hindi) marriage reading composed via fast O(1) dataset lookups (no AI involved).
router.post('/analyze', (req, res) => {
    try {
        const result = analyzeMarriage(req.body || {});
        if (!result.success) {
            return res.status(400).json({ error: 'Invalid input', details: result.errors });
        }
        res.json(result);
    } catch (error) {
        console.error('Error analyzing marriage chart:', error);
        res.status(500).json({ error: 'Failed to analyze marriage chart' });
    }
});

// GET /api/marriage-predictions/lagna/:sign
// Quick reference: lagna lord, 7th house sign, 7th lord, house-lordship map, Yogakaraka for a given lagna.
router.get('/lagna/:sign', (req, res) => {
    const base = getLagnaBase(req.params.sign.toLowerCase());
    if (!base) {
        return res.status(404).json({ error: 'Unknown lagna sign. Use one of the 12 rashi names (e.g. aries, taurus, ...).' });
    }
    res.json({ success: true, base });
});

// GET /api/marriage-predictions/reference/:table
// Browse a raw reference table, e.g. /reference/planets, /reference/rashis, /reference/houses,
// /reference/lagnaLordInHouse, /reference/seventhLordInHouse, /reference/planetInHouse1,
// /reference/planetInHouse7, /reference/conjunctions, /reference/classicalPairYogas,
// /reference/firstHouseConjunctionYogas, /reference/seventhHouseConjunctionYogas,
// /reference/lagnaLordInNavamsa, /reference/seventhLordInNavamsa,
// /reference/lagnaLordInNavamsaHouse, /reference/seventhLordInNavamsaHouse
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

// GET /api/marriage-predictions/search?q=keyword
// Fast full-text search across the whole combination dataset via a pre-built inverted index.
router.get('/search', (req, res) => {
    const { q, limit } = req.query;
    if (!q || !q.trim()) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const results = searchMarriageDataset(q, { limit: limit ? parseInt(limit, 10) : 20 });
    res.json({ success: true, query: q, count: results.length, results });
});

module.exports = router;
