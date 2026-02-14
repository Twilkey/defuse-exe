# DEFUSE.EXE

Procedural Discord Activity bomb-defusal game with server-authoritative multiplayer, asymmetric private briefs, and voice-budget mechanics.

## Monorepo layout

- `packages/client` — React + Vite Discord Activity UI
- `packages/server` — Express + WebSocket authoritative game server
- `packages/shared` — shared types + deterministic generator + JSON configs
- `packages/voice-bot` — companion Discord bot forwarding `SPEAK_START`/`SPEAK_END`
- `DEFUSE_EXE_PLAN` — build plan and progress tracker

## Features implemented

- Full round loop: lobby → start → active defusal → results → play again
- Procedural bomb generation from seed, tier, player count, and JSON config
- 4 interactive module types: wires, dial, glyph grid, power cell
- Asymmetric role briefs and capability lanes
- Voice mechanics: shared pool, silence windows, one-speaker penalties, overlap drain
- Support abilities: time dilation, comms battery, noise gate, echo cancel
- Admin tools: config reload, simulation endpoint, telemetry endpoint
- Privacy-first telemetry and instance-isolated voice event validation

## Local setup

### 1) Install dependencies

```bash
pnpm install
# or
npm install
```

### 2) Configure environment files

Copy and fill:

- `packages/server/.env.example` → `packages/server/.env`
- `packages/client/.env.example` → `packages/client/.env`
- `packages/voice-bot/.env.example` → `packages/voice-bot/.env` (only needed for voice mode testing)

### 3) Run all packages

```bash
pnpm dev
# or
npm run dev
```

Default ports:

- Client: `http://localhost:5173`
- Server: `http://localhost:3001`

### 4) Quick local test (without Discord)

- Open `http://localhost:5173?instance_id=local-instance` in two browser windows.
- Press `Start` in one window.
- Validate both windows sync lobby/round state in real time.

## Discord Activity setup

Follow `DEFUSE_EXE_PLAN/09-manual-setup-discord-portal.md`.

Use your tunnel URL for Discord URL Mapping root path `/`.

## Voice companion bot

The bot sends speaking boolean events only. It does not store or process raw audio.

Run:

```bash
pnpm --filter @defuse/voice-bot dev
# or
npm run dev --workspace @defuse/voice-bot
```

## Admin endpoints

- `POST /api/admin/reload-config` with header `x-admin-secret`
- `POST /api/admin/simulate` with header `x-admin-secret`
- `GET /api/telemetry` with header `x-admin-secret`

## Security notes

- Server-authoritative actions and state transitions
- CORS allowlist and request rate limiting enabled
- Voice events validated by shared source token + instance membership
- Telemetry hashes Discord user IDs with server salt
