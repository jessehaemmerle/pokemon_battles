import { io } from 'socket.io-client';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
let socketInstance = null;

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(backendUrl, { transports: ['websocket'] });
  }
  return socketInstance;
}
