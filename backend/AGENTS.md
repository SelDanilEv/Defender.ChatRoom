# Backend Agent Notes

## Scope
- Applies to everything under `backend/`.
- Backend stack: `.NET 8` minimal API + WebSocket signaling.

## Run And Test
- Restore/build: `dotnet restore` then `dotnet build Defender.ChatRoom.sln`
- Run app: `dotnet run --project Defender.ChatRoom.csproj`
- Run tests: `dotnet test Defender.ChatRoom.Tests/Defender.ChatRoom.Tests.csproj`

## Code Rules
- Keep signaling message contracts backward compatible unless explicitly changing both frontend and backend together.
- Favor small, explicit service methods in `Services/` over large procedural blocks.
- Keep logs structured and include `ClientId` for connection lifecycle events.

## Safety Checks Before Commit
- Build passes for solution.
- Backend tests pass.
- WebSocket connect/join/leave flow still works end-to-end.
