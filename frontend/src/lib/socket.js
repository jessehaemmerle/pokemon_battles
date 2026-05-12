import { io } from 'socket.io-client';
import { getBackendUrl } from './config.js';

let socketInstance = null;

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(getBackendUrl(), { transports: ['websocket'] });
  }
  return socketInstance;
}
