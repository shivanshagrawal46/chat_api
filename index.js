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
const User = require('./models/User');
const Message = require('./models/Message');
const jwt = require('jsonwebtoken');

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

// Middleware
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 6000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 