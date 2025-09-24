import { io } from 'socket.io-client';

// In Render als Env-Var setzen: VITE_BACKEND_URL=https://<dein-backend>.onrender.com
const URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const socket = io(URL, {
  autoConnect: true
});
