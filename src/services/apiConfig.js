const DEFAULT_API_BASE = "https://softshape-backend.onrender.com";

/** Strip trailing slashes — avoids https://host.app//api/... (breaks DNS/fetch) */
export function normalizeApiBase(url) {
  if (!url || typeof url !== "string") return DEFAULT_API_BASE;
  return url.trim().replace(/\/+$/, "");
}

export const API_BASE = normalizeApiBase(
  import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    DEFAULT_API_BASE
);

/** Build API URL: base + path (path must start with /) */
export function apiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

console.log("[API] Backend base:", API_BASE);
