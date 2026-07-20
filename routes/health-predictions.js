const express = require('express');
const router = express.Router();
const {
    analyzeHealth,
    searchHealthDataset,
    getLagnaBase,
    tables
} = require('../services/healthPredictionEngine');

// POST /api/health-predictions/analyze
// Body: {
//   lagna, lagnaLordHouse, sixthLordHouse, eighthLordHouse, twelfthLordHouse,
//   planetsInHouse1?, planetsInHouse6?, planetsInHouse8?, planetsInHouse12?,
//   conjunctions?: [ { planets: [planetA, planetB], house?: 1|6|8|12 } ],  // house 1/6/8/12 triggers lagna-aware Yoga detection
//   navamsaLagnaSign?, lagnaLordNavamsaSign?, sixthLordNavamsaSign?, eighthLordNavamsaSign?, twelfthLordNavamsaSign?
// }
// Returns a bilingual (English/Hindi) health reading composed via fast O(1) dataset lookups (no AI involved).
router.post('/analyze', (req, res) => {
    try {
        const result = analyzeHealth(req.body || {});
        if (!result.success) {
            return res.status(400).json({ error: 'Invalid input', details: result.errors });
        }
        res.json(result);
    } catch (error) {
        console.error('Error analyzing health chart:', error);
        res.status(500).json({ error: 'Failed to analyze health chart' });
    }
});

// GET /api/health-predictions/lagna/:sign
// Quick reference: lagna lord, 6th/8th/12th house sign/lord, house-lordship map, Yogakaraka.
router.get('/lagna/:sign', (req, res) => {
    const base = getLagnaBase(req.params.sign.toLowerCase());
    if (!base) {
        return res.status(404).json({ error: 'Unknown lagna sign. Use one of the 12 rashi names (e.g. aries, taurus, ...).' });
    }
    res.json({ success: true, base });
});

// GET /api/health-predictions/reference/:table
// Browse a raw reference table, e.g. /reference/planets, /reference/rashis, /reference/houses,
// /reference/lagnaLordInHouse, /reference/sixthLordInHouse, /reference/eighthLordInHouse, /reference/twelfthLordInHouse,
// /reference/planetInHouse1, /reference/planetInHouse6, /reference/planetInHouse8, /reference/planetInHouse12,
// /reference/conjunctions, /reference/classicalPairYogas,
// /reference/firstHouseConjunctionYogas, /reference/sixthHouseConjunctionYogas,
// /reference/eighthHouseConjunctionYogas, /reference/twelfthHouseConjunctionYogas,
// /reference/lagnaLordInNavamsa, /reference/sixthLordInNavamsa, /reference/eighthLordInNavamsa, /reference/twelfthLordInNavamsa,
// /reference/lagnaLordInNavamsaHouse, /reference/sixthLordInNavamsaHouse, /reference/eighthLordInNavamsaHouse, /reference/twelfthLordInNavamsaHouse
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

// GET /api/health-predictions/search?q=keyword
// Fast full-text search across the whole combination dataset via a pre-built inverted index.
router.get('/search', (req, res) => {
    const { q, limit } = req.query;
    if (!q || !q.trim()) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const results = searchHealthDataset(q, { limit: limit ? parseInt(limit, 10) : 20 });
    res.json({ success: true, query: q, count: results.length, results });
});

module.exports = router;
