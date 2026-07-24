import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { ProxyOptions } from 'vite'

// The backend + database live on the VM (bridge.bbh-hospital.com); there is no
// local backend on this machine. In dev we therefore proxy the API paths through
// the Vite server so the browser makes SAME-ORIGIN calls to localhost:5173 and
// Vite forwards them to the VM. This matters for auth: the session cookie is
// SameSite=Lax, which is NOT sent on a cross-site fetch (localhost -> bbh-hospital.com),
// so a direct call would "log in" then bounce straight back to the login page.
// Going through the proxy makes it same-origin, so the cookie sticks.
//
// changeOrigin -> backend sees the request as same-site (no CORS needed).
// We strip Domain= and Secure from Set-Cookie so the cookie is stored against
// http://localhost (a bbh-hospital.com Domain cookie, or a Secure-only cookie,
// would be dropped on plain-http localhost). Dev-only; prod is unaffected.
const BACKEND = 'https://bridge.bbh-hospital.com'

function apiProxy(): ProxyOptions {
  return {
    target: BACKEND,
    changeOrigin: true,
    secure: true,
    cookieDomainRewrite: '',
    configure: (proxy) => {
      proxy.on('proxyRes', (proxyRes) => {
        const cookies = proxyRes.headers['set-cookie']
        if (cookies) {
          proxyRes.headers['set-cookie'] = cookies.map((c) =>
            c.replace(/;\s*Domain=[^;]+/gi, '').replace(/;\s*Secure/gi, ''),
          )
        }
      })
    },
  }
}

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
    proxy: {
      '/api': apiProxy(),
      '/auth': apiProxy(),
    },
  },
})
