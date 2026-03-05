# Repository Guidelines

## Project Structure & Module Organization
This repository contains an audio-only chat app with separate frontend and backend projects:

- `frontend/`: Angular app (standalone components). Main code is in `frontend/src/app/` with `components/`, `services/`, `room/`, `welcome/`, and `models/`.
- `backend/`: .NET 8 Minimal API signaling server. Core logic is in `backend/Services/`, shared models in `backend/Models/`, and entrypoint in `backend/Program.cs`.
- `backend/Defender.ChatRoom.Tests/`: xUnit + Moq unit tests for backend services.
- `docs/`: architecture and project guides.
- `scripts/`: deployment/ops shell scripts.

## Build, Test, and Development Commands
Run commands from repository root unless noted:

- `docker compose up --build`: build and run full stack via containers.
- `dotnet run --project backend/Defender.ChatRoom.csproj`: run backend locally (`http://localhost:8080`).
- `dotnet test backend/Defender.ChatRoom.Tests/Defender.ChatRoom.Tests.csproj`: run backend tests.
- `cd frontend && npm ci`: install frontend dependencies cleanly.
- `cd frontend && npm start`: run Angular dev server (`http://localhost:4200`).
- `cd frontend && npm run build`: production frontend build.
- `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`: run frontend tests once.

## Coding Style & Naming Conventions
- TypeScript is strict (`frontend/tsconfig.json`): keep explicit types, null safety, and narrow unknown input.
- Angular naming: `*.component.ts`, `*.service.ts`, `*.spec.ts`; class names in PascalCase; keep existing signal-style naming (e.g., `participants$`).
- C# style: 4-space indentation, PascalCase for types/methods/properties, clear DI-friendly service boundaries.
- Prefer small, single-purpose methods and explicit cleanup of WebSocket/media resources.

## Testing Guidelines
- Frontend: Jasmine + Karma; specs live beside source files as `*.spec.ts`.
- Backend: xUnit + Moq; test files follow `*Tests.cs`.
- Add/adjust tests for any signaling, peer-connection, WebSocket, or room-state change.
- Validate both stacks before opening a PR.

## Commit & Pull Request Guidelines
- Use imperative commit subjects like existing history: `Fix ...`, `Add ...`, `Improve ...`, `Refactor ...`.
- Keep commits focused (avoid mixing unrelated frontend/backend changes).
- PRs should include:
  - What changed and why.
  - Test commands run and outcomes.
  - UI screenshots/GIFs for visible frontend updates.
  - Linked issue/task and any config/environment changes.

## Security & Configuration Tips
- Never commit secrets or real passphrases.
- Prefer environment variables for runtime config (e.g., `Room__Passphrase`, `Room__InactivityMinutes`, `Room__HeartbeatSeconds`).
- For microphone/WebRTC behavior, use `localhost` during development or HTTPS in deployed environments.
