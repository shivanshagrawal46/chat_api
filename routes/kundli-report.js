const express = require('express');
const router = express.Router();
const { fetchFullKundliChart } = require('../services/kundliChartService');
const { buildFullReport } = require('../services/kundliReportService');
const { buildNarrativeReport, pickLanguage } = require('../services/kundliNarrative');
const { extractRichChart } = require('../services/kundliExtract');
const { analyseChart } = require('../services/kundliAnalysis');
const { composeReport } = require('../services/kundliNarrative/compose');

/**
 * POST /api/kundli-report/full
 *
 * Frontend sends the user's birth details INCLUDING coordinates. This endpoint:
 *   1. Forwards them to the external Kundli API to compute the D-1 & D-9 charts.
 *   2. Normalises that chart.
 *   3. Composes a topic-wise NARRATIVE report (2-3 paragraphs per topic, in
 *      English and Hindi) for the chart overview and for Career, Marriage,
 *      Money and Health - deterministically, from our own phrase bank and
 *      datasets. No AI is involved.
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
 *   ?lang=en | hi               -> return a single language (default: both, as {en, hi})
 *   ?includeSections=1          -> also return the old raw table-row output under `predictions`
 *   ?includeChart=1             -> also return the normalised chart used
 *   ?includeInputs=1            -> also return the exact engine inputs (debug; implies raw engines run)
 *
 * Response (default):
 * {
 *   success: true,
 *   basicDetails: {...},
 *   summary: { lagnaSign, navamsaLagnaSign, planetHouses, conjunctions },
 *   report: {
 *     languages: ['en','hi'],
 *     overview: { title, topics: [...] },
 *     career:   { key, title, tone, score, summary, yogas, topics: [...] },
 *     marriage: {...}, money: {...}, health: {...}
 *   }
 * }
 * Each topic: { id, type, title:{en,hi}, paragraphs:{en:[...],hi:[...]}, text:{en,hi}, meta }
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

    const lang = ['en', 'hi'].includes(String(req.query.lang || '').toLowerCase())
        ? String(req.query.lang).toLowerCase()
        : null;

    let chart;
    try {
        chart = await fetchFullKundliChart(input, { includeRaw: true });
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
    let rich;
    let analysis;
    try {
        rich = extractRichChart(chart.raw, { now: new Date() });
        analysis = analyseChart(rich);
        report = composeReport(rich, analysis, {
            domains,
            name: input.name || input.fullName || ''
        });
    } catch (err) {
        console.error('Kundli report - narrative composition error:', err);
        return res.status(500).json({ error: 'Failed to compose the kundli report' });
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
        report: lang ? pickLanguage(report, lang) : report
    };

    // Legacy raw output (flat table rows per engine) - opt-in only.
    if (req.query.includeSections === '1' || req.query.includeInputs === '1') {
        try {
            const raw = buildFullReport(chart.normalized, { domains });
            if (req.query.includeSections === '1') response.predictions = raw.predictions;
            if (req.query.includeInputs === '1') response.engineInputs = raw.engineInputs;
        } catch (err) {
            console.error('Kundli report - legacy prediction composition error:', err);
            response.predictionsError = 'Failed to compose legacy predictions';
        }
    }

    if (req.query.includeChart === '1') response.chart = chart.normalized;

    res.json(response);
});

module.exports = router;
