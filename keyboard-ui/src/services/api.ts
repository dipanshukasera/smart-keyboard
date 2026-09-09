import axios from 'axios';

// Points at backend/node-service. This is currently a Cloudflare "quick
// tunnel" (`cloudflared tunnel --url http://localhost:4000`) forwarding to
// the Docker container on the dev machine, so the app works from any
// network rather than only when the phone shares Wi-Fi with that machine.
//
// IMPORTANT: quick tunnel URLs are ephemeral - this one breaks the moment
// the tunnel process restarts (reboot, crash, `cloudflared` re-run), at
// which point this must be updated to the new URL and the app rebuilt,
// since it's baked into the JS bundle at build time, not read at runtime.
// For anything longer-lived, replace this with either a named Cloudflare
// Tunnel bound to a domain you own, or a real deployment (Render/Railway/
// Fly.io/etc.) with a stable URL.
export const API_BASE_URL = 'https://witnesses-consultant-vault-purchased.trycloudflare.com';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});
