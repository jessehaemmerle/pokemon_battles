export function getBackendUrl() {
  const configured = import.meta.env.VITE_BACKEND_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (import.meta.env.PROD && typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}
