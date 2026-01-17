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

// Extract code from Monaco editor
function getEditorCode() {
	try {
		// Method 1: Try global window.monaco API first (best quality)
		if (typeof window.monaco === 'object' && window.monaco !== null && window.monaco.editor) {

			if (typeof window.monaco.editor.getModels === 'function') {
				const models = window.monaco.editor.getModels();

				if (models && models.length > 0) {
					let code = models[0].getValue();
					if (code && code.trim().length > 0) {
						code = code.split('').map(c => {
							const charCode = c.charCodeAt(0);
							if (charCode === 160) return ' ';
							return c;
						}).join('');
						console.log('CodeSync: Extracted', code.length, 'chars from Monaco model');
						return code;
					}
				}
			}
		}

		// Method 2: Extract from DOM view-lines (works but may have formatting issues)
		console.log('CodeSync: Trying view-line extraction...');
		const editorElement = document.querySelector('.monaco-editor');

		if (editorElement) {
			const lines = editorElement.querySelectorAll('.view-line');
			console.log('CodeSync: Found', lines.length, 'view lines');

			if (lines.length > 0) {
				let code = Array.from(lines)
					.map(line => line.textContent)
					.join('\n');

				if (code && code.trim().length > 0) {
					// Clean non-breaking spaces
					code = code.split('').map(c => {
						const charCode = c.charCodeAt(0);
						if (charCode === 160) return ' ';
						return c;
					}).join('');

					console.log('CodeSync: Extracted', code.length, 'chars from view-lines');
					return code;
				}
			}
		}

		console.warn('CodeSync: Could not extract code');
		return null;
	} catch (error) {
		console.error('CodeSync: Error extracting code:', error);
		return null;
	}
}

// Send template to server via background script
async function sendTemplate(code) {
	if (!code || code === lastSentTemplate) {
		return; // Don't send if empty or unchanged
	}

	// Clean non-breaking spaces at character level (same as extraction)
	code = code.split('').map(c => {
		const charCode = c.charCodeAt(0);
		if (charCode === 160) return ' '; // non-breaking space
		return c;
	}).join('');

	try {
		// Send message to background script which can access localhost
		const response = await browser.runtime.sendMessage({
			type: 'SEND_TEMPLATE',
			code: code
		});

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
let injectionWarningShown = false;

async function getSolutionAndInject() {
	try {
		// Use background script to fetch solution
		const response = await browser.runtime.sendMessage({
			type: 'GET_SOLUTION'
		});

		if (!response || !response.success || !response.code || response.code.trim().length === 0) {
			// No solution yet, silently return
			return;
		}

		const code = response.code;

		// Don't inject if we just injected this exact code
		if (code === lastInjectedCode) {
			return;
		}

		// Get current editor content to check if injection is needed
		const currentCode = getEditorCode();
		if (currentCode === code) {
			// Already matches, don't inject
			lastInjectedCode = code;
			return;
		}

		// Try Method 1: Monaco API if available  
		if (window.monaco && window.monaco.editor) {
			if (typeof window.monaco.editor.getModels === 'function') {
				const models = window.monaco.editor.getModels();
				if (models && models.length > 0) {
					models[0].setValue(code);
					lastInjectedCode = code;
					injectionWarningShown = false; // Reset warning
					console.log('CodeSync: Solution injected via Monaco API (' + code.length + ' chars)');
					return;
				}
			}
		}

		// Method 2: Can't inject - show warning only once
		if (!injectionWarningShown) {
			console.log('CodeSync: Automatic injection not available - use manual "Inject Solution" button');
			injectionWarningShown = true;
		}

	} catch (error) {
		if (error.name !== 'TypeError') {
			console.error('CodeSync: Failed to get solution:', error);
		}
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

	console.log('CodeSync: Editor detected, waiting for code to load...');

	// Wait longer for LeetCode to load the problem code
	setTimeout(async () => {
		const code = getEditorCode();
		console.log('CodeSync: First attempt - got', code ? code.length : 0, 'chars');
		if (code && code.trim().length > 20) { // Lower threshold
			console.log('CodeSync: Initial template extracted (' + code.length + ' chars)');
			await sendTemplate(code);
		} else {
			console.log('CodeSync: Waiting longer...');

			// Try again with more delay
			setTimeout(async () => {
				const code2 = getEditorCode();
				console.log('CodeSync: Second attempt - got', code2 ? code2.length : 0, 'chars');
				if (code2 && code2.trim().length > 20) {
					console.log('CodeSync: Template extracted on retry (' + code2.length + ' chars)');
					await sendTemplate(code2);
				} else {
					console.log('CodeSync: Final attempt...');

					// Final attempt
					setTimeout(async () => {
						const code3 = getEditorCode();
						console.log('CodeSync: Final attempt - got', code3 ? code3.length : 0, 'chars');
						if (code3 && code3.trim().length > 0) {
							console.log('CodeSync: Template extracted on final try (' + code3.length + ' chars)');
							await sendTemplate(code3);
						} else {
							console.warn('CodeSync: No code found - use manual fetch button');
						}
					}, 5000);
				}
			}, 5000);
		}
	}, 5000); // Increased from 3s to 5s

	console.log('CodeSync: Initialization complete - auto-injection handled by background');
}

// Start the extension
init();
