# WhatsApp-like Chat Features Documentation

## Overview
This document describes the new modern chat features added to make the application more WhatsApp-like, including message read/delivered status, unread counts, and push notifications.

## New Database Fields

### Message Model
The following fields have been added to the Message model:

- `isRead` (Boolean, default: false) - Indicates if the message has been read by the receiver
- `isDelivered` (Boolean, default: false) - Indicates if the message has been delivered to the receiver
- `readAt` (Date, default: null) - Timestamp when the message was read
- `deliveredAt` (Date, default: null) - Timestamp when the message was delivered

### User Model
- `fcmToken` (String, default: null) - Firebase Cloud Messaging token for push notifications

## New API Endpoints

### 1. Get Unread Count
**Endpoint:** `GET /api/chat/unread-count/:roomId`

**Description:** Get the count of unread messages from a specific user

**Authentication:** Required (JWT token)

**Parameters:**
- `roomId` (path parameter) - The sender's user ID

**Response:**
```json
{
  "unreadCount": 5
}
```

---

### 2. Mark Messages as Read
**Endpoint:** `POST /api/chat/mark-as-read`

**Description:** Mark all unread messages from a specific sender as read

**Authentication:** Required (JWT token)

**Request Body:**
```json
{
  "senderId": "user_id_here"
}
```

**Response:**
```json
{
  "success": true,
  "markedCount": 5
}
```

**Side Effects:**
- Updates `isRead` to true and sets `readAt` timestamp
- Emits `messages_read` socket event to the sender

---

### 3. Get All Conversations with Unread Counts
**Endpoint:** `GET /api/chat/conversations`

**Description:** Get all conversations with user details, last message, and unread counts

**Authentication:** Required (JWT token)

**Response:**
```json
{
  "conversations": [
    {
      "user": {
        "_id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com",
        "phone": "1234567890",
        "isAdmin": false,
        "createdAt": "2024-01-01T00:00:00.000Z"
      },
      "unreadCount": 3,
      "lastMessage": {
        "content": "Hello there!",
        "createdAt": "2024-01-01T12:00:00.000Z",
        "isRead": false,
        "sender": "sender_user_id"
      }
    }
  ]
}
```

---

### 4. Register FCM Token
**Endpoint:** `POST /api/chat/register-fcm-token`

**Description:** Register or update the user's FCM token for push notifications

**Authentication:** Required (JWT token)

**Request Body:**
```json
{
  "fcmToken": "firebase_cloud_messaging_token_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "FCM token registered successfully"
}
```

---

## Socket.IO Events

### Client -> Server Events

#### 1. send_message
**Description:** Send a new message to another user

**Payload:**
```javascript
{
  receiverId: "user_id_here",
  content: "Message content"
}
```

**Emits Back:**
- `new_message` - To both sender and receiver (if online)
- `message_delivered` - To sender (if receiver is online)
- `unread_count_update` - To receiver (if online)
- Sends FCM notification if receiver is offline

---

#### 2. mark_messages_read
**Description:** Mark all unread messages from a specific sender as read

**Payload:**
```javascript
{
  senderId: "user_id_here"
}
```

**Emits Back:**
- `message_read` - To the sender
- `unread_count_update` - To current user
- `messages_marked_read` - Confirmation to current user

---

### Server -> Client Events

#### 1. new_message
**Description:** A new message has been received

**Payload:**
```javascript
{
  _id: "message_id",
  sender: "sender_user_id",
  receiver: "receiver_user_id",
  content: "Message content",
  isRead: false,
  isDelivered: true,
  readAt: null,
  deliveredAt: "2024-01-01T12:00:00.000Z",
  createdAt: "2024-01-01T12:00:00.000Z"
}
```

---

#### 2. message_delivered
**Description:** Confirmation that a message was delivered to the receiver

**Payload:**
```javascript
{
  messageId: "message_id",
  deliveredAt: "2024-01-01T12:00:00.000Z"
}
```

---

#### 3. message_read
**Description:** One or more of your messages have been read

**Payload:**
```javascript
{
  readBy: "user_id_who_read",
  count: 5
}
```

---

#### 4. unread_count_update
**Description:** The unread count for a conversation has changed

**Payload:**
```javascript
{
  senderId: "sender_user_id",
  unreadCount: 3
}
```

---

#### 5. messages_marked_read
**Description:** Confirmation that messages were successfully marked as read

**Payload:**
```javascript
{
  success: true,
  count: 5
}
```

---

## Firebase Cloud Messaging (FCM) Integration

### Setup Instructions

1. **Get Firebase Service Account Credentials:**
   - Go to Firebase Console
   - Select your project
   - Go to Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Download the JSON file

2. **Add to Environment Variables:**
   Add the following to your `.env` file (extract values from the JSON file):
   ```
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour key\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY_ID=your-private-key-id
   FIREBASE_CLIENT_ID=your-client-id
   FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
   FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
   FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
   FIREBASE_CLIENT_X509_CERT_URL=your-cert-url
   FIREBASE_UNIVERSE_DOMAIN=googleapis.com
   ```
   
   **Required fields:** `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`  
   **Optional fields:** Others have default values

3. **FCM Notification Behavior:**
   - Notifications are sent only when the receiver is **offline**
   - If the receiver is online, they receive real-time messages via Socket.IO
   - Notification includes:
     - Title: "New message from [Sender Name]"
     - Body: First 100 characters of the message
     - Data: type, senderId, messageId

### Client-Side FCM Token Registration

On the client side (Flutter/Web), after getting the FCM token:

```javascript
// Example using fetch API
const registerFCMToken = async (token, fcmToken) => {
  const response = await fetch('https://your-api.com/api/chat/register-fcm-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ fcmToken })
  });
  return response.json();
};
```

---

## Usage Examples

### Example 1: Getting Unread Count
```javascript
// Client-side code
const getUnreadCount = async (token, roomId) => {
  const response = await fetch(`https://your-api.com/api/chat/unread-count/${roomId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  console.log(`Unread messages: ${data.unreadCount}`);
};
```

### Example 2: Marking Messages as Read
```javascript
// When user opens a chat, mark all messages as read
socket.emit('mark_messages_read', {
  senderId: otherUserId
});

// Listen for confirmation
socket.on('messages_marked_read', (data) => {
  console.log(`${data.count} messages marked as read`);
});

// Listen for unread count update
socket.on('unread_count_update', (data) => {
  console.log(`New unread count: ${data.unreadCount}`);
});
```

### Example 3: Real-time Message Status Updates
```javascript
// Listen for message delivery status
socket.on('message_delivered', (data) => {
  console.log(`Message ${data.messageId} delivered at ${data.deliveredAt}`);
  // Update UI to show double check mark (✓✓)
});

// Listen for message read status
socket.on('message_read', (data) => {
  console.log(`${data.count} messages read by ${data.readBy}`);
  // Update UI to show blue double check mark (✓✓ in blue)
});
```

### Example 4: Getting All Conversations
```javascript
// Get all conversations with unread counts
const getConversations = async (token) => {
  const response = await fetch('https://your-api.com/api/chat/conversations', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  
  // Display conversations sorted by most recent
  data.conversations.forEach(conv => {
    console.log(`${conv.user.firstName}: ${conv.lastMessage?.content}`);
    console.log(`Unread: ${conv.unreadCount}`);
  });
};
```

---

## Implementation Flow

### Sending a Message Flow
1. Client emits `send_message` with receiverId and content
2. Server creates message in database with `isRead: false`, `isDelivered: false`
3. Server emits `new_message` to sender
4. If receiver is online:
   - Server emits `new_message` to receiver
   - Server marks message as delivered and emits `message_delivered` to sender
   - Server calculates and emits `unread_count_update` to receiver
5. If receiver is offline:
   - Server sends FCM push notification to receiver's device

### Reading Messages Flow
1. User opens chat with another user
2. Client emits `mark_messages_read` with senderId
3. Server updates all unread messages from that sender to `isRead: true`
4. Server emits `message_read` to the sender (if online)
5. Server emits `unread_count_update` to current user with new count (should be 0)
6. Server emits `messages_marked_read` confirmation to current user

---

## Database Indexes

The following indexes are automatically created for optimal performance:
- `sender + receiver` (compound index)
- `createdAt` (descending)
- `sender + createdAt` (compound index, descending)
- `receiver + createdAt` (compound index, descending)

Additional indexes recommended for new fields:
- `receiver + isRead` (compound index) - for unread count queries

---

## Notes

1. **Backward Compatibility:** All existing functionality remains unchanged. Old messages will have default values for new fields.

2. **FCM is Optional:** The application works without FCM configuration. If `FIREBASE_SERVICE_ACCOUNT` is not provided, notifications are simply disabled and all other features work normally.

3. **Online Status:** A user is considered "online" if they have an active Socket.IO connection (authenticated).

4. **Performance:** Unread count calculations use MongoDB's `countDocuments` which is optimized with indexes.

5. **Security:** All endpoints require JWT authentication. Users can only mark messages as read if they are the receiver.

6. **Real-time Updates:** All status changes (delivered, read) are communicated in real-time via Socket.IO when users are online.

---

## Testing Checklist

- [ ] Send message when receiver is online → Check delivery status
- [ ] Send message when receiver is offline → Check FCM notification
- [ ] Mark messages as read → Check read status updates both sides
- [ ] Get unread count → Verify accurate count
- [ ] Get conversations → Verify sorting and unread counts
- [ ] Register FCM token → Verify token is saved
- [ ] Multiple devices → Test token updates
- [ ] Network disconnection → Test reconnection behavior

---

## Future Enhancements (Optional)

1. **Typing Indicators:** Add `typing_start` and `typing_stop` events
2. **Message Deletion:** Add soft delete functionality
3. **Message Editing:** Allow users to edit sent messages
4. **Read Receipts Toggle:** Allow users to disable read receipts
5. **Group Chats:** Extend functionality to support group conversations
6. **Media Messages:** Support images, videos, and files
7. **Message Reactions:** Add emoji reactions to messages
8. **Voice Messages:** Support audio message recording and playback

---

## Support

For any issues or questions regarding these features, please contact the development team.

**Version:** 2.0.0  
**Last Updated:** January 2026
