/** Single backend base URL for all API + Socket.io clients */
export const API_BASE =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  "https://softshape-backend.up.railway.app";
