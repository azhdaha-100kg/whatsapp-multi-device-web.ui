// src/services/socket.js
import { io } from 'socket.io-client';
import { useSessionStore } from '../stores/sessionStore'; //
import { useChatStore } from '../stores/chatStore'; //
import { useAuthStore } from '@/stores/authStore';

const BASE_URL = import.meta.env.VITE_SOCKET_BASE_URL || 'http://143.198.216.76:3000';
let socket = null;

export function initializeSocket() {
    if (socket && socket.connected) { // If already connected, don't re-initialize unnecessarily
        return socket;
    }

    const authStore = useAuthStore();
    const token = authStore.token || localStorage.getItem('authToken'); // Get token from store or localStorage

    // If trying to initialize socket without a token (e.g., on app load before login),
    // don't attempt to connect, or connect without auth if your backend allows it for some initial handshake.
    // For a fully protected socket, we should only connect if a token is present.
    if (!token) {
        console.log('Socket.IO: No auth token found, connection deferred until login.');
        // We might not want to return null, but rather a non-connected socket or handle this state.
        // For now, let's prevent connection without a token.
        if (socket) { // If a previous (possibly disconnected) socket exists, ensure it's cleaned up.
             socket.disconnect();
             socket = null;
        }
        return null; 
    }

    // If a socket instance exists but is disconnected, update its auth options before reconnecting.
    if (socket && !socket.connected) {
        socket.io.opts.auth = { token };
        socket.connect(); // Attempt to reconnect with new auth options
        return socket;
    }
    
    // If no socket instance or previous attempts failed to establish connection due to no token
    if (!socket) {
        socket = io(BASE_URL, {
            transports: ['websocket'],
            auth: { // Send the token with the connection request
                token: token
            },
            autoConnect: true, // Can be true, as token presence is checked above
        });

        const sessionStore = useSessionStore(); //
        const chatStore = useChatStore();       //

        socket.on('connect', () => { //
            console.log('Socket.IO connected with auth:', socket.id); //
            sessionStore.updateGlobalStatus('Socket connected.'); //
            if (sessionStore.currentSelectedSessionId) { //
                socket.emit('join_session_room', sessionStore.currentSelectedSessionId); //
            }
        });

        socket.on('disconnect', (reason) => { //
            console.log('Socket.IO disconnected:', reason); //
            sessionStore.updateGlobalStatus(`Socket disconnected: ${reason}`); //
            if (reason === 'io server disconnect') {
                // This can happen if the server disconnects the client (e.g. auth failure during handshake)
                // authStore.logout(); // Optionally force logout if server explicitly disconnects due to auth
            }
        });
        socket.on('connect_error', (error) => { //
            console.error('Socket.IO conn error:', error); //
            sessionStore.updateGlobalStatus(`Socket conn error: ${error.message}`); //
            if (error.message.includes('Authentication error')) {
                 // Token might be invalid or expired.
                 // authStore.logout(); // Force logout if auth error on connection
                 // Or, at least, prevent retrying with the bad token until user logs in again.
                 socket.disconnect(); // Prevent further automatic retries with a bad token.
            }
        });
        socket.on('qr_code', (data) => { sessionStore.updateSessionQr(data.sessionId, data.qr); }); //
        socket.on('authenticated', (data) => { sessionStore.setSessionAuthenticated(data.sessionId); }); //
        socket.on('ready', (data) => { sessionStore.setSessionReady(data.sessionId); }); //
        socket.on('auth_failure', (data) => { sessionStore.setSessionAuthFailure(data.sessionId, data.message); }); //
        socket.on('init_error', (data) => { sessionStore.setSessionInitError(data.sessionId, data.error);}); //
        socket.on('session_removed', (data) => { sessionStore.handleSessionRemoved(data.sessionId); chatStore.clearChatDataForSession(data.sessionId); }); //
        socket.on('disconnected', (data) => { if(data && data.sessionId) sessionStore.setSessionDisconnected(data.sessionId, data.reason); }); //
        socket.on('status_update', (data) => { //
            if (data.sessionId && data.message) { //
                const session = sessionStore.sessions[data.sessionId]; //
                if (session) session.statusMessage = data.message; //
                else if(data.message.toLowerCase().includes("initialization started") || data.message.toLowerCase().includes("qr code received")) sessionStore.fetchSessions(); //
                if(data.sessionId && data.qr !== undefined && sessionStore.currentSelectedSessionId === data.sessionId) { //
                    if(data.qr) sessionStore.updateSessionQr(data.sessionId, data.qr); //
                }
            }
            if (!data.sessionId && data.message) sessionStore.updateGlobalStatus(data.message); //
        });


        socket.on('new_message', (eventData) => { //
            console.log('Socket RX new_message for session:', eventData.sessionId, 'Chat:', eventData.message.fromMe ? eventData.message.to : eventData.message.from, 'Msg:', eventData.message.body); //
            const chatId = eventData.message.fromMe ? eventData.message.to : eventData.message.from; //
            const messagePayload = { //
                ...eventData.message, //
                author: eventData.message.author || (eventData.message.isGroupMsg && !eventData.message.fromMe ? eventData.message.from : undefined) //
            };
            chatStore.addMessageToChat(eventData.sessionId, chatId, messagePayload); //
        });

        socket.on('message_sent', (eventData) => { //
            console.log('Socket RX message_sent for session:', eventData.sessionId, 'To:', eventData.to, 'Msg:', eventData.body); //
            const messagePayload = { //
                id: eventData.id, //
                body: eventData.body, //
                timestamp: eventData.timestamp, //
                from: sessionStore.selectedSessionData?.id?.user || 'me', //
                to: eventData.to, //
                fromMe: true, //
                author: undefined, //
                type: 'chat', //
            };
            chatStore.addMessageToChat(eventData.sessionId, eventData.to, messagePayload); //
        });

        socket.on('media_sent', (eventData) => { //
            console.log('Socket RX media_sent:', eventData); //
            const messagePayload = { //
                id: `media-${Date.now()}`, //
                body: `[Media: ${eventData.type}] ${eventData.caption || eventData.filename || ''}`, //
                timestamp: Math.floor(Date.now() / 1000), //
                from: sessionStore.selectedSessionData?.id?.user || 'me', //
                to: eventData.to, //
                fromMe: true, //
                type: eventData.type, //
                hasMedia: true, //
            };
            chatStore.addMessageToChat(eventData.sessionId, eventData.to, messagePayload); //
        });

        socket.on('location_sent', (eventData) => { //
            console.log('Socket RX location_sent:', eventData); //
            const messagePayload = { //
                id: `loc-${Date.now()}`, //
                body: `[Location: ${eventData.latitude}, ${eventData.longitude}] ${eventData.description || ''}`, //
                timestamp: Math.floor(Date.now() / 1000), //
                from: sessionStore.selectedSessionData?.id?.user || 'me', //
                to: eventData.to, //
                fromMe: true, //
                type: 'location', //
            };
            chatStore.addMessageToChat(eventData.sessionId, eventData.to, messagePayload); //
        });

        socket.on('bulk_send_complete', (data) => { //
            console.log('Socket RX bulk_send_complete:', data); //
        });
    }
    return socket;
}

export function getSocket() { //
    if (!socket) { //
        // console.warn("Socket not initialized. Call initializeSocket first, possibly after login.");
        // Attempt to initialize if a token exists, e.g. after page refresh
        const authToken = localStorage.getItem('authToken');
        if (authToken) {
            return initializeSocket(); // This will use the token
        }
    }
    return socket; //
}

export function connectSocket() { //
    if (socket && !socket.connected) { //
        const authToken = localStorage.getItem('authToken');
        if (authToken) {
            socket.io.opts.auth = { token: authToken }; // Ensure auth options are up-to-date
            socket.connect(); //
        } else {
            console.warn("Cannot connect socket: No auth token available.");
        }
    } else if (!socket) {
        // If socket is null, try to initialize it. This might happen if getSocket() was called first.
        initializeSocket(); // This will attempt to connect if a token is available.
    }
}

export function disconnectSocket() {
    if (socket && socket.connected) {
        socket.disconnect();
        console.log('Socket.IO disconnected by disconnectSocket()');
    }
    // Optionally nullify the socket instance if you want a completely fresh one next time
    // socket = null; 
}
