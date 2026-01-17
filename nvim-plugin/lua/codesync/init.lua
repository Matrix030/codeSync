local M = {}

-- Configuration
M.config = {
	server_url = "http://localhost:8080",
	editor_file = vim.fn.expand("~/dev/codeSync/leetcode/LCEditor.py"),
}

-- Send current buffer content to server
function M.sync()
	-- Get all lines from current buffer
	local lines = vim.api.nvim_buf_get_lines(0, 0, -1, false)
	local code = table.concat(lines, "\n")
	-- Prepare JSON payload
	local json_payload = vim.fn.json_encode({ code = code })
	-- Send to server using curl
	local curl_cmd = string.format(
		"curl -s -X POST %s/solution -H 'Content-Type: application/json' -d '%s'",
		M.config.server_url,
		json_payload:gsub("'", "'\\''") -- Escape single quotes for shell
	)

	local result = vim.fn.system(curl_cmd)

	-- Check for errors
	if vim.v.shell_error ~= 0 then
		vim.notify("CodeSync: Failed to sync - is server running?", vim.log.levels.ERROR)
		return
	end

	vim.notify("CodeSync: Solution synced!", vim.log.levels.INFO)
end

-- Setup function
function M.setup(opts)
	opts = opts or {}
	M.config = vim.tbl_extend("force", M.config, opts)

	-- Create user command
	vim.api.nvim_create_user_command("LCSync", function()
		M.sync()
	end, {})

	-- Optional: Set up keybinding
	vim.keymap.set("n", "<leader>ls", M.sync(), { desc = "Leetcode Sync to browser" })

	print("CodeSync initialized - user :LCSync or <leader>ls")
end

return M
