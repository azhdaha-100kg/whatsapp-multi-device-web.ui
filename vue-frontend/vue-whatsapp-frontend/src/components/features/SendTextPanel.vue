<template>
  <section id="sendMessagePanel" class="feature-panel p-1 md:p-2 mb-6">
    <h3 class="text-lg font-semibold mb-3 text-slate-700 dark:text-slate-200">Send Text Message</h3>

    <div v-if="chatStore.replyingToMessage && chatStore.replyingToMessage.chatId === (recipient.includes('@') ? recipient : `${recipient.replace(/\D/g, '')}@c.us`)" class="mb-2 p-2 border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-md text-sm">
      <div class="flex justify-between items-center">
        <div>
          <div class="font-semibold text-xs text-blue-700 dark:text-blue-300">
            Replying to {{ chatStore.replyingToMessage.from }}:
          </div>
          <p class="italic text-slate-600 dark:text-slate-400 truncate">
            {{ chatStore.replyingToMessage.body }}
          </p>
        </div>
        <button @click="cancelReply" class="text-red-500 hover:text-red-700 dark:hover:text-red-400 font-bold text-xs" title="Cancel Reply">
          &times;
        </button>
      </div>
    </div>

    <form @submit.prevent="handleSendMessage" class="space-y-4">
      <div>
        <label for="panelRecipientNumber" class="block text-sm font-medium text-slate-600 dark:text-slate-400">Recipient Number/ID:</label>
        <input 
          type="text" 
          id="panelRecipientNumber" 
          v-model="recipient" 
          required 
          class="form-input" 
          placeholder="e.g., 123... or group@g.us"
          :disabled="!!(chatStore.replyingToMessage && chatStore.replyingToMessage.chatId === (recipient.includes('@') ? recipient : `${recipient.replace(/\D/g, '')}@c.us`))"
        >
      </div>
      <div>
        <label for="panelMessageText" class="block text-sm font-medium text-slate-600 dark:text-slate-400">Message:</label>
        <textarea id="panelMessageText" ref="messageInputRef" v-model="message" rows="3" required class="form-textarea" placeholder="Type your message..."></textarea>
      </div>
      <button type="submit" class="btn btn-green" :disabled="isSending || !sessionStore.selectedSessionData?.isReady">
        {{ isSending ? 'Processing...' : (chatStore.replyingToMessage && chatStore.replyingToMessage.chatId === (recipient.includes('@') ? recipient : `${recipient.replace(/\D/g, '')}@c.us`) ? 'Send Reply' : 'Send Message') }}
      </button>
    </form>
    <p v-if="sendStatus" class="mt-3 text-sm" :class="sendStatusType === 'error' ? 'text-red-500 dark:text-red-400' : (sendStatusType === 'success' ? 'text-green-500 dark:text-green-400' : 'text-slate-600 dark:text-slate-400')">{{ sendStatus }}</p>
  </section>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'; //
import { useSessionStore } from '../../stores/sessionStore'; //
import { useChatStore } from '../../stores/chatStore'; // NEW
import { sendMessageApi, sendTypingStateApi, checkWhatsAppNumberApi } from '../../services/api'; //

const sessionStore = useSessionStore(); //
const chatStore = useChatStore(); // NEW

const recipient = ref(''); //
const message = ref(''); //
const sendStatus = ref(''); //
const sendStatusType = ref(''); //
const isSending = ref(false); //
const messageInputRef = ref(null); // For focusing input

// Watch for changes from chat selection (quick send)
watch(() => sessionStore.quickSendRecipientId, (newRecipientId) => { //
  if (newRecipientId) {
    // Only update recipient if not actively replying to someone else in this panel
    if (!chatStore.replyingToMessage || chatStore.replyingToMessage.chatId !== newRecipientId) {
        recipient.value = newRecipientId;
    }
    // If chat changes via quick send, and a reply was active for a *different* chat, clear it.
    if (chatStore.replyingToMessage && chatStore.replyingToMessage.chatId !== newRecipientId) {
        chatStore.clearReplyingToMessage();
    }
  }
});

// Watch for when the main session is deselected
watch(() => sessionStore.currentSelectedSessionId, (newSession) => { //
  if (!newSession) {
    recipient.value = ''; //
    message.value = ''; // Clear message as well
    sendStatus.value = ''; //
    sendStatusType.value = ''; //
    chatStore.clearReplyingToMessage(); // Clear reply if session is lost
  }
});

// Watch for when a reply is initiated from MessageLogPanel (via chatStore)
watch(() => chatStore.replyingToMessage, (newReplyCtx) => {
    if (newReplyCtx && newReplyCtx.chatId) {
        // If SendTextPanel is the active way to send to the selected chat,
        // set its recipient to the chat of the message being replied to.
        recipient.value = newReplyCtx.chatId;
        nextTick(() => { 
             messageInputRef.value?.focus();
        });
    }
    // No need to clear message.value here, user will type the reply
}, { deep: true });


async function handleSendMessage() {
  if (!sessionStore.currentSelectedSessionId || !sessionStore.selectedSessionData?.isReady) { //
    sendStatus.value = 'No active session or session not ready.'; //
    sendStatusType.value = 'error'; //
    return;
  }
  const currentRecipient = recipient.value.trim(); //
  const currentMessage = message.value.trim(); //
  if (!currentRecipient || !currentMessage) { //
    sendStatus.value = 'Recipient & message required.'; //
    sendStatusType.value = 'error'; //
    return;
  }

  isSending.value = true; //
  sendStatus.value = `Checking number ${currentRecipient}...`; //
  sendStatusType.value = 'info'; //

  try {
    const checkRes = await checkWhatsAppNumberApi(sessionStore.currentSelectedSessionId, currentRecipient); //

    if (checkRes.success && checkRes.isRegistered) { //
      sendStatus.value = `Number ${currentRecipient} is registered. Sending message...`; //
      sendStatusType.value = 'info'; //
      
      const typingChatId = currentRecipient.includes('@') ? currentRecipient : `${currentRecipient.replace(/\D/g, '')}@c.us`; //
      if (sessionStore.sessionFeatureToggles.isTypingIndicatorEnabled) { //
        try {
          await sendTypingStateApi(sessionStore.currentSelectedSessionId, typingChatId); //
        } catch (typingError) {
          console.warn("Could not send typing state:", typingError);
        }
      }
      
      // --- NEW: Include quotedMessageId if replying ---
      // Check if the reply context in store is for the current recipient
      const quotedMsgId = (chatStore.replyingToMessage && chatStore.replyingToMessage.chatId === typingChatId) 
                          ? chatStore.replyingToMessage.id 
                          : null;

      const result = await sendMessageApi(sessionStore.currentSelectedSessionId, currentRecipient, currentMessage, quotedMsgId); // Pass quotedMsgId
      if (result.success) { //
        sendStatus.value = result.message || (quotedMsgId ? 'Reply Sent!' : 'Message Sent!'); 
        sendStatusType.value = 'success'; //
        message.value = ''; // Clear message input after sending
        if (quotedMsgId) {
            chatStore.clearReplyingToMessage(); // Clear reply state
        }
      } else {
        sendStatus.value = `Error sending: ${result.error || 'Failed.'}`; //
        sendStatusType.value = 'error'; //
      }
    } else if (checkRes.success && !checkRes.isRegistered) { //
      sendStatus.value = `Number ${currentRecipient} is not registered on WhatsApp. (Reason: ${checkRes.message || 'Not registered'}). Message not sent.`; //
      sendStatusType.value = 'error'; //
    } else { 
      sendStatus.value = `Could not verify number ${currentRecipient}: ${checkRes.error || 'Unknown error during check'}. Message not sent.`; //
      sendStatusType.value = 'error'; //
    }
  } catch (error) {
    console.error("Error sending text:", error); //
    sendStatus.value = `Client error: ${error.message}`; //
    sendStatusType.value = 'error'; //
  }
  isSending.value = false; //
}

// --- NEW: Cancel Reply ---
function cancelReply() {
    chatStore.clearReplyingToMessage();
}
</script>