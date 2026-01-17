// Content script - runs on LeetCode problem pages
const SERVER_URL = 'http://localhost:8080';
let pollingInterval = null;
let lastSentTemplate = '';

console.log('CodeSync: Content script loaded');

// Wait for page to fully load and Monaco editor to be ready
function waitForEditor() {
	return new Promise((resolve) => {
		let attempts = 0;
		const maxAttempts = 30; // 15 seconds total

		const checkInterval = setInterval(() => {
			attempts++;

			// Just look for Monaco editor DOM element with content
			const editorElement = document.querySelector('.monaco-editor');

			if (editorElement) {
				const lines = editorElement.querySelectorAll('.view-line');

				if (lines && lines.length > 0) {
					console.log('CodeSync: Monaco editor ready with', lines.length, 'lines');
					clearInterval(checkInterval);
					resolve(true);
					return;
				}
			}

			if (attempts % 5 === 0) {
				console.log('CodeSync: Waiting for editor content... (attempt', attempts + ')');
			}

			if (attempts >= maxAttempts) {
				clearInterval(checkInterval);
				console.log('CodeSync: Proceeding anyway after', attempts, 'attempts');
				resolve(true);
			}
		}, 500);
	});
}

// Extract code from Monaco editor by injecting into page context
function getEditorCode() {
	return new Promise((resolve) => {
		// Create a unique ID for this extraction request
		const requestId = 'codesync-extract-' + Date.now();

		// Listen for the response from injected script
		const handler = (event) => {
			if (event.detail && event.detail.requestId === requestId) {
				document.removeEventListener('codesync-code-extracted', handler);
				let code = event.detail.code;
				if (code) {
					// Clean non-breaking spaces
					code = code.split('').map(c => {
						const charCode = c.charCodeAt(0);
						if (charCode === 160) return ' ';
						return c;
					}).join('');
					console.log('CodeSync: Extracted', code.length, 'chars from Monaco model');
				}
				resolve(code);
			}
		};
		document.addEventListener('codesync-code-extracted', handler);

		// Inject script into page context to access window.monaco
		const script = document.createElement('script');
		script.textContent = `
			(function() {
				let code = null;
				try {
					if (window.monaco && window.monaco.editor && window.monaco.editor.getModels) {
						const models = window.monaco.editor.getModels();
						if (models && models.length > 0) {
							code = models[0].getValue();
						}
					}
				} catch (e) {
					console.error('CodeSync: Error in page context:', e);
				}
				document.dispatchEvent(new CustomEvent('codesync-code-extracted', {
					detail: { requestId: '${requestId}', code: code }
				}));
			})();
		`;
		document.documentElement.appendChild(script);
		script.remove();

		// Timeout fallback
		setTimeout(() => {
			document.removeEventListener('codesync-code-extracted', handler);
			resolve(null);
		}, 1000);
	});
}

// Send template to server via background script
async function sendTemplate(code) {
	console.log('CodeSync: sendTemplate called with', code ? code.length : 0, 'chars');

	if (!code) {
		console.log('CodeSync: No code to send');
		return;
	}

	if (code === lastSentTemplate) {
		console.log('CodeSync: Template unchanged, skipping');
		return;
	}

	// Clean non-breaking spaces at character level (same as extraction)
	code = code.split('').map(c => {
		const charCode = c.charCodeAt(0);
		if (charCode === 160) return ' '; // non-breaking space
		return c;
	}).join('');

	console.log('CodeSync: Sending template to background script...');

	try {
		// Send message to background script which can access localhost
		const response = await browser.runtime.sendMessage({
			type: 'SEND_TEMPLATE',
			code: code
		});

		console.log('CodeSync: Background response:', response);

		if (response && response.success) {
			lastSentTemplate = code;
			console.log('CodeSync: Template sent to server (' + code.length + ' chars)');
		} else {
			console.error('CodeSync: Failed to send template:', response ? response.error : 'No response');
		}
	} catch (error) {
		console.error('CodeSync: Failed to send template:', error);
	}
}

// Get solution from server and inject into editor
let lastInjectedCode = '';

async function getSolutionAndInject() {
	try {
		// Use background script to fetch solution
		const response = await browser.runtime.sendMessage({
			type: 'GET_SOLUTION'
		});

		if (!response || !response.success) {
			// No response or failed
			return;
		}

		if (!response.code || response.code.trim().length === 0) {
			// No solution yet
			return;
		}

		const code = response.code;

		// Don't inject if we just injected this exact code
		if (code === lastInjectedCode) {
			return;
		}

		console.log('CodeSync: New solution detected (' + code.length + ' chars), requesting injection...');

		// Ask background script to inject (it has executeScript permissions)
		const injectResponse = await browser.runtime.sendMessage({
			type: 'INJECT_SOLUTION',
			code: code
		});

		if (injectResponse && injectResponse.success) {
			lastInjectedCode = code;
			console.log('CodeSync: Injection successful!');
		} else {
			console.error('CodeSync: Injection failed:', injectResponse);
		}

	} catch (error) {
		console.error('CodeSync: Polling error:', error);
	}
}

// Initialize: extract template when page loads
async function init() {
	console.log('CodeSync: Initializing...');

	const editorReady = await waitForEditor();

	if (!editorReady) {
		console.warn('CodeSync: Editor not found after timeout');
		return;
	}

	console.log('CodeSync: Editor detected');

	// Don't auto-extract template - wait for Neovim to request it
	console.log('CodeSync: Ready - waiting for commands from Neovim');

	// Poll to check if server needs a template
	setInterval(async () => {
		try {
			const response = await browser.runtime.sendMessage({ type: 'CHECK_TEMPLATE_NEEDED' });
			if (response && response.needed) {
				console.log('CodeSync: Server needs template, extracting...');
				const code = await getEditorCode();
				if (code) {
					await sendTemplate(code);
				}
			}
		} catch (e) {
			// Silently fail
		}
	}, 1000); // Check every second

	// Start polling for solutions
	pollingInterval = setInterval(getSolutionAndInject, 2000);
	console.log('CodeSync: Started polling for solutions every 2s');
}

// Start the extension
init();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
	if (pollingInterval) {
		clearInterval(pollingInterval);
	}
});
