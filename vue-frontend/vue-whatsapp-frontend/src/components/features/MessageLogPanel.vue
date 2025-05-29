<template>
  <section id="messageLogSection" class="flex flex-col h-full">
    <h3 class="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">Message Log</h3>
    <div
        ref="messageLogContainer"
        id="messageLogDisplay"
        class="overflow-y-auto custom-scrollbar border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 p-3 rounded-lg space-y-2 flex-grow"
    >
        <div v-if="!chatStore.selectedChatId">
            <p class="text-sm text-slate-500 dark:text-slate-400 text-center p-4">Select a chat to view messages.</p> </div>
        <div v-else-if="chatStore.isLoadingMessages">
            <p class="text-sm text-slate-500 dark:text-slate-400 text-center p-4">Loading messages...</p> </div>
        <div v-else-if="chatStore.selectedChatMessages.length === 0">
            <p class="text-sm text-slate-500 dark:text-slate-400 text-center p-4">No messages in this chat yet.</p> </div>
        <div v-else>
            <div
                v-for="msg in chatStore.selectedChatMessages"
                :key="msg.id"
                class="group relative p-2 rounded-lg mb-1 text-xs break-words w-fit max-w-[85%]"
                :class="{
                    'bg-green-100 dark:bg-green-700 text-green-800 dark:text-green-100 ml-auto': msg.fromMe, //
                    'bg-blue-100 dark:bg-blue-700 text-blue-800 dark:text-blue-100 mr-auto': !msg.fromMe, //
                    'bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-slate-300 text-center italic mx-auto': msg.type === 'system' || (!msg.fromMe && !msg.author) //
                }"
            >
                <strong v-if="!msg.fromMe && msg.author" class="font-semibold block"> {{ msg.author.replace(/@c\.us|@g\.us/,'') }} </strong>
                <strong v-else-if="!msg.fromMe && !msg.isGroupMsg" class="font-semibold block"> {{ msg.from.replace(/@c\.us|@g\.us/,'') }} </strong>
                <span class="block whitespace-pre-wrap">{{ msg.body || `[Media: ${msg.type || 'unknown'}]` }}</span> <span class="text-xxs text-slate-500 dark:text-slate-400 block mt-0.5" :class="msg.fromMe ? 'text-right' : 'text-left'"> {{ formatTimestamp(msg.timestamp) }} </span>

                <button
                    @click="initiateReply(msg)"
                    title="Reply"
                    class="absolute p-1 bg-slate-200 dark:bg-slate-600 rounded-full shadow hover:bg-slate-300 dark:hover:bg-slate-500 transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100"
                    :class="{
                        '-top-2 -right-2': msg.fromMe, 
                        '-top-2 -left-2 transform scale-x-[-1]': !msg.fromMe && msg.type !== 'system' && msg.author // Only show for actual user messages
                    }"
                    v-if="msg.type !== 'system' && msg.id"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3 text-slate-600 dark:text-slate-200">
                        <path fill-rule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h6.128a5.5 5.5 0 1 1 0 11H5.75a.75.75 0 0 1 0-1.5h4a4 4 0 1 0 0-8H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clip-rule="evenodd" />
                    </svg>
                </button>
            </div>
        </div>
    </div>
  </section>
</template>

<script setup>
import { useChatStore } from '../../stores/chatStore'; //
import { useSessionStore } from '../../stores/sessionStore'; // Import for focusing input if needed
import { watch, ref, nextTick } from 'vue'; //

const chatStore = useChatStore(); //
const sessionStore = useSessionStore();
const messageLogContainer = ref(null); //

function formatTimestamp(timestamp) { //
    if (!timestamp) return ''; //
    return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); //
}

function scrollToBottom() { //
    nextTick(() => { //
        if (messageLogContainer.value) { //
            messageLogContainer.value.scrollTop = messageLogContainer.value.scrollHeight; //
        }
    });
}

// --- NEW: Initiate Reply ---
function initiateReply(messageToReplyTo) {
    // Ensure msg.id is the correct serializable ID from whatsapp-web.js
    // (e.g., 'false_1111111111@c.us_AAAAAAAAAAAAAAAAAAAA' or similar)
    if (!messageToReplyTo || !messageToReplyTo.id) {
        console.error('Cannot reply: Message ID is missing.', messageToReplyTo);
        return;
    }

    let bodySnippet = messageToReplyTo.body || `[Media: ${messageToReplyTo.type || 'unknown'}]`;
    if (bodySnippet.length > 40) { // Shorter snippet for display
        bodySnippet = bodySnippet.substring(0, 37) + "...";
    }

    let senderName = '';
    if (messageToReplyTo.fromMe) {
        senderName = 'You';
    } else {
        // Use author if available (for group messages), otherwise fallback to 'from'
        senderName = messageToReplyTo.author || messageToReplyTo.from;
        // Clean up senderName if it's a JID
        if (senderName && (senderName.includes('@c.us') || senderName.includes('@g.us'))) {
            senderName = senderName.split('@')[0];
        }
    }
    
    chatStore.setReplyingToMessage({
        id: messageToReplyTo.id, // This must be the ID whatsapp-web.js uses for quoting
        body: bodySnippet,
        from: senderName,
        fromMe: messageToReplyTo.fromMe,
        chatId: chatStore.selectedChatId // Associate reply context with the current chat
    });

    // Optional: If your SendTextPanel is always visible or you have a global way to focus its input:
    // const messageInputField = document.getElementById('panelMessageText'); // ID from SendTextPanel
    // if (messageInputField) {
    //   messageInputField.focus();
    // }
    // Or emit an event that the main view can listen to, to focus the correct input panel.
    // For now, setting in store is the primary action.
}


watch(() => chatStore.selectedChatMessages, (newMessages) => { //
    if (newMessages && newMessages.length > 0) { //
        scrollToBottom(); //
    }
}, { deep: true });

watch(() => chatStore.selectedChatId, (newChatId) => { //
    if (newChatId) { //
        // When a new chat is selected, messages will load, and the above watch will scroll.
        // We might want to ensure the scroll happens after messages are populated.
        // The current logic should be okay as selectedChatMessages watch will trigger scroll.
    }
});
</script>

<style scoped>
/* Extra small text for timestamp */
.text-xxs { /* */
    font-size: 0.65rem; 
    line-height: 0.85rem;
}
/* Ensure message body whitespace is preserved (e.g. for multi-line messages) */
.whitespace-pre-wrap {
  white-space: pre-wrap;
}
</style>