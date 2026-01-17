-- CodeSync plugin entry point
-- This file is loaded automatically by Neovim

if vim.g.loaded_codesync then
	return
end
vim.g.loaded_codesync = true

require("codesync").setup()
