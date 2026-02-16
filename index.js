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
const kundliRoutes = require('./routes/kundli');
const aiChatRoutes = require('./routes/aichat');
const unifiedPaymentRoutes = require('./routes/unified-payment');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Performance optimizations
    transports: ['websocket', 'polling'], // Prefer WebSocket
    upgradeTimeout: 10000,
    pingTimeout: 60000,    // 60s - Gemini 3 Pro can take 15-30s to respond
    pingInterval: 25000,   // 25s - less frequent pings to avoid disconnect during AI processing
    connectTimeout: 45000,
    maxHttpBufferSize: 1e6, // 1MB
    allowEIO3: true,
    perMessageDeflate: {
        threshold: 1024 // Compress messages > 1KB
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
        version: '4.0.0',
        note: 'All features now support Socket.IO for real-time communication',
        restEndpoints: {
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
                markAsRead: 'POST /api/chat/mark-as-read'
            },
            call: {
                initiate: 'POST /api/call/initiate',
                accept: 'POST /api/call/accept/:callId',
                reject: 'POST /api/call/reject/:callId',
                end: 'POST /api/call/end/:callId',
                history: 'GET /api/call/history'
            }
        },
        socketEvents: {
            connection: {
                authenticate: 'emit: authenticate(token) -> authenticated/error'
            },
            kundli: {
                save: 'emit: save_kundli({fullName, dateOfBirth, timeOfBirth, placeOfBirth, gender}) -> save_kundli_response',
                edit: 'emit: edit_kundli({fullName?, dateOfBirth?, timeOfBirth?, placeOfBirth?, gender?}) -> edit_kundli_response (partial update)',
                get: 'emit: get_my_kundli() -> get_my_kundli_response'
            },
            aiChat: {
                status: 'emit: ai_chat_status() -> ai_chat_status_response',
                history: 'emit: ai_chat_history() -> ai_chat_history_response',
                askFree: 'emit: ai_ask_free({question}) -> ai_ask_free_response',
                createPayment: 'emit: ai_create_payment() -> ai_create_payment_response',
                askPaid: 'emit: ai_ask_paid({question, razorpayOrderId, razorpayPaymentId, razorpaySignature}) -> ai_ask_paid_response'
            },
            payments: {
                poojaCreate: 'emit: create_pooja_payment({amount, poojaTitle}) -> create_pooja_payment_response',
                poojaVerify: 'emit: verify_pooja_payment({razorpayOrderId, razorpayPaymentId, razorpaySignature}) -> verify_pooja_payment_response',
                shopCreate: 'emit: create_shop_payment({amount, productName, quantity}) -> create_shop_payment_response',
                shopVerify: 'emit: verify_shop_payment({razorpayOrderId, razorpayPaymentId, razorpaySignature}) -> verify_shop_payment_response',
                myPayments: 'emit: get_my_payments({type?, page?, limit?}) -> get_my_payments_response'
            },
            astrologerChat: {
                sendMessage: 'emit: send_message({receiverId, content}) -> message_sent/new_message',
                freeze: 'emit: freeze_chat({admin, user, isFrozen, freezeAmount}) -> freeze_state_change (admin only)',
                unfreeze: 'emit: unfreeze_after_payment({admin, user}) -> freeze_state_change'
            },
            admin: {
                allPayments: 'emit: admin_get_all_payments({userId?, type?, page?}) -> admin_get_all_payments_response',
                userPayments: 'emit: admin_get_user_payments({userId}) -> admin_get_user_payments_response',
                userAiChat: 'emit: admin_get_user_ai_chat({userId}) -> admin_get_user_ai_chat_response',
                allAiChats: 'emit: admin_get_all_ai_chats({page?, limit?}) -> admin_get_all_ai_chats_response'
            }
        },
        pricing: {
            aiChat: '₹21 per question (first question free)',
            astrologerChat: 'Set by admin via freeze amount'
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

    // Handle new messages (OPTIMIZED for speed)
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
            
            // Check if receiver exists (optimized with lean() and only needed field)
            const receiver = await User.findById(receiverId).select('fcmToken firstName lastName').lean();
            if (!receiver) {
                socket.emit('error', 'Receiver not found');
                return;
            }
            
            // Create message object (without saving yet for instant delivery)
            const trimmedContent = content.trim();
            const now = new Date();
            const receiverSocketId = connectedUsers.get(receiverId);
            const isOnline = !!receiverSocketId;
            
            // Create message document
            const message = new Message({
                sender: socket.userId,
                receiver: receiverId,
                content: trimmedContent,
                isDelivered: isOnline,
                deliveredAt: isOnline ? now : null,
                isRead: false,
                createdAt: now
            });
            
            // INSTANT DELIVERY: Emit to both parties BEFORE database save
            const messagePayload = {
                _id: message._id,
                sender: socket.userId,
                receiver: receiverId,
                content: trimmedContent,
                isDelivered: isOnline,
                deliveredAt: isOnline ? now : null,
                isRead: false,
                createdAt: now
            };
            
            // Send to sender immediately
            socket.emit('new_message', messagePayload);
            
            // Send to receiver via Socket (for real-time when app is in foreground)
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new_message', messagePayload);
                
                // Send delivery confirmation to sender
                socket.emit('message_delivered', {
                    messageId: message._id,
                    deliveredAt: now
                });
                
                // Calculate unread count asynchronously
                Message.countDocuments({
                    receiver: receiverId,
                    sender: socket.userId,
                    isRead: false
                }).then(unreadCount => {
                    io.to(receiverSocketId).emit('unread_count_update', {
                        senderId: socket.userId,
                        unreadCount
                    });
                }).catch(err => console.error('Error counting unread messages:', err));
            }
            
            // Save to database asynchronously (non-blocking)
            message.save().catch(err => {
                console.error('Error saving message to DB:', err);
                socket.emit('error', 'Message sent but failed to save');
            });
            
            // ALWAYS send FCM notification (for when app is in background)
            // This is how WhatsApp/Telegram work - always send push notification
            // Client app will handle not showing duplicate if already received via socket
            if (receiver.fcmToken) {
                User.findById(socket.userId).select('firstName lastName').lean()
                    .then(sender => {
                        if (sender) {
                            sendFCMNotification(
                                receiver.fcmToken,
                                `${sender.firstName} ${sender.lastName}`,
                                trimmedContent.substring(0, 100),
                                {
                                    type: 'chat_message',
                                    senderId: socket.userId,
                                    senderName: `${sender.firstName} ${sender.lastName}`,
                                    messageId: message._id.toString(),
                                    message: trimmedContent.substring(0, 200),
                                    receiverId: receiverId,
                                    timestamp: now.toISOString(),
                                    click_action: 'FLUTTER_NOTIFICATION_CLICK'
                                }
                            ).catch(err => console.error('FCM notification error:', err));
                        }
                    })
                    .catch(err => console.error('Error fetching sender info:', err));
            }
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', 'Failed to send message');
        }
    });

    // Handle marking messages as read (OPTIMIZED)
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
            
            const now = new Date();
            
            // Emit immediate confirmation to user (perceived instant response)
            socket.emit('messages_marked_read', {
                success: true,
                count: 0 // Will be updated after DB operation
            });
            
            // Emit to sender immediately if online
            const senderSocketId = connectedUsers.get(senderId);
            if (senderSocketId) {
                io.to(senderSocketId).emit('message_read', {
                    readBy: socket.userId,
                    count: 0 // Approximate, will be accurate after DB
                });
            }
            
            // Update database asynchronously (non-blocking)
            Message.updateMany(
                {
                    sender: senderId,
                    receiver: socket.userId,
                    isRead: false
                },
                {
                    $set: {
                        isRead: true,
                        readAt: now
                    }
                }
            ).then(result => {
                // Send actual count after DB update
                if (result.modifiedCount > 0) {
                    socket.emit('messages_marked_read', {
                        success: true,
                        count: result.modifiedCount
                    });
                    
                    if (senderSocketId) {
                        io.to(senderSocketId).emit('message_read', {
                            readBy: socket.userId,
                            count: result.modifiedCount
                        });
                    }
                }
                
                // Update unread count (should be 0 now)
                socket.emit('unread_count_update', {
                    senderId: senderId,
                    unreadCount: 0
                });
            }).catch(error => {
                console.error('Error marking messages as read:', error);
                socket.emit('error', 'Failed to mark messages as read');
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

    // ==========================================
    // AI CHAT SOCKET EVENTS
    // ==========================================
    
    // Get AI Chat Status
    socket.on('ai_chat_status', async () => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const Kundli = require('./models/Kundli');
            const AIChat = require('./models/AIChat');
            
            const [kundli, aiChat] = await Promise.all([
                Kundli.findOne({ user: socket.userId }).lean(),
                AIChat.findOne({ user: socket.userId }).lean()
            ]);
            
            socket.emit('ai_chat_status_response', {
                success: true,
                hasKundli: !!kundli,
                kundli: kundli || null,
                freeQuestionUsed: aiChat?.freeQuestionUsed || false,
                totalQuestions: aiChat?.totalQuestions || 0,
                totalSpent: aiChat?.totalSpent || 0,
                pricePerQuestion: 21
            });
        } catch (error) {
            console.error('Error getting AI chat status:', error);
            socket.emit('error', 'Failed to get AI chat status');
        }
    });
    
    // Get AI Chat History
    socket.on('ai_chat_history', async () => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const AIChat = require('./models/AIChat');
            const aiChat = await AIChat.findOne({ user: socket.userId })
                .populate('kundli', 'fullName dateOfBirth placeOfBirth')
                .lean();
            
            socket.emit('ai_chat_history_response', {
                success: true,
                chat: aiChat,
                messages: aiChat?.messages || []
            });
        } catch (error) {
            console.error('Error getting AI chat history:', error);
            socket.emit('error', 'Failed to get chat history');
        }
    });
    
    // Ask Free AI Question
    socket.on('ai_ask_free', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { question } = data;
            if (!question || typeof question !== 'string') {
                socket.emit('error', 'Question is required');
                return;
            }
            
            const Kundli = require('./models/Kundli');
            const AIChat = require('./models/AIChat');
            const { generateAIResponse, isAstrologyQuestion, countWords, MAX_INPUT_WORDS } = require('./routes/aichat');
            
            // Check word count
            const wordCount = countWords(question);
            if (wordCount > MAX_INPUT_WORDS) {
                socket.emit('error', `Question too long. Maximum ${MAX_INPUT_WORDS} words allowed.`);
                return;
            }
            
            // Check kundli
            const kundli = await Kundli.findOne({ user: socket.userId });
            if (!kundli) {
                socket.emit('error', 'Please save your Kundli first');
                return;
            }
            
            // Check free question status
            let aiChat = await AIChat.findOne({ user: socket.userId });
            if (aiChat?.freeQuestionUsed) {
                socket.emit('ai_ask_free_response', {
                    success: false,
                    error: 'Free question already used',
                    requiresPayment: true,
                    pricePerQuestion: 21
                });
                return;
            }
            
            // Tell client we're processing (so they know server received it)
            socket.emit('ai_processing', { status: 'thinking', message: 'AI is generating your answer...' });
            
            // Generate AI response
            const aiResult = await generateAIResponse(
                kundli, 
                question.trim(), 
                aiChat ? aiChat.messages : []
            );
            
            // Save to chat
            if (!aiChat) {
                aiChat = new AIChat({
                    user: socket.userId,
                    kundli: kundli._id,
                    messages: [],
                    freeQuestionUsed: true,
                    totalQuestions: 1
                });
            } else {
                aiChat.freeQuestionUsed = true;
                aiChat.totalQuestions += 1;
            }
            
            // Add messages
            aiChat.messages.push({
                role: 'user',
                content: question.trim(),
                isFreeQuestion: true,
                createdAt: new Date()
            });
            
            aiChat.messages.push({
                role: 'ai',
                content: aiResult.response,
                isFreeQuestion: true,
                isAstrologyQuestion: aiResult.isAstrologyQuestion,
                createdAt: new Date()
            });
            
            await aiChat.save();
            
            socket.emit('ai_ask_free_response', {
                success: true,
                answer: aiResult.response,
                isAstrologyQuestion: aiResult.isAstrologyQuestion,
                isFreeQuestion: true,
                freeQuestionUsed: true,
                totalQuestions: aiChat.totalQuestions
            });
            
        } catch (error) {
            console.error('Error processing free AI question:', error);
            socket.emit('ai_ask_free_response', {
                success: false,
                error: error.message || 'Failed to process question'
            });
        }
    });
    
    // Create Payment for AI Question
    socket.on('ai_create_payment', async () => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const Razorpay = require('razorpay');
            const UnifiedPayment = require('./models/UnifiedPayment');
            const AIChat = require('./models/AIChat');
            const Kundli = require('./models/Kundli');
            const AI_CHAT_PRICE = 21;
            
            if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
                socket.emit('error', 'Payment service not configured');
                return;
            }
            
            const razorpay = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET
            });
            
            // Check kundli
            const kundli = await Kundli.findOne({ user: socket.userId });
            if (!kundli) {
                socket.emit('error', 'Please save your Kundli first');
                return;
            }
            
            // Get AI chat for question count
            const aiChat = await AIChat.findOne({ user: socket.userId });
            const questionNumber = (aiChat?.totalQuestions || 0) + 1;
            
            // Create Razorpay order
            const order = await razorpay.orders.create({
                amount: AI_CHAT_PRICE * 100, // in paise
                currency: 'INR',
                receipt: `ai_${socket.userId.slice(-8)}_${Date.now().toString().slice(-8)}`,
                notes: { userId: socket.userId, type: 'ai_chat', questionNumber }
            });
            
            // Save pending payment
            const payment = new UnifiedPayment({
                user: socket.userId,
                type: 'ai_chat',
                amount: AI_CHAT_PRICE,
                status: 'pending',
                razorpayOrderId: order.id,
                details: { questionNumber },
                description: `AI Chat Question #${questionNumber}`
            });
            await payment.save();
            
            socket.emit('ai_create_payment_response', {
                success: true,
                orderId: order.id,
                amount: AI_CHAT_PRICE,
                currency: 'INR',
                paymentId: payment._id,
                questionNumber
            });
            
        } catch (error) {
            console.error('Error creating AI payment:', error);
            socket.emit('error', 'Failed to create payment order');
        }
    });
    
    // Ask Paid AI Question (after payment verification)
    socket.on('ai_ask_paid', async (data) => {
        let payment = null; // Track payment for error recovery
        
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { question, razorpayOrderId, razorpayPaymentId, razorpaySignature } = data;
            
            if (!question || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
                socket.emit('error', 'Missing required fields');
                return;
            }
            
            const crypto = require('crypto');
            const UnifiedPayment = require('./models/UnifiedPayment');
            const AIChat = require('./models/AIChat');
            const Kundli = require('./models/Kundli');
            const { generateAIResponse, countWords, MAX_INPUT_WORDS } = require('./routes/aichat');
            const AI_CHAT_PRICE = 21;
            
            // Check word count
            const wordCount = countWords(question);
            if (wordCount > MAX_INPUT_WORDS) {
                socket.emit('error', `Question too long. Maximum ${MAX_INPUT_WORDS} words allowed.`);
                return;
            }
            
            // Verify payment signature
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(`${razorpayOrderId}|${razorpayPaymentId}`)
                .digest('hex');
            
            if (expectedSignature !== razorpaySignature) {
                socket.emit('error', 'Payment verification failed');
                return;
            }
            
            // Update payment record
            payment = await UnifiedPayment.findOne({ 
                razorpayOrderId, 
                user: socket.userId,
                type: 'ai_chat'
            });
            
            if (!payment) {
                socket.emit('error', 'Payment record not found');
                return;
            }
            
            // Check if already answered (prevent double-charge)
            if (payment.status === 'paid' && payment.details?.questionAnswered) {
                socket.emit('ai_ask_paid_response', {
                    success: false,
                    error: 'This payment has already been used for a question',
                    alreadyAnswered: true
                });
                return;
            }
            
            // Check if this is a retry (paid but AI failed previously)
            const isRetry = payment.status === 'paid' && !payment.details?.questionAnswered;
            
            // First time: verify and mark as paid
            if (payment.status !== 'paid') {
                payment.status = 'paid';
                payment.razorpayPaymentId = razorpayPaymentId;
                payment.razorpaySignature = razorpaySignature;
                payment.paidAt = new Date();
            }
            
            // Track the question
            payment.details = payment.details || {};
            payment.details.question = question.trim();
            payment.details.retryCount = (payment.details.retryCount || 0) + (isRetry ? 1 : 0);
            await payment.save();
            
            // Tell client we're processing (so they know server received it)
            socket.emit('ai_processing', { 
                status: 'thinking', 
                message: 'Payment verified! AI is generating your answer...',
                paymentId: payment._id
            });
            
            console.log(`💬 Socket: Processing ${isRetry ? 'RETRY' : 'NEW'} paid question for user:`, socket.userId);
            
            // Get kundli
            const kundli = await Kundli.findOne({ user: socket.userId });
            if (!kundli) {
                payment.details.failureReason = 'Kundli not found';
                await payment.save();
                socket.emit('ai_ask_paid_response', {
                    success: false,
                    error: 'Kundli not found',
                    canRetry: true,
                    paymentId: payment._id,
                    razorpayOrderId: payment.razorpayOrderId
                });
                return;
            }
            
            // Get or create AI chat
            let aiChat = await AIChat.findOne({ user: socket.userId });
            
            // Generate AI response with error recovery
            let aiResult;
            try {
                aiResult = await generateAIResponse(
                    kundli, 
                    question.trim(), 
                    aiChat ? aiChat.messages : []
                );
            } catch (aiError) {
                // AI failed — save failure reason, allow retry
                payment.details.failureReason = aiError.message;
                await payment.save();
                console.error('❌ Socket: AI generation failed for paid question:', aiError.message);
                socket.emit('ai_ask_paid_response', {
                    success: false,
                    error: 'AI failed to generate response. You can retry with the same payment.',
                    canRetry: true,
                    paymentId: payment._id,
                    razorpayOrderId: payment.razorpayOrderId
                });
                return;
            }
            
            // AI succeeded! Mark as answered
            payment.details.questionAnswered = true;
            payment.details.answerDelivered = true;
            payment.details.answeredAt = new Date();
            payment.details.failureReason = null;
            await payment.save();
            
            // Save to chat
            if (!aiChat) {
                aiChat = new AIChat({
                    user: socket.userId,
                    kundli: kundli._id,
                    messages: [],
                    freeQuestionUsed: true,
                    totalQuestions: 1,
                    totalSpent: AI_CHAT_PRICE
                });
            } else if (!isRetry) {
                aiChat.totalQuestions += 1;
                aiChat.totalSpent += AI_CHAT_PRICE;
            }
            
            // Add messages
            aiChat.messages.push({
                role: 'user',
                content: question.trim(),
                isFreeQuestion: false,
                paymentId: payment._id,
                createdAt: new Date()
            });
            
            aiChat.messages.push({
                role: 'ai',
                content: aiResult.response,
                isFreeQuestion: false,
                isAstrologyQuestion: aiResult.isAstrologyQuestion,
                paymentId: payment._id,
                createdAt: new Date()
            });
            
            await aiChat.save();
            console.log('✅ Socket: Paid question answered successfully for user:', socket.userId);
            
            socket.emit('ai_ask_paid_response', {
                success: true,
                answer: aiResult.response,
                isAstrologyQuestion: aiResult.isAstrologyQuestion,
                isFreeQuestion: false,
                totalQuestions: aiChat.totalQuestions,
                totalSpent: aiChat.totalSpent,
                paymentId: payment._id
            });
            
        } catch (error) {
            console.error('Error processing paid AI question:', error);
            // Save failure to payment if we have a payment record
            if (payment) {
                try {
                    payment.details = payment.details || {};
                    payment.details.failureReason = error.message;
                    await payment.save();
                } catch (saveErr) {
                    console.error('Failed to save payment failure:', saveErr);
                }
            }
            socket.emit('ai_ask_paid_response', {
                success: false,
                error: error.message || 'Failed to process question',
                canRetry: !!payment,
                paymentId: payment?._id,
                razorpayOrderId: payment?.razorpayOrderId
            });
        }
    });
    
    // ==========================================
    // PAYMENT SOCKET EVENTS (Pooja, Shop)
    // ==========================================
    
    // Create Pooja Payment
    socket.on('create_pooja_payment', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { amount, poojaTitle, description } = data;
            
            if (!amount || !poojaTitle) {
                socket.emit('error', 'Amount and pooja title are required');
                return;
            }
            
            const Razorpay = require('razorpay');
            const UnifiedPayment = require('./models/UnifiedPayment');
            
            if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
                socket.emit('error', 'Payment service not configured');
                return;
            }
            
            const razorpay = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET
            });
            
            // Create Razorpay order
            const order = await razorpay.orders.create({
                amount: Math.round(amount * 100),
                currency: 'INR',
                receipt: `pj_${socket.userId.slice(-8)}_${Date.now().toString().slice(-8)}`,
                notes: { userId: socket.userId, type: 'pooja_order', poojaTitle }
            });
            
            // Save pending payment
            const payment = new UnifiedPayment({
                user: socket.userId,
                type: 'pooja_order',
                amount,
                status: 'pending',
                razorpayOrderId: order.id,
                details: { poojaTitle },
                description: description || `Pooja Booking: ${poojaTitle}`
            });
            await payment.save();
            
            socket.emit('create_pooja_payment_response', {
                success: true,
                orderId: order.id,
                amount,
                currency: 'INR',
                paymentId: payment._id,
                poojaTitle
            });
            
        } catch (error) {
            console.error('Error creating pooja payment:', error);
            socket.emit('error', 'Failed to create payment order');
        }
    });
    
    // Verify Pooja Payment
    socket.on('verify_pooja_payment', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = data;
            
            if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
                socket.emit('error', 'Missing payment verification details');
                return;
            }
            
            const crypto = require('crypto');
            const UnifiedPayment = require('./models/UnifiedPayment');
            
            // Verify signature
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(`${razorpayOrderId}|${razorpayPaymentId}`)
                .digest('hex');
            
            if (expectedSignature !== razorpaySignature) {
                socket.emit('error', 'Payment verification failed');
                return;
            }
            
            // Update payment
            const payment = await UnifiedPayment.findOneAndUpdate(
                { razorpayOrderId, user: socket.userId, type: 'pooja_order' },
                {
                    status: 'paid',
                    razorpayPaymentId,
                    razorpaySignature,
                    paidAt: new Date()
                },
                { new: true }
            );
            
            if (!payment) {
                socket.emit('error', 'Payment record not found');
                return;
            }
            
            socket.emit('verify_pooja_payment_response', {
                success: true,
                message: 'Pooja payment verified successfully',
                payment: {
                    _id: payment._id,
                    amount: payment.amount,
                    poojaTitle: payment.details.poojaTitle,
                    status: payment.status,
                    paidAt: payment.paidAt
                }
            });
            
        } catch (error) {
            console.error('Error verifying pooja payment:', error);
            socket.emit('error', 'Failed to verify payment');
        }
    });
    
    // Create Shop Payment
    socket.on('create_shop_payment', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { amount, orderId, productName, quantity, description } = data;
            
            if (!amount || !productName) {
                socket.emit('error', 'Amount and product name are required');
                return;
            }
            
            const Razorpay = require('razorpay');
            const UnifiedPayment = require('./models/UnifiedPayment');
            
            if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
                socket.emit('error', 'Payment service not configured');
                return;
            }
            
            const razorpay = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET
            });
            
            // Create Razorpay order
            const order = await razorpay.orders.create({
                amount: Math.round(amount * 100),
                currency: 'INR',
                receipt: `sh_${socket.userId.slice(-8)}_${Date.now().toString().slice(-8)}`,
                notes: { userId: socket.userId, type: 'shop_order', productName }
            });
            
            // Save pending payment
            const payment = new UnifiedPayment({
                user: socket.userId,
                type: 'shop_order',
                amount,
                status: 'pending',
                razorpayOrderId: order.id,
                details: { orderId: orderId || `ORD_${Date.now()}`, productName, quantity: quantity || 1 },
                description: description || `Shop Order: ${productName}`
            });
            await payment.save();
            
            socket.emit('create_shop_payment_response', {
                success: true,
                orderId: order.id,
                amount,
                currency: 'INR',
                paymentId: payment._id,
                productName
            });
            
        } catch (error) {
            console.error('Error creating shop payment:', error);
            socket.emit('error', 'Failed to create payment order');
        }
    });
    
    // Verify Shop Payment
    socket.on('verify_shop_payment', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = data;
            
            if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
                socket.emit('error', 'Missing payment verification details');
                return;
            }
            
            const crypto = require('crypto');
            const UnifiedPayment = require('./models/UnifiedPayment');
            
            // Verify signature
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(`${razorpayOrderId}|${razorpayPaymentId}`)
                .digest('hex');
            
            if (expectedSignature !== razorpaySignature) {
                socket.emit('error', 'Payment verification failed');
                return;
            }
            
            // Update payment
            const payment = await UnifiedPayment.findOneAndUpdate(
                { razorpayOrderId, user: socket.userId, type: 'shop_order' },
                {
                    status: 'paid',
                    razorpayPaymentId,
                    razorpaySignature,
                    paidAt: new Date()
                },
                { new: true }
            );
            
            if (!payment) {
                socket.emit('error', 'Payment record not found');
                return;
            }
            
            socket.emit('verify_shop_payment_response', {
                success: true,
                message: 'Shop payment verified successfully',
                payment: {
                    _id: payment._id,
                    amount: payment.amount,
                    productName: payment.details.productName,
                    orderId: payment.details.orderId,
                    status: payment.status,
                    paidAt: payment.paidAt
                }
            });
            
        } catch (error) {
            console.error('Error verifying shop payment:', error);
            socket.emit('error', 'Failed to verify payment');
        }
    });
    
    // Get User's Payment History (for user)
    socket.on('get_my_payments', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { type, page = 1, limit = 20 } = data || {};
            
            const UnifiedPayment = require('./models/UnifiedPayment');
            const Payment = require('./models/Payment');
            
            // Build query
            const query = { user: socket.userId, status: 'paid' };
            if (type && type !== 'all') {
                query.type = type;
            }
            
            // Get unified payments (AI, Pooja, Shop)
            const unifiedPayments = await UnifiedPayment.find(query)
                .sort({ paidAt: -1, createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean();
            
            // Get astrologer payments (from original Payment model)
            const astrologerPayments = await Payment.find({ 
                user: socket.userId, 
                status: 'paid' 
            })
                .sort({ createdAt: -1 })
                .lean();
            
            // Combine and format
            const formattedAstrologerPayments = astrologerPayments.map(p => ({
                _id: p._id,
                type: 'astrologer_chat',
                amount: p.amount,
                status: p.status,
                paidAt: p.createdAt,
                details: { orderId: p.orderId, paymentId: p.paymentId },
                description: 'Astrologer Chat Payment'
            }));
            
            // Merge all payments
            let allPayments = [...unifiedPayments, ...formattedAstrologerPayments];
            
            // Filter by type if needed
            if (type && type !== 'all') {
                allPayments = allPayments.filter(p => p.type === type);
            }
            
            // Sort by date
            allPayments.sort((a, b) => new Date(b.paidAt || b.createdAt) - new Date(a.paidAt || a.createdAt));
            
            // Calculate totals by type
            const totals = {
                ai_chat: 0,
                astrologer_chat: 0,
                pooja_order: 0,
                shop_order: 0,
                total: 0
            };
            
            allPayments.forEach(p => {
                if (totals.hasOwnProperty(p.type)) {
                    totals[p.type] += p.amount;
                }
                totals.total += p.amount;
            });
            
            socket.emit('get_my_payments_response', {
                success: true,
                payments: allPayments.slice(0, limit),
                totals,
                pagination: {
                    page,
                    limit,
                    total: allPayments.length
                }
            });
            
        } catch (error) {
            console.error('Error fetching payments:', error);
            socket.emit('error', 'Failed to fetch payments');
        }
    });
    
    // ==========================================
    // ADMIN SOCKET EVENTS
    // ==========================================
    
    // Admin: Get All Payments (Unified View)
    socket.on('admin_get_all_payments', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            // Check if admin
            const adminUser = await User.findById(socket.userId);
            if (!adminUser || !adminUser.isAdmin) {
                socket.emit('error', 'Admin access required');
                return;
            }
            
            const { userId, type, page = 1, limit = 50 } = data || {};
            
            const UnifiedPayment = require('./models/UnifiedPayment');
            const Payment = require('./models/Payment');
            
            // Build query for unified payments
            const unifiedQuery = { status: 'paid' };
            if (userId) unifiedQuery.user = userId;
            if (type && type !== 'all' && type !== 'astrologer_chat') {
                unifiedQuery.type = type;
            }
            
            // Get unified payments
            let unifiedPayments = [];
            if (!type || type === 'all' || ['ai_chat', 'pooja_order', 'shop_order'].includes(type)) {
                unifiedPayments = await UnifiedPayment.find(unifiedQuery)
                    .populate('user', 'firstName lastName email phone')
                    .sort({ paidAt: -1, createdAt: -1 })
                    .lean();
            }
            
            // Get astrologer payments
            let astrologerPayments = [];
            if (!type || type === 'all' || type === 'astrologer_chat') {
                const astrologerQuery = { status: 'paid' };
                if (userId) astrologerQuery.user = userId;
                
                astrologerPayments = await Payment.find(astrologerQuery)
                    .populate('user', 'firstName lastName email phone')
                    .sort({ createdAt: -1 })
                    .lean();
            }
            
            // Format astrologer payments
            const formattedAstrologerPayments = astrologerPayments.map(p => ({
                _id: p._id,
                user: p.user,
                type: 'astrologer_chat',
                amount: p.amount,
                status: p.status,
                paidAt: p.createdAt,
                createdAt: p.createdAt,
                details: { orderId: p.orderId, paymentId: p.paymentId },
                description: 'Astrologer Chat Payment (Freeze/Unfreeze)'
            }));
            
            // Merge and sort
            let allPayments = [...unifiedPayments, ...formattedAstrologerPayments];
            allPayments.sort((a, b) => new Date(b.paidAt || b.createdAt) - new Date(a.paidAt || a.createdAt));
            
            // Calculate stats
            const stats = {
                ai_chat: { count: 0, total: 0 },
                astrologer_chat: { count: 0, total: 0 },
                pooja_order: { count: 0, total: 0 },
                shop_order: { count: 0, total: 0 },
                grandTotal: 0
            };
            
            allPayments.forEach(p => {
                if (stats[p.type]) {
                    stats[p.type].count++;
                    stats[p.type].total += p.amount;
                }
                stats.grandTotal += p.amount;
            });
            
            // Paginate
            const paginatedPayments = allPayments.slice((page - 1) * limit, page * limit);
            
            socket.emit('admin_get_all_payments_response', {
                success: true,
                payments: paginatedPayments,
                stats,
                pagination: {
                    page,
                    limit,
                    total: allPayments.length,
                    totalPages: Math.ceil(allPayments.length / limit)
                }
            });
            
        } catch (error) {
            console.error('Error fetching admin payments:', error);
            socket.emit('error', 'Failed to fetch payments');
        }
    });
    
    // Admin: Get User's All Payments
    socket.on('admin_get_user_payments', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const adminUser = await User.findById(socket.userId);
            if (!adminUser || !adminUser.isAdmin) {
                socket.emit('error', 'Admin access required');
                return;
            }
            
            const { userId } = data;
            if (!userId) {
                socket.emit('error', 'User ID is required');
                return;
            }
            
            const UnifiedPayment = require('./models/UnifiedPayment');
            const Payment = require('./models/Payment');
            
            // Get user info
            const targetUser = await User.findById(userId).select('firstName lastName email phone').lean();
            if (!targetUser) {
                socket.emit('error', 'User not found');
                return;
            }
            
            // Get all unified payments for user
            const unifiedPayments = await UnifiedPayment.find({ user: userId, status: 'paid' })
                .sort({ paidAt: -1, createdAt: -1 })
                .lean();
            
            // Get astrologer payments for user
            const astrologerPayments = await Payment.find({ user: userId, status: 'paid' })
                .sort({ createdAt: -1 })
                .lean();
            
            // Format astrologer payments
            const formattedAstrologerPayments = astrologerPayments.map(p => ({
                _id: p._id,
                type: 'astrologer_chat',
                amount: p.amount,
                status: p.status,
                paidAt: p.createdAt,
                createdAt: p.createdAt,
                details: { orderId: p.orderId, paymentId: p.paymentId },
                description: 'Astrologer Chat Payment'
            }));
            
            // Merge and sort
            let allPayments = [...unifiedPayments, ...formattedAstrologerPayments];
            allPayments.sort((a, b) => new Date(b.paidAt || b.createdAt) - new Date(a.paidAt || a.createdAt));
            
            // Calculate totals by type
            const summary = {
                ai_chat: { count: 0, total: 0 },
                astrologer_chat: { count: 0, total: 0 },
                pooja_order: { count: 0, total: 0 },
                shop_order: { count: 0, total: 0 },
                grandTotal: 0
            };
            
            allPayments.forEach(p => {
                if (summary[p.type]) {
                    summary[p.type].count++;
                    summary[p.type].total += p.amount;
                }
                summary.grandTotal += p.amount;
            });
            
            socket.emit('admin_get_user_payments_response', {
                success: true,
                user: targetUser,
                payments: allPayments,
                summary
            });
            
        } catch (error) {
            console.error('Error fetching user payments:', error);
            socket.emit('error', 'Failed to fetch user payments');
        }
    });
    
    // Admin: Get AI Chat for User
    socket.on('admin_get_user_ai_chat', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const adminUser = await User.findById(socket.userId);
            if (!adminUser || !adminUser.isAdmin) {
                socket.emit('error', 'Admin access required');
                return;
            }
            
            const { userId } = data;
            if (!userId) {
                socket.emit('error', 'User ID is required');
                return;
            }
            
            const AIChat = require('./models/AIChat');
            const Kundli = require('./models/Kundli');
            
            // Get user info
            const targetUser = await User.findById(userId).select('firstName lastName email phone').lean();
            if (!targetUser) {
                socket.emit('error', 'User not found');
                return;
            }
            
            // Get AI chat and kundli
            const [aiChat, kundli] = await Promise.all([
                AIChat.findOne({ user: userId }).lean(),
                Kundli.findOne({ user: userId }).lean()
            ]);
            
            socket.emit('admin_get_user_ai_chat_response', {
                success: true,
                user: targetUser,
                kundli,
                aiChat: {
                    totalQuestions: aiChat?.totalQuestions || 0,
                    totalSpent: aiChat?.totalSpent || 0,
                    freeQuestionUsed: aiChat?.freeQuestionUsed || false,
                    lastActivity: aiChat?.lastActivity,
                    createdAt: aiChat?.createdAt
                },
                messages: aiChat?.messages || []
            });
            
        } catch (error) {
            console.error('Error fetching user AI chat:', error);
            socket.emit('error', 'Failed to fetch AI chat');
        }
    });
    
    // Admin: Get All AI Chats
    socket.on('admin_get_all_ai_chats', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const adminUser = await User.findById(socket.userId);
            if (!adminUser || !adminUser.isAdmin) {
                socket.emit('error', 'Admin access required');
                return;
            }
            
            const { page = 1, limit = 20 } = data || {};
            
            const AIChat = require('./models/AIChat');
            
            const [chats, total] = await Promise.all([
                AIChat.find()
                    .populate('user', 'firstName lastName email phone')
                    .populate('kundli', 'fullName dateOfBirth placeOfBirth')
                    .sort({ lastActivity: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .lean(),
                AIChat.countDocuments()
            ]);
            
            // Add message count to each chat
            const formattedChats = chats.map(chat => ({
                _id: chat._id,
                user: chat.user,
                kundli: chat.kundli,
                totalQuestions: chat.totalQuestions,
                totalSpent: chat.totalSpent,
                freeQuestionUsed: chat.freeQuestionUsed,
                messageCount: chat.messages?.length || 0,
                lastActivity: chat.lastActivity,
                createdAt: chat.createdAt
            }));
            
            socket.emit('admin_get_all_ai_chats_response', {
                success: true,
                chats: formattedChats,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            });
            
        } catch (error) {
            console.error('Error fetching all AI chats:', error);
            socket.emit('error', 'Failed to fetch AI chats');
        }
    });
    
    // ==========================================
    // KUNDLI SOCKET EVENTS
    // ==========================================
    
    // Save/Update Kundli
    socket.on('save_kundli', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { fullName, dateOfBirth, timeOfBirth, placeOfBirth, gender, latitude, longitude } = data;
            
            // Validation
            if (!fullName || !dateOfBirth || !timeOfBirth || !placeOfBirth || !gender) {
                socket.emit('error', 'All fields are required: fullName, dateOfBirth, timeOfBirth, placeOfBirth, gender');
                return;
            }
            
            if (!['male', 'female', 'other'].includes(gender.toLowerCase())) {
                socket.emit('error', 'Gender must be male, female, or other');
                return;
            }
            
            const Kundli = require('./models/Kundli');
            
            // Upsert kundli
            const kundli = await Kundli.findOneAndUpdate(
                { user: socket.userId },
                {
                    user: socket.userId,
                    fullName: fullName.trim(),
                    dateOfBirth: new Date(dateOfBirth),
                    timeOfBirth: timeOfBirth.trim(),
                    placeOfBirth: placeOfBirth.trim(),
                    gender: gender.toLowerCase(),
                    coordinates: (latitude && longitude) ? { latitude, longitude } : undefined,
                    updatedAt: new Date()
                },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
            
            socket.emit('save_kundli_response', {
                success: true,
                message: 'Kundli saved successfully',
                kundli
            });
            
        } catch (error) {
            console.error('Error saving kundli:', error);
            socket.emit('error', 'Failed to save kundli');
        }
    });
    
    // Edit Kundli (partial update - only update provided fields)
    socket.on('edit_kundli', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const { fullName, dateOfBirth, timeOfBirth, placeOfBirth, gender, latitude, longitude } = data;
            
            const Kundli = require('./models/Kundli');
            
            // Find existing kundli
            const kundli = await Kundli.findOne({ user: socket.userId });
            if (!kundli) {
                socket.emit('edit_kundli_response', {
                    success: false,
                    error: 'Kundli not found. Please save your Kundli first.'
                });
                return;
            }
            
            // Update only provided fields
            if (fullName !== undefined && fullName.trim()) {
                kundli.fullName = fullName.trim();
            }
            if (dateOfBirth !== undefined) {
                const dob = new Date(dateOfBirth);
                if (isNaN(dob.getTime())) {
                    socket.emit('error', 'Invalid date format');
                    return;
                }
                kundli.dateOfBirth = dob;
            }
            if (timeOfBirth !== undefined) {
                const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
                if (!timeRegex.test(timeOfBirth)) {
                    socket.emit('error', 'Time must be in HH:MM format (24-hour)');
                    return;
                }
                kundli.timeOfBirth = timeOfBirth;
            }
            if (placeOfBirth !== undefined && placeOfBirth.trim()) {
                kundli.placeOfBirth = placeOfBirth.trim();
            }
            if (gender !== undefined) {
                if (!['male', 'female', 'other'].includes(gender.toLowerCase())) {
                    socket.emit('error', 'Gender must be male, female, or other');
                    return;
                }
                kundli.gender = gender.toLowerCase();
            }
            if (latitude !== undefined) kundli.coordinates.latitude = latitude;
            if (longitude !== undefined) kundli.coordinates.longitude = longitude;
            
            kundli.updatedAt = new Date();
            await kundli.save();
            
            socket.emit('edit_kundli_response', {
                success: true,
                message: 'Kundli updated successfully',
                kundli
            });
            
        } catch (error) {
            console.error('Error editing kundli:', error);
            socket.emit('error', 'Failed to edit kundli');
        }
    });
    
    // Get My Kundli
    socket.on('get_my_kundli', async () => {
        try {
            if (!socket.userId) {
                socket.emit('error', 'Not authenticated');
                return;
            }
            
            const Kundli = require('./models/Kundli');
            const kundli = await Kundli.findOne({ user: socket.userId }).lean();
            
            socket.emit('get_my_kundli_response', {
                success: true,
                hasKundli: !!kundli,
                kundli
            });
            
        } catch (error) {
            console.error('Error getting kundli:', error);
            socket.emit('error', 'Failed to get kundli');
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
app.use('/api/kundli', kundliRoutes);
// AI chat routes need longer timeout (Gemini 3 Pro can take 15-30s to respond)
app.use('/api/ai-chat', (req, res, next) => {
    req.setTimeout(60000); // 60 second request timeout
    res.setTimeout(60000); // 60 second response timeout
    next();
}, aiChatRoutes);
app.use('/api/payments', unifiedPaymentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 6000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 