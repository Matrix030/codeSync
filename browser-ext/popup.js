// Popup script
const SERVER_URL = 'http://localhost:8080';

//Check server status
async function checkServerStatus() {
	const statusEL = document.getElementById('status');
	try {
		const response = await fetch(`${SERVER_URL}/solution`);
		if (response.ok) {
			statusEL.textContent = 'Server connected';
			statusEL.className = 'status active';
		} else {
			statusEL.textContent = 'Server error';
			statusEL.className = 'status inactive';
		}
	} catch (error) {
		statusEL.textContent = 'Server not running';
		statusEL.className = 'status inactive';

	}
}

// Fetch template from current page
document.getElementById('fetchBtn').addEventListener('click', async () => {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

	const result = await browser.tabs.executeScript(tab.id, {
		code: `
      (function() {
        function getEditorCode() {
          if (window.monaco && window.monaco.editor) {
            const models = window.monaco.editor.getModels();
            if (models && models.length > 0) {
              return models[0].getValue();
            }
          }
          
          const editorElement = document.querySelector('.monaco-editor');
          if (editorElement) {
            const lines = editorElement.querySelectorAll('.view-line');
            if (lines.length > 0) {
              return Array.from(lines).map(line => line.textContent).join('\\n');
            }
          }
          return null;
        }
        return getEditorCode();
      })()
    `
	});

	const code = result[0];
	if (code) {
		try {
			await fetch(`${SERVER_URL}/template`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});
			alert('Template sent to server!');
		} catch (error) {
			alert('Failed to send template. Is server running?');
		}
	} else {
		alert('Could not extract code from editor');
	}
});


// Inject solution from server
document.getElementById('injectBtn').addEventListener('click', async () => {
	try {
		const response = await fetch(`${SERVER_URL}/solution`);
		const data = await response.json();

		if (!data.code) {
			alert('No solution available');
			return;
		}

		const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

		await browser.tabs.executeScript(tab.id, {
			code: `
        (function() {
          const code = ${JSON.stringify(data.code)};
          if (window.monaco && window.monaco.editor) {
            const models = window.monaco.editor.getModels();
            if (models && models.length > 0) {
              models[0].setValue(code);
              return true;
            }
          }
          return false;
        })()
      `
		});

		alert('Solution injected!');
	} catch (error) {
		alert('Failed to inject solution. Is server running?');
	}
});

// Check status on load
checkServerStatus();
