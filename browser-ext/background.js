// Background script - handles HTTP requests for content script
const SERVER_URL = 'http://localhost:8080';

console.log('CodeSync: Background script loaded');

// Listen for messages from content script
browser.runtime.onMessage.addListener(async (message, sender) => {
	console.log('CodeSync BG: Received message:', message.type);

	if (message.type === 'SEND_TEMPLATE') {
		try {
			const response = await fetch(`${SERVER_URL}/template`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ code: message.code }),
			});

			if (response.ok) {
				console.log('CodeSync BG: Template sent successfully');
				return { success: true };
			} else {
				console.error('CodeSync BG: Server returned', response.status);
				return { success: false, error: 'Server error' };
			}
		} catch (error) {
			console.error('CodeSync BG: Failed to send template:', error);
			return { success: false, error: error.message };
		}
	}

	if (message.type === 'GET_SOLUTION') {
		try {
			const response = await fetch(`${SERVER_URL}/solution`);
			if (!response.ok) {
				return { success: false };
			}

			const data = await response.json();
			return { success: true, code: data.code };
		} catch (error) {
			return { success: false, error: error.message };
		}
	}

	return { success: false, error: 'Unknown message type' };
});
