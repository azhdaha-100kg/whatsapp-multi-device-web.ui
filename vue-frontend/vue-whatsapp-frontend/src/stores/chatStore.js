// src/stores/chatStore.js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useSessionStore } from './sessionStore';
import { getChatsApi } from '../services/api';

export const useChatStore = defineStore('chat', () => {
    const sessionStore = useSessionStore();

    const chatsBySession = ref({}); //
    const messagesBySessionAndChat = ref({}); //
    const selectedChatId = ref(null); //
    const isLoadingChats = ref(false); //
    const isLoadingMessages = ref(false); //

    // --- NEW: For Message Replies ---
    const replyingToMessage = ref(null); // Stores { id: string, body: string, from: string, fromMe: boolean, chatId: string }

    const currentSessionChats = computed(() => { //
        if (sessionStore.currentSelectedSessionId) {
            return chatsBySession.value[sessionStore.currentSelectedSessionId] || [];
        }
        return [];
    });

    const selectedChatMessages = computed(() => { //
        if (sessionStore.currentSelectedSessionId && selectedChatId.value) {
            const sessionMessages = messagesBySessionAndChat.value[sessionStore.currentSelectedSessionId];
            return sessionMessages ? (sessionMessages[selectedChatId.value] || []) : [];
        }
        return [];
    });

    async function fetchChatsForCurrentSession() { //
        // ... (existing implementation from your uploaded file) ...
        if (!sessionStore.currentSelectedSessionId) {
            console.warn('No session selected, cannot fetch chats.');
            return;
        }
        if (!sessionStore.selectedSessionData?.isReady) {
            console.warn(`Session ${sessionStore.currentSelectedSessionId} not ready, cannot fetch chats.`);
            if (chatsBySession.value[sessionStore.currentSelectedSessionId]) { 
                chatsBySession.value[sessionStore.currentSelectedSessionId] = [];
            }
            return;
        }

        isLoadingChats.value = true;
        const sessionId = sessionStore.currentSelectedSessionId;
        const response = await getChatsApi(sessionId);

        if (response.success && response.chats) {
            const sortedChats = response.chats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            chatsBySession.value[sessionId] = sortedChats;

            if (!messagesBySessionAndChat.value[sessionId]) {
                messagesBySessionAndChat.value[sessionId] = {};
            }
            sortedChats.forEach(chat => {
                if (!messagesBySessionAndChat.value[sessionId][chat.id]) {
                    messagesBySessionAndChat.value[sessionId][chat.id] = [];
                }
                if (chat.lastMessage) {
                    const chatMessages = messagesBySessionAndChat.value[sessionId][chat.id];
                    const existingMsg = chatMessages.find(m => m.id === chat.lastMessage.id?._serialized || m.id === chat.lastMessage.id);
                    if (!existingMsg) {
                        const normalizedLastMsg = {
                            ...chat.lastMessage,
                            id: chat.lastMessage.id?._serialized || chat.lastMessage.id,
                            author: chat.lastMessage.author || (chat.isGroup ? chat.lastMessage.from : undefined)
                        };
                        chatMessages.push(normalizedLastMsg);
                        chatMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                    }
                }
            });
        } else {
            console.error('Error fetching chats:', response.error);
            chatsBySession.value[sessionId] = [];
        }
        isLoadingChats.value = false;
    }

    function addMessageToChat(sessionId, chatId, message) { //
        // ... (existing implementation from your uploaded file) ...
        if (!messagesBySessionAndChat.value[sessionId]) {
            messagesBySessionAndChat.value[sessionId] = {};
        }
        if (!messagesBySessionAndChat.value[sessionId][chatId]) {
            messagesBySessionAndChat.value[sessionId][chatId] = [];
        }

        const existingMsg = messagesBySessionAndChat.value[sessionId][chatId].find(m => m.id === message.id);
        if (!existingMsg) {
            messagesBySessionAndChat.value[sessionId][chatId].push(message);
            messagesBySessionAndChat.value[sessionId][chatId].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        }

        if (chatsBySession.value[sessionId]) {
            const chatIndex = chatsBySession.value[sessionId].findIndex(c => c.id === chatId);
            if (chatIndex > -1) {
                chatsBySession.value[sessionId][chatIndex].lastMessage = { ...message };
                chatsBySession.value[sessionId][chatIndex].timestamp = message.timestamp;
                chatsBySession.value[sessionId].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            }
        }
    }

    function setSelectedChatId(chatId) { //
        selectedChatId.value = chatId; //
        clearReplyingToMessage(); // NEW: Clear any active reply when changing chats
    }

    function clearChatDataForSession(sessionId) { //
        // ... (existing implementation from your uploaded file) ...
        if (chatsBySession.value[sessionId]) {
            delete chatsBySession.value[sessionId];
        }
        if (messagesBySessionAndChat.value[sessionId]) {
            delete messagesBySessionAndChat.value[sessionId];
        }
        if (sessionStore.currentSelectedSessionId === sessionId) {
            selectedChatId.value = null;
        }
        clearReplyingToMessage(); // NEW: Also clear reply context
    }

    // --- NEW: Actions for Message Replies ---
    function setReplyingToMessage(messageDetails) {
        // messageDetails should be an object like { id: 'messageId', body: 'snippet', from: 'senderName', fromMe: boolean, chatId: string }
        // Add chatId to ensure reply context is for the currently selected chat
        if (selectedChatId.value && messageDetails) {
            replyingToMessage.value = { ...messageDetails, chatId: selectedChatId.value };
        } else {
            replyingToMessage.value = null;
        }
    }

    function clearReplyingToMessage() {
        replyingToMessage.value = null;
    }

    return {
        chatsBySession, //
        messagesBySessionAndChat, //
        selectedChatId, //
        isLoadingChats, //
        isLoadingMessages, //
        currentSessionChats, //
        selectedChatMessages, //
        
        fetchChatsForCurrentSession, //
        addMessageToChat, //
        setSelectedChatId, //
        clearChatDataForSession, //

        // --- NEW: Exports for Message Replies ---
        replyingToMessage,
        setReplyingToMessage,
        clearReplyingToMessage
    };
});