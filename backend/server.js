import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import {
  startBotBattle,
  startPvpQuickMatch,
  handlePlayerMove,
  handlePlayerSwitch,
  getRoomSnapshot
} from './battles.js';

const app = express();
app.use(cors());
app.use(express.json());

// Healthcheck für Render
app.get('/health', (_, res) => res.status(200).json({ ok: true }));

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Schnelles PvP (vereinfachtes Matchmaking: Server generiert beide Teams sofort)
  socket.on('join-random', async (data) => {
    try {
      await startPvpQuickMatch(io, socket, data?.generation || 1);
    } catch (e) {
      console.error(e);
      socket.emit('error-message', 'Online-Battle konnte nicht gestartet werden.');
    }
  });

  // Bot-Battle
  socket.on('start-bot-battle', async (data) => {
    try {
      await startBotBattle(io, socket, data?.generation || 1);
    } catch (e) {
      console.error(e);
      socket.emit('error-message', 'Bot-Battle konnte nicht gestartet werden.');
    }
  });

  // Spieler führt eine Attacke aus
  socket.on('move', async (payload) => {
    try {
      await handlePlayerMove(io, socket, payload);
    } catch (e) {
      console.error(e);
      socket.emit('error-message', 'Zug fehlgeschlagen.');
    }
  });

  // Spieler wechselt Pokémon
  socket.on('switch', async (payload) => {
    try {
      await handlePlayerSwitch(io, socket, payload);
    } catch (e) {
      console.error(e);
      socket.emit('error-message', 'Wechsel fehlgeschlagen.');
    }
  });

  // Frontend kann einen Snapshot anfordern (z.B. nach Reconnect)
  socket.on('request-state', ({ room }) => {
    const snap = getRoomSnapshot(room);
    if (snap) socket.emit('state-update', snap);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
