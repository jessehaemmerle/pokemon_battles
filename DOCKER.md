# Docker Usage

Build and run the full application in one container:

```sh
docker compose up --build
```

Open `http://localhost:3000`.

The image builds the Vite frontend and serves the static production assets from the Node/Express backend. API calls and Socket.IO use the same origin in production, so no `VITE_BACKEND_URL` is needed for the default Docker setup.

## Configuration

Useful environment variables:

- `PORT`: HTTP port inside the container. Default: `3000`.
- `TURN_SECONDS`: turn timer duration. Default: `60`.
- `CLIENT_ORIGIN`: CORS origin list. Default: `*`.
- `POKEAPI_CACHE_FILE`: cache location for PokeAPI responses. Docker Compose uses `/data/pokeapi-cache.json`.

The Compose file stores PokeAPI cache data in the `pokeapi-cache` named volume.
