# AGENTS.md

## Stack

Vue 3 + TypeScript + Vite 8 SPA. Backend is Tencent CloudBase (realtime DB, no self-hosted server). Deployed to GitHub Pages.

## Commands

```bash
npm run dev        # local dev server (base: /)
npm run build      # vue-tsc -b && vite build (typecheck THEN build)
npm run test       # vitest run
```

There is no linter or formatter configured. Do not attempt to run eslint/prettier/biome.

## Build & Deploy

- `npm run build` type-checks first via `vue-tsc -b`; fix type errors before expecting a successful build.
- Production base path is `/classroom-toolkit/` (set conditionally in `vite.config.ts`).
- CI uses Node 24, npm, and deploys `dist/` to GitHub Pages on push to main/master.
- Two required env vars (from `.env`): `VITE_CLOUDBASE_ENV_ID`, `VITE_CLOUDBASE_PUBLISHABLE_KEY`.

## Testing

- Vitest with jsdom environment (configured in `vite.config.ts`).
- Test files are co-located: `*.test.ts` next to their source.
- Run a single test file: `npx vitest run src/path/to/file.test.ts`

## Architecture

- `src/main.ts` — app entrypoint; creates Pinia store, hydrates from localStorage, mounts after router ready.
- `src/router/index.ts` — uses **hash history** (`createWebHashHistory`) for GitHub Pages SPA compatibility.
- `src/stores/classroomStore.ts` — Pinia store with localStorage persistence (offline/local mode).
- `src/services/cloudbaseService.ts` — factory wrapping CloudBase SDK; two collections: `rooms`, `queueItems`; realtime sync via `.watch()`.
- `src/features/recitation/` — pure domain logic (queue management) and input utilities.
- `src/views/` — page components (Home, Create, Student, Teacher views).

Dual mode: local Pinia store for offline, CloudBase service for online multi-device sync.

## Conventions

- Path alias `@` → `./src` (configured in both tsconfig and vite).
- No monorepo; single `package.json` at root.
- npm is the package manager (lockfile is `package-lock.json`).
