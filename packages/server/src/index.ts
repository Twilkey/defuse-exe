import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";
import {
  BombSpec,
  ClientEnvelope,
  MatchAction,
  MatchState,
  PublicMatchView,
  RoleBrief,
  ServerEnvelope,
  VoiceEvent,
  voiceEventSchema,
  createInitialResources,
  generateBombSpec,
  generateRoleBriefs,
  chooseTalkModeForBomb,
  loadConfigs
} from "@defuse/shared";

dotenv.config();

const PORT = Number(process.env.PORT ?? "3001");
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
const VOICE_SOURCE_TOKEN = process.env.VOICE_SOURCE_TOKEN ?? "local-voice-source";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "dev-admin-secret";
const STATS_SALT = process.env.STATS_SALT ?? "dev-salt";
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const allowAllOrigins = allowedOrigins.includes("*");

function isAllowedOrigin(origin: string): boolean {
  if (allowAllOrigins) return true;

  for (const allowedOrigin of allowedOrigins) {
    if (allowedOrigin === origin) {
      return true;
    }

    if (allowedOrigin.startsWith("*.")) {
      const domain = allowedOrigin.slice(2);
      if (origin.endsWith(`.${domain}`) || origin === `https://${domain}` || origin === `http://${domain}`) {
        return true;
      }
    }
  }

  return false;
}
const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const sharedConfigPath = path.resolve(runtimeDir, "../../shared/config");
const clientDistPath = path.resolve(runtimeDir, "../../client/dist");

type ClientConnection = {
  socket: WebSocket;
  userId: string;
  instanceId: string;
};

type TelemetryRow = {
  matchId: string;
  durationMs: number;
  outcome: "defused" | "exploded" | "timeout";
  playerCount: number;
  archetypeId: string;
  talkSecondsUsed: number;
  at: number;
  players: string[];
};

type RuntimeInstance = {
  state: MatchState;
  briefs: Record<string, RoleBrief>;
  connections: Map<string, ClientConnection>;
  tier: number;
  startedAtMs?: number;
  initialTalkBudget: number;
};

let configs = loadConfigs(sharedConfigPath);
const instances = new Map<string, RuntimeInstance>();
const telemetry: TelemetryRow[] = [];

function now(): number {
  return Date.now();
}

function sendEnvelope(socket: WebSocket, envelope: ServerEnvelope): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(envelope));
  }
}

function hashUserId(userId: string): string {
  return crypto.createHash("sha256").update(`${STATS_SALT}:${userId}`).digest("hex");
}

function dailySeed(): string {
  const date = new Date();
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
}

function createEmptyState(instanceId: string): MatchState {
  return {
    instanceId,
    phase: "lobby",
    seed: dailySeed(),
    createdAtMs: now(),
    updatedAtMs: now(),
    players: {},
    resources: {
      timerMsRemaining: 0,
      commsSecondsRemaining: 0,
      stability: 3
    },
    voice: {
      mode: "shared_pool",
      speakingUsers: {},
      overlapPenaltyArmed: true
    },
    eventLog: []
  };
}

function ensureInstance(instanceId: string): RuntimeInstance {
  let runtime = instances.get(instanceId);
  if (!runtime) {
    runtime = {
      state: createEmptyState(instanceId),
      briefs: {},
      connections: new Map<string, ClientConnection>(),
      tier: 2,
      initialTalkBudget: 0
    };
    instances.set(instanceId, runtime);
  }
  return runtime;
}

function pushEvent(runtime: RuntimeInstance, text: string): void {
  runtime.state.eventLog.unshift(text);
  runtime.state.eventLog = runtime.state.eventLog.slice(0, 30);
  runtime.state.updatedAtMs = now();
}

function toPublicState(state: MatchState): PublicMatchView {
  return {
    instanceId: state.instanceId,
    phase: state.phase,
    seed: state.seed,
    resources: state.resources,
    voice: {
      mode: state.voice.mode,
      speakingCount: Object.keys(state.voice.speakingUsers).length,
      silenceWindowUntilMs: state.voice.silenceWindowUntilMs,
      noiseGateUntilMs: state.voice.noiseGateUntilMs
    },
    bomb: state.bomb,
    players: Object.values(state.players).map((player) => ({
      userId: player.userId,
      displayName: player.displayName,
      isHost: player.isHost,
      connected: player.connected,
      roleName: player.roleName,
      capabilities: player.capabilities
    })),
    eventLog: state.eventLog,
    result: state.result
  };
}

function broadcastState(runtime: RuntimeInstance): void {
  for (const [userId, connection] of runtime.connections) {
    sendEnvelope(connection.socket, {
      type: "state_patch",
      state: toPublicState(runtime.state),
      privateBrief: runtime.briefs[userId]
    });
  }
}

function canStart(runtime: RuntimeInstance): boolean {
  const playerCount = Object.keys(runtime.state.players).length;
  return runtime.state.phase === "lobby" && playerCount >= 1;
}

function computeTier(playerCount: number): number {
  if (playerCount <= 2) return 1;
  if (playerCount <= 6) return 2;
  return 3;
}

function isModuleSolved(moduleState: BombSpec["modules"][number]): boolean {
  if (moduleState.moduleType === "wires") {
    const wires = moduleState.params.wires as Array<{ cut: boolean }>;
    const safeWire = moduleState.params.safeWire as number;
    return wires[safeWire]?.cut === true;
  }
  if (moduleState.moduleType === "dial") {
    return moduleState.solved;
  }
  if (moduleState.moduleType === "glyph") {
    const progress = Number(moduleState.params.progress ?? 0);
    const sequence = moduleState.params.sequence as number[];
    return progress >= sequence.length;
  }
  if (moduleState.moduleType === "power") {
    const polarity = String(moduleState.params.polarity);
    const targetPolarity = String(moduleState.params.targetPolarity);
    return polarity === targetPolarity;
  }
  return moduleState.solved;
}

function evaluateRound(runtime: RuntimeInstance): void {
  const state = runtime.state;
  if (!state.bomb || state.phase !== "active") return;

  const allSolved = state.bomb.modules.every((moduleState) => isModuleSolved(moduleState));
  if (allSolved) {
    state.phase = "results";
    state.result = { outcome: "defused", reason: "All modules solved.", endedAtMs: now() };
    pushEvent(runtime, "Bomb defused.");
    recordTelemetry(runtime);
  }
}

function applyPenalty(runtime: RuntimeInstance, text: string, severity = 1): void {
  const state = runtime.state;
  state.resources.stability = Math.max(0, state.resources.stability - severity);
  state.resources.commsSecondsRemaining = Math.max(0, state.resources.commsSecondsRemaining - severity * 2);
  pushEvent(runtime, text);

  if (state.resources.stability <= 0) {
    explode(runtime, "Stability collapsed.");
  }
}

function explode(runtime: RuntimeInstance, reason: string): void {
  if (runtime.state.phase !== "active") return;
  runtime.state.phase = "results";
  runtime.state.result = { outcome: "exploded", reason, endedAtMs: now() };
  pushEvent(runtime, `BOOM: ${reason}`);
  recordTelemetry(runtime);
}

function timeout(runtime: RuntimeInstance): void {
  if (runtime.state.phase !== "active") return;
  runtime.state.phase = "results";
  runtime.state.result = { outcome: "timeout", reason: "Timer reached zero.", endedAtMs: now() };
  pushEvent(runtime, "Timer expired.");
  recordTelemetry(runtime);
}

function recordTelemetry(runtime: RuntimeInstance): void {
  if (!runtime.state.bomb || !runtime.state.result || runtime.startedAtMs === undefined) return;

  telemetry.push({
    matchId: `${runtime.state.instanceId}:${runtime.startedAtMs}`,
    durationMs: Math.max(0, now() - runtime.startedAtMs),
    outcome: runtime.state.result.outcome,
    playerCount: Object.keys(runtime.state.players).length,
    archetypeId: runtime.state.bomb.archetypeId,
    talkSecondsUsed: Math.max(0, runtime.initialTalkBudget - runtime.state.resources.commsSecondsRemaining),
    at: now(),
    players: Object.keys(runtime.state.players).map(hashUserId)
  });

  if (telemetry.length > 1000) {
    telemetry.splice(0, telemetry.length - 1000);
  }
}

function startMatch(runtime: RuntimeInstance): void {
  const state = runtime.state;
  const players = Object.values(state.players);
  runtime.tier = computeTier(players.length);

  state.phase = "active";
  state.seed = `${dailySeed()}-${Math.floor(Math.random() * 99999)}`;
  state.resources = createInitialResources(players.length, runtime.tier, configs);
  runtime.initialTalkBudget = state.resources.commsSecondsRemaining;

  state.bomb = generateBombSpec(state.seed, players.length, runtime.tier, configs);
  state.voice.mode = chooseTalkModeForBomb(configs, state.bomb);
  state.voice.speakingUsers = {};
  state.voice.overlapPenaltyArmed = true;
  state.voice.noiseGateUntilMs = undefined;
  state.voice.silenceWindowUntilMs = undefined;

  runtime.briefs = generateRoleBriefs(players, state.bomb);
  for (const [userId, brief] of Object.entries(runtime.briefs)) {
    const player = state.players[userId];
    if (!player) continue;
    player.roleName = brief.roleName;
    player.capabilities = brief.capabilities;
    player.privateHints = brief.privateHints;
  }

  state.result = undefined;
  runtime.startedAtMs = now();
  pushEvent(runtime, `Match started. Archetype: ${state.bomb.archetypeId}`);
}

function resetToLobby(runtime: RuntimeInstance): void {
  const players = Object.values(runtime.state.players).map((player) => ({
    ...player,
    roleName: "Unassigned",
    capabilities: [],
    privateHints: []
  }));

  runtime.state = createEmptyState(runtime.state.instanceId);
  for (const player of players) {
    runtime.state.players[player.userId] = player;
  }
  runtime.state.hostUserId = players.find((player) => player.isHost)?.userId;
  runtime.briefs = {};
  pushEvent(runtime, "Lobby reset. Ready for replay.");
}

function canUseCapability(playerId: string, runtime: RuntimeInstance, capability: string): boolean {
  const player = runtime.state.players[playerId];
  return player?.capabilities.includes(capability as never) ?? false;
}

function mutateAction(runtime: RuntimeInstance, userId: string, action: MatchAction): void {
  const state = runtime.state;
  if (state.phase !== "active" || !state.bomb) return;

  const player = state.players[userId];
  if (!player) return;
  player.stats.actions += 1;

  if (action.type === "use_ability") {
    if (action.ability === "time_dilation" && canUseCapability(userId, runtime, "anchor")) {
      state.resources.timerMsRemaining += 10_000;
      player.stats.supportActions += 1;
      pushEvent(runtime, `${player.displayName} used Time Dilation.`);
      return;
    }
    if (action.ability === "comms_battery" && canUseCapability(userId, runtime, "buffer")) {
      state.resources.commsSecondsRemaining += 20;
      player.stats.supportActions += 1;
      pushEvent(runtime, `${player.displayName} added +20 comms seconds.`);
      return;
    }
    if (action.ability === "noise_gate" && canUseCapability(userId, runtime, "scanner")) {
      state.voice.noiseGateUntilMs = now() + 5000;
      player.stats.supportActions += 1;
      pushEvent(runtime, `${player.displayName} opened Noise Gate for 5 seconds.`);
      return;
    }
    if (action.ability === "echo_cancel" && canUseCapability(userId, runtime, "auditor")) {
      state.voice.overlapPenaltyArmed = false;
      player.stats.supportActions += 1;
      pushEvent(runtime, `${player.displayName} canceled one overlap penalty.`);
      return;
    }
    applyPenalty(runtime, `${player.displayName} used unavailable ability.`);
    return;
  }

  if (action.type === "observer_ping") {
    player.stats.supportActions += 1;
    pushEvent(runtime, `${player.displayName} pinged module ${action.moduleId}.`);
    return;
  }

  const moduleState = state.bomb.modules.find((candidate) => candidate.id === action.moduleId);
  if (!moduleState) {
    applyPenalty(runtime, "Invalid module action target.");
    return;
  }

  if (moduleState.lockedUntilMs && moduleState.lockedUntilMs > now()) {
    applyPenalty(runtime, `${moduleState.id} is temporarily locked.`);
    return;
  }

  if (action.type === "inspect_wire" && moduleState.moduleType === "wires") {
    const wires = moduleState.params.wires as Array<{
      id: string;
      inspectedProperties: string[];
    }>;
    const wire = wires.find((item) => item.id === action.wireId);
    if (!wire) {
      applyPenalty(runtime, "Wire not found.");
      return;
    }
    if (!wire.inspectedProperties.includes(action.property)) {
      wire.inspectedProperties.push(action.property);
    }
    moduleState.lockedUntilMs = now() + 500;
    pushEvent(runtime, `${player.displayName} inspected ${action.property} on ${action.wireId}.`);
    return;
  }

  if (action.type === "cut_wire" && moduleState.moduleType === "wires") {
    const wires = moduleState.params.wires as Array<{ id: string; cut: boolean }>;
    const safeWire = Number(moduleState.params.safeWire);
    const wireIndex = wires.findIndex((wire) => wire.id === action.wireId);

    if (wireIndex < 0) {
      applyPenalty(runtime, "Attempted to cut unknown wire.");
      return;
    }

    wires[wireIndex].cut = true;
    if (wireIndex !== safeWire) {
      applyPenalty(runtime, `${player.displayName} cut the wrong wire.`, 2);
    } else {
      moduleState.solved = true;
      pushEvent(runtime, `${player.displayName} cut the safe wire.`);
    }
    evaluateRound(runtime);
    return;
  }

  if (action.type === "reroute_wire" && moduleState.moduleType === "wires") {
    const wires = moduleState.params.wires as Array<{ cut: boolean }>;
    wires.reverse();
    moduleState.lockedUntilMs = now() + 1000;
    pushEvent(runtime, `${player.displayName} rerouted wire lattice.`);
    return;
  }

  if (action.type === "rotate_dial" && moduleState.moduleType === "dial") {
    const max = String(moduleState.params.alphabet) === "A-F" ? 15 : 9;
    const value = Number(moduleState.params.value);
    moduleState.params.value = (value + action.delta + (max + 1)) % (max + 1);
    return;
  }

  if (action.type === "lock_dial" && moduleState.moduleType === "dial") {
    const value = Number(moduleState.params.value);
    const targetMin = Number(moduleState.params.targetMin);
    const targetMax = Number(moduleState.params.targetMax);
    if (value >= targetMin && value <= targetMax) {
      moduleState.solved = true;
      pushEvent(runtime, `${player.displayName} locked dial correctly.`);
    } else {
      applyPenalty(runtime, `${player.displayName} locked dial out of safe range.`);
    }
    evaluateRound(runtime);
    return;
  }

  if (action.type === "press_glyph" && moduleState.moduleType === "glyph") {
    const sequence = moduleState.params.sequence as number[];
    const progress = Number(moduleState.params.progress ?? 0);
    if (sequence[progress] === action.glyphIndex) {
      moduleState.params.progress = progress + 1;
      if (progress + 1 >= sequence.length) {
        moduleState.solved = true;
        pushEvent(runtime, `${player.displayName} solved glyph grid.`);
        evaluateRound(runtime);
      }
    } else {
      moduleState.params.progress = 0;
      applyPenalty(runtime, `${player.displayName} hit wrong glyph.`);
    }
    return;
  }

  if (action.type === "swap_polarity" && moduleState.moduleType === "power") {
    moduleState.params.polarity = moduleState.params.polarity === "POS" ? "NEG" : "POS";
    moduleState.solved = isModuleSolved(moduleState);
    pushEvent(runtime, `${player.displayName} swapped polarity.`);
    evaluateRound(runtime);
    return;
  }

  if (action.type === "vent_power" && moduleState.moduleType === "power") {
    moduleState.params.voltage = Math.max(0, Number(moduleState.params.voltage) - 15);
    moduleState.params.vented = true;
    state.resources.timerMsRemaining = Math.max(0, state.resources.timerMsRemaining - 10_000);
    player.stats.supportActions += 1;
    pushEvent(runtime, `${player.displayName} vented power (-10s timer).`);
    return;
  }

  applyPenalty(runtime, "Illegal action transition.");
}

function getSpeakCount(state: MatchState): number {
  return Object.keys(state.voice.speakingUsers).length;
}

function applyVoiceTick(runtime: RuntimeInstance, deltaMs: number): void {
  const state = runtime.state;
  if (state.phase !== "active") return;

  state.resources.timerMsRemaining = Math.max(0, state.resources.timerMsRemaining - deltaMs);
  if (state.resources.timerMsRemaining <= 0) {
    timeout(runtime);
    return;
  }

  const playerCount = Object.keys(state.players).length;
  if (playerCount <= 1) return;

  if (state.voice.mode === "silence_windows" && state.resources.timerMsRemaining <= 30_000) {
    state.voice.silenceWindowUntilMs = now() + 1500;
  }

  const speakCount = getSpeakCount(state);
  if (speakCount <= 0) return;

  if (state.voice.noiseGateUntilMs && state.voice.noiseGateUntilMs > now()) {
    return;
  }

  if (state.voice.mode === "silence_windows" && state.voice.silenceWindowUntilMs && state.voice.silenceWindowUntilMs > now()) {
    applyPenalty(runtime, "Spoke during silence window.", 2);
    return;
  }

  const seconds = deltaMs / 1000;
  let drain = configs.balance.drain_per_second * seconds;

  if (speakCount > 1) {
    drain *= configs.balance.overlap_multiplier;
    if (state.voice.mode === "one_speaker_rule") {
      if (state.voice.overlapPenaltyArmed) {
        applyPenalty(runtime, "Overlap detected under One Speaker Rule.", 2);
      } else {
        state.voice.overlapPenaltyArmed = true;
      }
    }
  }

  state.resources.commsSecondsRemaining = Math.max(0, state.resources.commsSecondsRemaining - drain);
  if (state.resources.commsSecondsRemaining <= 0) {
    if (configs.balance.lockout_on_zero) {
      explode(runtime, "Comms pool exhausted.");
    } else {
      applyPenalty(runtime, "Comms exhausted: critical lockout penalties active.", 1);
      state.resources.commsSecondsRemaining = 0;
    }
  }
}

function simulateBombs(rounds: number, playerCount: number, tier: number): { uniqueRuleStacks: number; duplicateRate: number } {
  const seen = new Set<string>();
  let duplicates = 0;

  for (let index = 0; index < rounds; index += 1) {
    const seed = `sim-${index}`;
    const bomb = generateBombSpec(seed, playerCount, tier, configs);
    const signature = bomb.ruleStack.map((rule) => rule.id).sort().join("|");
    if (seen.has(signature)) {
      duplicates += 1;
    }
    seen.add(signature);
  }

  return {
    uniqueRuleStacks: seen.size,
    duplicateRate: rounds === 0 ? 0 : duplicates / rounds
  };
}

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    }
  })
);

app.use(
  rateLimit({
    windowMs: 10_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, instanceCount: instances.size, telemetryRows: telemetry.length });
});

app.post("/api/auth/exchange", async (req, res) => {
  const code = String(req.body?.code ?? "").trim();
  if (!code) {
    return res.status(400).json({ error: "Missing OAuth code" });
  }

  const hasDiscordConfig =
    Boolean(process.env.DISCORD_CLIENT_ID) &&
    Boolean(process.env.DISCORD_CLIENT_SECRET) &&
    Boolean(process.env.DISCORD_REDIRECT_URI);

  if (!hasDiscordConfig) {
    const devUserId = `dev-${code.slice(0, 8)}`;
    const token = jwt.sign({ userId: devUserId, dev: true }, JWT_SECRET, { expiresIn: "12h" });
    return res.json({
      accessToken: `dev-token-${code}`,
      sessionToken: token,
      user: { id: devUserId, username: `DevUser-${code.slice(0, 4)}` }
    });
  }

  try {
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID ?? "",
      client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI ?? ""
    });

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });

    if (!tokenResponse.ok) {
      return res.status(401).json({ error: "Token exchange failed" });
    }

    const tokenJson = (await tokenResponse.json()) as { access_token: string };
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` }
    });

    if (!userResponse.ok) {
      return res.status(401).json({ error: "Fetching user profile failed" });
    }

    const userJson = (await userResponse.json()) as { id: string; username: string };
    const sessionToken = jwt.sign({ userId: userJson.id }, JWT_SECRET, { expiresIn: "12h" });

    return res.json({
      accessToken: tokenJson.access_token,
      sessionToken,
      user: { id: userJson.id, username: userJson.username }
    });
  } catch {
    return res.status(500).json({ error: "OAuth exchange failed" });
  }
});

app.post("/api/voice/event", (req, res) => {
  const parsed = voiceEventSchema.safeParse(req.body as VoiceEvent);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid voice payload" });
  }

  const payload = parsed.data;
  if (payload.sourceToken !== VOICE_SOURCE_TOKEN) {
    return res.status(403).json({ error: "Invalid voice source" });
  }

  const runtime = instances.get(payload.instanceId);
  if (!runtime) {
    return res.status(404).json({ error: "Unknown instance" });
  }

  if (!runtime.state.players[payload.userId]) {
    return res.status(403).json({ error: "User not in instance" });
  }

  if (payload.event === "SPEAK_START") {
    runtime.state.voice.speakingUsers[payload.userId] = payload.timestampMs;
  } else {
    delete runtime.state.voice.speakingUsers[payload.userId];
  }

  runtime.state.updatedAtMs = now();
  broadcastState(runtime);
  return res.json({ ok: true });
});

app.post("/api/admin/reload-config", (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    configs = loadConfigs(sharedConfigPath);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to reload config" });
  }
});

app.post("/api/admin/simulate", (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const rounds = Math.max(1, Math.min(1000, Number(req.body?.rounds ?? 100)));
  const playerCount = Math.max(1, Math.min(10, Number(req.body?.playerCount ?? 4)));
  const tier = Math.max(1, Math.min(3, Number(req.body?.tier ?? 2)));
  const report = simulateBombs(rounds, playerCount, tier);
  return res.json({ ok: true, rounds, playerCount, tier, report });
});

app.get("/api/telemetry", (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return res.json({ rows: telemetry.slice(-200) });
});

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "defuse-exe-server",
      message: "Client build not found. Deploy client service or build client artifacts."
    });
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function parseClientEnvelope(payload: string): ClientEnvelope | null {
  try {
    return JSON.parse(payload) as ClientEnvelope;
  } catch {
    return null;
  }
}

wss.on("connection", (socket) => {
  let currentUserId = "";
  let currentInstanceId = "";

  socket.on("message", (rawData) => {
    const message = parseClientEnvelope(String(rawData));
    if (!message) {
      sendEnvelope(socket, { type: "error", message: "Invalid payload" });
      return;
    }

    if (message.type === "join_instance") {
      currentUserId = message.userId;
      currentInstanceId = message.instanceId;
      const runtime = ensureInstance(message.instanceId);

      const firstJoin = !runtime.state.players[message.userId];
      if (firstJoin) {
        runtime.state.players[message.userId] = {
          userId: message.userId,
          displayName: message.displayName,
          connected: true,
          isHost: Object.keys(runtime.state.players).length === 0,
          capabilities: [],
          roleName: "Unassigned",
          joinedAtMs: now(),
          privateHints: [],
          stats: { actions: 0, penalties: 0, supportActions: 0 }
        };
      } else {
        runtime.state.players[message.userId].connected = true;
        runtime.state.players[message.userId].displayName = message.displayName;
      }

      runtime.state.hostUserId = Object.values(runtime.state.players).find((player) => player.isHost)?.userId;
      runtime.connections.set(message.userId, {
        socket,
        userId: message.userId,
        instanceId: message.instanceId
      });

      pushEvent(runtime, `${message.displayName} joined lobby.`);
      sendEnvelope(socket, { type: "joined", instanceId: message.instanceId, userId: message.userId });
      broadcastState(runtime);
      return;
    }

    if (!currentUserId || !currentInstanceId) {
      sendEnvelope(socket, { type: "error", message: "Join an instance first" });
      return;
    }

    const runtime = instances.get(currentInstanceId);
    if (!runtime || !runtime.state.players[currentUserId]) {
      sendEnvelope(socket, { type: "error", message: "Invalid instance membership" });
      return;
    }

    if (message.type === "presence") {
      runtime.state.players[currentUserId].connected = message.status === "active";
      runtime.state.updatedAtMs = now();
      broadcastState(runtime);
      return;
    }

    if (message.type === "start_match") {
      if (runtime.state.hostUserId !== currentUserId) {
        sendEnvelope(socket, { type: "error", message: "Only host can start." });
        return;
      }
      if (!canStart(runtime)) {
        sendEnvelope(socket, { type: "error", message: "Lobby not ready." });
        return;
      }
      startMatch(runtime);
      broadcastState(runtime);
      return;
    }

    if (message.type === "play_again") {
      resetToLobby(runtime);
      broadcastState(runtime);
      return;
    }

    if (message.type === "request_scan") {
      if (!canUseCapability(currentUserId, runtime, "scanner")) {
        applyPenalty(runtime, "Scan requested without scanner capability.");
      } else if (runtime.state.bomb) {
        const randomRule = runtime.state.bomb.ruleStack[Math.floor(Math.random() * runtime.state.bomb.ruleStack.length)];
        pushEvent(runtime, `Scan reveal: ${randomRule.description}`);
      }
      broadcastState(runtime);
      return;
    }

    if (message.type === "action") {
      mutateAction(runtime, currentUserId, message.action);
      broadcastState(runtime);
      return;
    }

    sendEnvelope(socket, { type: "error", message: "Unhandled message" });
  });

  socket.on("close", () => {
    if (!currentUserId || !currentInstanceId) return;
    const runtime = instances.get(currentInstanceId);
    if (!runtime) return;
    const player = runtime.state.players[currentUserId];
    if (player) {
      player.connected = false;
      pushEvent(runtime, `${player.displayName} disconnected.`);
    }
    runtime.connections.delete(currentUserId);
    broadcastState(runtime);
  });
});

let lastTickMs = now();
setInterval(() => {
  const current = now();
  const deltaMs = Math.max(0, current - lastTickMs);
  lastTickMs = current;

  for (const runtime of instances.values()) {
    applyVoiceTick(runtime, deltaMs);
    if (runtime.state.phase === "active") {
      evaluateRound(runtime);
      broadcastState(runtime);
    }
  }
}, 250);

server.listen(PORT, () => {
  console.log(`DEFUSE.EXE server listening on :${PORT}`);
});
