require('dotenv').config();
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const store = require('./data/store');

connectDB();

const isVercel = Boolean(process.env.VERCEL);
const app = express();
let server = null;
let io = null;

if (!isVercel) {
    server = http.createServer(app);
    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });
}

app.locals.io = io;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const defaultUploadsDir = isVercel ? '/tmp/uploads' : path.join(__dirname, 'uploads');
const configuredUploadsDir = process.env.UPLOADS_DIR || defaultUploadsDir;
const uploadsDir = path.isAbsolute(configuredUploadsDir)
    ? configuredUploadsDir
    : path.join(__dirname, configuredUploadsDir);
fs.mkdirSync(uploadsDir, { recursive: true });

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'frontend')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/about', require('./routes/about'));
app.use('/api/reports', require('./routes/reports'));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'College Lost & Found Expert API v2.0' });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

if (io) {
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
            if (!token) return next(new Error('Authentication required'));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = store.getUserById(decoded.id);
            if (!user) return next(new Error('User not found'));

            socket.user = user;
            next();
        } catch (_err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`Expert User connected: ${socket.user?.name}`);
        socket.join(String(socket.user?._id));

        socket.on('join_chat', async (matchId) => {
            if (!matchId) return;

            const participantIds = store.getChatParticipantIds(matchId);

            if (!participantIds.length) {
                const participantsFromId = String(matchId).split('_');
                if (!participantsFromId.includes(String(socket.user._id))) {
                    socket.emit('chat_error', { message: 'Not authorized to join this chat' });
                    return;
                }

                socket.join(matchId);
                return;
            }

            const isParticipant = participantIds.includes(String(socket.user._id));
            if (!isParticipant) {
                socket.emit('chat_error', { message: 'Not authorized to join this chat' });
                return;
            }

            socket.join(matchId);
            console.log(`User joined match room: ${matchId}`);
        });

        socket.on('send_message', async (data) => {
            const { matchId, receiverId, message } = data;

            try {
                if (!matchId || !receiverId || !message?.trim()) {
                    socket.emit('chat_error', { message: 'matchId, receiverId and message are required' });
                    return;
                }

                const populatedChat = store.appendChatMessage({
                    matchId,
                    senderId: socket.user._id,
                    receiverId,
                    message
                });

                io.to(matchId).emit('receive_message', populatedChat);
                io.to(String(receiverId)).emit('new_chat_notification', {
                    matchId,
                    from: socket.user.name,
                    message: String(message).trim()
                });
            } catch (err) {
                console.error('Socket message error:', err);
                socket.emit('chat_error', { message: err.message || 'Failed to send message' });
            }
        });
    });
}

app.use((err, req, res, next) => {
    console.error('SERVER ERROR STACK:', err.stack);
    res.status(500).json({ error: 'Server error: ' + (err.message || 'Unknown error') });
});

if (isVercel) {
    module.exports = app;
} else {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`\nEXPERT BACKEND v2.0 running on port ${PORT}`);
        console.log(`http://localhost:${PORT}`);
    });
}
