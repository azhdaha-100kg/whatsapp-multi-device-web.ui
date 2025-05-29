// backend/server.js
require('dotenv').config(); // Load environment variables first

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { Client, LocalAuth, MessageMedia, Location } = require('whatsapp-web.js');
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

// --- CORS Setup ---
const frontendURL = process.env.FRONTEND_URL || 'http://143.198.216.76/:8787'; // Define your frontend URL
app.use(cors({
    origin: frontendURL
}));
// --- End CORS Setup ---

app.use(express.json());

// --- Authentication Setup ---
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secret-and-complex-key-change-this';

const users = [
    {
        id: 1,
        username: 'admin',
        passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'devpassword123', 10)
    }
    // Add more users here if needed
];

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('Token verification failed:', err.message);
            return res.sendStatus(403);
        }
        req.user = user;
        next();
    });
}
// --- End Authentication Setup ---

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: frontendURL, // Use the same frontendURL for Socket.IO
        methods: ["GET", "POST"]
    }
});

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                console.error('Socket Auth Error: Invalid token');
                return next(new Error('Authentication error: Invalid token'));
            }
            socket.user = decoded;
            console.log(`Socket ${socket.id} authenticated for user: ${socket.user.username}`);
            next();
        });
    } else {
        console.error('Socket Auth Error: No token provided');
        next(new Error('Authentication error: No token provided'));
    }
});

const PORT = process.env.PORT || 3000;

const sessions = {};
const qrCodes = {};
const clientReadyStatus = {};

function createWhatsappSession(sessionId) {
    console.log(`[${sessionId}] Initializing WhatsApp client...`);
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId, dataPath: path.join(__dirname, '.wwebjs_auth') }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        },
    });

    client.on('qr', (qr) => {
        console.log(`[${sessionId}] QR RECEIVED`);
        qrCodes[sessionId] = qr;
        clientReadyStatus[sessionId] = false;
        io.to(sessionId).emit('qr_code', { sessionId, qr });
        io.emit('status_update', { sessionId, message: 'QR code received. Scan.', qr });
    });

    client.on('authenticated', () => {
        console.log(`[${sessionId}] AUTHENTICATED`);
        qrCodes[sessionId] = null;
        io.to(sessionId).emit('authenticated', { sessionId });
        io.emit('status_update', { sessionId, message: 'Authenticated!' });
    });

    client.on('auth_failure', msg => {
        console.error(`[${sessionId}] AUTHENTICATION FAILURE:`, msg);
        qrCodes[sessionId] = null;
        clientReadyStatus[sessionId] = false;
        io.to(sessionId).emit('auth_failure', { sessionId, message: msg });
        io.emit('status_update', { sessionId, message: `Authentication failure: ${msg}` });
    });

    client.on('ready', () => {
        console.log(`[${sessionId}] WhatsApp client READY!`);
        clientReadyStatus[sessionId] = true;
        qrCodes[sessionId] = null;
        io.to(sessionId).emit('ready', { sessionId });
        io.emit('status_update', { sessionId, message: 'Client is READY!' });
    });

    client.on('message', async msg => {
        console.log(`[${sessionId}] RX MSG From:${msg.from} Body:${msg.body}`);
        io.to(sessionId).emit('new_message', {
            sessionId,
            message: {
                from: msg.from, to: msg.to, body: msg.body, timestamp: msg.timestamp,
                id: msg.id._serialized || msg.id.id, // Ensure a serializable ID
                author: msg.author, isStatus: msg.isStatus,
                isGroupMsg: msg.isGroupMsg, hasMedia: msg.hasMedia, type: msg.type,
                fromMe: msg.fromMe // Add fromMe for UI differentiation
            }
        });
    });

    client.on('disconnected', (reason) => {
        console.log(`[${sessionId}] Client logged out. Reason:`, reason);
        clientReadyStatus[sessionId] = false;
        qrCodes[sessionId] = null;
        io.to(sessionId).emit('disconnected', { sessionId, reason });
        io.emit('status_update', { sessionId, message: `Client disconnected: ${reason}.` });
    });

    client.initialize().catch(err => {
        console.error(`[${sessionId}] Initialization ERROR:`, err.message);
        io.to(sessionId).emit('init_error', { sessionId, error: err.message });
        io.emit('status_update', { sessionId, message: `Initialization Error: ${err.message}` });
        delete sessions[sessionId];
        delete qrCodes[sessionId];
        delete clientReadyStatus[sessionId];
    });

    sessions[sessionId] = client;
    clientReadyStatus[sessionId] = false;
    qrCodes[sessionId] = null;
    return client;
}

// --- Authentication Route ---
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }
    const user = users.find(u => u.username === username);
    if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
        return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }
    const userPayload = { id: user.id, username: user.username };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, message: 'Login successful', token: token, user: userPayload });
});

// --- Protected API Endpoints ---
app.post('/session/init/:sessionId', authenticateToken, (req, res) => {
    const { sessionId } = req.params;
    console.log(`User ${req.user.username} trying to init session ${sessionId}`);
    if (!sessionId) return res.status(400).json({ success: false, error: 'Session ID required.' });
    if (sessions[sessionId]) {
        sessions[sessionId].getState().then(state =>
            res.json({ success: true, message: `Session '${sessionId}' exists/processing.`, status: state || 'INITIALIZING', qr: qrCodes[sessionId] })
        ).catch(() => {
            console.warn(`[${sessionId}] getState failed for existing session. Attempting re-initialization.`);
            createWhatsappSession(sessionId);
            res.json({ success: true, message: `Session '${sessionId}' re-initializing due to previous error.`, status: 'RE_INITIALIZING' });
        });
    } else {
        createWhatsappSession(sessionId);
        res.json({ success: true, message: `Session '${sessionId}' initialization started.`, status: 'INITIALIZING' });
    }
});

app.get('/sessions', authenticateToken, (req, res) => {
    res.json({ success: true, sessions: Object.keys(sessions).map(id => ({
        sessionId: id,
        isReady: clientReadyStatus[id] || false,
        hasQr: !!qrCodes[id]
    }))
  });
});

app.post('/session/remove/:sessionId', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    const client = sessions[sessionId];
    if (client) {
        try {
            await client.destroy();
            console.log(`[${sessionId}] Client destroyed via API by user ${req.user.username}.`);
        } catch (e) {
            console.error(`[${sessionId}] Error destroying client via API:`, e.message);
        }
    } else {
        console.log(`[${sessionId}] No active client found to remove via API.`);
    }
    delete sessions[sessionId];
    delete qrCodes[sessionId];
    delete clientReadyStatus[sessionId];
    io.emit('session_removed', { sessionId });
    io.emit('status_update', { sessionId, message: 'Session has been removed.' });
    res.json({ success: true, message: `Session '${sessionId}' removed/state cleared.` });
});

app.get('/session/is-registered/:sessionId/:number', authenticateToken, async (req, res) => {
    const { sessionId, number } = req.params;
    const client = sessions[sessionId];
    if (!client || !clientReadyStatus[sessionId]) {
        return res.status(400).json({ success: false, error: `Session ${sessionId} not ready.`, isRegistered: false });
    }
    if (!number) {
        return res.status(400).json({ success: false, error: 'Number to check is required.', isRegistered: false });
    }
    try {
        let numberIdToCheck = number.includes('@') ? number : `${number.replace(/\D/g, '')}@c.us`;
        const isRegistered = await client.isRegisteredUser(numberIdToCheck);
        if (isRegistered) {
            res.json({ success: true, isRegistered: true, numberId: numberIdToCheck, message: 'Number is registered on WhatsApp.' });
        } else {
            const contactIdObj = await client.getNumberId(number.replace(/\D/g, ''));
            if (contactIdObj) {
                 res.json({ success: true, isRegistered: false, numberId: contactIdObj._serialized, message: 'Number format appears valid but not actively on WhatsApp or privacy settings may hide status.' });
            } else {
                 res.json({ success: true, isRegistered: false, numberId: numberIdToCheck, message: 'Number is not registered on WhatsApp or format is invalid for lookup.' });
            }
        }
    } catch (e) {
        console.error(`[${sessionId}] API: Error checking number ${number} by user ${req.user.username}:`, e.message);
        res.status(500).json({ success: false, error: `Failed to check number: ${e.message}`, isRegistered: false });
    }
});

// MODIFIED /session/send-message TO INCLUDE QUOTED MESSAGE ID
app.post('/session/send-message/:sessionId', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    const { number, message, quotedMessageId } = req.body; // <<< Added quotedMessageId
    const client = sessions[sessionId];

    console.log(`[${sessionId}] API: User ${req.user.username} send message to ${number}${quotedMessageId ? ' (replying to ' + quotedMessageId + ')' : ''}`);

    if (!client || !clientReadyStatus[sessionId]) return res.status(400).json({ success: false, error: `Session ${sessionId} not ready.` });
    if (!number || !message) return res.status(400).json({ success: false, error: 'Recipient & message required.' });

    try {
        if (await client.getState() !== 'CONNECTED') return res.status(400).json({ success: false, error: `Client ${sessionId} not connected.` });
        let chatId = number.includes('@') ? number : `${number.replace(/\D/g, '')}@c.us`;

        const messageOptions = {};
        if (quotedMessageId) {
            messageOptions.quotedMessageId = quotedMessageId; // Add this to options if provided
        }

        const msgSent = await client.sendMessage(chatId, message, messageOptions); // Pass options here

        io.to(sessionId).emit('message_sent', { 
            sessionId, 
            to: chatId, 
            body: message, 
            id: msgSent.id._serialized || msgSent.id.id, // Ensure serializable ID
            timestamp: msgSent.timestamp,
            // Optionally include info if it was a reply for frontend to update UI if needed
            // quotedMsg: quotedMessageId ? { id: quotedMessageId } : undefined 
        });
        res.json({ success: true, message: 'Message sent!', msgData: {id: msgSent.id._serialized || msgSent.id.id, timestamp: msgSent.timestamp} });
    } catch (e) {
        console.error(`[${sessionId}] API: Send message error to ${number} by user ${req.user.username}:`, e.message);
        res.status(500).json({ success: false, error: `Send fail: ${e.message}` });
    }
});


app.get('/session/chats/:sessionId', authenticateToken, async (req, res) => {
    const { sessionId } = req.params; const client = sessions[sessionId];
    if (!client || !clientReadyStatus[sessionId]) return res.status(400).json({ success: false, error: `Session ${sessionId} not ready.` });
    try {
        if (await client.getState() !== 'CONNECTED') return res.status(400).json({ success: false, error: `Client ${sessionId} not connected.` });
        const chats = await client.getChats();
        res.json({ success: true, chats: chats.map(c => ({ id:c.id._serialized, name:c.name, isGroup:c.isGroup, unreadCount:c.unreadCount, timestamp:c.timestamp, lastMessage: c.lastMessage ? { id: c.lastMessage.id._serialized || c.lastMessage.id.id, body:c.lastMessage.body, from:c.lastMessage.from, to:c.lastMessage.to, fromMe:c.lastMessage.fromMe, timestamp:c.lastMessage.timestamp, hasMedia:c.lastMessage.hasMedia, type:c.lastMessage.type, author: c.lastMessage.author } : null })) });
    } catch (e) {
        console.error(`[${sessionId}] API: Chat fetch error by user ${req.user.username}:`, e.message);
        res.status(500).json({ success: false, error: `Chat fetch fail: ${e.message}` });
    }
});

app.get('/session/contact-info/:sessionId/:contactId', authenticateToken, async (req, res) => {
    const { sessionId, contactId } = req.params; const client = sessions[sessionId];
    if (!client || !clientReadyStatus[sessionId]) return res.status(400).json({ success: false, error: `Session ${sessionId} not ready.` });
    if (!contactId) return res.status(400).json({ success: false, error: 'Contact ID required.' });
    try {
        const formattedId = contactId.includes('@') ? contactId : `${contactId.replace(/\D/g, '')}@c.us`;
        const contact = await client.getContactById(formattedId);
        const pic = await contact.getProfilePicUrl();
        res.json({ success: true, contactInfo: { id:contact.id._serialized, name:contact.name, number:contact.number, pushname:contact.pushname, isMe:contact.isMe, isUser:contact.isUser, isGroup:contact.isGroup, isWAUser:contact.isWAUser, isBlocked:contact.isBlocked, profilePicUrl:pic||null } });
    } catch (e) {
        console.error(`[${sessionId}] API: Contact info error for ${contactId} by user ${req.user.username}:`, e.message);
        res.status(500).json({ success: false, error: `Contact info fail: ${e.message}` });
    }
});

// MODIFIED /session/send-image TO INCLUDE QUOTED MESSAGE ID
app.post('/session/send-image/:sessionId', authenticateToken, upload.single('imageFile'), async (req, res) => {
    const { sessionId } = req.params;
    const { number, caption, imageUrl, quotedMessageId } = req.body; // <<< Added quotedMessageId
    const client = sessions[sessionId];

    console.log(`[${sessionId}] API: User ${req.user.username} send image to ${number}${quotedMessageId ? ' (replying to ' + quotedMessageId + ')' : ''}`);

    if (!client || !clientReadyStatus[sessionId]) return res.status(400).json({ success: false, error: `Session ${sessionId} not ready.` });
    if (!number) return res.status(400).json({ success: false, error: 'Recipient required.' });
    if (!req.file && !imageUrl) return res.status(400).json({ success: false, error: 'Image file or URL required.' });
    try {
        if (await client.getState() !== 'CONNECTED') return res.status(400).json({ success: false, error: `Client ${sessionId} not connected.` });
        let media, filename = 'image.png';
        if (req.file) {
            media = new MessageMedia(req.file.mimetype, req.file.buffer.toString('base64'), req.file.originalname);
            filename = req.file.originalname;
        } else if (imageUrl) {
            const r = await axios.get(imageUrl, {responseType:'arraybuffer'});
            const mt = r.headers['content-type']||'image/jpeg';
            const buf = Buffer.from(r.data,'binary');
            try {filename=path.basename(new URL(imageUrl).pathname)||filename;} catch(e){ /* ignore */ }
            media = new MessageMedia(mt,buf.toString('base64'),filename);
        }
        let chatId = number.includes('@') ? number : `${number.replace(/\D/g, '')}@c.us`;

        const messageOptions = { caption: caption || '' };
        if (quotedMessageId) {
            messageOptions.quotedMessageId = quotedMessageId;
        }

        const msgSent = await client.sendMessage(chatId, media, messageOptions); // Pass options
        io.to(sessionId).emit('media_sent', { 
            sessionId, 
            to: chatId, 
            type: media.mimetype, // More accurate type
            filename, 
            caption: caption || '',
            id: msgSent.id._serialized || msgSent.id.id // Ensure serializable ID
            // quotedMsg: quotedMessageId ? { id: quotedMessageId } : undefined
        });
        res.json({ success: true, message: 'Image sent!' });
    } catch (e) {
        console.error(`[${sessionId}] API: Image send error to ${number} by user ${req.user.username}:`, e.message);
        res.status(500).json({ success: false, error: `Image send fail: ${e.message}` });
    }
});

app.post('/session/send-location/:sessionId', authenticateToken, async (req, res) => {
    const { sessionId } = req.params; const { number, latitude, longitude, description } = req.body; const client = sessions[sessionId];
    // Note: whatsapp-web.js send Location does not directly support quoting message in the same way as text/media.
    // If reply is needed for location, it typically means sending location as a new message and visually associating it in UI if possible.
    if (!client || !clientReadyStatus[sessionId]) return res.status(400).json({ success: false, error: `Session ${sessionId} not ready.` });
    if (!number || latitude === undefined || longitude === undefined ) return res.status(400).json({ success: false, error: 'Recipient, latitude, longitude required.' });
    try {
        if (await client.getState() !== 'CONNECTED') return res.status(400).json({ success: false, error: `Client ${sessionId} not connected.` });
        const loc = new Location(parseFloat(latitude), parseFloat(longitude), description || undefined);
        let chatId = number.includes('@') ? number : `${number.replace(/\D/g, '')}@c.us`;
        const msgSent = await client.sendMessage(chatId, loc);
        io.to(sessionId).emit('location_sent', { sessionId, to: chatId, latitude, longitude, description, id: msgSent.id._serialized || msgSent.id.id });
        res.json({ success: true, message: 'Location sent!' });
    } catch (e) {
        console.error(`[${sessionId}] API: Location send error to ${number} by user ${req.user.username}:`, e.message);
        res.status(500).json({ success: false, error: `Location send fail: ${e.message}` });
    }
});

app.post('/session/set-status/:sessionId', authenticateToken, async (req, res) => {
    const { sessionId } = req.params; const { statusMessage } = req.body; const client = sessions[sessionId];
    if (!client || !clientReadyStatus[sessionId]) return res.status(400).json({ success: false, error: `Session ${sessionId} not ready.` });
    if (typeof statusMessage !== 'string') return res.status(400).json({ success: false, error: 'statusMessage (string) required.' });
    try {
        await client.setStatus(statusMessage);
        io.to(sessionId).emit('status_message_set', { sessionId, status: statusMessage });
        res.json({ success: true, message: 'Status updated!' });
    } catch (e) {
        console.error(`[${sessionId}] API: Set status error by user ${req.user.username}:`, e.message);
        res.status(500).json({ success: false, error: `Set status fail: ${e.message}` });
    }
});

app.post('/session/:sessionId/chat/:chatId/send-typing', authenticateToken, async (req, res) => {
    const { sessionId, chatId } = req.params;
    const client = sessions[sessionId];
    if (!client || !clientReadyStatus[sessionId]) return res.status(400).json({ success: false, error: `Session ${sessionId} not ready.` });
    if (!chatId) return res.status(400).json({ success: false, error: 'Chat ID required.' });
    try {
        const chat = await client.getChatById(chatId);
        if (!chat) return res.status(404).json({ success: false, error: `Chat ${chatId} not found in session ${sessionId}.` });
        await chat.sendStateTyping();
        // console.log(`[${sessionId}] API: Sent typing state to chat ${chatId} by user ${req.user.username}`); // Already logged by frontend action
        res.json({ success: true, message: `Typing state sent to ${chatId}` });
    } catch (error) { console.error(`[${sessionId}] API: Error sending typing state to ${chatId} by user ${req.user.username}:`, error.message); res.status(500).json({ success: false, error: `Typing state fail: ${error.message}` });}
});

app.post('/session/:sessionId/chat/:chatId/send-seen', authenticateToken, async (req, res) => {
    const { sessionId, chatId } = req.params;
    const client = sessions[sessionId];
    if (!client || !clientReadyStatus[sessionId]) return res.status(400).json({ success: false, error: `Session ${sessionId} not ready.` });
    if (!chatId) return res.status(400).json({ success: false, error: 'Chat ID required.' });
    try {
        const chat = await client.getChatById(chatId);
        if (!chat) return res.status(404).json({ success: false, error: `Chat ${chatId} not found in session ${sessionId}.` });
        const success = await chat.sendSeen();
        // console.log(`[${sessionId}] API: Sent seen receipt to chat ${chatId}. Success: ${success} by user ${req.user.username}`);
        res.json({ success: success, message: success ? `Seen receipt sent` : `Failed to send seen` });
    } catch (error) { console.error(`[${sessionId}] API: Error sending seen receipt to ${chatId} by user ${req.user.username}:`, error.message); res.status(500).json({ success: false, error: `Send seen fail: ${error.message}` });}
});

app.post('/session/:sessionId/set-presence-online', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    const client = sessions[sessionId];
    if (!client || !clientReadyStatus[sessionId]) return res.status(400).json({ success: false, error: `Session ${sessionId} not ready.` });
    try {
        await client.sendPresenceAvailable();
        // console.log(`[${sessionId}] API: Presence set to available (online) by user ${req.user.username}.`);
        res.json({ success: true, message: 'Presence set online.' });
    } catch (error) { console.error(`[${sessionId}] API: Error setting presence online by user ${req.user.username}:`, error.message); res.status(500).json({ success: false, error: `Set presence fail: ${error.message}` });}
});


// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log('Socket.IO user connected:', socket.id, socket.user ? `(User: ${socket.user.username})` : '(Unauthenticated)');
    if (!socket.user) {
        console.log(`Socket ${socket.id} tried to join room without authentication. Disconnecting.`);
        socket.disconnect(true);
        return;
    }
    socket.on('join_session_room', (sessionId) => {
        if (sessionId) {
            socket.join(sessionId);
            console.log(`Socket ${socket.id} (User: ${socket.user.username}) joined room ${sessionId}`);
            if (qrCodes[sessionId]) socket.emit('qr_code', { sessionId, qr: qrCodes[sessionId] });
            else if (clientReadyStatus[sessionId]) socket.emit('ready', { sessionId });
            else if (sessions[sessionId]) socket.emit('status_update', { sessionId, message: 'Session initializing...'});
            else socket.emit('status_update', { sessionId, message: 'Session not active. Initialize it first.' });
        }
    });
    socket.on('request_init_session', (sessionId) => {
        if (sessionId) {
            if (sessions[sessionId]) {
                 sessions[sessionId].getState().then(st => {
                     io.to(sessionId).emit('status_update', { sessionId, message: `Session '${sessionId}' exists. State: ${st}`, status: st, qr: qrCodes[sessionId] });
                     if (qrCodes[sessionId]) io.to(sessionId).emit('qr_code', { sessionId, qr: qrCodes[sessionId] });
                 }).catch(() => {
                     createWhatsappSession(sessionId);
                     io.to(sessionId).emit('status_update', { sessionId, message: `Session '${sessionId}' re-initializing.`});
                 });
            } else {
                createWhatsappSession(sessionId);
                io.to(sessionId).emit('status_update', { sessionId, message: `Session '${sessionId}' initialization started.`});
            }
        }
    });
    socket.on('disconnect', () => console.log('Socket.IO user disconnected:', socket.id, socket.user ? `(User: ${socket.user.username})` : ''));
});

server.listen(PORT, () => {
    console.log(`Server with authentication running on http://localhost:${PORT}`);
});