<template>
  <section id="bulkSendPanel" class="feature-panel p-1 md:p-2 mb-6">
    <h3 class="text-lg font-semibold mb-3 text-slate-700 dark:text-slate-200">Bulk Send Message</h3>
    <form @submit.prevent="handleBulkSend" class="space-y-4" ref="bulkSendFormElement">
        <div>
            <label for="panelBulkRecipients" class="block text-sm font-medium text-slate-600 dark:text-slate-400">Recipients (comma/newline):</label>
            <textarea id="panelBulkRecipients" v-model="recipients" rows="3" required class="form-textarea" placeholder="e.g., 123..., 456..."></textarea> </div>
        <div>
            <label for="panelBulkMessageText" class="block text-sm font-medium text-slate-600 dark:text-slate-400">Message Text (Also used as caption if sending media):</label>
            <textarea id="panelBulkMessageText" v-model="messageText" rows="2" class="form-textarea"></textarea> </div>

        <div>
            <label for="panelBulkSendInterval" class="block text-sm font-medium text-slate-600 dark:text-slate-400">Time Interval (seconds):</label>
            <input
                type="number"
                id="panelBulkSendInterval"
                v-model.number="sendIntervalSeconds"
                class="form-input"
                min="1"
                placeholder="e.g., 5"
                required
            />
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Delay in seconds between sending each message.</p>
        </div>

        <hr class="my-2 border-gray-200 dark:border-slate-700"> <h4 class="text-base font-medium text-gray-600 dark:text-slate-300">Optional Media (Image/Video):</h4> <div class="my-2">
            <span class="text-sm font-medium text-slate-600 dark:text-slate-400">Source:</span> <div class="mt-1 flex items-center space-x-4">
                <label class="inline-flex items-center">
                    <input type="radio" class="form-radio" name="bulkMediaSourceType" value="none" v-model="mediaSourceType" @change="onMediaSourceChange"> <span class="ml-2 text-sm text-slate-700 dark:text-slate-300">None</span> </label>
                <label class="inline-flex items-center">
                    <input type="radio" class="form-radio" name="bulkMediaSourceType" value="file" v-model="mediaSourceType" @change="onMediaSourceChange"> <span class="ml-2 text-sm text-slate-700 dark:text-slate-300">Upload</span> </label>
                <label class="inline-flex items-center">
                    <input type="radio" class="form-radio" name="bulkMediaSourceType" value="url" v-model="mediaSourceType" @change="onMediaSourceChange"> <span class="ml-2 text-sm text-slate-700 dark:text-slate-300">URL</span> </label>
            </div>
        </div>
        <div v-show="mediaSourceType === 'file'">
            <label for="panelBulkMediaFileInput" class="block text-sm font-medium text-slate-600 dark:text-slate-400">Media File:</label> <input type="file" id="panelBulkMediaFileInput" @change="handleFileSelect" accept="image/*,video/*" class="file-input-styled"> </div>
        <div v-show="mediaSourceType === 'url'">
            <label for="panelBulkMediaUrlInput" class="block text-sm font-medium text-slate-600 dark:text-slate-400">Media URL:</label> <input type="url" id="panelBulkMediaUrlInput" v-model="mediaUrl" class="form-input" placeholder="https://example.com/media.mp4"> </div>

        <button type="submit" class="btn btn-purple" :disabled="isSending">{{ isSending ? 'Sending Bulk...' : 'Start Bulk Send' }}</button> </form>
    <div id="panelBulkSendResponse" class="mt-3 text-sm"> <p :class="overallStatusType === 'error' ? 'text-red-500 dark:text-red-400' : (overallStatusType === 'success' ? 'text-green-500 dark:text-green-400' : 'text-slate-600 dark:text-slate-400')">{{ overallStatus }}</p> <div id="panelBulkSendResultsLog" class="mt-2 max-h-32 overflow-y-auto border border-gray-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-700/40 rounded text-xs custom-scrollbar"> <div v-for="(log, index) in resultsLog" :key="index" :class="log.type === 'error' ? 'text-red-500 dark:text-red-400' : (log.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400')">{{ log.message }}</div> </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { useSessionStore } from '../../stores/sessionStore';
import { sendMessageApi, sendImageApi, sendTypingStateApi, checkWhatsAppNumberApi } from '../../services/api';

const sessionStore = useSessionStore();
const recipients = ref('');
const messageText = ref('');
const mediaSourceType = ref('none');
const selectedMediaFile = ref(null);
const mediaUrl = ref('');
const sendIntervalSeconds = ref(5); 

const isSending = ref(false);
const overallStatus = ref('Status will appear here.');
const overallStatusType = ref('');
const resultsLog = ref([]);
const bulkSendFormElement = ref(null);

function handleFileSelect(event) { selectedMediaFile.value = event.target.files[0] || null; }
function onMediaSourceChange() {
  if (mediaSourceType.value === 'file') {
    mediaUrl.value = '';
  } else if (mediaSourceType.value === 'url') {
    selectedMediaFile.value = null;
    const fileInput = document.getElementById('panelBulkMediaFileInput');
    if (fileInput) fileInput.value = '';
  } else {
    selectedMediaFile.value = null;
    mediaUrl.value = '';
    const fileInput = document.getElementById('panelBulkMediaFileInput');
    if (fileInput) fileInput.value = '';
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleBulkSend() {
  if (!sessionStore.currentSelectedSessionId || !sessionStore.selectedSessionData?.isReady) {
    overallStatus.value = 'Select a ready session first.';
    overallStatusType.value = 'error';
    return;
  }
  const recipientsArray = recipients.value.trim().split(/[\n,]+/).map(r => r.trim()).filter(r => r);
  if (recipientsArray.length === 0) {
    overallStatus.value = 'Recipients are required.';
    overallStatusType.value = 'error';
    return;
  }
  if (typeof sendIntervalSeconds.value !== 'number' || sendIntervalSeconds.value < 1) {
    overallStatus.value = 'Interval must be a number and at least 1 second.';
    overallStatusType.value = 'error';
    return;
  }

  const currentMessageText = messageText.value.trim();
  if (!currentMessageText && mediaSourceType.value === 'none') {
    overallStatus.value = 'Message text or media is required.';
    overallStatusType.value = 'error';
    return;
  }
  let currentMediaFile = selectedMediaFile.value;
  let currentMediaUrl = mediaUrl.value.trim();
  if (mediaSourceType.value === 'file' && !currentMediaFile) {
    overallStatus.value = 'Media file is required for upload source.';
    overallStatusType.value = 'error';
    return;
  }
  if (mediaSourceType.value === 'url' && !currentMediaUrl) {
    overallStatus.value = 'Media URL is required for URL source.';
    overallStatusType.value = 'error';
    return;
  }

  isSending.value = true;
  overallStatus.value = `Starting bulk send to ${recipientsArray.length} recipients...`;
  overallStatusType.value = 'info';
  resultsLog.value = [];
  if (bulkSendFormElement.value) bulkSendFormElement.value.querySelectorAll('input, textarea, button').forEach(el => el.disabled = true);
  
  let successes = 0, failures = 0;

  for (let i = 0; i < recipientsArray.length; i++) {
    const recipientTarget = recipientsArray[i];
    resultsLog.value.push({ message: `Processing ${recipientTarget}... `, type: 'info' });
    let currentLogIndex = resultsLog.value.length - 1;
    let messageSentSuccessfullyInThisIteration = false; // Flag for this iteration

    const recipientChatId = recipientTarget.includes('@') ? recipientTarget : `${recipientTarget.replace(/\D/g, '')}@c.us`;

    // Step 1: Check if number is registered on WhatsApp
    let isRegistered = false;
    try {
      resultsLog.value[currentLogIndex].message += 'Checking number... ';
      const checkResponse = await checkWhatsAppNumberApi(sessionStore.currentSelectedSessionId, recipientTarget);
      if (checkResponse.success && checkResponse.isRegistered) {
        isRegistered = true;
        resultsLog.value[currentLogIndex].message += 'Registered. ';
      } else {
        resultsLog.value[currentLogIndex].message += `Not registered (${checkResponse.message || checkResponse.error || 'Unknown'}). Skipping.`;
        resultsLog.value[currentLogIndex].type = 'error';
        failures++;
        overallStatus.value = `Processed ${i + 1}/${recipientsArray.length}. OK: ${successes}, Fail: ${failures}.`;
        continue; // Skip to the next recipient immediately, no delay
      }
    } catch (e) {
      resultsLog.value[currentLogIndex].message += `Error checking number: ${e.message}. Skipping.`;
      resultsLog.value[currentLogIndex].type = 'error';
      failures++;
      overallStatus.value = `Processed ${i + 1}/${recipientsArray.length}. OK: ${successes}, Fail: ${failures}.`;
      continue; // Skip to the next recipient immediately, no delay
    }

    // Step 2: Send Typing Indicator (if enabled and number registered)
    if (sessionStore.sessionFeatureToggles.isTypingIndicatorEnabled) {
      try { 
        await sendTypingStateApi(sessionStore.currentSelectedSessionId, recipientChatId);
      } catch (e) { 
        console.warn(`Could not send typing state to ${recipientChatId}`, e);
      }
    }

    // Step 3: Send Message/Media (if number registered)
    resultsLog.value[currentLogIndex].message += 'Sending... ';
    let result = { success: false, error: 'No action taken' };
    let actionTaken = false;
    let logMessageSuffix = '';
    
    if (mediaSourceType.value !== 'none') {
      actionTaken = true;
      const fd = new FormData();
      fd.append('number', recipientTarget);
      fd.append('caption', currentMessageText || ''); 
      if (currentMediaFile) {
        fd.append('imageFile', currentMediaFile);
      } else if (currentMediaUrl) {
        fd.append('imageUrl', currentMediaUrl);
      }
      result = await sendImageApi(sessionStore.currentSelectedSessionId, fd);
      logMessageSuffix = currentMessageText ? 'media with caption' : 'media';
    } else if (currentMessageText) {
      actionTaken = true;
      result = await sendMessageApi(sessionStore.currentSelectedSessionId, recipientTarget, currentMessageText);
      logMessageSuffix = 'text';
    }

    if (actionTaken) {
      if (result.success) {
        resultsLog.value[currentLogIndex].message += `Sent ${logMessageSuffix}!`;
        resultsLog.value[currentLogIndex].type = 'success';
        successes++;
        messageSentSuccessfullyInThisIteration = true; // Mark as successful send
      } else {
        resultsLog.value[currentLogIndex].message += `Failed to send: ${result.error || 'Unknown error'}`;
        resultsLog.value[currentLogIndex].type = 'error';
        failures++;
      }
    } else { 
      resultsLog.value[currentLogIndex].message += 'Skipped (no message/media specified).';
      resultsLog.value[currentLogIndex].type = 'info';
      failures++; 
    }
    
    overallStatus.value = `Processed ${i + 1}/${recipientsArray.length}. OK: ${successes}, Fail: ${failures}.`;

    // --- MODIFIED DELAY LOGIC ---
    // Only wait if a message was actually sent in this iteration AND it's not the last recipient
    if (messageSentSuccessfullyInThisIteration && i < recipientsArray.length - 1) {
      resultsLog.value.push({ message: `Waiting for ${sendIntervalSeconds.value}s before next message...`, type: 'info' });
      await delay(sendIntervalSeconds.value * 1000);
    }
  }

  overallStatus.value = `Bulk send complete. Total: ${recipientsArray.length}, OK: ${successes}, Fail: ${failures}.`;
  overallStatusType.value = failures > 0 ? 'error' : (successes > 0 ? 'success' : 'info');
  isSending.value = false;
  if (bulkSendFormElement.value) bulkSendFormElement.value.querySelectorAll('input, textarea, button').forEach(el => el.disabled = false);
}
</script>