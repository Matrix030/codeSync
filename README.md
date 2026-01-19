# CodeSync

```
┌────────────┐         ┌────────────┐         ┌────────────┐
│            │         │            │         │            │
│   Neovim   │◄───────►│  Go Server │◄───────►│  LeetCode  │
│            │  :8080  │            │  :8080  │  (Monaco)  │
└────────────┘         └────────────┘         └────────────┘
   <leader>lg ─────────► GET /template ◄─────── Extract code
   <leader>ls ─────────► POST /solution ──────► Inject code
```
