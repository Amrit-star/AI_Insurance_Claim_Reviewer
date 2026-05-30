// Single source of truth for the backend URL.
// In development: http://127.0.0.1:8000
// In production:  set VITE_API_URL in .env.production (or Vercel environment variables)
const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';

export default API_URL;
