const express = require('express');
const router = express.Router();
const { fetchFullKundliChart } = require('../services/kundliChartService');
const { buildFullReport } = require('../services/kundliReportService');

/**
 * POST /api/kundli-report/full
 *
 * Frontend sends the user's birth details INCLUDING coordinates. This endpoint:
 *   1. Forwards them to the external Kundli API to compute the D-1 & D-9 charts.
 *   2. Normalises that chart and maps it into our four prediction engines.
 *   3. Returns the full bilingual (English/Hindi) Career + Marriage + Money +
 *      Health reports, composed deterministically from our own dataset (no AI).
 *
 * Request body:
 * {
 *   "name": "Full Name",
 *   "gender": "male" | "female" | "other",
 *   "city": "Delhi",
 *   "lat": 28.6139,               // REQUIRED
 *   "lon": 77.2090,               // REQUIRED
 *   "timezone": "Asia/Kolkata",   // optional (default Asia/Kolkata)
 *   "dst": false,                 // optional
 *   // date/time - either explicit parts OR strings:
 *   "year": 1990, "month": 5, "day": 15, "hour": 10, "minute": 30, "second": 0
 *   // ...or:
 *   "dateOfBirth": "1990-05-15", "timeOfBirth": "10:30"
 * }
 *
 * Optional query params:
 *   ?domains=career,money       -> compute only a subset (default: all four)
 *   ?includeChart=1             -> also return the normalised chart used
 *   ?includeInputs=1            -> also return the exact engine inputs (debug)
 */
router.post('/full', async (req, res) => {
    const input = req.body || {};

    // Parse optional domain filter
    let domains;
    if (req.query.domains) {
        const allowed = ['career', 'marriage', 'money', 'health'];
        domains = String(req.query.domains)
            .split(',')
            .map((d) => d.trim().toLowerCase())
            .filter((d) => allowed.includes(d));
        if (domains.length === 0) domains = undefined;
    }

    let chart;
    try {
        chart = await fetchFullKundliChart(input);
    } catch (err) {
        if (err.code === 'VALIDATION') {
            return res.status(400).json({ error: err.message, details: err.details });
        }
        if (err.code === 'UPSTREAM_UNREACHABLE') {
            return res.status(502).json({ error: 'Could not reach the Kundli calculation service. Please try again.' });
        }
        if (err.code === 'UPSTREAM_ERROR' || err.code === 'UPSTREAM_BAD_JSON') {
            return res.status(502).json({ error: 'Kundli calculation service returned an unexpected response.', upstreamStatus: err.status });
        }
        console.error('Kundli report - chart fetch/normalise error:', err);
        return res.status(500).json({ error: err.message || 'Failed to compute kundli chart' });
    }

    let report;
    try {
        report = buildFullReport(chart.normalized, { domains });
    } catch (err) {
        console.error('Kundli report - prediction composition error:', err);
        return res.status(500).json({ error: 'Failed to compose predictions from chart' });
    }

    const response = {
        success: true,
        basicDetails: chart.basicDetails,
        summary: {
            lagnaSign: chart.normalized.lagnaSign,
            navamsaLagnaSign: chart.normalized.navamsaLagnaSign,
            planetHouses: chart.normalized.planetHouse,
            conjunctions: chart.normalized.conjunctions
        },
        predictions: report.predictions
    };

    if (req.query.includeChart === '1') response.chart = chart.normalized;
    if (req.query.includeInputs === '1') response.engineInputs = report.engineInputs;

    res.json(response);
});

module.exports = router;
