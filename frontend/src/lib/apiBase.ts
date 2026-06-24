// Resolve the backend base URL the right way for every environment:
//
//   1. If VITE_API_BASE is explicitly set (production builds, CI), use it.
//   2. Otherwise derive from window.location — replace the Vite dev port
//      (5173) with the backend port (8000) on whatever host the user
//      typed into their browser. This means a teammate hitting
//      http://172.25.20.162:5173 from another machine on the LAN gets
//      http://172.25.20.162:8000 for API calls automatically, with no
//      per-machine .env file to maintain.
//   3. SSR / non-browser fallback (tests, prerender) → localhost.
//
// Backend CORS already whitelists the 192.168 / 10 / 172.16-31 ranges,
// so any LAN host works without further config.

const FALLBACK = 'http://localhost:8000'

function deriveFromWindow(): string {
  if (typeof window === 'undefined') return FALLBACK
  const { protocol, hostname, port } = window.location
  // If we're accessing via Vite dev (5173) or a custom port, swap to 8000.
  // If we're already on 8000 somehow, keep it.
  const backendPort = port === '8000' ? '8000' : '8000'
  return `${protocol}//${hostname}:${backendPort}`
}

const fromEnv = import.meta.env.VITE_API_BASE
export const API_BASE: string = fromEnv && fromEnv.trim() !== ''
  ? fromEnv
  : deriveFromWindow()
