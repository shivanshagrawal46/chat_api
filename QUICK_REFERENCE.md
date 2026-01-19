# Quick Reference - WhatsApp-like Chat Features

## 🚀 New Endpoints

```http
GET    /api/chat/unread-count/:roomId      # Get unread count for a chat
POST   /api/chat/mark-as-read              # Mark messages as read
GET    /api/chat/conversations              # Get all conversations with unread counts
POST   /api/chat/register-fcm-token        # Register FCM token for notifications
```

## 📡 New Socket.IO Events

### Emit (Client → Server)
```javascript
socket.emit('mark_messages_read', { senderId: 'user_id' });
```

### Listen (Server → Client)
```javascript
socket.on('message_delivered', (data) => {
  // { messageId, deliveredAt }
});

socket.on('message_read', (data) => {
  // { readBy, count }
});

socket.on('unread_count_update', (data) => {
  // { senderId, unreadCount }
});

socket.on('messages_marked_read', (data) => {
  // { success, count }
});
```

## 🔧 Environment Variables (Optional - for FCM)

```env
FIREBASE_PROJECT_ID=jyotishviswkosh
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@jyotishviswkosh.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_CLIENT_ID=your-client-id
```

**Note:** Only the first 3 are required. Others have defaults.

## 📊 Message Fields (New)

```javascript
{
  // Existing fields
  sender: ObjectId,
  receiver: ObjectId,
  content: String,
  createdAt: Date,
  
  // New fields
  isRead: Boolean,        // default: false
  isDelivered: Boolean,   // default: false
  readAt: Date,           // default: null
  deliveredAt: Date       // default: null
}
```

## 👤 User Fields (New)

```javascript
{
  // Existing fields
  firstName: String,
  lastName: String,
  email: String,
  // ...
  
  // New field
  fcmToken: String  // default: null
}
```

## 💡 Common Patterns

### 1. Show Unread Badge
```javascript
// On app load, get unread counts for all conversations
fetch('/api/chat/conversations', {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(res => res.json())
.then(data => {
  data.conversations.forEach(conv => {
    if (conv.unreadCount > 0) {
      showBadge(conv.user._id, conv.unreadCount);
    }
  });
});
```

### 2. Mark Chat as Read (When Opening)
```javascript
// When user opens a chat
socket.emit('mark_messages_read', { 
  senderId: otherUserId 
});

// Update UI when confirmed
socket.on('messages_marked_read', (data) => {
  console.log(`${data.count} messages marked as read`);
  removeBadge(otherUserId);
});
```

### 3. Show Delivery Status (Single Check)
```javascript
// When sending message
socket.emit('send_message', { receiverId, content });

// Update UI when delivered
socket.on('message_delivered', (data) => {
  updateMessageUI(data.messageId, 'delivered'); // Show ✓✓
});
```

### 4. Show Read Status (Blue Checks)
```javascript
// Listen for read receipts
socket.on('message_read', (data) => {
  console.log(`${data.count} messages read by ${data.readBy}`);
  updateMessagesUI(data.readBy, 'read'); // Show blue ✓✓
});
```

### 5. Real-time Unread Count
```javascript
// Listen for unread count changes
socket.on('unread_count_update', (data) => {
  updateBadge(data.senderId, data.unreadCount);
});
```

### 6. Register FCM Token
```javascript
// After login, register FCM token for push notifications
const fcmToken = await getFCMToken(); // From Firebase SDK

fetch('/api/chat/register-fcm-token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({ fcmToken })
});
```

## 🎨 UI Status Indicators

| Status | Icon | Color | Meaning |
|--------|------|-------|---------|
| Sent | ✓ | Gray | Message sent to server |
| Delivered | ✓✓ | Gray | Received by recipient (online) |
| Read | ✓✓ | Blue | Read by recipient |
| Pending | 🕐 | Gray | Sending... |

## 🔔 Notification Behavior

| User Status | Behavior |
|-------------|----------|
| Online | Real-time via Socket.IO, no FCM |
| Offline | FCM push notification sent |
| App Closed | FCM wakes app with notification |

## ⚡ Performance Tips

1. **Batch Read Updates:** Don't mark messages as read on every scroll
2. **Debounce Unread Counts:** Update UI after user stops scrolling
3. **Cache Conversations:** Store locally and update incrementally
4. **Lazy Load Messages:** Paginate message history
5. **Optimize Queries:** Use proper indexes on `receiver + isRead`

## 🐛 Debugging

### Check FCM Status
```javascript
// Server logs on startup
✅ Firebase Admin SDK initialized successfully
// or
⚠️ FIREBASE_SERVICE_ACCOUNT not found. FCM notifications disabled.
```

### Test Socket Connection
```javascript
socket.on('connect', () => {
  console.log('Connected:', socket.id);
  socket.emit('authenticate', jwtToken);
});

socket.on('authenticated', (data) => {
  console.log('Authenticated:', data.success);
});
```

### Check Message Status
```javascript
// Query message from database to see status
const message = await Message.findById(messageId);
console.log({
  isDelivered: message.isDelivered,
  deliveredAt: message.deliveredAt,
  isRead: message.isRead,
  readAt: message.readAt
});
```

## 📱 Platform-Specific Notes

### Flutter
```dart
// Get FCM token
final fcmToken = await FirebaseMessaging.instance.getToken();

// Listen for foreground messages
FirebaseMessaging.onMessage.listen((RemoteMessage message) {
  print('New message: ${message.notification?.title}');
});
```

### React Native
```javascript
import messaging from '@react-native-firebase/messaging';

// Get FCM token
const fcmToken = await messaging().getToken();

// Listen for messages
messaging().onMessage(async remoteMessage => {
  console.log('New message:', remoteMessage);
});
```

### Web
```javascript
import { getMessaging, getToken } from 'firebase/messaging';

const messaging = getMessaging();
const token = await getToken(messaging, { 
  vapidKey: 'YOUR_VAPID_KEY' 
});
```

## 🔐 Security Checklist

- ✅ All endpoints require JWT authentication
- ✅ Users can only read their own messages
- ✅ Users can only mark messages as read if they're the receiver
- ✅ FCM credentials stored in environment variables
- ✅ .env file in .gitignore
- ✅ Input validation on all endpoints
- ✅ MongoDB ObjectId validation

## 📈 Monitoring

### Key Metrics to Track
1. Message delivery rate
2. Message read rate  
3. Average time to read
4. FCM notification success rate
5. Socket.IO connection stability
6. Unread message accumulation

## 🚦 Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Message created |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (no/invalid token) |
| 404 | User/Message not found |
| 500 | Server error |

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| Unread count wrong | Check database query filters |
| Messages not marked as read | Verify sender ID is correct |
| No push notifications | Check FCM setup and token registration |
| Delivery status not updating | Ensure receiver is connected via Socket.IO |
| Read receipts not showing | Check Socket.IO event listeners |

## 📚 Documentation Links

- **Full API Docs:** `CHAT_FEATURES_DOCUMENTATION.md`
- **FCM Setup:** `FCM_SETUP_GUIDE.md`
- **Changes Summary:** `CHANGES_SUMMARY.md`

---

**Pro Tip:** Start testing without FCM to verify core functionality, then add FCM for production push notifications.
