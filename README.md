# Audio Call Room

A minimal self-hosted web application for audio-only group calls. Single shared room, no authentication, no database.

## Features

- Single shared audio-only call room
- WebRTC peer-to-peer mesh networking
- WebSocket signaling
- Inactivity timeout (15 minutes default)
- Mute/unmute controls
- Volume control
- Minimal UI, dependency-light

## Tech Stack

- **Frontend**: Angular 18, TypeScript
- **Backend**: .NET 8 Minimal API, WebSocket
- **Containerization**: Docker, docker-compose

## Quick Start with Docker

1. Clone the repository
2. Run:
   ```bash
   docker compose up --build
   ```
3. Open http://localhost:8083 in your browser

The application will be available on port 8083, with nginx serving the frontend and proxying WebSocket connections to the backend.

## Local Development

### Backend

```bash
cd backend
dotnet run
```

Backend runs on http://localhost:8080

### Frontend

```bash
cd frontend
npm install
npm start
```

Frontend runs on http://localhost:4200

Note: When running the frontend on port 4200, it connects to the backend at `ws://localhost:8080/ws`. When using Docker, the app is served on 8083 and connects to `/ws` on the same host.

## Configuration

Configuration uses the .NET Options pattern with support for both configuration files and environment variables. Environment variables override values from configuration files.

### Configuration File

The backend uses `appsettings.json` for configuration. You can also create environment-specific files like `appsettings.Production.json`.

Example `appsettings.json`:
```json
{
  "Room": {
    "Passphrase": "",
    "InactivityMinutes": 5,
    "HeartbeatSeconds": 30
  }
}
```

### Environment Variables

Environment variables can be set in `docker-compose.yml` or as system environment variables. They override configuration file values:

- `Room__Passphrase` - Optional passphrase required to join the room (if not set, no passphrase is required)
- `Room__InactivityMinutes` - Minutes before inactive users are kicked (default: 5)
- `Room__HeartbeatSeconds` - Heartbeat interval in seconds (default: 30)
- `ASPNETCORE_URLS` - Backend URL binding (default: `http://0.0.0.0:8080`)

**Note:** For environment variables, use double underscore `__` to represent nested configuration (e.g., `Room__Passphrase` maps to `Room.Passphrase` in the config file).

### Legacy Environment Variables (still supported)

For backward compatibility, these environment variables are also supported:
- `ROOM_PASSPHRASE` - Maps to `Room:Passphrase`
- `INACTIVITY_MINUTES` - Maps to `Room:InactivityMinutes`
- `HEARTBEAT_SECONDS` - Maps to `Room:HeartbeatSeconds`

## HTTPS / Reverse Proxy Setup

**Note on Microphone Access:**
- `getUserMedia` works on `localhost` over HTTP (browser security exception)
- For production/home server deployment, HTTPS is required for WebRTC
- Some browsers may still require user interaction (button click) even on localhost
- Mobile browsers typically require user interaction regardless of protocol

For production/home server deployment:

1. Use a reverse proxy (nginx, Traefik, Caddy) with TLS certificates
2. Configure the proxy to:
   - Serve the frontend static files
   - Proxy `/ws` WebSocket connections to the backend

## Architecture

- **Backend**: WebSocket signaling server handling join/leave, WebRTC offer/answer/ICE exchange, participant roster, and inactivity tracking
- **Frontend**: Angular SPA with WebRTC mesh peer connections (each participant connects to all others)
- **Signaling**: JSON messages over WebSocket for WebRTC negotiation

For detailed architecture, flows, and diagrams (for onboarding or the next chat), see **[docs/DOCUMENTATION.md](docs/DOCUMENTATION.md)**.

## Limitations

- Mesh networking limits scalability to ~10 participants
- No persistent storage (all state in-memory)
- No authentication or user accounts
- Audio-only (no video, screen share, or chat)

## Troubleshooting

- **Microphone not working**: Check browser permissions and allow microphone access
- **Can't hear others**: Check volume slider and browser audio settings
- **Connection issues**: Verify STUN/TURN configuration for NAT traversal. STUN is set in frontend `PeerConnectionService` (e.g. `stun:stun.l.google.com:19302`).
- **Inactivity kicks**: Users are automatically disconnected after 15 minutes of no activity (configurable)
