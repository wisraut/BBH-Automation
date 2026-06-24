import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all interfaces so teammates on the LAN can reach the dev
    // server at http://<this-machine-ip>:5173 without --host flag.
    host: true,
    port: 5173,
    strictPort: true,
    // Tell the browser never to cache dev assets. Without this, browsers
    // hold onto an old index.html (and the old hashed JS bundle it points
    // to) for hours, so people end up needing Cmd/Ctrl+Shift+R or a
    // private window every time the dev server restarts with new code.
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
})
