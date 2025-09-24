import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { handleBattle } from './battles.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Pokémon-Daten von PokéAPI abrufen
app.get('/pokemon/:id', async (req, res) => {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${req.params.id}`);
  const data = await response.json();
  res.json(data);
});

// Socket.IO für Online-Battles
io.on('connection', (socket) => {
  console.log('Ein Spieler ist verbunden:', socket.id);

  socket.on('join-random', (data) => {
    socket.generation = data?.generation || 1;
    handleBattle(io, socket);
  });

  socket.on('move', (moveData) => {
    io.to(moveData.room).emit('move-made', moveData);
  });
});

socket.on('start-bot-battle', (data) => {
  handleBotBattle(socket, data?.generation || 1);
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
