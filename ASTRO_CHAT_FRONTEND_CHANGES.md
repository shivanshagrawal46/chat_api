# Astrologer (Guruji) Chat — Frontend Changes Required

Backend changes shipped in this pass. This file lists exactly what the Flutter
apps must do to use them. Nothing here is optional for the **admin ring**; the
rest improves smoothness and can be done incrementally.

## 1. Admin app: call-style incoming chat (REQUIRED)

The admin ring is now a **data-only** high-priority FCM message
(`ASTRO_RING_PUSH_STYLE=call`, the default). The OS shows nothing by itself —
the app must draw the incoming-chat screen. Until this is implemented, set
`ASTRO_RING_PUSH_STYLE=banner` in `.env` to get the old tray notification back.

### FCM data payload (all values are strings)

| key | example | notes |
|---|---|---|
| `type` | `incoming_astro_chat` | |
| `sessionId` | `66f0…` | pass to accept / reject |
| `astrologerKey` | `bhupendra` | |
| `astrologerName` | `Bhupendra` | |
| `ratePerMinute` | `50` | |
| `userId` | `66e1…` | |
| `userName` | `Ravi Kumar` | |
| `userPhone` | `98…` | |
| `walletBalance` | `600` | |
| `estimatedMinutes` | `12` | |
| `requestedAt` | ISO 8601 | |
| `expiresAt` | ISO 8601 | **stop ringing at this time** even if no cancel arrives |
| `ringTimeoutMs` | `60000` | |
| `title`, `body` | text | ready-made strings for the notification |

A second data-only message tells the device to stop ringing:

| key | value |
|---|---|
| `type` | `astro_ring_cancelled` |
| `sessionId` | the ring to dismiss |
| `reason` | `accepted`, `user_cancelled`, `admin_did_not_answer`, `admin_rejected`, `disconnected` … |

### Android

1. Register `FirebaseMessaging.onBackgroundMessage` (top-level function, `@pragma('vm:entry-point')`).
2. On `type == incoming_astro_chat` show a **full-screen intent** notification on channel
   `astro_chat_ring` (create the channel with `Importance.max`, a looping ringtone sound,
   `AudioAttributes` usage = notification ringtone, `fullScreenIntent = true`) with
   **Accept** and **Reject** actions. `flutter_callkit_incoming` does all of this and gives a
   real call screen; `flutter_local_notifications` with `fullScreenIntent: true` also works.
3. Auto-dismiss at `expiresAt`. Dismiss on `astro_ring_cancelled` for the same `sessionId`.
4. Accept → open the app, `POST /api/astrologer-chat/admin/sessions/:id/accept` (or socket
   `astro_accept_chat`), then open the chat screen and emit `astro_join_chat` immediately.
   The join window is 60 s after accept.
5. Reject → `POST /api/astrologer-chat/admin/sessions/:id/reject`.
6. In the foreground, the same data also arrives on the socket as `astro_chat_ringing`
   (now includes `expiresAt` and the `user` object, also on admin reconnect resume).
   Show the in-app ring card from the socket event and ignore the FCM duplicate.

### iOS

Apple only allows CallKit / VoIP push for real voice calls; using it for chat gets the app
rejected. The backend therefore attaches a visible **time-sensitive alert** (category
`INCOMING_ASTRO_CHAT`) to the same push. To make it feel like a call:

1. Enable the *Time Sensitive Notifications* capability.
2. Register a `UNNotificationCategory` `INCOMING_ASTRO_CHAT` with Accept / Reject actions.
3. Bundle a looping ring sound (≤ 30 s, `.caf`) and set `ASTRO_RING_IOS_SOUND=astro_ring.caf`
   in `.env`.

## 2. Admin app: presence banner (recommended)

Socket event `astro_peer_presence`:

```json
{ "sessionId": "...", "userId": "...", "side": "user", "online": false, "graceMs": 60000,
  "message": "User lost connection. Waiting up to 60s…" }
```

Show `message` as a banner in the open chat while `online == false`; hide it on the next
event with `online == true`. If the user does not return inside `graceMs`, the session ends
with `astro_chat_ended.endReason == "disconnected"`.

## 3. User app

- **`astro_peer_presence`** with `side == "admin"`: show "Guruji reconnecting…" banner.
  If Guruji does not return within `graceMs`, `astro_chat_ended` arrives with
  `endReason == "admin_disconnected"` — show a friendly message; no further minutes are charged.
- **Request errors**: `astro_request_chat_response` / `POST /sessions/start` now carry a machine
  `code` next to `error`. New one: `ADMIN_UNREACHABLE` (HTTP 503) — Guruji has no device
  online and nothing to ring. Show it instead of the ringing screen.
- **Ended reasons** to handle in the session-ended screen: `disconnected`, `admin_disconnected`
  (both new in practice; see model enum for the full list).

## 4. Chat screen (both apps)

- **Optimistic send**: include `clientId` (any string ≤ 64 chars, e.g. a UUID) in
  `astro_send_message`. The echoed `astro_new_message` and `astro_message_delivered` carry the
  same `clientId` — use it to replace the pending bubble.
- **Typing**: emit `astro_typing { sessionId, isTyping: true }` on first keystroke and
  `isTyping: false` after ~2 s idle or on send. Listen for `astro_typing` and show the
  indicator when `from` is the other side.
- **Read receipts**: emit `astro_mark_read { sessionId }` when the chat screen opens and on
  every incoming message while it is open. The other side receives
  `astro_messages_seen { sessionId, messageIds, seenAt, seenBy }` — flip those bubbles to
  "seen". The caller gets `astro_messages_marked_read { count }`.
- **Offline push**: when the receiver's socket is gone mid-chat, a normal notification
  (`type: astro_chat_message`, includes `sessionId`) is pushed. Tapping it should open the
  session's chat screen and re-emit `astro_join_chat` if the session is still active.

## 5. Backend env knobs added

| var | default | meaning |
|---|---|---|
| `ASTRO_RING_PUSH_STYLE` | `call` | `call` = data-only ring (needs §1); `banner` = old tray notification |
| `ASTRO_RING_IOS_SOUND` | `default` | iOS sound file name for the ring alert |
