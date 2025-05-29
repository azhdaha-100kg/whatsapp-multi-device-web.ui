<template>
  <section id="sendImagePanel" class="feature-panel p-1 md:p-2 mb-6">
    <h3 class="text-lg font-semibold mb-3 text-slate-700 dark:text-slate-200">Send Image/Video</h3>

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

    <form @submit.prevent="handleSendMedia" class="space-y-4">
      <div>
        <label for="mediaRecipientNumber" class="block text-sm font-medium text-slate-600 dark:text-slate-400">Recipient:</label>
        <input 
          type="text" 
          id="mediaRecipientNumber" 
          v-model="recipient" 
          required 
          class="form-input" 
          :disabled="!!(chatStore.replyingToMessage && chatStore.replyingToMessage.chatId === (recipient.includes('@') ? recipient : `${recipient.replace(/\D/g, '')}@c.us`))"
        > </div>
      <div class="my-3">
        <span class="text-sm font-medium text-slate-600 dark:text-slate-400">Source:</span> <div class="mt-1 flex items-center space-x-4">
          <label class="inline-flex items-center">
            <input type="radio" class="form-radio" name="imageSourceType" value="file" v-model="mediaSourceType" @change="onMediaSourceChange"> <span class="ml-2 text-sm text-slate-700 dark:text-slate-300">Upload</span> </label>
          <label class="inline-flex items-center">
            <input type="radio" class="form-radio" name="imageSourceType" value="url" v-model="mediaSourceType" @change="onMediaSourceChange"> <span class="ml-2 text-sm text-slate-700 dark:text-slate-300">URL</span> </label>
        </div>
      </div>
      <div v-show="mediaSourceType === 'file'">
        <label for="mediaFileInput" class="block text-sm font-medium text-slate-600 dark:text-slate-400">Media File:</label> <input type="file" id="mediaFileInput" @change="handleFileSelect" accept="image/*,video/*" class="file-input-styled"> </div>
      <div v-show="mediaSourceType === 'url'">
        <label for="mediaUrlInput" class="block text-sm font-medium text-slate-600 dark:text-slate-400">Media URL:</label> <input type="url" id="mediaUrlInput" v-model="mediaUrl" class="form-input" placeholder="https://example.com/image.png"> </div>
      <div>
        <label for="mediaCaptionInput" class="block text-sm font-medium text-slate-600 dark:text-slate-400">Caption (Optional):</label> <input type="text" id="mediaCaptionInput" v-model="caption" class="form-input"> </div>
      <button type="submit" class="btn btn-teal" :disabled="isSending || !sessionStore.selectedSessionData?.isReady"> {{ isSending ? 'Processing...' : (chatStore.replyingToMessage && chatStore.replyingToMessage.chatId === (recipient.includes('@') ? recipient : `${recipient.replace(/\D/g, '')}@c.us`) ? 'Send Reply with Media' : 'Send Media') }}
      </button>
    </form>
    <p v-if="sendStatus" class="mt-3 text-sm" :class="sendStatusType === 'error' ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'">{{ sendStatus }}</p> </section>
</template>

<script setup>
import { ref, watch } from 'vue'; //
import { useSessionStore } from '../../stores/sessionStore'; //
import { useChatStore } from '../../stores/chatStore'; // NEW
import { sendImageApi, sendTypingStateApi, checkWhatsAppNumberApi } from '../../services/api'; //

const sessionStore = useSessionStore(); //
const chatStore = useChatStore(); // NEW

const recipient = ref(''); //
const caption = ref(''); //
const mediaSourceType = ref('file'); //
const selectedFile = ref(null); //
const mediaUrl = ref(''); //
const sendStatus = ref(''); //
const sendStatusType = ref(''); //
const isSending = ref(false); //

watch(() => sessionStore.quickSendRecipientId, (newId) => { //
    if (newId) {
        // Only update recipient if not actively replying to someone else in this panel
        if (!chatStore.replyingToMessage || chatStore.replyingToMessage.chatId !== newId) {
            recipient.value = newId;
        }
        // If chat changes via quick send, and a reply was active for a *different* chat, clear it.
        if (chatStore.replyingToMessage && chatStore.replyingToMessage.chatId !== newId) {
            chatStore.clearReplyingToMessage();
        }
    }
});
watch(() => sessionStore.currentSelectedSessionId, (newSess) => { //
    if (!newSess) {
        recipient.value = ''; //
        caption.value = ''; // Clear caption as well
        sendStatus.value = ''; //
        sendStatusType.value = ''; //
        chatStore.clearReplyingToMessage(); // Clear reply if session is lost
    }
});

// NEW: Watch for when a reply is initiated
watch(() => chatStore.replyingToMessage, (newReplyCtx) => {
    if (newReplyCtx && newReplyCtx.chatId) {
        // If SendImagePanel is the active way to send to the selected chat,
        // set its recipient to the chat of the message being replied to.
        recipient.value = newReplyCtx.chatId;
    }
    // Caption field is separate, so user can still type a new caption for the reply media.
    // No need to focus specific input here unless desired.
}, { deep: true });


function handleFileSelect(event) { selectedFile.value = event.target.files[0] || null; } //
function onMediaSourceChange() { //
  if (mediaSourceType.value === 'file') { //
    mediaUrl.value = ''; //
  } else {
    selectedFile.value = null; //
    const el = document.getElementById('mediaFileInput'); //
    if (el) el.value = ''; //
  }
}

// --- NEW: Cancel Reply ---
function cancelReply() {
    chatStore.clearReplyingToMessage();
}

async function handleSendMedia() {
  if (!sessionStore.currentSelectedSessionId || !sessionStore.selectedSessionData?.isReady) { //
    sendStatus.value = 'No active session or session not ready.'; //
    sendStatusType.value = 'error'; //
    return;
  }
  const currentRecipient = recipient.value.trim(); //
  if (!currentRecipient) { //
    sendStatus.value = 'Recipient required.'; //
    sendStatusType.value = 'error'; //
    return;
  }

  const formData = new FormData(); //
  formData.append('number', currentRecipient); //
  formData.append('caption', caption.value.trim()); //

  if (mediaSourceType.value === 'file') { //
    if (!selectedFile.value) { sendStatus.value = 'Media file required.'; sendStatusType.value = 'error'; return; } //
    formData.append('imageFile', selectedFile.value); //
  } else if (mediaSourceType.value === 'url') { //
    if (!mediaUrl.value.trim()) { sendStatus.value = 'Media URL required.'; sendStatusType.value = 'error'; return; } //
    formData.append('imageUrl', mediaUrl.value.trim()); //
  } else {
    sendStatus.value = 'Invalid media source.'; //
    sendStatusType.value = 'error'; //
    return;
  }

  isSending.value = true; //
  sendStatus.value = `Checking number ${currentRecipient}...`; //
  sendStatusType.value = 'info'; //

  try {
    const checkRes = await checkWhatsAppNumberApi(sessionStore.currentSelectedSessionId, currentRecipient); //

    if (checkRes.success && checkRes.isRegistered) { //
      sendStatus.value = `Number ${currentRecipient} is registered. Sending media...`; //
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
      const quotedMsgId = (chatStore.replyingToMessage && chatStore.replyingToMessage.chatId === typingChatId) 
                          ? chatStore.replyingToMessage.id 
                          : null;
      if (quotedMsgId) {
        formData.append('quotedMessageId', quotedMsgId);
      }
      
      const result = await sendImageApi(sessionStore.currentSelectedSessionId, formData); //
      if (result.success) { //
        sendStatus.value = result.message || (quotedMsgId ? 'Reply with media sent!' : 'Media sent!');
        sendStatusType.value = 'success'; //
        // Clear inputs or not, based on preference.
        // caption.value = ''; 
        // selectedFile.value = null; 
        // mediaUrl.value = '';
        // if (document.getElementById('mediaFileInput')) document.getElementById('mediaFileInput').value = '';

        if (quotedMsgId) {
            chatStore.clearReplyingToMessage(); // Clear reply state
        }
      } else {
        sendStatus.value = `Error sending: ${result.error || 'Failed.'}`; //
        sendStatusType.value = 'error'; //
      }
    } else if (checkRes.success && !checkRes.isRegistered) { //
      sendStatus.value = `Number ${currentRecipient} is not registered on WhatsApp. (Reason: ${checkRes.message || 'Not registered'}). Media not sent.`; //
      sendStatusType.value = 'error'; //
    } else { 
      sendStatus.value = `Could not verify number ${currentRecipient}: ${checkRes.error || 'Unknown error during check'}. Media not sent.`; //
      sendStatusType.value = 'error'; //
    }
  } catch (error) {
    console.error("Error sending media:", error); //
    sendStatus.value = `Client error: ${error.message}`; //
    sendStatusType.value = 'error'; //
  }
  isSending.value = false; //
}
</script>