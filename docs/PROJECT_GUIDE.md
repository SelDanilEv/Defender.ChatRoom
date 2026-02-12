# Defender.ChatRoom — Super Detailed Project Guide

This guide provides comprehensive documentation to help AI assistants and developers quickly understand and extend the project. Use it as the primary reference for future tasks.

---

## Table of Contents

1. [Project Summary](#1-project-summary)
2. [Repository Structure](#2-repository-structure)
3. [Tech Stack & Versions](#3-tech-stack--versions)
4. [Backend Deep Dive](#4-backend-deep-dive)
5. [Frontend Deep Dive](#5-frontend-deep-dive)
6. [WebSocket Signaling Protocol](#6-websocket-signaling-protocol)
7. [Passphrase Authentication Flow](#7-passphrase-authentication-flow)
8. [WebRTC Mesh Architecture](#8-webrtc-mesh-architecture)
9. [Configuration Reference](#9-configuration-reference)
10. [Deployment & CI/CD](#10-deployment--cicd)
11. [Testing](#11-testing)
12. [Common Task Locations](#12-common-task-locations)
13. [Known Limitations & Design Decisions](#13-known-limitations--design-decisions)
14. [File-by-File Reference](#14-file-by-file-reference)

---

## 1. Project Summary

**Defender.ChatRoom** is a minimal, self-hosted **audio-only group call** web application.

| Aspect | Details |
|--------|---------|
| **Purpose** | Single shared room for audio-only group calls |
| **Topology** | WebRTC mesh (each participant connects directly to every other) |
| **Signaling** | JSON over WebSocket at `/ws` |
| **State** | Fully in-memory; no database |
| **Auth** | Optional passphrase (challenge/response with SHA-256) |
| **Scalability** | ~10 participants due to mesh (N² connections) |

---

## 2. Repository Structure

```
Defender.ChatRoom/
├── .github/workflows/
│   └── build-images.yml          # Docker image build & push (manual trigger)
├── backend/
│   ├── Defender.ChatRoom.csproj # .NET 8 web project
│   ├── Defender.ChatRoom.sln    # Solution file
│   ├── Program.cs               # Entry: /ws WebSocket, /reset HTTP
│   ├── RoomOptions.cs           # Room config model
│   ├── appsettings.json        # Default config
│   ├── Models/
│   │   └── Participant.cs       # Participant model
│   ├── Services/
│   │   ├── ChallengeService.cs      # One-time passphrase challenges
│   │   ├── CryptographyService.cs   # SHA-256 hashing
│   │   ├── RoomService.cs           # In-memory participant roster
│   │   ├── SignalingService.cs      # Message routing & handlers
│   │   ├── WebSocketConnectionService.cs  # connectionId → WebSocket map
│   │   ├── WebSocketHandlerService.cs     # Receive loop, ping, inactivity
│   │   └── WebSocketMessageService.cs      # JSON send helper
│   ├── Defender.ChatRoom.Tests/   # xUnit tests
│   └── Dockerfile
├── frontend/
│   ├── package.json
│   ├── angular.json
│   ├── src/app/
│   │   ├── app.component.ts
│   │   ├── app.routes.ts
│   │   ├── welcome/welcome.component.ts
│   │   ├── room/room.component.ts
│   │   ├── components/
│   │   │   ├── participant/participant.component.ts
│   │   │   ├── room-controls/room-controls.component.ts
│   │   │   ├── connection-status/connection-status.component.ts
│   │   │   └── language-selector/language-selector.component.ts
│   │   └── services/
│   │       ├── websocket.service.ts
│   │       ├── peer-connection.service.ts
│   │       ├── audio.service.ts
│   │       ├── room-state.service.ts
│   │       ├── client-id.service.ts
│   │       ├── health-monitor.service.ts
│   │       └── translation-loader.service.ts
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml           # Local dev: build from source
├── docker-compose.prod.yml      # Production: pull images from registry
├── docs/
│   ├── DOCUMENTATION.md         # Architecture & flows (mermaid diagrams)
│   ├── IMPLEMENTATION_GAPS.md   # Historical gap list (mostly resolved)
│   └── PROJECT_GUIDE.md        # This file
├── scripts/
│   ├── setup.sh
│   └── run-prod.sh
└── README.md
```

---

## 3. Tech Stack & Versions

| Component | Technology | Version |
|-----------|------------|---------|
| Backend | .NET | 8.0 |
| Frontend | Angular | 21.x |
| Frontend | TypeScript | 5.9.x |
| Frontend | @ngx-translate/core | 15.x |
| Backend container | mcr.microsoft.com/dotnet/aspnet | 8.0 |
| Frontend container | Node (build) | 20-alpine |
| Frontend container | Nginx (runtime) | alpine |
| Tests (backend) | xUnit | (default .NET) |
| Tests (frontend) | Karma + Jasmine | 5.x |

---

## 4. Backend Deep Dive

### 4.1 Program.cs — Entry Points

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ws` | WebSocket | Main signaling; accepts `?clientId=...` (optional) |
| `/reset` | GET, POST | Disconnects all clients and clears room; requires passphrase |

**WebSocket connection flow:**
1. Accept WebSocket; get or generate `clientId` from query
2. If existing connection for same `clientId`, close it and cleanup
3. Add connection to `WebSocketConnectionService`
4. Send `challenge` if `Room.Passphrase` is set
5. Run `WebSocketHandlerService.HandleWebSocketAsync`
6. On exit (close/error), run `CleanupConnection`

**/reset flow:**
- Requires `Room.Passphrase` to be configured
- Passphrase via query `?passphrase=...` or JSON body `{ "passphrase": "..." }`
- Compares SHA-256 of provided vs configured passphrase
- Sends `kicked` (reason: `room_reset`) to all clients, then clears room

### 4.2 Service Dependencies (DI)

```text
Singleton:
  RoomService
  WebSocketConnectionService
  ChallengeService
  CryptographyService
  WebSocketMessageService

Scoped (per request/connection):
  SignalingService
  WebSocketHandlerService
```

### 4.3 RoomService

- Thread-safe dictionary: `connectionId → Participant`
- `Participant`: Id, Name, LastSeen, Muted
- Key methods: `AddParticipant`, `RemoveParticipant`, `GetParticipant`, `GetAllParticipantsExcept`, `UpdateLastSeen`, `UpdateMuteState`, `ClearAllParticipants`

### 4.4 WebSocketConnectionService

- Maps `connectionId` → `WebSocket`
- Thread-safe; used to send messages to specific clients
- `GetConnection`, `GetAllConnectionsExcept`, `AddConnection`, `RemoveConnection`

### 4.5 WebSocketHandlerService

- Receive loop: reads messages, updates `LastSeen`, passes to `SignalingService.ProcessMessageAsync`
- Ping task: sends raw `ping` every `HeartbeatSeconds` (capped at 60); client must reply `pong`
- Inactivity check: if `LastSeen` is older than `InactivityMinutes`, sends `kicked` and closes connection
- `CleanupConnection`: removes from RoomService, broadcasts `participant-left` (reason: `disconnect`), removes from ConnectionService

### 4.6 SignalingService — Message Handlers

| type | Handler | Notes |
|------|----------|-------|
| `join` | HandleJoinAsync | Rejects if passphrase configured |
| `join-response` | HandleJoinResponseAsync | Validates challenge response; then CompleteJoinAsync |
| `leave` | HandleLeave | Remove from room, broadcast participant-left |
| `heartbeat` | — | Updates LastSeen |
| `mute` | HandleMuteAsync | Updates mute state, broadcasts participant-mute |
| `offer` | HandleOfferAsync | Relays to toId with fromId, name, muted, sdp |
| `answer` | HandleAnswerAsync | Relays to toId |
| `ice` | HandleIceAsync | Relays to toId |

Error responses: `{ type: "error", message: "..." }` for invalid JSON, missing type, unknown type, processing errors.

### 4.7 ChallengeService

- Per-connection one-time challenges for passphrase auth
- `GenerateAndStoreChallenge(connectionId)` → 32-char hex string
- `GetChallenge`, `RemoveChallenge` used by SignalingService

### 4.8 CryptographyService

- `ComputeSha256Hash(input)` → hex string (lowercase)
- Used for passphrase hashing and challenge response validation

---

## 5. Frontend Deep Dive

### 5.1 Routing

| Path | Component |
|------|------------|
| `''` | WelcomeComponent |
| `'room'` | RoomComponent |

### 5.2 WelcomeComponent

- Form: display name, passphrase
- On submit: navigates to `/room` with `history.state = { displayName, passphrase }`
- Shows error/info from `history.state.message` (e.g. after kick)

### 5.3 RoomComponent — Lifecycle

1. **ngOnInit**: Initialize RoomStateService from `history.state`, cleanup peers, connect WebSocket, request mic (if permission already granted), start local track monitoring
2. **messageEffect**: Subscribes to `WebSocketService.messages$`; each message → `handleSignalingMessage`
3. **microphoneEffect**: When mic granted + WS connected + not processing join:
   - If awaiting challenge → `sendJoinResponse()`
   - Else → `sendJoinMessage()`
   - Start heartbeat, activity tracking, health monitor
4. **ngOnDestroy**: cleanup (disconnect, peer cleanup, audio cleanup)

### 5.4 Key Frontend Services

| Service | Responsibility |
|---------|----------------|
| **ClientIdService** | Persists clientId in localStorage; UUID v4 format |
| **WebSocketService** | Connect, send, `messages$` Subject, reconnect (max 10), heartbeat (30s), activity tracking, message queue |
| **RoomStateService** | displayName, passphrase, selfId, challenge, awaitingChallenge, isLeaving, errorMessage; `sha256()` for passphrase |
| **AudioService** | getUserMedia, mute toggle, volume, mic level, localStream; optionally uses AudioContext for gain |
| **PeerConnectionService** | One RTCPeerConnection per remote participant; offer/answer/ICE; participant list with audioElement |
| **HealthMonitorService** | Periodic health check (WebSocket, local audio, peer connections, AudioContext); recovery logic; forceRecovery |

### 5.5 WebSocketService Details

- **Local dev**: `ws://localhost:8080/ws` when `port === '4200'`
- **Docker/prod**: Same host, `/ws` path
- **Reconnect**: Exponential backoff, max 10 attempts
- **Connection quality**: Monitors time since last ping; >60s = poor, >90s = unstable (closes)
- **Message queue**: Up to 100 messages when disconnected; flushed on reconnect

### 5.6 PeerConnectionService — WebRTC

- **STUN**: `stun:stun.l.google.com:19302`
- **Offerer selection**: `selfId < participantId` (string comparison)
- **Retry**: Up to 3 retries on failed/disconnected
- **Audio**: Creates `<audio>` element, autoplay, appends to body
- **Volume**: Applied to each participant's `audioElement.volume`

### 5.7 HealthMonitorService

- Checks every 5s: WebSocket, local audio track, peer connections, AudioContext
- States: `healthy`, `unhealthy`, `recovering`
- Recovery: reconnect WS, re-request mic, re-create failed peer connections, resume AudioContext
- Max 5 recovery attempts; `forceRecovery()` resets and re-checks

### 5.8 i18n

- **CustomTranslateLoader**: Inline translations in `translation-loader.service.ts`
- **Languages**: `en`, `ru`, `bl` (Belarusian)
- **Persistence**: `localStorage.language`

---

## 6. WebSocket Signaling Protocol

All messages are JSON with `type` field.

### Client → Server

| type | Fields | Purpose |
|-----|--------|---------|
| join | name?, muted? | Join (no passphrase) |
| join-response | name?, muted?, response | Join with passphrase proof |
| leave | — | Leave room |
| heartbeat | — | Keep-alive |
| mute | muted | Update mute state |
| offer | toId, sdp | WebRTC offer |
| answer | toId, sdp | WebRTC answer |
| ice | toId, candidate | ICE candidate |

### Server → Client

| type | Fields | Purpose |
|-----|--------|---------|
| challenge | challenge | One-time challenge (passphrase mode) |
| joined | selfId, participants[] | Join confirmed |
| join-error | message | Invalid join |
| participant-joined | id, name, muted | New participant |
| participant-left | id, reason | Someone left (reason: left, disconnect, reconnected) |
| participant-mute | id, muted | Mute change |
| offer | fromId, name?, muted?, sdp | Incoming offer |
| answer | fromId, sdp | Incoming answer |
| ice | fromId, candidate | ICE candidate |
| kicked | reason | Kicked (inactivity, room_reset) |
| error | message | Generic error |

### Raw Protocol

- Server sends `ping`; client must reply `pong` (plain text, not JSON).

---

## 7. Passphrase Authentication Flow

1. Server has `Room.Passphrase` set.
2. Client connects; server sends `challenge` with 32-char hex.
3. Client stores challenge; `RoomStateService.setAwaitingChallenge(true)`.
4. Client computes: `response = SHA256(SHA256(passphrase) + challenge)`.
5. Client sends `join-response` with `name`, `muted`, `response`.
6. Server checks: `SHA256(roomPassphraseHash + challenge) === response`.
7. If valid: `CompleteJoinAsync`; else: `join-error` and close.

---

## 8. WebRTC Mesh Architecture

- Each participant has N-1 peer connections (one per other participant).
- Offerer = participant with lexicographically smaller ID.
- Signaling: offer/answer/ICE relayed by server via `toId`/`fromId`.
- Audio flows peer-to-peer; server does not see media.

### STUN Configuration

- Frontend: `peer-connection.service.ts` — `stun:stun.l.google.com:19302`
- No TURN server by default (NAT traversal may fail in restrictive networks).

---

## 9. Configuration Reference

### appsettings.json

```json
{
  "Room": {
    "Passphrase": "",
    "InactivityMinutes": 15,
    "HeartbeatSeconds": 30
  }
}
```

### Environment Variables

| Variable | Maps to | Default |
|----------|---------|---------|
| Room__Passphrase | Room.Passphrase | (empty) |
| Room__InactivityMinutes | Room.InactivityMinutes | 15 |
| Room__HeartbeatSeconds | Room.HeartbeatSeconds | 30 |
| ROOM_PASSPHRASE | (legacy) | — |
| INACTIVITY_MINUTES | (legacy) | 15 |
| HEARTBEAT_SECONDS | (legacy) | 30 |
| ASPNETCORE_URLS | Backend binding | http://0.0.0.0:8080 |

---

## 10. Deployment & CI/CD

### Docker

- **backend**: .NET 8 runtime; listens on 8080
- **frontend**: Nginx; serves static files; proxies `/ws` and `/reset` to `backend:8080`
- **Port**: 8083 (host) → 80 (frontend container)

### docker-compose.yml (dev)

- Builds from source
- Backend and frontend built locally

### docker-compose.prod.yml

- Uses pre-built images: `defendersd/defender-chatroom-backend:latest`, `defendersd/defender-chatroom-frontend:latest`

### GitHub Workflow

- **File**: `.github/workflows/build-images.yml`
- **Trigger**: `workflow_dispatch` (manual)
- **Input**: `push_to_registry` (true/false)
- **Output**: Images tagged `YYYYMMDD-<run_number>` and `latest`
- **Registry**: Docker Hub `defendersd/defender-chatroom-*`

---

## 11. Testing

### Backend (xUnit)

- **Location**: `backend/Defender.ChatRoom.Tests/`
- **Run**: `dotnet test` from `backend/`
- **Projects**: RoomServiceTests, ChallengeServiceTests, CryptographyServiceTests (referenced in structure)

### Frontend (Karma + Jasmine)

- **Run**: `npm test` from `frontend/`
- **Specs**: e.g. `client-id.service.spec.ts`, `room-state.service.spec.ts`

---

## 12. Common Task Locations

| Task | Where to Look |
|------|---------------|
| Add new WebSocket message type | Backend: SignalingService.ProcessMessageAsync; Frontend: SignalingHandlerService.handleMessage |
| Change passphrase logic | Backend: SignalingService (HandleJoinResponseAsync, SendChallengeAsync), ChallengeService, CryptographyService; Frontend: RoomStateService.sha256, RoomComponent.sendJoinResponse |
| Change inactivity/timeout | Backend: RoomOptions, WebSocketHandlerService (ping loop); Frontend: WebSocketService (heartbeat, connection monitoring) |
| Change STUN/TURN | Frontend: peer-connection.service.ts — `DEFAULT_ICE_SERVERS`, `getIceServers()`. Add TURN via `window.__TURN_CONFIG__` before bootstrap (e.g. in index.html). |
| Add translation key | Frontend: translation-loader.service.ts (translations object); use `{{ 'key' \| translate }}` |
| Add new route | Frontend: app.routes.ts |
| Change nginx proxy | Frontend: nginx.conf |
| Reset endpoint behavior | Backend: Program.cs (`/reset` map) |
| Participant list / roster | Backend: RoomService; Frontend: PeerConnectionService.participants$ |

---

## 13. Known Limitations & Design Decisions

- **Mesh**: ~10 participants; N² peer connections.
- **No persistence**: All state in memory; restart clears everything.
- **No user accounts**: Optional passphrase only.
- **Audio only**: No video, screen share, or chat.
- **HTTP on localhost**: getUserMedia works over HTTP on localhost; HTTPS needed for non-localhost.
- **ClientId reuse**: Same clientId reconnecting replaces existing connection (reconnect-from-another-tab flow).
- **Offerer by ID**: Deterministic offerer selection avoids duplicate offers.
- **TURN for restrictive networks**: Default is dual STUN. For corporate/symmetric NAT, set `window.__TURN_CONFIG__ = [{ urls: 'turn:host:port', username: '...', credential: '...' }]` before app loads.

---

## 14. File-by-File Reference

### Backend

| File | Purpose |
|------|---------|
| Program.cs | WebSocket accept, /reset, DI wiring, config loading |
| RoomOptions.cs | Room.Passphrase, InactivityMinutes, HeartbeatSeconds |
| Models/Participant.cs | Id, Name, LastSeen, Muted |
| Services/SignalingService.cs | ProcessMessageAsync, join/leave/mute/offer/answer/ice, challenge |
| Services/BroadcastService.cs | Broadcast to room participants |
| Services/RoomResetHandler.cs | /reset endpoint logic |
| Services/RoomService.cs | Participant CRUD, thread-safe |
| Services/WebSocketConnectionService.cs | connectionId → WebSocket map |
| Services/WebSocketHandlerService.cs | Receive loop, ping, inactivity, CleanupConnection |
| Services/WebSocketMessageService.cs | Serialize and send JSON |
| Services/ChallengeService.cs | Generate, get, remove challenge |
| Services/CryptographyService.cs | SHA-256 |

### Frontend

| File | Purpose |
|------|---------|
| main.ts | Bootstrap, router, TranslateModule |
| app.component.ts | Router outlet |
| app.routes.ts | '', 'room' |
| models/signaling.ts | SignalingMessage, ParticipantInfo types |
| welcome/welcome.component.ts | Form, navigate to room |
| room/room.component.ts | Room UI, orchestrates services |
| room/room.component.html | Room template |
| services/websocket.service.ts | Connect, send, messages$, reconnect, heartbeat |
| services/peer-connection.service.ts | RTCPeerConnection, offer/answer/ICE, participants |
| services/peer-orchestrator.service.ts | Peer creation with pending/processing queue |
| services/signaling-handler.service.ts | Handles all signaling message types |
| services/audio.service.ts | Microphone, mute, volume, mic level |
| services/room-state.service.ts | displayName, passphrase, selfId, challenge |
| services/client-id.service.ts | localStorage clientId |
| services/crypto.service.ts | SHA-256 hashing for passphrase |
| services/health-monitor.service.ts | Health checks, recovery |
| services/translation-loader.service.ts | en, ru, bl translations |
| components/participant.component.ts | Participant card |
| components/room-controls.component.ts | Mute, volume, mic level, leave |
| components/connection-status.component.ts | Connection/reconnect status |
| components/language-selector.component.ts | en/ru/bl selector |
| nginx.conf | SPA, /ws, /reset proxy |

---

**End of guide.** Use this document in conjunction with `docs/DOCUMENTATION.md` for architecture diagrams and sequence flows.
