// Background script - handles HTTP requests for content script
const SERVER_URL = 'http://localhost:8080';

console.log('CodeSync: Background script loaded');

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
					console.log('CodeSync BG: GET_SOLUTION - server returned', response.status);
					return { success: false };
				}

				const data = await response.json();
				console.log('CodeSync BG: GET_SOLUTION - got', data.code ? data.code.length : 0, 'chars');
				return { success: true, code: data.code };
			} catch (error) {
				console.error('CodeSync BG: GET_SOLUTION error:', error);
				return { success: false, error: error.message };
			}
		})();
	}

	if (message.type === 'INJECT_SOLUTION') {
		// Handle injection via executeScript (has proper permissions)
		return (async () => {
			try {
				const code = message.code;
				console.log('CodeSync BG: Injecting solution (' + code.length + ' chars) into tab', sender.tab.id);

				// Inject into the sender tab
				const result = await browser.tabs.executeScript(sender.tab.id, {
					code: `
            (function() {
              const code = ${JSON.stringify(code)};
              console.log('CodeSync: Injection script running...');
              console.log('CodeSync: window.monaco?', typeof window.monaco);
              
              if (window.monaco && window.monaco.editor) {
                console.log('CodeSync: monaco.editor exists');
                const models = window.monaco.editor.getModels();
                console.log('CodeSync: Models count:', models ? models.length : 0);
                
                if (models && models.length > 0) {
                  const currentCode = models[0].getValue();
                  console.log('CodeSync: Current:', currentCode.length, 'New:', code.length);
                  
                  if (currentCode !== code) {
                    models[0].setValue(code);
                    console.log('CodeSync: ✓ INJECTED!');
                    return true;
                  } else {
                    console.log('CodeSync: Already matches');
                    return true;
                  }
                }
              }
              console.warn('CodeSync: ✗ Monaco not available');
              return false;
            })()
          `
				});

				console.log('CodeSync BG: Result:', result);
				return { success: true };
			} catch (error) {
				console.error('CodeSync BG: Injection error:', error);
				return { success: false, error: error.message };
			}
		})();
	}
} catch (error) {
	console.error('CodeSync BG: Injection failed:', error);
	return { success: false, error: error.message };
}
    }) ();
  }

return Promise.resolve({ success: false, error: 'Unknown message type' });
});
