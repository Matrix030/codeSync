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

			// Inject into page using executeScript - find the model with code
			await browser.tabs.executeScript(tab.id, {
				code: `
          (function() {
            const code = ${JSON.stringify(data.code)};
            if (window.monaco && window.monaco.editor) {
              const models = window.monaco.editor.getModels();
              if (models && models.length > 0) {
                let targetModel = models[0];
                for (let i = 0; i < models.length; i++) {
                  const val = models[i].getValue();
                  if (val && val.trim().length > 0) {
                    targetModel = models[i];
                    break;
                  }
                }
                targetModel.setValue(code);
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

	if (message.type === 'CHECK_TEMPLATE_NEEDED') {
		// Check if server needs a template
		return (async () => {
			try {
				const response = await fetch(`${SERVER_URL}/template-needed`);
				if (!response.ok) {
					return { needed: false };
				}

				const data = await response.json();
				return { needed: data.needed };
			} catch (error) {
				return { needed: false };
			}
		})();
	}

	if (message.type === 'INJECT_SOLUTION') {
		// Handle injection via executeScript that injects into page context
		return (async () => {
			try {
				const codeToInject = message.code;
				console.log('CodeSync BG: Injecting solution (' + codeToInject.length + ' chars) into tab', sender.tab.id);

				// Use a simpler approach: store code in a hidden element, then read it in page context
				const result = await browser.tabs.executeScript(sender.tab.id, {
					code: `
            (function() {
              // Store code in a hidden element
              const dataEl = document.createElement('div');
              dataEl.id = '__codesync_data__';
              dataEl.style.display = 'none';
              dataEl.textContent = ${JSON.stringify(codeToInject)};
              document.body.appendChild(dataEl);

              // Inject script into page context - find the model with code and update it
              const script = document.createElement('script');
              script.textContent = '(function(){const code=document.getElementById("__codesync_data__").textContent;if(window.monaco&&window.monaco.editor){const models=window.monaco.editor.getModels();if(models&&models.length>0){let targetModel=models[0];for(let i=0;i<models.length;i++){const val=models[i].getValue();if(val&&val.trim().length>0){targetModel=models[i];break;}}targetModel.setValue(code);console.log("CodeSync: ✓ Injected "+code.length+" chars");}}else{console.warn("CodeSync: Monaco not found");}document.getElementById("__codesync_data__").remove();})()';
              document.documentElement.appendChild(script);
              script.remove();
              return true;
            })()
          `
				});

				console.log('CodeSync BG: Injection executed');
				return { success: true };
			} catch (error) {
				console.error('CodeSync BG: Injection error:', error);
				return { success: false, error: error.message };
			}
		})();
	}

	return Promise.resolve({ success: false, error: 'Unknown message type' });
});
