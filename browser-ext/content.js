// Content script - runs on LeetCode problem pages
const SERVER_URL = 'http://localhost:8080';
let pollingInterval = null;
let lastSentTemplate = '';

console.log('CodeSync: Content script loaded');

// Wait for page to fully load and Monaco editor to be ready
function waitForEditor() {
	return new Promise((resolve) => {
		const checkInterval = setInterval(() => {
			// LeetCode uses Monaco editor - check for its presence
			const editor = document.querySelector('.monaco-editor');
			if (editor) {
				clearInterval(checkInterval);
				console.log('CodeSync: Editor found');
				resolve(true);
			}
		}, 500);

		// Timeout after 10 seconds
		setTimeout(() => {
			clearInterval(checkInterval);
			resolve(false);
		}, 10000);
	});
}

// Extract code from Monaco editor
function getEditorCode() {
	try {
		//Method 1: Try to get Monaco editor instance
		if (window.monaco && window.monaco.editor) {
			const models = window.monaco.editor.getModels();
			if (models && models.length > 0) {
				return models[0].getValue();
			}
		}

		//Method 2: Try to access through React fiber
		const editorElement = document.querySelector('.monaco-editor');
		if (editorElement) {
			//Try to find the textarea that Monaco uses
			const textarea = editorElement.querySelector('textarea');
			if (textarea && textarea.value) {
				return textarea.value;
			}

			// Try to get from the view lines
			const lines = editorElement.querySelectorAll('.view-line');
			if (lines.length > 0) {
				return Array.from(lines)
					.map(line => line.textContent)
					.join('\n');
			}
		}

		return null;
	} catch (error) {
		console.error('CodeSync: Error extracting code:', error);
		return null;
	}
}

// Send template to server
async function sendTemplate(code) {
	if (!code || code === lastSentTemplate) {
		return; // Don't send if empty or unchanged
	}

	try {
		const response = await fetch(`${SERVER_URL}/template`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ code }),
		});

		if (response.ok) {
			lastSentTemplate = code;
			console.log('CodeSync: Template sent to server');
		}
	} catch (error) {
		console.error('CodeSync: Failed to send template:', error);
	}
}

//Get solution from server and inject into editor
async function getSolutionAndInject() {
	try {
		const response = await fetch(`${SERVER_URL}/solution`);
		if (!response.ok) return;

		const data = await.response.json();
		if (!data.code) return;

		// Inject code into Monaco editor
		if (window.monaco && window.monaco.editor) {
			const models = window.monaco.getModels();
			if (models && models.length > 0) {
				models[0].setValue(data.code);
				console.log('CodeSync: Solution injected into editor');
				return;
			}
		}

		console.warn('CodeSync: Could not inject - editor not accessible');

	} catch (error) {
		console.error('CodeSync: Failed to get solution:', error);
	}
}

//Initialize: extract template when page loads
async function init() {
	const editorReady = await waitForEditor();

	if (!editorReady) {
		console.warn('CodeSync: Editor not found after timeout');
		return;
	}

	//Wait a bit more for code to load
	setTimeout(async () => {
		const code = getEditorCode();
		if (code) {
			console.log('CodeSync: Initial template extracted');
			await sendTemplate(code);
		}
	}, 2000);

	// Start polling for solutions every 2 seconds
	pollingInterval = setInterval(getSolutionAndInject, 2000);
	console.log('CodeSync: Started polling for solutions');
}

// Watch for editor changes and send updates
function watchForChanges() {
	// Watch for when user switches between problems
	const observer = new MutationObserver(async (mutations) => {
		// Check if URL changed (new problem loaded)
		const currentUrl = window.location.href;
		if (currentUrl.includes('/problems/') && !currentUrl.includes('/submissions/')) {
			setTimeout(async () => {
				const code = getEditorCode();
				if (code) {
					await sendTemplate(code);
				}
			}, 2000);
		}
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true
	});
}

// Start the extension
init();
watchForChanges();

//Cleanup on page unload
window.addEventListener('beforeunload', () => {
	if (pollingInterval) {
		clearInterval(pollingInterval);
	}
});
