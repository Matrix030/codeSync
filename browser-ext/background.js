// Background script - handles HTTP requests for content script
const SERVER_URL = 'http://localhost:8080';

console.log('CodeSync: Background script loaded');

let lastInjectedCode = '';

// Automatic injection polling - runs every 2 seconds
async function pollAndInject() {
	try {
		// Get active tab
		const tabs = await browser.tabs.query({ active: true, currentWindow: true });
		if (tabs.length === 0) return;

		const tab = tabs[0];

		// Only inject on LeetCode pages
		if (!tab.url || !tab.url.includes('leetcode.com/problems/')) {
			return;
		}

		// Fetch solution from server
		const response = await fetch(`${SERVER_URL}/solution`);
		const data = await response.json();

		if (!data.code || data.code.trim().length === 0) {
			return; // No solution yet
		}

		// Don't inject if same as last time
		if (data.code === lastInjectedCode) {
			return;
		}

		// Inject into page
		await browser.tabs.executeScript(tab.id, {
			code: `
        (function() {
          const code = ${JSON.stringify(data.code)};
          if (window.monaco && window.monaco.editor) {
            const models = window.monaco.editor.getModels();
            if (models && models.length > 0) {
              const currentCode = models[0].getValue();
              if (currentCode !== code) {
                models[0].setValue(code);
                console.log('CodeSync: Solution auto-injected (' + code.length + ' chars)');
              }
              return true;
            }
          }
          return false;
        })()
      `
		});

		lastInjectedCode = data.code;
		console.log('CodeSync BG: Auto-injected solution (' + data.code.length + ' chars)');

	} catch (error) {
		// Silently fail - might not be on LeetCode page
	}
}

// Start polling every 2 seconds
setInterval(pollAndInject, 2000);
console.log('CodeSync: Auto-injection polling started');

// Listen for keyboard commands
browser.commands.onCommand.addListener(async (command) => {
	if (command === 'inject-solution') {
		console.log('CodeSync BG: Inject shortcut triggered');

		// Get active tab
		const tabs = await browser.tabs.query({ active: true, currentWindow: true });
		if (tabs.length === 0) return;

		const tab = tabs[0];

		// Fetch solution from server
		try {
			const response = await fetch(`${SERVER_URL}/solution`);
			const data = await response.json();

			if (!data.code) {
				console.log('CodeSync BG: No solution available');
				return;
			}

			// Inject into page using executeScript
			await browser.tabs.executeScript(tab.id, {
				code: `
          (function() {
            const code = ${JSON.stringify(data.code)};
            if (window.monaco && window.monaco.editor) {
              const models = window.monaco.editor.getModels();
              if (models && models.length > 0) {
                models[0].setValue(code);
                console.log('CodeSync: Solution injected via keyboard shortcut!');
                return true;
              }
            }
            console.warn('CodeSync: Could not inject - Monaco not available');
            return false;
          })()
        `
			});

			console.log('CodeSync BG: Injection executed');
		} catch (error) {
			console.error('CodeSync BG: Injection failed:', error);
		}
	}
});

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, sender) => {
	console.log('CodeSync BG: Received message:', message.type);

	if (message.type === 'SEND_TEMPLATE') {
		// Return a promise for async handling
		return (async () => {
			try {
				console.log('CodeSync BG: Sending template to server...', message.code.length, 'chars');
				const response = await fetch(`${SERVER_URL}/template`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ code: message.code }),
				});

				if (response.ok) {
					console.log('CodeSync BG: Template sent successfully to server');
					return { success: true };
				} else {
					console.error('CodeSync BG: Server returned', response.status);
					return { success: false, error: 'Server error' };
				}
			} catch (error) {
				console.error('CodeSync BG: Failed to send template:', error);
				return { success: false, error: error.message };
			}
		})();
	}

	if (message.type === 'GET_SOLUTION') {
		// Return a promise for async handling
		return (async () => {
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
		})();
	}

	return Promise.resolve({ success: false, error: 'Unknown message type' });
});
