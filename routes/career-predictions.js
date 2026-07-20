const express = require('express');
const router = express.Router();
const {
    analyzeCareer,
    searchCareerDataset,
    getLagnaBase,
    tables
} = require('../services/careerPredictionEngine');

// POST /api/career-predictions/analyze
// Body: {
//   lagna, lagnaLordHouse, tenthLordHouse,
//   planetsInHouse1?, planetsInHouse10?,
//   conjunctions?: [ { planets: [planetA, planetB], house?: 1|10 }, ... ]   // house 1/10 triggers lagna-aware Yoga detection
//   navamsaLagnaSign?,          // D-9 chart's own Ascendant sign (needed to compute Navamsa house numbers)
//   lagnaLordNavamsaSign?,      // sign the Lagna lord occupies in D-9
//   tenthLordNavamsaSign?       // sign the 10th lord occupies in D-9
// }
// Returns a bilingual (English/Hindi) career reading composed via fast O(1) dataset lookups (no AI involved).
router.post('/analyze', (req, res) => {
    try {
        const result = analyzeCareer(req.body || {});
        if (!result.success) {
            return res.status(400).json({ error: 'Invalid input', details: result.errors });
        }
        res.json(result);
    } catch (error) {
        console.error('Error analyzing career chart:', error);
        res.status(500).json({ error: 'Failed to analyze career chart' });
    }
});

// GET /api/career-predictions/lagna/:sign
// Quick reference: lagna lord, 10th house sign, 10th lord for a given lagna.
router.get('/lagna/:sign', (req, res) => {
    const base = getLagnaBase(req.params.sign.toLowerCase());
    if (!base) {
        return res.status(404).json({ error: 'Unknown lagna sign. Use one of the 12 rashi names (e.g. aries, taurus, ...).' });
    }
    res.json({ success: true, base });
});

// GET /api/career-predictions/reference/:table
// Browse a raw reference table, e.g. /reference/planets, /reference/rashis, /reference/houses,
// /reference/lagnaLordInHouse, /reference/tenthLordInHouse, /reference/planetInHouse1,
// /reference/planetInHouse10, /reference/conjunctions, /reference/tenthLordInNavamsa
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

// GET /api/career-predictions/search?q=keyword
// Fast full-text search across the whole combination dataset via a pre-built inverted index.
router.get('/search', (req, res) => {
    const { q, limit } = req.query;
    if (!q || !q.trim()) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const results = searchCareerDataset(q, { limit: limit ? parseInt(limit, 10) : 20 });
    res.json({ success: true, query: q, count: results.length, results });
});

module.exports = router;
