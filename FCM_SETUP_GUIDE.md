# Firebase Cloud Messaging (FCM) Setup Guide

## TL;DR - Quick Copy-Paste

Add these to your `.env` file and replace the values:

```env
FIREBASE_PROJECT_ID=jyotishviswkosh
FIREBASE_PRIVATE_KEY_ID=abc123def456ghi789
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwgg...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@jyotishviswkosh.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=123456789012345678901
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40jyotishviswkosh.iam.gserviceaccount.com
FIREBASE_UNIVERSE_DOMAIN=googleapis.com
```

**Get these values:** Download service account JSON from Firebase Console → Copy each field to your .env

**Required fields:** Only `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, and `FIREBASE_CLIENT_EMAIL` are mandatory.

---

## Quick Setup Steps

### 1. Firebase Console Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Click the gear icon ⚙️ next to "Project Overview"
4. Select "Project settings"
5. Go to the "Service accounts" tab
6. Click "Generate new private key"
7. Click "Generate key" in the confirmation dialog
8. A JSON file will be downloaded - keep it safe!

### 2. Add to .env File

Open your `.env` file and add the following environment variables from your downloaded JSON file:

```env
# Firebase Configuration (from service account JSON file)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project.iam.gserviceaccount.com
FIREBASE_UNIVERSE_DOMAIN=googleapis.com
```

**Important Notes:**
- The `FIREBASE_PRIVATE_KEY` should be wrapped in quotes and include the full key with `\n` for line breaks
- Copy each value from your downloaded JSON file
- The three **required** fields are: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, and `FIREBASE_CLIENT_EMAIL`
- The other fields have default values and are optional

### 3. Example .env File

Here's an example with your project:

```env
# Your existing variables
JWT_SECRET=your_jwt_secret_here
MONGODB_URI=your_mongodb_uri_here

# Firebase Configuration
FIREBASE_PROJECT_ID=jyotishviswkosh
FIREBASE_PRIVATE_KEY_ID=abc123def456
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@jyotishviswkosh.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=123456789012345678901
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40jyotishviswkosh.iam.gserviceaccount.com
FIREBASE_UNIVERSE_DOMAIN=googleapis.com
```

### 4. Restart Your Server

After adding the environment variables, restart your Node.js server:

```bash
npm start
```

You should see these messages in the console:
```
✅ Firebase Admin SDK initialized successfully
📱 FCM configured for project: jyotishviswkosh
```

If you see this message instead:
```
⚠️ Firebase credentials not found. FCM notifications disabled.
   Required: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL
```

Then the required environment variables are not set correctly. Double-check your `.env` file.

## Testing FCM Notifications

### Client-Side Setup (Flutter Example)

1. **Install Firebase packages:**
```yaml
dependencies:
  firebase_core: latest_version
  firebase_messaging: latest_version
```

2. **Initialize Firebase:**
```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  runApp(MyApp());
}
```

3. **Get FCM Token:**
```dart
final fcmToken = await FirebaseMessaging.instance.getToken();
print('FCM Token: $fcmToken');
```

4. **Register Token with Backend:**
```dart
// After user login, register the FCM token
Future<void> registerFCMToken(String jwtToken, String fcmToken) async {
  final response = await http.post(
    Uri.parse('https://your-api.com/api/chat/register-fcm-token'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $jwtToken',
    },
    body: jsonEncode({'fcmToken': fcmToken}),
  );
  
  if (response.statusCode == 200) {
    print('FCM token registered successfully');
  }
}
```

5. **Listen for Notifications:**
```dart
FirebaseMessaging.onMessage.listen((RemoteMessage message) {
  print('Got a message whilst in the foreground!');
  print('Message data: ${message.data}');
  
  if (message.notification != null) {
    print('Message also contained a notification: ${message.notification}');
    // Show local notification or update UI
  }
});
```

### Client-Side Setup (Web Example)

1. **Add Firebase to your web app:**
```html
<script src="https://www.gstatic.com/firebasejs/9.x.x/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.x.x/firebase-messaging.js"></script>
```

2. **Initialize and get token:**
```javascript
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  // ... other config
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Get FCM token
getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY' })
  .then((currentToken) => {
    if (currentToken) {
      console.log('FCM Token:', currentToken);
      // Register with backend
      registerFCMToken(jwtToken, currentToken);
    }
  });
```

## Testing Without FCM (Development)

If you don't want to set up FCM during development:

1. Simply don't add the `FIREBASE_SERVICE_ACCOUNT` to your `.env` file
2. All chat features will work normally
3. You'll see this warning in console (which is fine):
   ```
   ⚠️ FIREBASE_SERVICE_ACCOUNT not found. FCM notifications disabled.
   ```
4. Messages will still be delivered via Socket.IO when users are online
5. Only offline push notifications won't work

## Troubleshooting

### Issue: "Error: Firebase credential is not valid"
**Solution:** 
1. Check that your `FIREBASE_PRIVATE_KEY` is wrapped in quotes
2. Make sure the private key includes `\n` characters for line breaks
3. Verify all three required fields are present: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`

### Issue: "Error: Invalid FCM token"
**Solution:** The client-side FCM token might be expired or invalid. Request a new token from the client.

### Issue: Notifications not received on client
**Possible causes:**
1. Client didn't register FCM token with backend
2. Client app doesn't have notification permissions
3. FCM token expired (refresh it periodically)
4. User is online (notifications only sent when offline)

### Issue: "Failed to initialize Firebase Admin SDK"
**Solution:** 
1. Verify the JSON format in your `.env` file
2. Check that the service account has the correct permissions in Firebase Console
3. Make sure you're using the correct Firebase project

## Security Best Practices

1. **Never commit `.env` file to git** - It contains sensitive credentials
2. **Use environment variables in production** - Don't hardcode credentials
3. **Rotate service account keys regularly** - Generate new keys periodically
4. **Limit service account permissions** - Only grant necessary permissions in Firebase Console
5. **Validate FCM tokens** - Ensure tokens are from legitimate sources

## Production Deployment

### Using Heroku
```bash
heroku config:set FIREBASE_PROJECT_ID=jyotishviswkosh
heroku config:set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
heroku config:set FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@jyotishviswkosh.iam.gserviceaccount.com
# ... add other variables
```

### Using Vercel
Add each environment variable in Vercel dashboard:
```
FIREBASE_PROJECT_ID=jyotishviswkosh
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@jyotishviswkosh.iam.gserviceaccount.com
```

### Using Docker
```dockerfile
ENV FIREBASE_PROJECT_ID=jyotishviswkosh
ENV FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ENV FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@jyotishviswkosh.iam.gserviceaccount.com
```

Or use a `.env` file mounted as a volume:
```bash
docker run -v ./.env:/app/.env your-image
```

## Monitoring

Check your Firebase Console > Cloud Messaging section to monitor:
- Notification delivery rates
- Failed notifications
- Token registration stats

## Additional Resources

- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Firebase Admin SDK Setup](https://firebase.google.com/docs/admin/setup)
- [FCM HTTP v1 API](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages)

---

**Note:** FCM is completely optional for the chat features to work. All core functionality (read receipts, delivered status, unread counts) works without FCM. FCM only adds push notifications for offline users.
