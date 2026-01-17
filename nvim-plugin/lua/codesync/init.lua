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

	-- Write to temporary file to avoid shell escaping issues
	local tmpfile = os.tmpname()
	local f = io.open(tmpfile, "w")
	if not f then
		vim.notify("CodeSync: Failed to create temp file", vim.log.levels.ERROR)
		return
	end

	-- Write JSON payload to file
	f:write(vim.fn.json_encode({ code = code }))
	f:close()

	-- Send to server using curl with file input
	local curl_cmd = string.format(
		"curl -s -X POST %s/solution -H 'Content-Type: application/json' -d @%s",
		M.config.server_url,
		tmpfile
	)

	local result = vim.fn.system(curl_cmd)

	-- Clean up temp file
	os.remove(tmpfile)

	-- Check for errors
	if vim.v.shell_error ~= 0 then
		vim.notify("CodeSync: Failed to sync - is server running?", vim.log.levels.ERROR)
		return
	end

	vim.notify("CodeSync: Solution synced!", vim.log.levels.INFO)
end

-- Fetch template from server and load into current buffer
function M.get_template()
	local curl_cmd = string.format("curl -s -X GET %s/template", M.config.server_url)

	local result = vim.fn.system(curl_cmd)

	-- Check for errors
	if vim.v.shell_error ~= 0 then
		vim.notify("CodeSync: Failed to fetch template - is server running?", vim.log.levels.ERROR)
		return
	end

	-- Parse JSON response
	local ok, response = pcall(vim.fn.json_decode, result)
	if not ok or not response or not response.code then
		vim.notify("CodeSync: No template available yet", vim.log.levels.WARN)
		return
	end

	-- Split code into lines and set buffer content
	local lines = vim.split(response.code, "\n")
	vim.api.nvim_buf_set_lines(0, 0, -1, false, lines)

	vim.notify("CodeSync: Template loaded!", vim.log.levels.INFO)
end

-- Setup function
function M.setup(opts)
	opts = opts or {}
	M.config = vim.tbl_extend("force", M.config, opts)

	-- Create user commands
	vim.api.nvim_create_user_command("LCSync", function()
		M.sync()
	end, {})

	vim.api.nvim_create_user_command("LCGet", function()
		M.get_template()
	end, {})

	-- Set up keybindings
	vim.keymap.set("n", "<leader>ls", M.sync, { desc = "LeetCode Sync to browser" })
	vim.keymap.set("n", "<leader>lg", M.get_template, { desc = "LeetCode Get template" })

	print("CodeSync initialized - :LCSync/<leader>ls to sync, :LCGet/<leader>lg to get template")
end

return M
