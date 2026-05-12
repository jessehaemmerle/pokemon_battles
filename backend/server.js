const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const {
  rooms,
  startRandomBattle,
  startBotBattle,
  startCustomBotBattle,
  startCustomPvp,
  lockAction,
  autoMove,
  resolveTurn,
  getRoomSnapshot,
  finalizeReplay,
  getReplay,
  chooseBotAction,
  parseShowdownLite,
  exportShowdownLite,
  checkTeamLegality,
  hydrateTeam
} = require('./battles');

const PORT = Number(process.env.PORT || 3000);
const TURN_SECONDS = Math.max(5, Number(process.env.TURN_SECONDS || 60));
const PUBLIC_DIR = path.join(__dirname, 'public');
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const corsOrigin = CLIENT_ORIGIN === '*'
  ? '*'
  : CLIENT_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

const waiting = [];
const customWaiting = [];
const roomSockets = new Map();
const rematchVotes = new Map();

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    rooms: rooms.size,
    waiting: waiting.length + customWaiting.length
  });
});

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    activeRooms: rooms.size,
    randomQueue: waiting.length,
    customQueue: customWaiting.length,
    turnSeconds: TURN_SECONDS
  });
});

app.get('/replays/:id', (req, res) => {
  const replay = getReplay(req.params.id);
  if (!replay) return res.status(404).json({ ok: false });
  return res.json(replay);
});

app.post('/teams/parse', async (req, res) => {
  try {
    const team = await parseShowdownLite(req.body.text || '');
    res.json({ team });
  } catch (err) {
    res.status(400).json({ error: 'Parse failed' });
  }
});

app.post('/teams/export', (req, res) => {
  try {
    const text = exportShowdownLite(req.body.team || []);
    res.json({ text });
  } catch (err) {
    res.status(400).json({ error: 'Export failed' });
  }
});

app.post('/teams/legal', async (req, res) => {
  try {
    const ok = await checkTeamLegality(req.body.team || [], req.body.generations || []);
    res.json({ ok });
  } catch (err) {
    res.json({ ok: false });
  }
});

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOrigin } });

function normalizeGenerations(generations) {
  const picked = Array.isArray(generations)
    ? generations.map(Number).filter((g) => Number.isInteger(g) && g >= 1 && g <= 9)
    : [];
  return picked.length ? [...new Set(picked)] : [1];
}

function removeQueuedSocket(socket) {
  for (const queue of [waiting, customWaiting]) {
    const index = queue.findIndex((entry) => entry.socket.id === socket.id);
    if (index >= 0) queue.splice(index, 1);
  }
}

function takeConnectedOpponent(queue) {
  while (queue.length) {
    const opponent = queue.shift();
    if (opponent.socket.connected) return opponent;
  }
  return null;
}

function getControllableSide(roomId, socketId) {
  const sockets = roomSockets.get(roomId);
  if (!sockets) return null;
  if (sockets.p1 === socketId) return 'p1';
  if (sockets.p2 === socketId) return 'p2';
  return null;
}

function reportStartError(socket, err) {
  console.error(err);
  socket.emit('error-message', { text: 'Battle could not be started. Please try again.' });
}

function clearRoomTimers(room) {
  if (room.timer) clearTimeout(room.timer);
  if (room.timerInterval) clearInterval(room.timerInterval);
  room.timer = null;
  room.timerInterval = null;
}

function startTurnTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  clearRoomTimers(room);
  io.to(roomId).emit('timer', { room: roomId, remaining: TURN_SECONDS });
  room.timer = setTimeout(() => {
    io.to(roomId).emit('timer', { room: roomId, remaining: 0 });
    if (room.battleOver) return;
    if (!room.actions.p1) lockAction(room, 'p1', autoMove(room, 'p1'));
    if (!room.actions.p2) lockAction(room, 'p2', autoMove(room, 'p2'));
    resolveAndBroadcast(roomId);
  }, TURN_SECONDS * 1000);
  let remaining = TURN_SECONDS;
  const interval = setInterval(() => {
    remaining -= 1;
    io.to(roomId).emit('timer', { room: roomId, remaining });
    if (remaining <= 0) clearInterval(interval);
  }, 1000);
  room.timerInterval = interval;
}

function resolveAndBroadcast(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  clearRoomTimers(room);
  const events = resolveTurn(room);
  const snap = getRoomSnapshot(room);
  io.to(roomId).emit('turn-state', { room: roomId, events });
  io.to(roomId).emit('state-update', snap);
  if (room.battleOver) {
    const replayId = finalizeReplay(room);
    io.to(roomId).emit('battle-end', { room: roomId, winner: room.winner, replayId });
  } else {
    startTurnTimer(roomId);
  }
}

function bindRoomSockets(roomId, sockets) {
  roomSockets.set(roomId, sockets);
}

function emitBattleStart(roomId, room, sockets) {
  const payloadBase = {
    room: roomId,
    teams: { p1: room.sides.p1.team, p2: room.sides.p2.team },
    snapshot: getRoomSnapshot(room)
  };
  if (sockets.p1 && sockets.p1 !== 'bot') {
    io.to(sockets.p1).emit('battle-start', { ...payloadBase, side: 'p1' });
  }
  if (sockets.p2 && sockets.p2 !== 'bot') {
    io.to(sockets.p2).emit('battle-start', { ...payloadBase, side: 'p2' });
  }
  io.to(roomId).emit('state-update', payloadBase.snapshot);
  startTurnTimer(roomId);
}

io.on('connection', (socket) => {
  socket.on('join-random', async (payload = {}) => {
    removeQueuedSocket(socket);
    const opponent = takeConnectedOpponent(waiting);
    if (!opponent) {
      waiting.push({ socket, payload: { generations: normalizeGenerations(payload.generations) } });
      socket.emit('message', { text: 'Waiting for opponent...' });
      return;
    }
    try {
      const genList = normalizeGenerations([...(opponent.payload.generations || []), ...(payload.generations || [])]);
      const room = await startRandomBattle(genList);
      socket.join(room.id);
      opponent.socket.join(room.id);
      const sockets = { p1: opponent.socket.id, p2: socket.id };
      bindRoomSockets(room.id, sockets);
      emitBattleStart(room.id, room, sockets);
    } catch (err) {
      reportStartError(socket, err);
      reportStartError(opponent.socket, err);
    }
  });

  socket.on('start-bot-battle', async (payload = {}) => {
    removeQueuedSocket(socket);
    try {
      const room = await startBotBattle(normalizeGenerations(payload.generations));
      socket.join(room.id);
      const sockets = { p1: socket.id, p2: 'bot' };
      bindRoomSockets(room.id, sockets);
      emitBattleStart(room.id, room, sockets);
    } catch (err) {
      reportStartError(socket, err);
    }
  });

  socket.on('start-custom-bot', async (payload = {}) => {
    removeQueuedSocket(socket);
    try {
      const generations = normalizeGenerations(payload.generations);
      const ok = await checkTeamLegality(payload.team || [], generations);
      if (!ok) return socket.emit('error-message', { text: 'Team illegal' });
      const team = await hydrateTeam(payload.team || []);
      const room = await startCustomBotBattle(generations, team);
      socket.join(room.id);
      const sockets = { p1: socket.id, p2: 'bot' };
      bindRoomSockets(room.id, sockets);
      emitBattleStart(room.id, room, sockets);
    } catch (err) {
      reportStartError(socket, err);
    }
  });

  socket.on('start-custom-pvp', async (payload = {}) => {
    removeQueuedSocket(socket);
    let opponent = null;
    try {
      const generations = normalizeGenerations(payload.generations);
      const ok = await checkTeamLegality(payload.team || [], generations);
      if (!ok) return socket.emit('error-message', { text: 'Team illegal' });
      const team = await hydrateTeam(payload.team || []);
      opponent = takeConnectedOpponent(customWaiting);
      if (!opponent) {
        customWaiting.push({ socket, team, payload: { generations } });
        socket.emit('message', { text: 'Waiting for a custom-team opponent...' });
        return;
      }
      const genList = normalizeGenerations([...(opponent.payload.generations || []), ...generations]);
      const room = await startCustomPvp(genList, opponent.team, team);
      opponent.socket.join(room.id);
      socket.join(room.id);
      const sockets = { p1: opponent.socket.id, p2: socket.id };
      bindRoomSockets(room.id, sockets);
      emitBattleStart(room.id, room, sockets);
    } catch (err) {
      reportStartError(socket, err);
      if (opponent) reportStartError(opponent.socket, err);
    }
  });

  socket.on('lock-action', (payload = {}) => {
    const room = rooms.get(payload.room);
    if (!room || room.battleOver) return;
    const allowedSide = getControllableSide(payload.room, socket.id);
    if (!allowedSide || allowedSide !== payload.side) {
      socket.emit('error-message', { text: 'You cannot control this side.' });
      return;
    }
    lockAction(room, allowedSide, payload);
    const roomMeta = roomSockets.get(payload.room);
    if (roomMeta?.p2 === 'bot' && !room.actions.p2) {
      lockAction(room, 'p2', chooseBotAction(room, 'p2'));
    }
    if (room.actions.p1 && room.actions.p2) {
      resolveAndBroadcast(payload.room);
    }
  });

  socket.on('request-state', (payload = {}) => {
    const room = rooms.get(payload.room);
    if (!room) return;
    socket.emit('state-update', getRoomSnapshot(room));
  });

  socket.on('forfeit', (payload = {}) => {
    const room = rooms.get(payload.room);
    if (!room) return;
    const allowedSide = getControllableSide(payload.room, socket.id);
    if (!allowedSide || allowedSide !== payload.side) {
      socket.emit('error-message', { text: 'You cannot forfeit this side.' });
      return;
    }
    room.battleOver = true;
    room.winner = allowedSide === 'p1' ? 'p2' : 'p1';
    clearRoomTimers(room);
    const replayId = finalizeReplay(room);
    io.to(room.id).emit('battle-end', { room: room.id, winner: room.winner, replayId });
  });

  socket.on('rematch', () => {
    const activeRoomId = [...roomSockets.entries()].find(([, s]) => s.p1 === socket.id || s.p2 === socket.id)?.[0];
    if (!activeRoomId) return;
    const room = rooms.get(activeRoomId);
    if (!room) return;
    const sockets = roomSockets.get(activeRoomId);
    if (sockets?.p2 === 'bot') {
      startBotBattle(room.meta?.genList || [1]).then((newRoom) => {
        socket.join(newRoom.id);
        const newSockets = { p1: socket.id, p2: 'bot' };
        bindRoomSockets(newRoom.id, newSockets);
        emitBattleStart(newRoom.id, newRoom, newSockets);
      });
      return;
    }
    const votes = rematchVotes.get(activeRoomId) || new Set();
    votes.add(socket.id);
    rematchVotes.set(activeRoomId, votes);
    if (votes.size < 2) {
      socket.emit('message', { text: 'Waiting for opponent rematch...' });
      return;
    }
    rematchVotes.delete(activeRoomId);
    startRandomBattle(room.meta?.genList || [1]).then((newRoom) => {
      const newSockets = { p1: sockets.p1, p2: sockets.p2 };
      if (sockets.p1) io.sockets.sockets.get(sockets.p1)?.join(newRoom.id);
      if (sockets.p2) io.sockets.sockets.get(sockets.p2)?.join(newRoom.id);
      bindRoomSockets(newRoom.id, newSockets);
      emitBattleStart(newRoom.id, newRoom, newSockets);
    });
  });

  socket.on('spectate', (payload = {}) => {
    const room = rooms.get(payload.room);
    if (!room) return socket.emit('error-message', { text: 'Room not found' });
    socket.join(room.id);
    socket.emit('state-update', getRoomSnapshot(room));
  });

  socket.on('disconnect', () => {
    removeQueuedSocket(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Backend listening on ${PORT}`);
});
