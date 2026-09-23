# Admin app: call-style ring for incoming Guruji chats (Flutter)

The backend rings the admin phone with a **data-only** FCM push. Android shows
nothing for a data-only push by itself. The admin app must receive it in the
background and draw the incoming-call screen. This document is everything the
Flutter developer needs to make that work with the app **closed**, in the
background, and in the foreground.

Server setting in use: `ASTRO_RING_PUSH_STYLE=call`.

---

## 0. Fix first: token registration is failing

The registration call currently sends no login header, so the backend answers
401 and never saves the token. Rings then go to whatever old token is stored.

```
POST /api/chat/register-fcm-token
Authorization: Bearer <admin JWT>
Content-Type: application/json
X-App-Version: 92        (from build 92 on, like every other request)
X-App-Id: admin

{ "fcmToken": "<token from FirebaseMessaging.instance.getToken()>" }
```

Call it:
- on every app launch after login,
- inside `FirebaseMessaging.instance.onTokenRefresh.listen(...)`,
- again right after login succeeds.

Verify: after launching the admin app, the server DB `users.fcmToken` for the
admin must equal the token the app just printed.

---

## 1. What the backend sends

### Ring (data-only, Android priority high, 60 s TTL)

All values are **strings** (FCM rule). Parse numbers and dates.

```json
{
  "type": "incoming_astro_chat",
  "sessionId": "66f1…",
  "astrologerKey": "bhupendra",
  "astrologerName": "Bhupendra",
  "ratePerMinute": "50",
  "userId": "66e0…",
  "userName": "Riya Sharma",
  "userPhone": "98…",
  "walletBalance": "500",
  "estimatedMinutes": "10",
  "requestedAt": "2026-09-22T12:37:45.745Z",
  "expiresAt": "2026-09-22T12:38:45.745Z",
  "ringTimeoutMs": "60000",
  "title": "Incoming chat for Bhupendra",
  "body": "Riya wants to chat (₹50/min)",
  "click_action": "FLUTTER_NOTIFICATION_CLICK"
}
```

iOS receives the same data plus a visible alert (title/body, default sound,
category `INCOMING_ASTRO_CHAT`, time-sensitive).

### Stop ringing (data-only, 60 s TTL)

Sent when the ring times out, the user cancels, or another admin device
accepts.

```json
{
  "type": "astro_ring_cancelled",
  "sessionId": "66f1…",
  "astrologerKey": "bhupendra",
  "userId": "66e0…",
  "reason": "accepted | user_cancelled | admin_did_not_answer | disconnected | server_restart"
}
```

### Same ring over Socket.IO (only if the admin socket is connected)

Event `astro_chat_ringing`, same fields but typed (numbers are numbers,
`user` is an object). De-duplicate by `sessionId`: the push and the socket
event can both arrive.

---

## 2. Packages

```yaml
firebase_core: ^latest
firebase_messaging: ^latest
flutter_local_notifications: ^latest   # full-screen intent + actions
package_info_plus: ^latest             # build number for X-App-Version
```

Put a ringtone file at `android/app/src/main/res/raw/astro_ring.mp3`
(20–30 s long; Android plays a channel sound once, so a long file gives a
long ring).

---

## 3. Android manifest

`android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT"/>
<uses-permission android:name="android.permission.VIBRATE"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>

<activity
    android:name=".MainActivity"
    android:showWhenLocked="true"
    android:turnScreenOn="true"
    android:launchMode="singleTop"
    ... >
```

Also inside `<application>` so notification taps open the activity directly
(Android 12 forbids "trampolines"):

```xml
<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="astro_chat_ring"/>
```

---

## 4. Notification channel (create once, on app start AND in the background isolate)

```dart
const ringChannel = AndroidNotificationChannel(
  'astro_chat_ring',                       // must match this id
  'Incoming Guruji chat',
  description: 'Rings when a user requests a chat',
  importance: Importance.max,
  playSound: true,
  sound: RawResourceAndroidNotificationSound('astro_ring'),
  enableVibration: true,
  enableLights: true,
);

await flutterLocalNotificationsPlugin
    .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
    ?.createNotificationChannel(ringChannel);
```

If the channel already exists with different settings Android keeps the old
ones. During development, uninstall the app once after changing the channel.

---

## 5. Background handler (this is the part that makes "app closed" work)

Top-level function, outside any class, with the entry-point pragma. Register
it in `main()` **before** `runApp`.

```dart
@pragma('vm:entry-point')
Future<void> astroBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  final plugin = FlutterLocalNotificationsPlugin();
  await plugin.initialize(const InitializationSettings(
    android: AndroidInitializationSettings('@mipmap/ic_launcher'),
  ));
  await plugin
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(ringChannel);

  final data = message.data;
  switch (data['type']) {
    case 'incoming_astro_chat':
      await showIncomingRing(plugin, data);
      break;
    case 'astro_ring_cancelled':
      await plugin.cancel(ringNotificationId(data['sessionId']));
      break;
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(astroBackgroundHandler);
  runApp(const AdminApp());
}
```

The ring itself:

```dart
int ringNotificationId(String? sessionId) => (sessionId ?? '').hashCode & 0x7fffffff;

Future<void> showIncomingRing(FlutterLocalNotificationsPlugin plugin, Map<String, dynamic> d) async {
  final expiresAt = DateTime.tryParse(d['expiresAt'] ?? '')?.toUtc();
  final now = DateTime.now().toUtc();
  if (expiresAt == null || !expiresAt.isAfter(now)) return;   // stale ring, ignore
  final msLeft = expiresAt.difference(now).inMilliseconds;

  final android = AndroidNotificationDetails(
    ringChannel.id, ringChannel.name,
    channelDescription: ringChannel.description,
    importance: Importance.max,
    priority: Priority.max,
    category: AndroidNotificationCategory.call,
    fullScreenIntent: true,          // shows over lock screen
    ongoing: true,                   // cannot be swiped away
    autoCancel: false,
    timeoutAfter: msLeft,            // disappears when the server would cancel
    visibility: NotificationVisibility.public,
    sound: ringChannel.sound,
    playSound: true,
    enableVibration: true,
    actions: const [
      AndroidNotificationAction('accept', 'Accept', showsUserInterface: true, cancelNotification: true),
      AndroidNotificationAction('reject', 'Reject', cancelNotification: true),
    ],
  );

  await plugin.show(
    ringNotificationId(d['sessionId']),
    d['title'] ?? 'Incoming chat for ${d['astrologerName']}',
    d['body'] ?? '${d['userName']} wants to chat (₹${d['ratePerMinute']}/min)',
    NotificationDetails(android: android),
    payload: jsonEncode(d),
  );
}
```

Rules for this handler:
- No `BuildContext`, no navigation, no providers. Only notification code.
- Do not `await` anything slow. Android gives about 10 seconds.
- Do not rely on app state; the isolate is fresh every time.

---

## 6. Foreground handling

When the app is open, the push arrives on `FirebaseMessaging.onMessage` and
the socket event `astro_chat_ringing` may arrive too. Show the in-app
incoming-call page. De-duplicate by `sessionId`.

```dart
FirebaseMessaging.onMessage.listen((m) {
  if (m.data['type'] == 'incoming_astro_chat') ringController.show(m.data);
  if (m.data['type'] == 'astro_ring_cancelled') ringController.dismiss(m.data['sessionId']);
});
socket.on('astro_chat_ringing', (p) => ringController.show(p));
socket.on('astro_chat_ended', (p) => ringController.dismiss(p['sessionId']));
```

Also send `authenticate(token)` on the socket right after connect. That call
joins the admins room; without it the socket ring never arrives.

---

## 7. Accept / Reject

From the notification action or the in-app page:

```
POST /api/astrologer-chat/admin/sessions/{sessionId}/accept   (Bearer + version headers)
POST /api/astrologer-chat/admin/sessions/{sessionId}/reject
```

or over the socket: `astro_accept_chat({ sessionId })` → `astro_accept_chat_response`.

After accept succeeds: open the chat page and emit `astro_join_chat({ sessionId })`.
Billing starts only when both sides have joined.

Error to handle: `code: "SESSION_NOT_RINGING"` with `error: "Session is already cancelled"`.
Show "This request has expired" and close the ring.

Handle taps when the app was closed or in background:

```dart
final initial = await FirebaseMessaging.instance.getInitialMessage();   // app was killed
FirebaseMessaging.onMessageOpenedApp.listen(...);                        // app was in background
// flutter_local_notifications: onDidReceiveNotificationResponse / getNotificationAppLaunchDetails()
```

Read `payload` (the JSON from step 5), check `expiresAt` again, then accept.

---

## 8. Permissions the app must request (by Android version)

| Android | What | How |
|---|---|---|
| 13+ | Notification permission (runtime) | `FirebaseMessaging.instance.requestPermission()` or `plugin.requestNotificationsPermission()` on first launch |
| 14+ | Full-screen notifications are OFF by default for non-phone apps | `AndroidFlutterLocalNotificationsPlugin.canUseFullScreenIntent()`; if false, `requestFullScreenIntentPermission()` which opens settings |
| 6+ | Battery optimisation | Ask the admin to exclude the app; open `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` |
| Xiaomi / Redmi / Oppo / Vivo / Realme / OnePlus | Autostart | Show a one-time guide page and deep-link to the OEM autostart settings |

Show a "Ring setup" checklist page in the admin app that checks all of the
above and shows red/green for each. This removes 90% of support calls.

---

## 9. iOS

The push arrives as a visible alert with category `INCOMING_ASTRO_CHAT`.
Register a `UNNotificationCategory` with Accept and Reject actions under that
id in `AppDelegate`. There is no looping ringtone on iOS without CallKit and
VoIP push, which the backend does not send. The alert plays the default sound
once and shows for as long as iOS keeps it.

---

## 10. Test checklist

Run each with a user account requesting Bhupendra. Watch the server log for
`🔔 Admin ring push … sent=1 failed=0` after each request.

1. Admin app killed (swiped away), screen locked → full-screen ring appears with sound.
2. Admin app in background → same.
3. Admin app open → in-app incoming page, only one ring even though both push and socket arrive.
4. Tap Accept from the killed-app notification → app opens on the chat, user gets "accepted".
5. Wait 60 s without answering → ring disappears on its own; server log shows the cancel push with `reason=admin_did_not_answer`.
6. User cancels within 10 s → ring disappears immediately; log shows `reason=user_cancelled`.
7. Reinstall the admin app, log in → DB token changes to the new one.
8. Repeat test 1 on a Xiaomi or Realme phone after enabling Autostart.

If the server log shows `sent=1` and the phone shows nothing, the fault is in
steps 3–5 or 8 of this document. If the log shows `failed=1` with
`registration-token-not-registered`, step 0 is not done.
