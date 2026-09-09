import axios from 'axios';

// Points at backend/node-service, deployed on Render (see render.yaml at
// the repo root and github.com/dipanshukasera/smart-keyboard) - a stable
// URL that doesn't change across restarts/reboots, unlike the Cloudflare
// quick tunnel this used to point at (those are anonymous/ephemeral by
// design and die the moment the local tunnel process does).
//
// Render's free tier spins the service down after ~15 minutes of
// inactivity - the first request after a quiet period wakes it back up
// but can take 30-50s, hence the generous timeout below (a typical
// already-warm request is still fast; this only matters for that
// occasional cold start).
export const API_BASE_URL = 'https://smart-keyboard-backend.onrender.com';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});
