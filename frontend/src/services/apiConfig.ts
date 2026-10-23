/**
 * ChainCert API Configuration & Base HTTP Client
 * 
 * To connect to your backend:
 * 1. Set VITE_API_BASE_URL in your .env or .env.local file (e.g. VITE_API_BASE_URL=http://localhost:8000/api)
 * 2. Or configure a proxy in vite.config.ts to forward /api requests to your backend port.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Include auth token if available in localStorage
  const authUser = localStorage.getItem('chaincert_auth_user');
  if (authUser) {
    try {
      const parsed = JSON.parse(authUser);
      if (parsed.token) {
        headers.set('Authorization', `Bearer ${parsed.token}`);
      }
    } catch {
      // Ignore token parse error
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `API Error ${response.status}: ${response.statusText}`;
    try {
      const parsedJson = JSON.parse(errorBody);
      if (parsedJson.message) message = parsedJson.message;
      else if (parsedJson.error) message = parsedJson.error;
    } catch {
      // Keep default message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
