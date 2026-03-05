# Frontend Agent Notes

## Scope
- Applies to everything under `frontend/`.
- Frontend stack: Angular standalone components + WebRTC audio + WebSocket signaling.

## Run And Test
- Install deps: `npm ci`
- Dev server: `npm start`
- Build: `npm run build`
- Tests: `npm test -- --watch=false --browsers=ChromeHeadless`

## Code Rules
- Keep room behavior fail-fast: unhealthy local connection/audio should drop the current user from the call.
- Keep controls minimal: mute, speaker volume, mic level.
- Avoid reconnect/recovery loops unless explicitly requested.
- Keep `index.html` non-cached in deployment setup; hashed JS/CSS can be cached long-term.

## Safety Checks Before Commit
- Angular build passes.
- Unit tests pass.
- Multi-user smoke test: join room from two browsers and verify bidirectional audio, mute, and clean leave.
