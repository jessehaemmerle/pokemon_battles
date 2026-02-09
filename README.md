# Pokemon Battles

A full-stack, real-time Pokémon battle sandbox built as a monorepo. It includes a Vite + React frontend and a Node.js + Express + Socket.IO backend with a Showdown-lite battle engine. The app supports random battles, custom teams, replays, and a lightweight battle simulation with extended move mechanics.

## Contents

- Overview
- Features
- Tech Stack
- Repo Structure
- Requirements
- Quick Start (Local)
- Configuration
- Scripts
- Deployment
- Replay Usage
- Team Builder Format
- Testing
- Troubleshooting
- License

## Overview

Pokemon Battles lets you:
- Launch quick random battles (PvP queue or vs bot).
- Build custom teams and validate legality with a simplified ruleset.
- Play through a battle with turn timers, status effects, and hazards.
- Save and re-watch replays with timeline and speed controls.

## Features

### Battles
- Random team generation from PokéAPI (Gen 1–9 ranges).
- Turn-based battle flow with 60s timer.
- Basic damage formula with STAB, crits, random factor, and type effectiveness.
- Status conditions: burn, poison, toxic, paralysis, sleep, freeze.
- Hazards: stealth rock, spikes, toxic spikes.
- Items: leftovers, choice scarf, focus sash, life orb.
- Abilities: intimidate, levitate, flash-fire, overgrow, blaze, torrent, guts.
- Weather/Terrain: rain, sun, sand, hail, grassy/electric/psychic/misty terrain.
- Extended mechanics: confusion, flinch, substitute, taunt, encore, drain, recoil, multi-hit.
- Data-driven move effects via PokéAPI metadata (ailments, stat changes, heal, drain, recoil, etc.).

### Replays
- Each battle produces an event log and replay ID.
- Replay viewer supports timeline, speed controls, and snapshot simulation.

### Team Builder
- Search and add Pokémon by name.
- Move picker with filtering and 4-move limit.
- Import/Export in Showdown-Lite format.
- Legality check via backend endpoint.
- Save/Load from localStorage + JSON download.

## Tech Stack

- **Frontend**: React 18, Vite, Socket.IO client, Testing Library + Vitest
- **Backend**: Node.js, Express, Socket.IO, node-fetch
- **Data**: PokéAPI

## Repo Structure

```
/pokemon-battles
  /backend
    battles.js
    cache.js
    server.js
    package.json
    /shared
      typeChart.js
  /frontend
    index.html
    vite.config.js
    package.json
    /src
      App.jsx
      index.jsx
      index.css
      i18n.jsx
      /lib
        socket.js
        clipboard.js
        download.js
      /shared
        typeChart.js
      /components
        RandomBattle.jsx
        BattleScreen.jsx
        TeamBuilder.jsx
        ReplayViewer.jsx
        ToastProvider.jsx
        ErrorBoundary.jsx
      /__tests__
        simpleRender.test.jsx
```

## Requirements

- Node.js 18+ recommended
- npm 9+ recommended
- Internet access for PokéAPI

## Quick Start (Local)

### Backend

```
cd backend
npm i
npm start
```

Backend runs on `http://localhost:3000`.

### Frontend

```
cd frontend
npm i
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Configuration

### Frontend Environment

- `VITE_BACKEND_URL` (optional)
  - Default: `http://localhost:3000`
  - Example: `VITE_BACKEND_URL=https://api.example.com`

## Scripts

### Backend

- `npm start` — start API + Socket.IO server
- `npm test` — run Vitest (placeholder)

### Frontend

- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm run preview` — preview build locally
- `npm test` — Vitest + RTL

## Deployment

You can deploy frontend and backend separately or together behind a proxy.

### Backend (Node + Socket.IO)

1. Build and install:

```
cd backend
npm i
```

2. Run with a process manager (recommended):

```
node server.js
```

Example using PM2:

```
pm i -g pm2
pm2 start server.js --name pokemon-battles-backend
```

3. Ensure port `3000` (or your chosen port) is open.

### Frontend (Static Hosting)

1. Build:

```
cd frontend
npm i
npm run build
```

2. Deploy the `dist/` directory to any static host.

3. Set `VITE_BACKEND_URL` at build time to point to your backend.

### Reverse Proxy (Optional)

If you want a single domain, place a reverse proxy in front:
- Route `/socket.io` and `/` API calls to the backend.
- Serve the frontend static files from `/`.

Nginx example (conceptual):
- `/socket.io` -> backend
- `/api` -> backend (if you add a prefix)
- `/` -> frontend static

## Replay Usage

- During a battle, the server emits a replay ID at battle end.
- Use the Replay tab to load it.
- Or fetch directly: `GET /replays/:id`

## Team Builder Format (Showdown-Lite)

Each Pokémon is a block separated by a blank line:

```
Pikachu | light-ball | static | thunderbolt, volt-tackle

Charizard | leftovers | blaze | flamethrower, air-slash
```

## Testing

Frontend:

```
cd frontend
npm test
```

## Troubleshooting

- **PokéAPI rate limits**: The backend includes a simple cache in `backend/cache.js`. If you hit rate limits, try again later.
- **CORS issues**: Ensure `VITE_BACKEND_URL` matches your backend host.
- **Socket errors**: Confirm the backend is reachable and not blocked by a proxy.
- **Blank UI**: Check console logs for failed API calls or missing env vars.

## License

This project is provided as-is for educational purposes.
