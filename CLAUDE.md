# CLAUDE.md — Backend Chat (Jyotish Vishwakosh API)

## After every update: give a change summary (REQUIRED)

Whenever you change any code in this repo, end your reply with a structured summary in
**simple, easy language** (no heavy jargon; if a technical word is needed, explain it in
a few words). Use exactly this format:

```
## Summary of changes

### What I changed
- <file path> — <what was changed in one or two plain sentences>
- ...

### Why I changed it
- <the problem or goal in simple words, and how the change solves it>
- ...

### How it works now
- <short walkthrough of the new behaviour from the user's / admin's point of view>

### Things to keep in mind
- <anything to do before deploying, env vars to set, frontend changes needed, risks>
- (write "Nothing" if there is nothing)

### Verified
- <what was tested and how; say clearly if something was NOT tested>
```

Rules for the summary:
- Write for someone who did not watch the work. Every bullet must make sense on its own.
- One idea per bullet. Short sentences. No walls of text.
- Always list every file created, edited, or deleted.
- Never skip the "Why" section — the reason matters as much as the change.
- If frontend (Flutter app) changes are needed to use a backend change, say so explicitly
  under "Things to keep in mind".
- Give the summary even for small changes (one-line fixes get a short summary, not none).

## Project overview

Node.js + Express 5 + Socket.IO + MongoDB (Mongoose) backend for an astrology app.
Clients are Flutter mobile apps (user app + admin app) and a website.
Start with `npm start` (runs `node index.js`). No test suite exists; verify with
`node --check <file>` and a short boot (`PORT=6999 node index.js`).

### Main features
- **Auth** — JWT + Google Sign-In (`routes/auth.js`, `middleware/auth.js`).
- **Legacy admin ↔ user chat** — `send_message` socket event, freeze/unfreeze flow.
- **Astrologer (Guruji) paid chat** — user picks a persona (Bhupendra, Samta, Rashmi,
  Smirita, Rekha); one real admin answers all of them. Flow:
  `ringing → accepted → active → ended/cancelled`. Per-minute wallet billing.
  - `services/astroChatService.js` — start / accept a chat (shared by REST + socket).
  - `services/astroBillingEngine.js` — timers, per-minute charging, grace periods,
    ring/join timeouts, presence (disconnect grace), session ending.
  - `services/astroPush.js` — every FCM push for this flow (ring, cancel ring, accepted,
    offline message).
  - `routes/astrologer-chat.js` — REST endpoints; `index.js` — `astro_*` socket events.
  - `models/AstrologerChatSession.js` — session record + partial unique indexes
    (one live session per user, one per astrologer).
- **AI chat** (Gemini) — `routes/aichat.js`; free first question, then ₹21 each.
- **Wallet + payments** (Razorpay) — `routes/wallet.js`, `routes/unified-payment.js`.
- **Kundli, palmistry, predictions, reports** — `routes/kundli*.js`, `routes/palmistry.js`,
  `routes/*-predictions.js`, `services/*PredictionEngine.js`, data in `data/astrology/`.
  - `POST /api/kundli-report/full` returns a topic-wise reading (EN + HI, no AI). Pipeline:
    `services/kundliExtract.js` (reads the full upstream payload: degrees, nakshatras,
    Ashtakavarga, Shadbala, aspects, avasthas, Vimshottari dasha) →
    `services/kundliAnalysis/` (0–100 strength scores for planets and houses,
    rarity-gated yoga detection, per-domain verdicts) → `services/kundliNarrative/compose.js`
    (writes the paragraphs, prevents repetition). See `KUNDLI_REPORT_NARRATIVE.md`.
    The old flat table-row output is behind `?includeSections=1`.
  - Yoga detection is deliberately rarity-gated: a plain kendra–trikona Raja Yoga occurs in
    ~97.5% of charts, so it is only surfaced when both lords are genuinely strong. Do not
    loosen those gates without re-running the distribution check in the doc.
- **Push notifications** — `services/fcmService.js` (Firebase Admin). Optional; the app
  runs without Firebase credentials.

### Key files
- `index.js` — app setup, all Socket.IO handlers, route mounting. Large file; search for
  the `// ===== ... =====` section headers.
- `.env` — secrets and config (never commit, never print values).
- Docs: `ASTRO_CHAT_FRONTEND_CHANGES.md`, `CHAT_FEATURES_DOCUMENTATION.md`,
  `FCM_SETUP_GUIDE.md`, `QUICK_REFERENCE.md`.

## Conventions
- Business-rule failures return result objects (`{ ok: false, status, code, error }`) or
  emit `<event>_response` with `success: false`; do not throw for expected failures.
- Anything that changes money (wallet debit, session status) must be an atomic
  `findOneAndUpdate` with a precondition, never read-modify-write.
- Socket events for the astrologer chat are prefixed `astro_`. Admin broadcasts go to the
  `admins` room; user events go to the room named by the user id.
- FCM `data` values must be strings — always send through `fcmService` helpers.
- Keep the welcome route in `index.js` (`GET /`) updated when adding events/endpoints.
- Do not commit unless asked. Do not run `npm install` changes into `package-lock.json`
  unless a dependency was actually added.
