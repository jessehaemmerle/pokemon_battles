import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { startBotBattle } from './battles.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('Neuer Client verbunden:', socket.id);

  // Random Battle
  socket.on('join-random', (data) => {
    // Hier Random Battle starten
  });

  // Bot Battle
  socket.on('start-bot-battle', (data) => {
    startBotBattle(socket, data?.generation || 1);
  });

  socket.on('disconnect', () => {
    console.log('Client getrennt:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
