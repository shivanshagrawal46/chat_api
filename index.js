require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
}

const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const callRoutes = require('./routes/call');
const paymentRoutes = require('./routes/payment');
const User = require('./models/User');
const Message = require('./models/Message');
const jwt = require('jsonwebtoken');
const chatMetaRoutes = require('./routes/chatmeta');
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Make io accessible to routes
app.set('io', io);

// Initialize Firebase Admin SDK (optional - only if FCM credentials are provided)
let fcmInitialized = false;
try {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        const serviceAccount = {
            type: "service_account",
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle escaped newlines
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            client_id: process.env.FIREBASE_CLIENT_ID,
            auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
            token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
            universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || "googleapis.com"
        };
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        fcmInitialized = true;
        console.log('✅ Firebase Admin SDK initialized successfully');
        console.log(`📱 FCM configured for project: ${process.env.FIREBASE_PROJECT_ID}`);
    } else {
        console.log('⚠️ Firebase credentials not found. FCM notifications disabled.');
        console.log('   Required: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
    }
} catch (error) {
    console.error('⚠️ Failed to initialize Firebase Admin SDK:', error.message);
    console.log('FCM notifications will be disabled.');
}

// Helper function to send FCM notification
const sendFCMNotification = async (fcmToken, title, body, data = {}) => {
    if (!fcmInitialized || !fcmToken) {
        return { success: false, error: 'FCM not initialized or no token' };
    }
    
    try {
        const message = {
            notification: {
                title,
                body
            },
            data,
            token: fcmToken
        };
        
        const response = await admin.messaging().send(message);
        console.log('Successfully sent FCM notification:', response);
        return { success: true, response };
    } catch (error) {
        console.error('Error sending FCM notification:', error);
        return { success: false, error: error.message };
    }
};

// Middleware - CORS configuration to allow all origins (for website, Flutter app, etc.)
// Note: JWT tokens in Authorization header don't require credentials, so we can use origin: '*'
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.set('trust proxy', 1);

// Serve static files from public directory
app.use(express.static('public'));

// Delete account page route
app.get('/delete-account', (req, res) => {
    res.sendFile(__dirname + '/public/delete-account.html');
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Welcome route
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to Bhupendra Chat API',
        version: '2.0.0',
        endpoints: {
            health: 'GET /health',
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                google: 'POST /api/auth/google',
                me: 'GET /api/auth/me',
                refreshToken: 'POST /api/auth/refresh-token',
                users: 'GET /api/auth/users (admin only)'
            },
            chat: {
                send: 'POST /api/chat/send',
                messages: 'GET /api/chat/messages/:userId',
                users: 'GET /api/chat/users',
                conversations: 'GET /api/chat/conversations',
                unreadCount: 'GET /api/chat/unread-count/:roomId',
                markAsRead: 'POST /api/chat/mark-as-read',
                registerFcmToken: 'POST /api/chat/register-fcm-token'
            },
            call: {
                initiate: 'POST /api/call/initiate',
                accept: 'POST /api/call/accept/:callId',
                reject: 'POST /api/call/reject/:callId',
                end: 'POST /api/call/end/:callId',
                history: 'GET /api/call/history'
            }
        }
    });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_app')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Create admin user if it doesn't exist
const createAdminUser = async () => {
    try {
        const adminExists = await User.findOne({ isAdmin: true });
        if (!adminExists) {
            const admin = new User({
                firstName: 'Bhupendra',
                lastName: 'Pandey',
                email: 'bhupendrapandey29@gmail.com',
                phone: '9999999999',
                password: 'password123',
                isAdmin: true
            });
            await admin.save();
            console.log('Admin user created');
        }
    } catch (error) {
        console.error('Error creating admin user:', error);
    }
};

createAdminUser();

// Socket.IO connection handling
const connectedUsers = new Map();
const adminSockets = new Set();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle user authentication
    socket.on('authenticate', async (token) => {
        try {
            if (!token) {
                socket.emit('error', 'No token provided');
                return;
            }
            
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findOne({ _id: decoded.userId });
            
            if (user) {
                // Remove previous socket connection for this user
                const existingSocketId = connectedUsers.get(user._id.toString());
                if (existingSocketId && existingSocketId !== socket.id) {
                    adminSockets.delete(existingSocketId);
                }
                
                connectedUsers.set(user._id.toString(), socket.id);
                socket.userId = user._id.toString();
                socket.join(user._id.toString());
                
                // If user is admin, add to admin sockets
                if (user.isAdmin) {
                    adminSockets.add(socket.id);
                    // Send initial user list to admin
                    const users = await User.find({ isAdmin: false })
                        .select('-password -googleId')
                        .sort({ createdAt: -1 });
                    socket.emit('user_list', users);
                }
                
                console.log(`User ${user.firstName} authenticated`);
                socket.emit('authenticated', { success: true });
            } else {
                socket.emit('error', 'User not found');
            }
        } catch (error) {
            console.error('Authentication error:', error);
            if (error.name === 'TokenExpiredError') {
                socket.emit('error', 'Token expired. Please login again.');
            } else if (error.name === 'JsonWebTokenError') {
                socket.emit('error', 'Invalid token');
            } else {
                socket.emit('error', 'Authentication failed');
            }
        }
    });

    // Handle new messages
    socket.on('send_message', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { receiverId, content } = data;
            
            // Input validation
            if (!receiverId || !content) {
                socket.emit('error', 'Receiver ID and content are required');
                return;
            }
            
            if (typeof content !== 'string' || content.trim().length === 0) {
                socket.emit('error', 'Content must be a non-empty string');
                return;
            }
            
            if (content.length > 1000) {
                socket.emit('error', 'Message content too long (max 1000 characters)');
                return;
            }
            
            // Prevent sending message to self
            if (receiverId === socket.userId) {
                socket.emit('error', 'Cannot send message to yourself');
                return;
            }
            
            // Check if receiver exists
            const receiver = await User.findById(receiverId);
            if (!receiver) {
                socket.emit('error', 'Receiver not found');
                return;
            }
            
            const message = new Message({
                sender: socket.userId,
                receiver: receiverId,
                content: content.trim(),
                isDelivered: false,
                isRead: false
            });
            await message.save();

            // Emit to sender
            socket.emit('new_message', message);

            // Emit to receiver if online
            const receiverSocketId = connectedUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new_message', message);
                
                // Mark as delivered and emit delivered event
                message.isDelivered = true;
                message.deliveredAt = new Date();
                await message.save();
                
                socket.emit('message_delivered', {
                    messageId: message._id,
                    deliveredAt: message.deliveredAt
                });
                
                // Update unread count for receiver
                const unreadCount = await Message.countDocuments({
                    receiver: receiverId,
                    sender: socket.userId,
                    isRead: false
                });
                
                io.to(receiverSocketId).emit('unread_count_update', {
                    senderId: socket.userId,
                    unreadCount
                });
            } else {
                // Receiver is offline, send FCM notification
                const sender = await User.findById(socket.userId);
                if (receiver.fcmToken && sender) {
                    await sendFCMNotification(
                        receiver.fcmToken,
                        `New message from ${sender.firstName} ${sender.lastName}`,
                        content.trim().substring(0, 100),
                        {
                            type: 'chat_message',
                            senderId: socket.userId,
                            messageId: message._id.toString()
                        }
                    );
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', 'Failed to send message');
        }
    });

    // Handle marking messages as read
    socket.on('mark_messages_read', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { senderId } = data;
            
            if (!senderId) {
                socket.emit('error', 'Sender ID is required');
                return;
            }
            
            // Mark all unread messages from sender as read
            const result = await Message.updateMany(
                {
                    sender: senderId,
                    receiver: socket.userId,
                    isRead: false
                },
                {
                    $set: {
                        isRead: true,
                        readAt: new Date()
                    }
                }
            );
            
            // Emit read event to sender
            const senderSocketId = connectedUsers.get(senderId);
            if (senderSocketId) {
                io.to(senderSocketId).emit('message_read', {
                    readBy: socket.userId,
                    count: result.modifiedCount
                });
            }
            
            // Update unread count for current user
            const unreadCount = await Message.countDocuments({
                receiver: socket.userId,
                sender: senderId,
                isRead: false
            });
            
            socket.emit('unread_count_update', {
                senderId: senderId,
                unreadCount
            });
            
            socket.emit('messages_marked_read', {
                success: true,
                count: result.modifiedCount
            });
        } catch (error) {
            console.error('Error marking messages as read:', error);
            socket.emit('error', 'Failed to mark messages as read');
        }
    });

    // Handle call signaling
    socket.on('call_user', async (data) => {
        const { receiverId, signalData, type } = data;
        const receiverSocketId = connectedUsers.get(receiverId);
        
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('incoming_call', {
                signal: signalData,
                from: socket.userId,
                type
            });
        }
    });

    socket.on('answer_call', (data) => {
        const { to, signal } = data;
        const receiverSocketId = connectedUsers.get(to);
        
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call_accepted', signal);
        }
    });

    socket.on('call_rejected', (data) => {
        const { to } = data;
        const receiverSocketId = connectedUsers.get(to);
        
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call_rejected');
        }
    });

    socket.on('end_call', (data) => {
        const { to } = data;
        const receiverSocketId = connectedUsers.get(to);
        
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call_ended');
        }
    });

    // Handle chat freeze state changes
    socket.on('freeze_chat', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { admin, user, isFrozen, freezeAmount } = data;
            if (!admin || !user || typeof isFrozen !== 'boolean') {
                socket.emit('error', 'admin, user, and isFrozen are required');
                return;
            }
            
            const actingUser = await User.findById(socket.userId);
            if (!actingUser) {
                socket.emit('error', 'User not found');
                return;
            }
            
            // Admin can always freeze/unfreeze
            if (actingUser.isAdmin) {
                const ChatMeta = require('./models/ChatMeta');
                const update = {
                    isFrozen,
                    freezeAmount: isFrozen ? freezeAmount : null,
                    frozenBy: actingUser._id,
                    updatedAt: new Date()
                };
                const meta = await ChatMeta.findOneAndUpdate(
                    { admin, user },
                    { $set: update },
                    { upsert: true, new: true }
                );
                
                // Broadcast freeze state change to both admin and user
                const userSocketId = connectedUsers.get(user);
                if (userSocketId) {
                    io.to(userSocketId).emit('freeze_state_change', {
                        isFrozen: meta.isFrozen,
                        freezeAmount: meta.freezeAmount,
                        frozenBy: meta.frozenBy
                    });
                }
                
                // Also emit to admin
                socket.emit('freeze_state_change', {
                    isFrozen: meta.isFrozen,
                    freezeAmount: meta.freezeAmount,
                    frozenBy: meta.frozenBy
                });
                
                console.log(`Admin ${actingUser.firstName} ${isFrozen ? 'froze' : 'unfroze'} chat for user ${user}`);
            } else {
                socket.emit('error', 'Only admin can freeze/unfreeze chat');
            }
        } catch (error) {
            console.error('Error handling freeze chat:', error);
            socket.emit('error', 'Failed to update freeze state');
        }
    });

    // Handle user unfreeze after payment
    socket.on('unfreeze_after_payment', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { admin, user } = data;
            if (!admin || !user) {
                socket.emit('error', 'admin and user are required');
                return;
            }
            
            const actingUser = await User.findById(socket.userId);
            if (!actingUser || actingUser._id.toString() !== user) {
                socket.emit('error', 'Only the user can unfreeze their own chat after payment');
                return;
            }
            
            // Check for recent successful payment
            const Payment = require('./models/Payment');
            const recentPaid = await Payment.findOne({
                user,
                status: 'paid'
            }).sort({ createdAt: -1 });
            
            if (!recentPaid) {
                socket.emit('error', 'No recent successful payment found. Cannot unfreeze.');
                return;
            }
            
            const ChatMeta = require('./models/ChatMeta');
            const update = {
                isFrozen: false,
                freezeAmount: null,
                frozenBy: actingUser._id,
                updatedAt: new Date()
            };
            const meta = await ChatMeta.findOneAndUpdate(
                { admin, user },
                { $set: update },
                { upsert: true, new: true }
            );
            
            // Broadcast unfreeze to both user and admin
            const adminSocketId = connectedUsers.get(admin);
            if (adminSocketId) {
                io.to(adminSocketId).emit('freeze_state_change', {
                    isFrozen: false,
                    freezeAmount: null,
                    frozenBy: actingUser._id
                });
            }
            
            // Also emit to user
            socket.emit('freeze_state_change', {
                isFrozen: false,
                freezeAmount: null,
                frozenBy: actingUser._id
            });
            
            console.log(`User ${actingUser.firstName} unfroze chat after payment`);
        } catch (error) {
            console.error('Error handling unfreeze after payment:', error);
            socket.emit('error', 'Failed to unfreeze chat');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        if (socket.userId) {
            connectedUsers.delete(socket.userId);
            adminSockets.delete(socket.id);
            console.log('User disconnected:', socket.userId);
        }
    });
});

// Function to notify admins about new user
const notifyAdminsAboutNewUser = async (user) => {
    const userData = {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt
    };
    
    adminSockets.forEach(socketId => {
        io.to(socketId).emit('new_user', userData);
    });
};

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/call', callRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/chatmeta', chatMetaRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 6000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 