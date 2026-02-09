const express = require('express');
const cors = require('cors');
const http = require('http');
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

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true });
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

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const waiting = [];
const roomSockets = new Map();
const rematchVotes = new Map();

function startTurnTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.timer) clearTimeout(room.timer);
  if (room.timerInterval) clearInterval(room.timerInterval);
  room.timer = setTimeout(() => {
    io.to(roomId).emit('timer', { room: roomId, remaining: 0 });
    if (room.battleOver) return;
    if (!room.actions.p1) lockAction(room, 'p1', autoMove(room, 'p1'));
    if (!room.actions.p2) lockAction(room, 'p2', autoMove(room, 'p2'));
    resolveAndBroadcast(roomId);
  }, 60000);
  let remaining = 60;
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
  if (room.timer) clearTimeout(room.timer);
  if (room.timerInterval) clearInterval(room.timerInterval);
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
    if (waiting.length === 0) {
      waiting.push({ socket, payload });
      socket.emit('message', { text: 'Waiting for opponent...' });
      return;
    }
    const opponent = waiting.shift();
    const genList = payload.generations || opponent.payload.generations || [1];
    const room = await startRandomBattle(genList);
    socket.join(room.id);
    opponent.socket.join(room.id);
    const sockets = { p1: socket.id, p2: opponent.socket.id };
    bindRoomSockets(room.id, sockets);
    emitBattleStart(room.id, room, sockets);
  });

  socket.on('start-bot-battle', async (payload = {}) => {
    const room = await startBotBattle(payload.generations || [1]);
    socket.join(room.id);
    const sockets = { p1: socket.id, p2: 'bot' };
    bindRoomSockets(room.id, sockets);
    emitBattleStart(room.id, room, sockets);
  });

  socket.on('start-custom-bot', async (payload = {}) => {
    const ok = await checkTeamLegality(payload.team || [], payload.generations || []);
    if (!ok) return socket.emit('error-message', { text: 'Team illegal' });
    const team = await hydrateTeam(payload.team || []);
    const room = await startCustomBotBattle(payload.generations || [1], team);
    socket.join(room.id);
    const sockets = { p1: socket.id, p2: 'bot' };
    bindRoomSockets(room.id, sockets);
    emitBattleStart(room.id, room, sockets);
  });

  socket.on('start-custom-pvp', async (payload = {}) => {
    const ok = await checkTeamLegality(payload.team || [], payload.generations || []);
    if (!ok) return socket.emit('error-message', { text: 'Team illegal' });
    const team = await hydrateTeam(payload.team || []);
    const room = await startCustomPvp(payload.generations || [1], team);
    socket.join(room.id);
    const sockets = { p1: socket.id, p2: 'bot' };
    bindRoomSockets(room.id, sockets);
    emitBattleStart(room.id, room, sockets);
  });

  socket.on('lock-action', (payload = {}) => {
    const room = rooms.get(payload.room);
    if (!room || room.battleOver) return;
    lockAction(room, payload.side, payload);
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
    room.battleOver = true;
    room.winner = payload.side === 'p1' ? 'p2' : 'p1';
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
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Backend listening on ${PORT}`);
});
