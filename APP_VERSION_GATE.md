# App version gate (force update)

The backend can refuse app builds that are too old and tell the app to show an
"update required" screen. The minimum build lives in MongoDB and can be changed
by an admin without redeploying.

## Version number used

`pubspec.yaml` version `5.0.0+92` = version name `5.0.0`, **build number `92`**.
The backend compares the build number only (an integer). The first build that
ships this feature is `92`, so the minimum is seeded as `92`.

## What the app must send

On **every HTTP request** (add to the shared Dio/http client):

```
X-App-Version: 92            # build number (also accepts "5.0.0+92")
X-App-Version-Name: 5.0.0    # optional, for logs
X-App-Id: user               # "user" or "admin" (defaults to "user")
```

On the **Socket.IO connection**:

```dart
IO.io(baseUrl, IO.OptionBuilder()
  .setTransports(['websocket'])
  .setAuth({'appVersion': 92, 'appVersionName': '5.0.0', 'appId': 'user'})
  .build());
```

## What the backend returns

### Build is too old (any `/api/*` route except `/api/app-config`)

```
HTTP 401
X-Update-Required: 1
{
  "error": "Please update the app from the Play Store to continue.",
  "code": "UPDATE_REQUIRED",
  "updateRequired": true,
  "app": "user",
  "minBuild": 92,
  "latestBuild": 92,
  "latestVersionName": "5.0.0",
  "currentBuild": 80,
  "updateAvailable": true,
  "androidStoreUrl": "...",
  "iosStoreUrl": "...",
  "message": { "en": "...", "hi": "..." }
}
```

Socket.IO: the handshake is refused. The client gets `connect_error` and
`error.data` holds the same JSON body.

**Why 401?** The old APK (before this feature) already reacts to 401 by logging
the user out and showing the server's `error` text on the login screen. So old
users end up on the login screen reading "Please update the app...". The new
app must check `code == "UPDATE_REQUIRED"` **before** treating a 401 as
"session expired", and show the update screen instead of logging out.

### Public config (call on app launch, no token needed)

```
GET /api/app-config?app=user
{
  "success": true,
  "app": "user",
  "minBuild": 92,
  "latestBuild": 92,
  "latestVersionName": "5.0.0",
  "currentBuild": 92,          // null if X-App-Version was not sent
  "updateRequired": false,     // hard block -> show blocking update screen
  "updateAvailable": false,    // soft nudge -> optional "update available" banner
  "androidStoreUrl": "",
  "iosStoreUrl": "",
  "message": { "en": "...", "hi": "..." }
}
```

## Flutter checklist (new build 92+)

1. Add the three headers to the shared HTTP client and `auth` to the socket.
2. On launch call `GET /api/app-config`; if `updateRequired` show a blocking
   screen with the store button; if `updateAvailable` show an optional nudge.
3. In the global error interceptor: if status is 401 **and** body has
   `code == "UPDATE_REQUIRED"`, show the blocking update screen. Do **not**
   clear the token. Any other 401 keeps the existing logout behaviour.
4. On socket `connect_error`, if `error.data?.code == "UPDATE_REQUIRED"`, show
   the same screen and stop reconnecting.

## Admin control

```
GET /api/app-config/admin                       (admin JWT)
PUT /api/app-config/admin/user                  (admin JWT)
PUT /api/app-config/admin/admin                 (admin JWT)
{
  "minBuild": 92,
  "latestBuild": 95,
  "latestVersionName": "5.1.0",
  "blockMissingVersion": true,
  "androidStoreUrl": "https://play.google.com/store/apps/details?id=...",
  "iosStoreUrl": "",
  "messageEn": "Please update the app from the Play Store to continue.",
  "messageHi": "कृपया जारी रखने के लिए Play Store से ऐप अपडेट करें।"
}
```

All fields optional. Changes apply immediately on that server and within 30 s
on other instances (policy is cached for 30 s).

## Rollout plan for the old APK

Old builds send **no** version header. They are treated as build "unknown".

| `blockMissingVersion` | Old APK (no header) | New APK below `minBuild` |
|---|---|---|
| `false` (default) | keeps working | blocked (401 UPDATE_REQUIRED) |
| `true` | blocked (401, logs out, login shows update text) | blocked |

Recommended:
1. Deploy backend. Nothing changes for anyone yet.
2. Release build 92 with the headers and update screen.
3. Wait for most users to update (send a push saying "please update").
4. `PUT /api/app-config/admin/user { "blockMissingVersion": true }` to cut off
   the remaining old builds. Do the same for `admin` only after the admin app
   also sends the headers, otherwise the admin app locks itself out.

If the admin app gets locked out, `/api/app-config/*` is exempt from the gate,
so the fix endpoint always works with a valid admin token.

## Env defaults (only used the first time the policy row is created)

```
APP_MIN_BUILD_USER=92
APP_LATEST_BUILD_USER=92
APP_LATEST_VERSION_NAME_USER=5.0.0
APP_BLOCK_MISSING_VERSION_USER=false
APP_MIN_BUILD_ADMIN=0
APP_ANDROID_STORE_URL=
APP_IOS_STORE_URL=
```

After the row exists, the DB value wins; use the admin endpoint to change it.
