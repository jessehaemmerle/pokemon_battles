import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import {
  startBotBattle,
  startPvpQuickMatch,
  clientLockAction,
  clientRequestSnapshot
} from './battles.js';

const app = express();
app.use(cors());
app.use(express.json());

// Healthcheck
app.get('/health', (_, res) => res.status(200).json({ ok: true }));

const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-random', async (data) => {
    try {
      const gens = data?.generations?.length ? data.generations : (data?.generation ?? 1);
      await startPvpQuickMatch(io, socket, gens);
    } catch (e) {
      console.error(e);
      socket.emit('error-message', 'Online-Battle konnte nicht gestartet werden.');
    }
  });

  socket.on('start-bot-battle', async (data) => {
    try {
      const gens = data?.generations?.length ? data.generations : (data?.generation ?? 1);
      await startBotBattle(io, socket, gens);
    } catch (e) {
      console.error(e);
      socket.emit('error-message', 'Bot-Battle konnte nicht gestartet werden.');
    }
  });

  // EINZUG-RUNDEN: genau 1 Aktion pro Runde
  socket.on('lock-action', async (payload) => {
    try {
      await clientLockAction(io, socket, payload);
    } catch (e) {
      console.error(e);
      socket.emit('error-message', 'Aktion konnte nicht gelockt werden.');
    }
  });

  socket.on('request-state', ({ room }) => {
    clientRequestSnapshot(io, socket, room);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
