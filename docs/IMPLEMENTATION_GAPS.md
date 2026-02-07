# Implementation Gaps

**Note:** The issues in this document have been addressed: local track monitoring, health UI, audio context check, backend error handling and validation, removal of dead code, README/defaults, offer name/muted, participant-left toast, and unit tests (backend and frontend) were added. The list below is kept for historical reference.

This document lists gaps that were in the implementation: incomplete code, missing behavior, inconsistencies, and dead or duplicate code. Use it to prioritize fixes or feature completion.

---

## 1. Empty or stub implementation

### 1.1 `startLocalTrackMonitoring()` — empty

**File:** [frontend/src/app/room/room.component.ts](frontend/src/app/room/room.component.ts)

**Location:** Called from `ngOnInit()`, body is empty.

```ts
private startLocalTrackMonitoring(): void {
}
```

**Gap:** No local track monitoring (e.g. detecting when the microphone track ends or is muted externally). The method is never implemented.

**Suggestion:** Either implement (e.g. listen to `MediaStreamTrack.onended` / `onmute` and update UI or reconnect), or remove the call from `ngOnInit` and the method.

---

## 2. Incomplete or no-op logic

### 2.1 `checkAudioContext()` always returns healthy

**File:** [frontend/src/app/services/health-monitor.service.ts](frontend/src/app/services/health-monitor.service.ts)

**Location:** `checkAudioContext()` (used in `performHealthCheck()`).

**Current behavior:** Always returns `'healthy'`; it does not inspect `AudioContext` state.

**Gap:** Suspended or closed `AudioContext` (e.g. after browser tab backgrounding) is never reported, so recovery is not triggered for audio context.

**Suggestion:** If the app uses an `AudioContext` (e.g. in [AudioService](frontend/src/app/services/audio.service.ts)), read its `state` and return `'unhealthy'` when `state === 'suspended'` or `'closed'`, and wire recovery (e.g. `resumeAudioContext`) in `attemptRecovery` when `audioContext === 'unhealthy'`.

---

### 2.2 Health monitor status not shown in UI

**File:** [frontend/src/app/services/health-monitor.service.ts](frontend/src/app/services/health-monitor.service.ts), [frontend/src/app/room/room.component.ts](frontend/src/app/room/room.component.ts)

**Current behavior:** `HealthMonitorService.startMonitoring()` and `stopMonitoring()` are used; `status`, `getHealthReport()`, and `forceRecovery()` are never used in templates or components.

**Gap:** Health checks run and recovery is attempted, but the user never sees overall health or a way to trigger manual recovery.

**Suggestion:** In the room UI, show `healthMonitor.status()` (or a summary) and optionally a “Retry” button that calls `forceRecovery()` when status is unhealthy.

---

## 3. Error handling and validation

### 3.1 Empty catch in `/reset` body parsing

**File:** [backend/Program.cs](backend/Program.cs)

**Location:** `/reset` endpoint, when reading JSON body.

**Current code:** `catch { }` swallows all exceptions during JSON deserialization.

**Gap:** Malformed JSON or non-JSON body fails silently; the request then falls back to query string. No logging or client feedback for bad body.

**Suggestion:** At least log the exception (e.g. `Console.WriteLine` or ILogger). Optionally return 400 with a short message when body is present but invalid JSON.

---

### 3.2 Signaling: malformed or missing fields — no client feedback

**File:** [backend/Services/SignalingService.cs](backend/Services/SignalingService.cs)

**Current behavior:** `ProcessMessageAsync` wraps everything in `try/catch` and only logs. Missing or invalid JSON (e.g. missing `type`, or `join` without `name`) causes an exception; the client gets no response.

**Gap:** Clients that send invalid messages (e.g. `join` with no `name`) never receive a `join-error` or similar; they just see no `joined` and get no explanation.

**Suggestion:** Use `TryGetProperty` / safe parsing for optional fields (e.g. `name` in join/join-response). For invalid or missing required fields, send a structured error message to the client (e.g. `{ type: "error", message: "..." }`) instead of only logging.

---

## 4. Dead or duplicate code

### 4.1 `TranslationService` unused

**File:** [frontend/src/app/services/translation.service.ts](frontend/src/app/services/translation.service.ts)

**Current behavior:** The app uses `@ngx-translate/core` with `TranslateModule` and `CustomTranslateLoader` from [translation-loader.service.ts](frontend/src/app/services/translation-loader.service.ts). `TranslationService` is never injected or used anywhere.

**Gap:** Duplicate translation data and a second translation path that is never used; risk of keys getting out of sync.

**Suggestion:** Remove [translation.service.ts](frontend/src/app/services/translation.service.ts) and keep a single source of truth in the translation loader (or the other way around, if you prefer a programmatic API). Ensure all UI uses one mechanism.

---

## 5. Documentation / config mismatch

### 5.1 Default inactivity minutes

**Files:** [README.md](README.md), [backend/RoomOptions.cs](backend/RoomOptions.cs), [backend/appsettings.json](backend/appsettings.json)

**README says:** “Inactivity timeout (5 minutes default)”.

**Code/defaults:** `RoomOptions.InactivityMinutes = 15`, `appsettings.json` has `"InactivityMinutes": 15`, and legacy env in Program uses `"15"`.

**Gap:** Documentation says 5, code defaults to 15.

**Suggestion:** Change README to “15 minutes default” or change the code/appsettings default to 5 so they match.

---

## 6. Optional / nice-to-have improvements

### 6.1 Offer relay omits participant name/muted

**File:** [backend/Services/SignalingService.cs](backend/Services/SignalingService.cs) — `HandleOfferAsync`

**Current behavior:** Server relays `offer` with only `fromId` and `sdp`. It does not include `name` or `muted`.

**Frontend:** [room.component.ts](frontend/src/app/room/room.component.ts) uses `message.name || 'Guest'` when creating a peer for an incoming offer.

**Gap:** If the answerer has not yet received `participant-joined` (e.g. race), the UI shows “Guest” until the next update. Including `name` and `muted` from `RoomService` in the relayed offer would make the UI consistent immediately.

**Suggestion:** When relaying `offer`, add `name` and `muted` from `_roomService.GetParticipant(connectionId)` so the answerer can display the correct label without waiting for another message.

---

### 6.2 Participant-left reason not shown to user

**Current behavior:** Backend sends `participant-left` with `reason` (`"left"`, `"disconnect"`, `"reconnected"`). Frontend only removes the participant from the list; it does not show the reason.

**Gap:** Users cannot tell if someone left voluntarily, was disconnected, or reconnected (replaced tab).

**Suggestion:** Optional: show a short toast or inline message (e.g. “X left the call” vs “X disconnected”) using the existing `reason` field.

---

## Summary table

| #   | Category        | Location                    | Severity / impact                          |
|-----|-----------------|-----------------------------|--------------------------------------------|
| 1.1 | Stub            | RoomComponent               | Low (unused hook)                          |
| 2.1 | Incomplete      | HealthMonitorService        | Medium (audio context not monitored)       |
| 2.2 | Incomplete      | HealthMonitorService + Room | Low (status not surfaced)                  |
| 3.1 | Error handling  | Program.cs /reset           | Low (silent failure on bad JSON)           |
| 3.2 | Error handling  | SignalingService            | Medium (no client feedback on bad input)  |
| 4.1 | Dead code       | TranslationService          | Low (maintainability)                      |
| 5.1 | Doc/config      | README vs backend defaults  | Low (wrong default in docs)                |
| 6.1 | Optional        | SignalingService offer      | Low (UI can show “Guest” briefly)         |
| 6.2 | Optional        | Room UI participant-left   | Low (no reason shown)                     |

Recommended order to address: 3.2 (client feedback), 2.1 (audio context health), 5.1 (doc fix), then 1.1, 2.2, 3.1, 4.1, 6.1, 6.2 as time allows.
