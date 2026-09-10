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
const DEPLOYED_BACKEND = 'https://smart-keyboard-backend.onrender.com';
// Local backend from infra/docker-compose.yml. 10.0.2.2 is the Android
// emulator's alias for the host machine - plain "localhost" would be the
// emulator itself. Cleartext http is already permitted (see
// usesCleartextTraffic in AndroidManifest.xml), and on a physical device
// this needs the Mac's LAN IP instead.
const LOCAL_BACKEND = 'http://10.0.2.2:4000';

// SWITCH TO DEPLOYED_BACKEND BEFORE SHIPPING. Pointed at the local
// backend so features can be tested before they're pushed - the deployed
// service only has whatever was last committed, so anything newer than
// that answers 404 here (which is exactly how the 18+ tab appeared
// broken). A release build must not point at a developer's machine.
export const API_BASE_URL = DEPLOYED_BACKEND;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // A cold start was measured taking the full 45s this used to allow, which
  // surfaced as GIF/translation simply failing after any idle period. 75s
  // leaves headroom above the observed 30-50s wake time - slow, but a slow
  // first request beats a failed one.
  timeout: 75000,
  headers: {
    'Content-Type': 'application/json',
  },
});
