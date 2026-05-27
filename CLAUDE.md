# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # local dev server
npm run build      # type-check (vue-tsc -b) then build (vite build)
npm run test       # run all vitest tests
npm run preview    # preview production build locally

# Single test file
npx vitest run src/path/to/file.test.ts
```

There is no linter or formatter configured. Do not run eslint/prettier/biome.

## Architecture

Vue 3 + TypeScript + Vite 8 SPA with Element Plus UI. Backend is Tencent CloudBase (realtime NoSQL DB, no self-hosted server). Deployed to GitHub Pages via the workflow in `.github/workflows/deploy.yml`.

### Dual offline/online mode

The app works in two modes:
- **Offline/local**: The Pinia store (`src/stores/classroomStore.ts`) manages state in-memory with localStorage persistence. Domain logic lives in `src/features/recitation/sessionLogic.ts` (pure functions operating on `RecitationSession`).
- **Online/multi-device**: Views bypass the Pinia store and call `src/services/cloudbaseService.ts` directly. This service wraps the CloudBase JS SDK and provides realtime sync via `.watch()` on the `rooms` and `queueItems` collections.

The store is effectively used for standalone/demo mode; the online CloudBase flow is the primary production path.

### Key source layout

- `src/main.ts` — creates the Vue app, installs Pinia + Element Plus, hydrates the store from localStorage, then mounts after the router is ready.
- `src/router/index.ts` — **hash history** (`createWebHashHistory`) for GitHub Pages SPA compatibility.
- `src/services/cloudbaseService.ts` — factory function `createCloudBaseService()` wrapping CloudBase SDK. All dependency injection points (env vars, code generators, `now()`) accept option overrides for testability. Default instance is exported as named functions. Three collections: `rooms`, `queueItems`, `archivedTasks`.
- `src/stores/classroomStore.ts` — Pinia store for offline mode. Hydrates from/persists to localStorage under `classroom-toolkit:sessions` and `classroom-toolkit:active-session-id`.
- `src/features/recitation/` — pure domain logic:
  - `sessionLogic.ts` — queue management (add, finish-next, skip-next, remove, reset). Student numbers validate to 1–55.
  - `completionMatrix.ts` — builds a 5×10 matrix (50 students total) tracking who has completed recitation.
  - `room.ts` — reactive `currentRoom` singleton and room title formatting.
  - `teacherPinAuth.ts` — sessionStorage-persisted teacher PIN authorization.
  - `inputBuffer.ts` — tiny helper to clear input buffer after submission.
- `src/utils/callAudioPlayer.ts` — sequential audio playback with cancellation token. Uses `/audio/call/` base path (MP3 files served from `public/audio/call/`).
- `src/utils/errorMessage.ts` — extracts human-readable messages from CloudBase or generic error objects.
- `src/views/` — page components using `<script setup>` and Composition API.
  - `HomeView.vue` — room creation + entry (teacher PIN, student join code).
  - `RecitationTeacherView.vue` — PIN-gated teacher dashboard: call next, mark done, skip, prioritize, archive.
  - `RecitationStudentView.vue` — student join + realtime queue display with TTS call announcements.
  - `StudentEntryView.vue` — student-facing join code entry.

### CloudBase collections

`rooms` (doc ID = sessionCode): title, sessionCode, teacherPin, currentStudentNo, studentJoinCode, joinEnabled, announceVersion, timestamps.
`queueItems` (doc ID = `{roomId}_{studentNo}`): roomCode, studentNo, status (waiting|current|done|removed), orderKey, timestamps.
`archivedTasks`: snapshot of completed tasks with completion matrix data, room reference, and timestamps.

### Conventions

- Path alias `@` → `./src` (configured in tsconfig and vite).
- Test files co-located as `*.test.ts`. Vitest with jsdom environment.
- No monorepo; single `package.json` at root. npm is the package manager.
- Vue 3 Composition API with `<script setup>` throughout.
- `cloudbaseService.ts` uses a factory pattern — tests import `createCloudBaseService` with fake options rather than mocking the SDK.
- The `_id` field on `QueueItem` is a compound key: `{roomId}_{studentNo}`.
