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
        version: '1.0.0',
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
                users: 'GET /api/chat/users'
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
                content: content.trim()
            });
            await message.save();

            // Emit to sender
            socket.emit('new_message', message);

            // Emit to receiver if online
            const receiverSocketId = connectedUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new_message', message);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', 'Failed to send message');
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