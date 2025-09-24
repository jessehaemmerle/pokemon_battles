import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import {
  startBotBattle,
  startPvpQuickMatch,
  clientLockAction,
  clientRequestSnapshot,
  clientForfeit,
  clientRematch,
  addSpectator,
  parseShowdownLite,
  exportShowdownLite,
  checkTeamLegality
} from './battles.js';

const app = express();
app.use(cors());
app.use(express.json());

// Healthcheck
app.get('/health', (_, res) => res.status(200).json({ ok: true }));

// --- Replays (in-memory) ---
import { getReplay } from './battles.js';
app.get('/replays/:id', (req, res) => {
  const rep = getReplay(req.params.id);
  if (!rep) return res.status(404).json({ error: 'Replay not found' });
  res.json(rep);
});

// --- Team Import/Export + Legality (Showdown-Lite) ---
app.post('/teams/parse', (req, res) => {
  try {
    const text = String(req.body?.text || '');
    const team = parseShowdownLite(text);
    res.json({ team });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post('/teams/export', (req, res) => {
  try {
    const team = req.body?.team;
    const text = exportShowdownLite(team);
    res.json({ text });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post('/teams/legal', (req, res) => {
  try {
    const team = req.body?.team;
    const gens = req.body?.generations || req.body?.generation || [1];
    const ok = checkTeamLegality(team, gens);
    res.json({ ok });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  // Random PvP-Demo (server generiert Teams)
  socket.on('join-random', async (data) => {
    try {
      const gens = data?.generations?.length ? data.generations : (data?.generation ?? 1);
      await startPvpQuickMatch(io, socket, gens);
    } catch (e) {
      console.error(e);
      socket.emit('error-message', 'Online-Battle konnte nicht gestartet werden.');
    }
  });

  // Bot-Battle
  socket.on('start-bot-battle', async (data) => {
    try {
      const gens = data?.generations?.length ? data.generations : (data?.generation ?? 1);
      await startBotBattle(io, socket, gens);
    } catch (e) {
      console.error(e);
      socket.emit('error-message', 'Bot-Battle konnte nicht gestartet werden.');
    }
  });

  // Ein-Zug-Runden (Move/Switch)
  socket.on('lock-action', async (payload) => {
    try { await clientLockAction(io, socket, payload); }
    catch (e) { console.error(e); socket.emit('error-message', 'Aktion konnte nicht gelockt werden.'); }
  });

  // Timer/State
  socket.on('request-state', ({ room }) => clientRequestSnapshot(io, socket, room));

  // Forfeit (manuell)
  socket.on('forfeit', ({ room, side }) => clientForfeit(io, room, side));

  // Rematch (gleiche Gens, neue Teams)
  socket.on('rematch', ({ room }) => clientRematch(io, room));

  // Spectator-Join (read-only)
  socket.on('spectate', ({ room }) => addSpectator(io, socket, room));

  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
