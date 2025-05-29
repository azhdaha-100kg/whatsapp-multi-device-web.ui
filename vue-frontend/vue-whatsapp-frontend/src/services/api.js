// src/services/api.js
const BASE_URL = process.env.NODE_ENV === 'production'
    ? 'http://143.198.216.76:3000' // Replace with your actual production backend URL
    : (import.meta.env.VITE_API_BASE_URL || 'http://143.198.216.76:3000'); // Use Vite env var or fallback for dev

/**
 * Generic request helper function.
 * @param {string} endpoint - The API endpoint (e.g., '/sessions').
 * @param {object} options - Fetch options (method, body, headers, etc.).
 * @param {boolean} isLogin - Flag to indicate if this is the login request itself.
 * @returns {Promise<object>} - The JSON response or an error object.
 */
async function request(endpoint, options = {}, isLogin = false) {
    const url = `${BASE_URL}${endpoint}`;
    
    const headers = { ...options.headers };

    if (!isLogin) {
        const token = localStorage.getItem('authToken');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    }

    if (!(options.body instanceof FormData) && options.body) {
        headers['Content-Type'] = 'application/json';
    }

    const config = {
        ...options,
        headers,
    };

    try {
        const response = await fetch(url, config);
        const contentType = response.headers.get("content-type");
        let responseData;

        if (response.status === 401 && !isLogin) {
            console.error('API Request Unauthorized (401). Token might be invalid or expired.');
            // Consider dispatching a logout action from your authStore here
            // Example:
            // const authStore = useAuthStore(); // This won't work directly here due to setup context
            // window.dispatchEvent(new CustomEvent('auth-error-401')); // Then listen in App.vue
            return { success: false, error: 'Unauthorized. Please login again.', status: response.status };
        }

        if (contentType && contentType.indexOf("application/json") !== -1) {
            responseData = await response.json();
        } else {
            responseData = await response.text();
        }

        if (!response.ok) {
            const errorMessage = (typeof responseData === 'object' && responseData && responseData.error) 
                                 ? responseData.error 
                                 : (typeof responseData === 'string' && responseData ? responseData : `HTTP error! Status: ${response.status}`);
            console.error(`API Error for ${endpoint}: ${response.status} - ${errorMessage}`);
            return { success: false, error: errorMessage, status: response.status, data: responseData };
        }

        if (typeof responseData === 'object' && responseData !== null) {
            return responseData.success !== undefined ? responseData : { success: true, ...responseData };
        } else {
            return { success: true, data: responseData };
        }
    } catch (error) {
        console.error(`Network Error or API request failed for ${endpoint}:`, error);
        return { success: false, error: error.message || 'Network error or request failed.' };
    }
}

// --- Authentication API Call ---
export const loginApi = (credentials) => {
    return request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
    }, true);
};


// --- Session Management API Calls ---
export const initSessionApi = (sessionId) => {
    return request(`/session/init/${sessionId}`, { method: 'POST' });
};

export const getSessionsApi = () => {
    return request('/sessions');
};

export const removeSessionApi = (sessionId) => {
    return request(`/session/remove/${sessionId}`, { method: 'POST' });
};

export const checkWhatsAppNumberApi = (sessionId, numberToCheck) => {
    return request(`/session/is-registered/${sessionId}/${encodeURIComponent(numberToCheck)}`, { method: 'GET' });
};

// --- Feature-Specific API Calls ---
// MODIFIED sendMessageApi
export const sendMessageApi = (sessionId, recipient, message, quotedMessageId = null) => {
    const payload = {
        number: recipient,
        message: message
    };
    if (quotedMessageId) {
        payload.quotedMessageId = quotedMessageId;
    }
    return request(`/session/send-message/${sessionId}`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

// MODIFIED sendImageApi (though FormData handling for quotedMessageId is done in the component)
// The backend will pick up 'quotedMessageId' if it's part of the FormData
export const sendImageApi = (sessionId, formData) => { // formData should contain 'number', 'caption', 'imageFile'/'imageUrl', and optionally 'quotedMessageId'
    return request(`/session/send-image/${sessionId}`, {
        method: 'POST',
        body: formData
    });
};

export const getChatsApi = (sessionId) => {
    return request(`/session/chats/${sessionId}`);
};

export const getContactInfoApi = (sessionId, contactId) => {
    return request(`/session/contact-info/${sessionId}/${encodeURIComponent(contactId)}`);
};

export const sendLocationApi = (sessionId, recipient, latitude, longitude, description) => {
    return request(`/session/send-location/${sessionId}`, {
        method: 'POST',
        body: JSON.stringify({
            number: recipient,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            description: description
        }),
    });
};

export const setStatusApi = (sessionId, statusMessage) => {
    return request(`/session/set-status/${sessionId}`, {
        method: 'POST',
        body: JSON.stringify({ statusMessage }),
    });
};

export const sendTypingStateApi = (sessionId, chatId) => {
    return request(`/session/${sessionId}/chat/${chatId}/send-typing`, {
        method: 'POST',
    });
};

export const sendSeenApi = (sessionId, chatId) => {
    return request(`/session/${sessionId}/chat/${chatId}/send-seen`, {
        method: 'POST',
    });
};

export const setPresenceOnlineApi = (sessionId) => {
    return request(`/session/${sessionId}/set-presence-online`, {
        method: 'POST',
    });
};