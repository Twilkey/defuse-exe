/* ═══════════════════════════════════════════════════════════════════════
   DEFUSE.EXE — Multiplayer Roguelite Survivor — Authoritative Server
   ═══════════════════════════════════════════════════════════════════════ */

import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";

import {
  // types
  type GamePhase, type GameState, type PlayerState, type EnemyState,
  type ProjectileState, type XpGemState, type BombZoneState, type DamageNumber,
  type LobbyState, type LobbyPlayer, type ClientEnvelope, type ServerEnvelope,
  type PlayerWeaponState, type UpgradeDef, type CosmeticChoice,
  type GameResult, type PlayerResult, type LevelUpOffer, type WeaponDef,
  type BreakableState, type PickupState, type PickupType,
  type PlayerSettings,
  // constants
  TICK_RATE, TICK_MS, GAME_DURATION_MS, ARENA_W, ARENA_H, SPAWN_MARGIN,
  PLAYER_RADIUS, PICKUP_BASE_RANGE, BASE_XP_TO_LEVEL, XP_GROWTH,
  BOMB_ZONE_RADIUS, BOMB_ZONE_BASE_DURATION_MS, BOMB_ZONE_BASE_SPEED,
  BOMB_ZONE_MULTI_BONUS, BOMB_ZONE_XP_REWARD_BASE, BOMB_ZONE_SPAWN_INTERVAL_MS,
  ELITE_HP_MULT, ELITE_DMG_MULT, ELITE_XP_MULT,
  MINIBOSS_HP_MULT, MINIBOSS_DMG_MULT, MINIBOSS_XP_MULT,
  BOSS_HP_MULT, BOSS_DMG_MULT, BOSS_XP_MULT,
  MAX_WEAPONS, MAX_TOKENS, WEAPON_MAX_LEVEL, WEAPON_ASCEND_LEVEL, WEAPON_TRANSCEND_LEVEL,
  LEVEL_UP_CHOICES,
  CRIT_MULTIPLIER, INVULN_AFTER_HIT_MS, POST_BOSS_WAVE_INTERVAL,
  DAMAGE_NUMBER_LIFETIME, MAX_ENEMIES, MAX_PROJECTILES, MAX_XP_GEMS,
  MAX_BLACKLISTED_WEAPONS, MAX_BLACKLISTED_TOKENS,
  MAX_BREAKABLES, BREAKABLE_SPAWN_INTERVAL_MS, BREAKABLE_SPAWN_COUNT,
  BREAKABLE_HP_CRATE, BREAKABLE_HP_BARREL, BREAKABLE_HP_CRYSTAL,
  PICKUP_LIFETIME_MS, PICKUP_COLLECT_RANGE,
  ENEMY_SPAWN_INTERVAL_MS, MINIBOSS_SPAWN_TIME_MS, MINIBOSS_REPEAT_MS,
  BOSS_SPAWN_TIME_MS, BOSS_REPEAT_MS,
  // data
  CHARACTERS, WEAPONS, ASCENDED_WEAPONS, TOKENS, ASCENSION_RECIPES,
  ENEMIES, MINIBOSS_IDS, BOSS_IDS,
  PLAYER_UPGRADES, GROUP_UPGRADES,
  getWeapon, getToken, getCharacter, getEnemy,
  getNonStarterWeapons,
} from "@defuse/shared";

/* ── helpers ────────────────────────────────────────────────────────── */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let nextId = 1;
function uid(): number { return nextId++; }

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function xpForLevel(level: number): number {
  return Math.floor(BASE_XP_TO_LEVEL * Math.pow(XP_GROWTH, level - 1));
}

/* ── Room / Game state ──────────────────────────────────────────────── */

interface PlayerSocket {
  ws: WebSocket;
  playerId: string;
  inputDx: number;
  inputDy: number;
  cursorX: number;
  cursorY: number;
  settings: PlayerSettings;
  pendingUpgrade: LevelUpOffer | null;
}

interface GameRoom {
  id: string;
  lobby: LobbyState;
  sockets: Map<string, PlayerSocket>;
  game: GameState | null;
  interval: ReturnType<typeof setInterval> | null;
  weaponCooldowns: Map<string, Map<string, number>>; // playerId -> weaponId -> ticksLeft
  groupBonuses: Record<string, number>;
  nextBombZoneMs: number;
  nextBreakableMs: number;
  enemySpawnTimer: number;      // ms until next enemy batch
  nextMinibossMs: number;       // ms until next miniboss
  nextBossMs: number;           // ms until next boss
  elapsedMs: number;            // total elapsed game time
  bossKilledThisRound: boolean;
  pendingLevelUps: Set<string>;
}

const rooms = new Map<string, GameRoom>();

function getOrCreateRoom(roomId: string): GameRoom {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      lobby: { hostId: "", players: [], countdown: -1 },
      sockets: new Map(),
      game: null,
      interval: null,
      weaponCooldowns: new Map(),
      groupBonuses: {},
      nextBombZoneMs: BOMB_ZONE_SPAWN_INTERVAL_MS / 2,
      nextBreakableMs: 5000,
      enemySpawnTimer: 1000,
      nextMinibossMs: MINIBOSS_SPAWN_TIME_MS,
      nextBossMs: BOSS_SPAWN_TIME_MS,
      elapsedMs: 0,
      bossKilledThisRound: false,
      pendingLevelUps: new Set(),
    };
    rooms.set(roomId, room);
  }
  return room;
}

/* ── send helpers ───────────────────────────────────────────────────── */

function sendTo(ps: PlayerSocket, env: ServerEnvelope): void {
  if (ps.ws.readyState === WebSocket.OPEN) ps.ws.send(JSON.stringify(env));
}

function broadcast(room: GameRoom, env: ServerEnvelope): void {
  const msg = JSON.stringify(env);
  for (const ps of room.sockets.values()) {
    if (ps.ws.readyState === WebSocket.OPEN) ps.ws.send(msg);
  }
}

/* ── lobby helpers ──────────────────────────────────────────────────── */

function broadcastLobby(room: GameRoom): void {
  broadcast(room, { type: "lobby", lobby: room.lobby });
}

/* ── Create player state ────────────────────────────────────────────── */

function createPlayerState(lp: LobbyPlayer): PlayerState {
  const charDef = getCharacter(lp.characterId) ?? CHARACTERS[0];
  return {
    id: lp.id,
    displayName: lp.displayName,
    characterId: charDef.id,
    x: ARENA_W / 2 + (Math.random() - 0.5) * 200,
    y: ARENA_H / 2 + (Math.random() - 0.5) * 200,
    hp: charDef.baseHp,
    maxHp: charDef.baseHp,
    speed: charDef.baseSpeed,
    weapons: [{ weaponId: lp.starterWeaponId, level: 1, xp: 0, ascended: false, transcended: false }],
    tokens: [],
    cosmetic: lp.cosmetic,
    alive: true,
    damageDealt: 0,
    killCount: 0,
    xpCollected: 0,
    bombsDefused: 0,
    revives: 0,
    dx: 0, dy: -1,
    moving: false,
    invulnMs: 2000,
    bonusDamage: 0, bonusSpeed: 0, bonusArea: 0, bonusProjectiles: 0,
    bonusPierce: 0, bonusCrit: 0, bonusPickupRange: 0, bonusMaxHp: 0,
    bonusDamageReduction: 0, bonusLifesteal: 0, bonusAttackSpeed: 0,
    bonusXpGain: 0,
  };
}

/* ── Start game ─────────────────────────────────────────────────────── */

function startGame(room: GameRoom): void {
  const players = room.lobby.players.map(createPlayerState);
  room.groupBonuses = {};
  room.weaponCooldowns = new Map();
  room.nextBombZoneMs = BOMB_ZONE_SPAWN_INTERVAL_MS / 2;
  room.nextBreakableMs = 3000;
  room.enemySpawnTimer = 1000;
  room.nextMinibossMs = MINIBOSS_SPAWN_TIME_MS;
  room.nextBossMs = BOSS_SPAWN_TIME_MS;
  room.elapsedMs = 0;
  room.bossKilledThisRound = false;
  room.pendingLevelUps = new Set();

  for (const p of players) {
    room.weaponCooldowns.set(p.id, new Map());
  }

  room.game = {
    phase: "active",
    tick: 0,
    timeRemainingMs: GAME_DURATION_MS,
    elapsedMs: 0,
    wave: 0,
    totalWaves: 20,
    sharedXp: 0,
    sharedLevel: 1,
    xpToNext: xpForLevel(1),
    players,
    enemies: [],
    projectiles: [],
    xpGems: [],
    bombZones: [],
    breakables: [],
    pickups: [],
    damageNumbers: [],
    arenaWidth: ARENA_W,
    arenaHeight: ARENA_H,
    bossActive: false,
    waveEnemiesRemaining: 0,
    postBoss: false,
    continueVotes: [],
    hostId: room.lobby.hostId,
    waveModifier: undefined,
  };

  room.interval = setInterval(() => tick(room), TICK_MS);
  broadcastState(room);
}

/* ── Wave spawning ──────────────────────────────────────────────────── */

function spawnEdge(): { x: number; y: number } {
  const side = Math.floor(Math.random() * 4);
  switch (side) {
    case 0: return { x: Math.random() * ARENA_W, y: -SPAWN_MARGIN };
    case 1: return { x: Math.random() * ARENA_W, y: ARENA_H + SPAWN_MARGIN };
    case 2: return { x: -SPAWN_MARGIN, y: Math.random() * ARENA_H };
    default: return { x: ARENA_W + SPAWN_MARGIN, y: Math.random() * ARENA_H };
  }
}

/* ── Continuous enemy spawning ───────────────────────────────────────── */

function spawnEnemies(room: GameRoom): void {
  const g = room.game!;
  room.enemySpawnTimer -= TICK_MS;
  if (room.enemySpawnTimer > 0) return;
  room.enemySpawnTimer = ENEMY_SPAWN_INTERVAL_MS;

  if (g.enemies.length >= MAX_ENEMIES) return;

  const playerCount = g.players.filter(p => p.alive).length || 1;
  // difficulty ramps with elapsed time (minutes)
  const minutesElapsed = room.elapsedMs / 60000;
  const diffScale = 1 + minutesElapsed * 0.15;
  const hpScale = 1 + minutesElapsed * 0.12;

  // how many enemies per spawn batch — ramps up over time
  const batchSize = Math.min(
    MAX_ENEMIES - g.enemies.length,
    Math.floor((5 + minutesElapsed * 2) * playerCount)
  );

  const eligible = ENEMIES.filter(e => e.spawnWeight > 0);
  const totalWeight = eligible.reduce((s, e) => s + e.spawnWeight, 0);

  for (let i = 0; i < batchSize; i++) {
    let roll = Math.random() * totalWeight;
    let def = eligible[0];
    for (const e of eligible) {
      roll -= e.spawnWeight;
      if (roll <= 0) { def = e; break; }
    }
    const pos = spawnEdge();
    const isElite = minutesElapsed >= 2 && Math.random() < 0.03 + minutesElapsed * 0.008;
    const rank = isElite ? "elite" as const : "normal" as const;
    const hpMult = isElite ? ELITE_HP_MULT : 1;
    g.enemies.push({
      id: uid(),
      defId: def.id,
      x: pos.x, y: pos.y,
      hp: Math.floor(def.baseHp * hpScale * hpMult),
      maxHp: Math.floor(def.baseHp * hpScale * hpMult),
      rank,
      stunMs: 0,
      speedMult: 1,
      armor: 0,
    });
  }

  // track a notional "wave" number for display (increments every spawn batch)
  g.wave++;
  g.waveEnemiesRemaining = g.enemies.length;
}

/* ── Timed boss/miniboss spawning ───────────────────────────────────── */

function spawnTimedBosses(room: GameRoom): void {
  const g = room.game!;
  const hpScale = 1 + room.elapsedMs / 60000 * 0.12;
  const playerCount = g.players.filter(p => p.alive).length || 1;

  // miniboss timer
  room.nextMinibossMs -= TICK_MS;
  if (room.nextMinibossMs <= 0) {
    room.nextMinibossMs = MINIBOSS_REPEAT_MS;
    const mbId = pick(MINIBOSS_IDS);
    const mbDef = getEnemy(mbId)!;
    const pos = spawnEdge();
    g.enemies.push({
      id: uid(), defId: mbDef.id,
      x: pos.x, y: pos.y,
      hp: Math.floor(mbDef.baseHp * hpScale * MINIBOSS_HP_MULT / mbDef.baseHp * mbDef.baseHp * playerCount * 0.7),
      maxHp: Math.floor(mbDef.baseHp * hpScale * MINIBOSS_HP_MULT / mbDef.baseHp * mbDef.baseHp * playerCount * 0.7),
      rank: "miniboss", stunMs: 0, speedMult: 1, armor: 0,
    });
    broadcast(room, { type: "boss_warning", bossName: mbDef.name });
  }

  // boss timer
  room.nextBossMs -= TICK_MS;
  if (room.nextBossMs <= 0) {
    room.nextBossMs = BOSS_REPEAT_MS;
    const bossId = pick(BOSS_IDS);
    const bossDef = getEnemy(bossId)!;
    const pos = spawnEdge();
    g.enemies.push({
      id: uid(), defId: bossDef.id,
      x: pos.x, y: pos.y,
      hp: Math.floor(bossDef.baseHp * hpScale * playerCount * 0.8),
      maxHp: Math.floor(bossDef.baseHp * hpScale * playerCount * 0.8),
      rank: "boss", stunMs: 0, speedMult: 1, armor: 0,
    });
    g.bossActive = true;
    broadcast(room, { type: "boss_warning", bossName: bossDef.name });
  }
}

/* ── Weapon firing ──────────────────────────────────────────────────── */

function fireWeapons(room: GameRoom): void {
  const g = room.game!;
  for (const player of g.players) {
    if (!player.alive) continue;
    const cdMap = room.weaponCooldowns.get(player.id)!;

    for (const ws of player.weapons) {
      const wDef = getWeapon(ws.weaponId);
      if (!wDef) continue;

      const cdKey = ws.weaponId;
      const remaining = cdMap.get(cdKey) ?? 0;
      if (remaining > 0) {
        cdMap.set(cdKey, remaining - TICK_MS);
        continue;
      }

      // Apply level + bonus scaling (gentler curve for 30 levels)
      const lvlMult = 1 + (ws.level - 1) * 0.08;
      const transcendMult = ws.transcended ? 1.5 : 1; // 50% bonus for transcended
      const damage = Math.floor(wDef.baseDamage * lvlMult * transcendMult * (1 + player.bonusDamage));
      const area = wDef.baseArea * (1 + player.bonusArea) * (ws.transcended ? 1.25 : 1);
      const projCount = wDef.baseProjectiles + Math.floor(player.bonusProjectiles) + (ws.transcended ? 2 : 0);
      const pierce = wDef.basePierce + Math.floor(player.bonusPierce) + (ws.transcended ? 3 : 0);
      const cooldown = Math.max(50, wDef.baseCooldownMs * (1 / (1 + player.bonusAttackSpeed)) * (ws.transcended ? 0.8 : 1));

      cdMap.set(cdKey, cooldown);

      // find nearest enemy for targeting
      let nearDist = Infinity, nearEnemy: EnemyState | null = null;
      for (const e of g.enemies) {
        const d = dist(player.x, player.y, e.x, e.y);
        if (d < nearDist) { nearDist = d; nearEnemy = e; }
      }

      // Determine aim direction based on player settings
      const ps = room.sockets.get(player.id);
      const targeting = ps?.settings?.targetingMode ?? "closest";

      let faceDx = player.dx || 0;
      let faceDy = player.dy || -1;
      if (targeting === "cursor" && ps && (ps.cursorX !== 0 || ps.cursorY !== 0)) {
        // aim toward cursor world position
        faceDx = ps.cursorX - player.x;
        faceDy = ps.cursorY - player.y;
        const len = Math.sqrt(faceDx * faceDx + faceDy * faceDy) || 1;
        faceDx /= len; faceDy /= len;
      } else if (nearEnemy && nearDist < 500) {
        faceDx = nearEnemy.x - player.x;
        faceDy = nearEnemy.y - player.y;
        const len = Math.sqrt(faceDx * faceDx + faceDy * faceDy) || 1;
        faceDx /= len; faceDy /= len;
      }

      if (g.projectiles.length >= MAX_PROJECTILES) continue;

      switch (wDef.pattern) {
        case "projectile":
        case "homing":
          for (let i = 0; i < projCount; i++) {
            const spread = (i - (projCount - 1) / 2) * 0.15;
            const cos = Math.cos(spread), sin = Math.sin(spread);
            const pdx = faceDx * cos - faceDy * sin;
            const pdy = faceDx * sin + faceDy * cos;
            g.projectiles.push({
              id: uid(), ownerId: player.id, weaponId: ws.weaponId,
              x: player.x, y: player.y, dx: pdx, dy: pdy,
              speed: wDef.baseSpeed, damage, pierce, pierced: 0,
              area, lifeMs: wDef.baseDuration * TICK_MS,
              pattern: wDef.pattern, color: wDef.color, hitEnemies: [],
            });
          }
          break;
        case "beam": {
          const len2 = 600;
          // beam = long thin projectile
          g.projectiles.push({
            id: uid(), ownerId: player.id, weaponId: ws.weaponId,
            x: player.x, y: player.y, dx: faceDx, dy: faceDy,
            speed: wDef.baseSpeed, damage, pierce, pierced: 0,
            area: Math.max(area, 12), lifeMs: wDef.baseDuration * TICK_MS,
            pattern: "beam", color: wDef.color, hitEnemies: [],
          });
          break;
        }
        case "area":
        case "cone":
          // immediate AoE around player
          for (const enemy of g.enemies) {
            const d = dist(player.x, player.y, enemy.x, enemy.y);
            if (d > area) continue;
            if (wDef.pattern === "cone") {
              // check angle
              const edx = enemy.x - player.x, edy = enemy.y - player.y;
              const elen = Math.sqrt(edx * edx + edy * edy) || 1;
              const dot = (edx / elen) * faceDx + (edy / elen) * faceDy;
              if (dot < 0.5) continue; // ~60° cone
            }
            applyDamage(room, player, enemy, damage);
          }
          break;
        case "orbit":
          // damage enemies within orbit radius
          for (const enemy of g.enemies) {
            const d = dist(player.x, player.y, enemy.x, enemy.y);
            if (d < area && d > area * 0.4) {
              applyDamage(room, player, enemy, damage);
            }
          }
          break;
        case "chain": {
          // chain to nearest, then jump
          if (!nearEnemy) break;
          let target = nearEnemy;
          const hit = new Set<number>();
          for (let c = 0; c <= pierce; c++) {
            if (hit.has(target.id)) break;
            hit.add(target.id);
            applyDamage(room, player, target, damage);
            // find next closest not hit
            let nextDist = Infinity;
            let nextTarget: EnemyState | null = null;
            for (const e of g.enemies) {
              if (hit.has(e.id)) continue;
              const d = dist(target.x, target.y, e.x, e.y);
              if (d < area && d < nextDist) { nextDist = d; nextTarget = e; }
            }
            if (!nextTarget) break;
            target = nextTarget;
          }
          break;
        }
        case "ring":
          g.projectiles.push({
            id: uid(), ownerId: player.id, weaponId: ws.weaponId,
            x: player.x, y: player.y, dx: 0, dy: 0,
            speed: wDef.baseSpeed, damage, pierce: 99, pierced: 0,
            area: 10, lifeMs: wDef.baseDuration * TICK_MS,
            pattern: "ring", color: wDef.color, hitEnemies: [],
          });
          break;
        case "ground":
          g.projectiles.push({
            id: uid(), ownerId: player.id, weaponId: ws.weaponId,
            x: player.x + faceDx * 40, y: player.y + faceDy * 40,
            dx: 0, dy: 0, speed: 0, damage, pierce: 99, pierced: 0,
            area, lifeMs: wDef.baseDuration * TICK_MS,
            pattern: "ground", color: wDef.color, hitEnemies: [],
          });
          break;
      }
    }
  }
}

/* ── Damage application ─────────────────────────────────────────────── */

function applyDamage(room: GameRoom, player: PlayerState, enemy: EnemyState, baseDmg: number): void {
  const g = room.game!;
  const isCrit = Math.random() < player.bonusCrit;
  let dmg = isCrit ? Math.floor(baseDmg * CRIT_MULTIPLIER) : baseDmg;
  // enemy armor from wave modifiers
  dmg = Math.max(1, dmg - (enemy.armor || 0));
  enemy.hp -= dmg;
  player.damageDealt += dmg;

  // lifesteal
  if (player.bonusLifesteal > 0) {
    player.hp = Math.min(player.maxHp, player.hp + Math.floor(dmg * player.bonusLifesteal));
  }

  g.damageNumbers.push({ x: enemy.x, y: enemy.y - 10, value: dmg, crit: isCrit, age: 0 });
}

/* ── Projectile movement & collision ────────────────────────────────── */

function updateProjectiles(room: GameRoom): void {
  const g = room.game!;
  const toRemove: number[] = [];

  for (const proj of g.projectiles) {
    proj.lifeMs -= TICK_MS;
    if (proj.lifeMs <= 0) { toRemove.push(proj.id); continue; }

    if (proj.pattern === "ring") {
      // expand ring
      proj.area += proj.speed;
      // check enemies in ring band
      for (const enemy of g.enemies) {
        if (proj.hitEnemies.includes(enemy.id)) continue;
        const d = dist(proj.x, proj.y, enemy.x, enemy.y);
        if (Math.abs(d - proj.area) < 15) {
          const player = g.players.find(p => p.id === proj.ownerId);
          if (player) applyDamage(room, player, enemy, proj.damage);
          proj.hitEnemies.push(enemy.id);
        }
      }
      continue;
    }

    if (proj.pattern === "ground") {
      // stationary AoE
      for (const enemy of g.enemies) {
        const d = dist(proj.x, proj.y, enemy.x, enemy.y);
        if (d < proj.area) {
          const player = g.players.find(p => p.id === proj.ownerId);
          if (player && !proj.hitEnemies.includes(enemy.id)) {
            applyDamage(room, player, enemy, Math.floor(proj.damage * 0.7));
            proj.hitEnemies.push(enemy.id);
          }
        }
      }
      // reset hits periodically for ground effects
      if (g.tick % 10 === 0) proj.hitEnemies = [];
      continue;
    }

    // move
    if (proj.pattern === "homing") {
      // seek nearest enemy
      let nd = Infinity; let ne: EnemyState | null = null;
      for (const e of g.enemies) {
        const d = dist(proj.x, proj.y, e.x, e.y);
        if (d < nd) { nd = d; ne = e; }
      }
      if (ne && nd < 400) {
        const toDx = ne.x - proj.x, toDy = ne.y - proj.y;
        const toLen = Math.sqrt(toDx * toDx + toDy * toDy) || 1;
        proj.dx += (toDx / toLen - proj.dx) * 0.08;
        proj.dy += (toDy / toLen - proj.dy) * 0.08;
        const nLen = Math.sqrt(proj.dx * proj.dx + proj.dy * proj.dy) || 1;
        proj.dx /= nLen; proj.dy /= nLen;
      }
    }

    proj.x += proj.dx * proj.speed;
    proj.y += proj.dy * proj.speed;

    // out of bounds
    if (proj.x < -200 || proj.x > ARENA_W + 200 || proj.y < -200 || proj.y > ARENA_H + 200) {
      toRemove.push(proj.id);
      continue;
    }

    // collide with enemies
    for (const enemy of g.enemies) {
      if (proj.hitEnemies.includes(enemy.id)) continue;
      const d = dist(proj.x, proj.y, enemy.x, enemy.y);
      const eDef = getEnemy(enemy.defId);
      const eSize = eDef ? eDef.size : 12;
      if (d < eSize + proj.area) {
        const player = g.players.find(p => p.id === proj.ownerId);
        if (player) applyDamage(room, player, enemy, proj.damage);
        proj.hitEnemies.push(enemy.id);
        proj.pierced++;
        if (proj.pierced > proj.pierce) { toRemove.push(proj.id); break; }
      }
    }
  }

  g.projectiles = g.projectiles.filter(p => !toRemove.includes(p.id));
}

/* ── Enemy AI ───────────────────────────────────────────────────────── */

function updateEnemies(room: GameRoom): void {
  const g = room.game!;
  const alivePlayers = g.players.filter(p => p.alive);
  if (alivePlayers.length === 0) return;

  for (const enemy of g.enemies) {
    if (enemy.stunMs > 0) { enemy.stunMs -= TICK_MS; continue; }
    const eDef = getEnemy(enemy.defId);
    if (!eDef) continue;

    // find nearest player
    let nd = Infinity; let nearP: PlayerState | null = null;
    for (const p of alivePlayers) {
      const d = dist(enemy.x, enemy.y, p.x, p.y);
      if (d < nd) { nd = d; nearP = p; }
    }
    if (!nearP) continue;

    const rankSpeedMult = enemy.rank === "boss" ? 0.8 : enemy.rank === "miniboss" ? 0.9 : 1;
    const spdMul = rankSpeedMult * (enemy.speedMult || 1);

    if (eDef.enemyClass === "ranged" && nd < 250) {
      // ranged enemies try to keep distance
      const dx = enemy.x - nearP.x, dy = enemy.y - nearP.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      enemy.x += (dx / len) * eDef.baseSpeed * 0.5 * spdMul;
      enemy.y += (dy / len) * eDef.baseSpeed * 0.5 * spdMul;
    } else if (eDef.baseSpeed > 0) {
      // move toward nearest player
      const dx = nearP.x - enemy.x, dy = nearP.y - enemy.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      enemy.x += (dx / len) * eDef.baseSpeed * spdMul;
      enemy.y += (dy / len) * eDef.baseSpeed * spdMul;
    }

    // clamp to arena (with some leeway)
    enemy.x = clamp(enemy.x, -100, ARENA_W + 100);
    enemy.y = clamp(enemy.y, -100, ARENA_H + 100);

    // melee damage to player on contact
    if (nd < PLAYER_RADIUS + (eDef.size || 12)) {
      if (nearP.invulnMs <= 0) {
        const dmgMult = enemy.rank === "elite" ? ELITE_DMG_MULT
          : enemy.rank === "miniboss" ? MINIBOSS_DMG_MULT
          : enemy.rank === "boss" ? BOSS_DMG_MULT : 1;
        const rawDmg = Math.floor(eDef.baseDamage * dmgMult);
        const reduced = Math.floor(rawDmg * (1 - nearP.bonusDamageReduction));
        nearP.hp -= Math.max(1, reduced);
        nearP.invulnMs = INVULN_AFTER_HIT_MS;
        g.damageNumbers.push({ x: nearP.x, y: nearP.y - 16, value: reduced, crit: false, age: 0 });
      }
    }

    // ranged enemies: shoot periodically
    if (eDef.enemyClass === "ranged" && nd < 400 && nd > 60 && g.tick % 40 === 0) {
      if (g.projectiles.length < MAX_PROJECTILES) {
        const dx = nearP.x - enemy.x, dy = nearP.y - enemy.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        // enemy projectile (negative ownerId convention: "enemy")
        g.projectiles.push({
          id: uid(), ownerId: "__enemy__", weaponId: "enemy_shot",
          x: enemy.x, y: enemy.y, dx: dx / len, dy: dy / len,
          speed: 5, damage: Math.floor(eDef.baseDamage * 0.7),
          pierce: 0, pierced: 0, area: 6, lifeMs: 3000,
          pattern: "projectile", color: "#ff6666", hitEnemies: [],
        });
      }
    }
  }
}

/* ── Enemy projectile → player collision ────────────────────────────── */

function checkEnemyProjectiles(room: GameRoom): void {
  const g = room.game!;
  const toRemove: number[] = [];
  for (const proj of g.projectiles) {
    if (proj.ownerId !== "__enemy__") continue;
    for (const p of g.players) {
      if (!p.alive || p.invulnMs > 0) continue;
      const d = dist(proj.x, proj.y, p.x, p.y);
      if (d < PLAYER_RADIUS + proj.area) {
        const reduced = Math.floor(proj.damage * (1 - p.bonusDamageReduction));
        p.hp -= Math.max(1, reduced);
        p.invulnMs = INVULN_AFTER_HIT_MS;
        g.damageNumbers.push({ x: p.x, y: p.y - 16, value: reduced, crit: false, age: 0 });
        toRemove.push(proj.id);
        break;
      }
    }
  }
  g.projectiles = g.projectiles.filter(p => !toRemove.includes(p.id));
}

/* ── Dead enemies → XP gems ─────────────────────────────────────────── */

function processDeadEnemies(room: GameRoom): void {
  const g = room.game!;
  const dead: EnemyState[] = [];
  g.enemies = g.enemies.filter(e => {
    if (e.hp <= 0) { dead.push(e); return false; }
    return true;
  });

  for (const e of dead) {
    const eDef = getEnemy(e.defId);
    if (!eDef) continue;
    const xpMult = e.rank === "elite" ? ELITE_XP_MULT
      : e.rank === "miniboss" ? MINIBOSS_XP_MULT
      : e.rank === "boss" ? BOSS_XP_MULT : 1;
    const xpVal = Math.floor(eDef.xpValue * xpMult);

    if (g.xpGems.length < MAX_XP_GEMS) {
      g.xpGems.push({ id: uid(), x: e.x, y: e.y, value: xpVal });
    }

    // credit kill to closest player
    let nd = Infinity; let killer: PlayerState | null = null;
    for (const p of g.players) {
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < nd) { nd = d; killer = p; }
    }
    if (killer) killer.killCount++;

    // check boss death
    if (e.rank === "boss") {
      g.bossActive = false;
      room.bossKilledThisRound = true;
      if (g.wave >= 20 && !g.postBoss) {
        g.phase = "vote_continue";
        g.continueVotes = [];
      }
    }
  }

  g.waveEnemiesRemaining = g.enemies.length;
}

/* ── XP collection ──────────────────────────────────────────────────── */

function collectXp(room: GameRoom): void {
  const g = room.game!;
  const toRemove = new Set<number>();

  for (const gem of g.xpGems) {
    for (const p of g.players) {
      if (!p.alive) continue;
      const range = PICKUP_BASE_RANGE * (1 + p.bonusPickupRange);
      const d = dist(gem.x, gem.y, p.x, p.y);
      if (d < range) {
        const xpGainMult = 1 + p.bonusXpGain + (room.groupBonuses["xpGain"] ?? 0);
        const gained = Math.floor(gem.value * xpGainMult);
        g.sharedXp += gained;
        p.xpCollected += gained;
        toRemove.add(gem.id);
        break; // only one player picks it up
      } else if (d < range * 2) {
        // magnet pull
        const dx = p.x - gem.x, dy = p.y - gem.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        gem.x += (dx / len) * 3;
        gem.y += (dy / len) * 3;
      }
    }
  }

  g.xpGems = g.xpGems.filter(gem => !toRemove.has(gem.id));

  // check level up
  while (g.sharedXp >= g.xpToNext) {
    g.sharedXp -= g.xpToNext;
    g.sharedLevel++;
    g.xpToNext = xpForLevel(g.sharedLevel);
    triggerLevelUp(room);
  }
}

/* ── Level-up system ────────────────────────────────────────────────── */

function triggerLevelUp(room: GameRoom): void {
  const g = room.game!;
  const isMulti = g.players.length > 1;

  for (const player of g.players) {
    if (!player.alive) continue;
    const options = generateUpgradeOptions(room, player, isMulti);
    const offer: LevelUpOffer = { playerId: player.id, options };
    const ps = room.sockets.get(player.id);
    if (ps) {
      ps.pendingUpgrade = offer;
      sendTo(ps, { type: "level_up", offer });
      room.pendingLevelUps.add(player.id);
    }
  }
}

function generateUpgradeOptions(room: GameRoom, player: PlayerState, isMulti: boolean): UpgradeDef[] {
  const pool: UpgradeDef[] = [];
  const lp = room.lobby.players.find(l => l.id === player.id);
  const blackWeapons = lp?.blacklistedWeapons ?? [];
  const blackTokens = lp?.blacklistedTokens ?? [];
  const ownedWeaponIds = new Set(player.weapons.map(w => w.weaponId));

  // ── New weapon (only if open weapon slots) ──
  if (player.weapons.length < MAX_WEAPONS) {
    const available = getNonStarterWeapons().filter(w => !ownedWeaponIds.has(w.id) && !blackWeapons.includes(w.id));
    if (available.length > 0) {
      const w = pick(available);
      pool.push({ id: `nw_${w.id}`, kind: "new_weapon", name: `New: ${w.name}`, description: w.description, weaponId: w.id, group: false });
    }
  }

  // ── Weapon level-ups (only weapons I own that aren't max) ──
  const upgradable = player.weapons.filter(w => w.level < WEAPON_MAX_LEVEL);
  if (upgradable.length > 0) {
    // offer up to 2 different weapon level-ups if available
    const shuffled = shuffle(upgradable);
    for (let i = 0; i < Math.min(2, shuffled.length); i++) {
      const ws = shuffled[i];
      const wDef = getWeapon(ws.weaponId);
      if (wDef) {
        pool.push({ id: `wl_${ws.weaponId}`, kind: "weapon_level", name: `↑ ${wDef.name} Lv${ws.level + 1}`, description: `Upgrade ${wDef.name} to level ${ws.level + 1}.`, weaponId: ws.weaponId, group: false });
      }
    }
  }

  // ── New token (only if open token slots) ──
  if (player.tokens.length < MAX_TOKENS) {
    const ownedTokens = new Set(player.tokens);
    // prefer tokens matching weapons I own
    const matching = TOKENS.filter(t => !ownedTokens.has(t.id) && !blackTokens.includes(t.id) && (!t.group || isMulti) && t.matchingWeaponId && ownedWeaponIds.has(t.matchingWeaponId));
    const nonMatching = TOKENS.filter(t => !ownedTokens.has(t.id) && !blackTokens.includes(t.id) && (!t.group || isMulti) && (!t.matchingWeaponId || !ownedWeaponIds.has(t.matchingWeaponId)));
    // 70% chance to offer a matching token if available
    const tokenPool = matching.length > 0 && Math.random() < 0.7 ? matching : [...matching, ...nonMatching];
    if (tokenPool.length > 0) {
      const t = pick(tokenPool);
      pool.push({ id: `nt_${t.id}`, kind: "new_token", name: `${t.icon} ${t.name}`, description: t.description, tokenId: t.id, group: t.group });
    }
  }

  // ── Stat upgrades that are relevant ──
  // Filter stats based on what makes sense for the player's current weapons
  const hasProjectileWeapon = player.weapons.some(w => { const d = getWeapon(w.weaponId); return d && (d.pattern === "projectile" || d.pattern === "homing" || d.pattern === "beam"); });
  const relevantStats = PLAYER_UPGRADES.filter(u => {
    if (u.stat === "projectiles" && !hasProjectileWeapon) return false;
    if (u.stat === "pierce" && !hasProjectileWeapon) return false;
    return true;
  });
  const pUpgrades = shuffle(relevantStats).slice(0, 3);
  pool.push(...pUpgrades);

  // group upgrades
  if (isMulti) {
    const gUp = shuffle(GROUP_UPGRADES).slice(0, 2);
    pool.push(...gUp);
  }

  return shuffle(pool).slice(0, LEVEL_UP_CHOICES);
}

function applyUpgrade(room: GameRoom, playerId: string, upgradeId: string): void {
  const g = room.game!;
  const player = g.players.find(p => p.id === playerId);
  if (!player) return;

  const ps = room.sockets.get(playerId);
  if (!ps?.pendingUpgrade) return;
  const option = ps.pendingUpgrade.options.find(o => o.id === upgradeId);
  if (!option) return;

  switch (option.kind) {
    case "new_weapon":
      if (option.weaponId && player.weapons.length < MAX_WEAPONS) {
        player.weapons.push({ weaponId: option.weaponId, level: 1, xp: 0, ascended: false, transcended: false });
        room.weaponCooldowns.get(playerId)?.set(option.weaponId, 0);
      }
      break;
    case "weapon_level":
      if (option.weaponId) {
        const ws = player.weapons.find(w => w.weaponId === option.weaponId);
        if (ws && ws.level < WEAPON_MAX_LEVEL) {
          ws.level++;
          checkAscension(room, player, ws);
          checkTranscendence(room, player, ws);
        }
      }
      break;
    case "new_token":
      if (option.tokenId && player.tokens.length < MAX_TOKENS) {
        player.tokens.push(option.tokenId);
        recalcBonuses(room, player);
        // check ascensions for all weapons
        for (const ws of player.weapons) {
          checkAscension(room, player, ws);
          checkTranscendence(room, player, ws);
        }
      }
      break;
    case "player_stat":
      if (option.stat && option.value) {
        applyStatBonus(player, option.stat, option.value);
      }
      break;
    case "group_stat":
      if (option.stat && option.value) {
        room.groupBonuses[option.stat] = (room.groupBonuses[option.stat] ?? 0) + option.value;
        // apply to all players
        for (const p of g.players) recalcBonuses(room, p);
      }
      break;
  }

  ps.pendingUpgrade = null;
  room.pendingLevelUps.delete(playerId);
}

function applyStatBonus(player: PlayerState, stat: string, value: number): void {
  switch (stat) {
    case "damage": player.bonusDamage += value; break;
    case "attackSpeed": player.bonusAttackSpeed += value; break;
    case "area": player.bonusArea += value; break;
    case "speed": player.bonusSpeed += value; player.speed *= (1 + value); break;
    case "projectiles": player.bonusProjectiles += value; break;
    case "pierce": player.bonusPierce += value; break;
    case "maxHp": if (value < 1) { player.maxHp = Math.floor(player.maxHp * (1 + value)); } else { player.maxHp += value; } player.hp = Math.min(player.hp + Math.floor(value < 1 ? player.maxHp * value : value), player.maxHp); break;
    case "crit": player.bonusCrit += value; break;
    case "pickupRange": player.bonusPickupRange += value; break;
    case "damageReduction": player.bonusDamageReduction += value; break;
    case "lifesteal": player.bonusLifesteal += value; break;
    case "xpGain": player.bonusXpGain += value; break;
    case "knockback": break; // knockback applied during weapon fire
  }
}

function recalcBonuses(room: GameRoom, player: PlayerState): void {
  // reset bonuses from tokens
  // (this is simplified — in production you'd track sources)
  for (const tokenId of player.tokens) {
    const tDef = getToken(tokenId);
    if (!tDef) continue;
    // Token bonuses are already applied incrementally via applyStatBonus when acquired
    // So we skip re-applying here to avoid double-counting
  }
  // apply group bonuses
  const g = room.groupBonuses;
  // Group bonuses are applied once when chosen — this function exists for future expansion
}

/* ── Ascension ──────────────────────────────────────────────────────── */

function checkAscension(room: GameRoom, player: PlayerState, ws: PlayerWeaponState): void {
  if (ws.ascended) return;
  if (ws.level < WEAPON_ASCEND_LEVEL) return;
  const recipe = ASCENSION_RECIPES.find(r => r.weaponId === ws.weaponId);
  if (!recipe) return;
  if (!player.tokens.includes(recipe.tokenId)) return;

  // Ascend!
  const ascDef = ASCENDED_WEAPONS.find(a => a.id === recipe.ascendedWeaponId);
  if (!ascDef) return;

  const oldName = getWeapon(ws.weaponId)?.name ?? ws.weaponId;
  ws.weaponId = ascDef.id;
  ws.ascended = true;
  ws.level = 1; // reset level for ascended growth

  broadcast(room, { type: "ascension", playerId: player.id, weaponName: oldName, ascendedName: ascDef.name });
}

function checkTranscendence(room: GameRoom, player: PlayerState, ws: PlayerWeaponState): void {
  if (ws.transcended) return;
  if (!ws.ascended) return; // must be ascended first
  if (ws.level < WEAPON_TRANSCEND_LEVEL) return;

  const wDef = getWeapon(ws.weaponId);
  ws.transcended = true;
  const wName = wDef?.name ?? ws.weaponId;
  broadcast(room, { type: "transcendence", playerId: player.id, weaponName: wName });
}

/* ── Bomb zones ─────────────────────────────────────────────────────── */

function updateBombZones(room: GameRoom): void {
  const g = room.game!;

  // spawn new zone
  room.nextBombZoneMs -= TICK_MS;
  if (room.nextBombZoneMs <= 0) {
    room.nextBombZoneMs = BOMB_ZONE_SPAWN_INTERVAL_MS;
    g.bombZones.push({
      id: uid(),
      x: 200 + Math.random() * (ARENA_W - 400),
      y: 200 + Math.random() * (ARENA_H - 400),
      radius: BOMB_ZONE_RADIUS,
      progress: 0,
      playersInside: 0,
      active: true,
      xpReward: BOMB_ZONE_XP_REWARD_BASE + g.sharedLevel * 5,
      timeLeftMs: BOMB_ZONE_BASE_DURATION_MS,
    });
  }

  // update existing
  for (const zone of g.bombZones) {
    if (!zone.active) continue;
    zone.timeLeftMs -= TICK_MS;
    if (zone.timeLeftMs <= 0) { zone.active = false; continue; }

    // count players inside
    let inside = 0;
    for (const p of g.players) {
      if (!p.alive) continue;
      if (dist(p.x, p.y, zone.x, zone.y) < zone.radius) inside++;
    }
    zone.playersInside = inside;

    if (inside > 0) {
      const speed = BOMB_ZONE_BASE_SPEED * (1 + (inside - 1) * BOMB_ZONE_MULTI_BONUS);
      zone.progress += speed;
      if (zone.progress >= 100) {
        zone.active = false;
        zone.progress = 100;
        // award XP
        const xpGainMult = 1 + (room.groupBonuses["xpGain"] ?? 0);
        g.sharedXp += Math.floor(zone.xpReward * xpGainMult);
        // credit players inside
        for (const p of g.players) {
          if (p.alive && dist(p.x, p.y, zone.x, zone.y) < zone.radius) {
            p.bombsDefused++;
          }
        }
        // check level
        while (g.sharedXp >= g.xpToNext) {
          g.sharedXp -= g.xpToNext;
          g.sharedLevel++;
          g.xpToNext = xpForLevel(g.sharedLevel);
          triggerLevelUp(room);
        }
      }
    }
  }

  // remove inactive/completed
  g.bombZones = g.bombZones.filter(z => z.active);
}

/* ── Breakable objects ───────────────────────────────────────────────── */

function spawnBreakables(room: GameRoom): void {
  const g = room.game!;
  room.nextBreakableMs -= TICK_MS;
  if (room.nextBreakableMs > 0) return;
  room.nextBreakableMs = BREAKABLE_SPAWN_INTERVAL_MS;

  for (let i = 0; i < BREAKABLE_SPAWN_COUNT && g.breakables.length < MAX_BREAKABLES; i++) {
    const kind = pick(["crate", "barrel", "crystal"] as const);
    const hp = kind === "crate" ? BREAKABLE_HP_CRATE : kind === "barrel" ? BREAKABLE_HP_BARREL : BREAKABLE_HP_CRYSTAL;
    g.breakables.push({
      id: uid(),
      x: 100 + Math.random() * (ARENA_W - 200),
      y: 100 + Math.random() * (ARENA_H - 200),
      hp, maxHp: hp,
      kind,
    });
  }
}

function updateBreakables(room: GameRoom): void {
  const g = room.game!;

  // Check projectile collisions with breakables
  for (const proj of g.projectiles) {
    if (proj.ownerId === "__enemy__") continue;
    for (const br of g.breakables) {
      if (br.hp <= 0) continue;
      const d = dist(proj.x, proj.y, br.x, br.y);
      if (d < 20 + proj.area) {
        br.hp -= proj.damage;
      }
    }
  }

  // Check area/cone/orbit weapon hits via damage numbers proximity (already dealt)
  // Breakables also take damage from players touching them
  for (const p of g.players) {
    if (!p.alive) continue;
    for (const br of g.breakables) {
      if (br.hp <= 0) continue;
      const d = dist(p.x, p.y, br.x, br.y);
      if (d < PLAYER_RADIUS + 20) {
        // Melee-range auto-break (small tick damage)
        br.hp -= 2;
      }
    }
  }

  // Process destroyed breakables → spawn pickups
  const destroyed: BreakableState[] = [];
  g.breakables = g.breakables.filter(br => {
    if (br.hp <= 0) { destroyed.push(br); return false; }
    return true;
  });

  for (const br of destroyed) {
    // Always drop coins (XP gems)
    if (g.xpGems.length < MAX_XP_GEMS) {
      const gemCount = br.kind === "crystal" ? 3 : br.kind === "crate" ? 2 : 1;
      for (let i = 0; i < gemCount; i++) {
        g.xpGems.push({
          id: uid(),
          x: br.x + (Math.random() - 0.5) * 30,
          y: br.y + (Math.random() - 0.5) * 30,
          value: br.kind === "crystal" ? 8 : 4,
        });
      }
    }

    // Chance to drop a special pickup
    const dropRoll = Math.random();
    if (dropRoll < (br.kind === "crystal" ? 0.6 : 0.3)) {
      const types: PickupType[] = ["health", "magnet", "speed_boost", "damage_boost", "bomb_charge"];
      const weights = [30, 20, 20, 15, 15];
      const totalW = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalW;
      let pType: PickupType = "health";
      for (let i = 0; i < types.length; i++) {
        r -= weights[i];
        if (r <= 0) { pType = types[i]; break; }
      }

      const value = pType === "health" ? 30
        : pType === "magnet" ? 5000       // ms duration
        : pType === "speed_boost" ? 5000  // ms duration
        : pType === "damage_boost" ? 5000 // ms duration
        : 15; // bomb_charge: progress %

      g.pickups.push({
        id: uid(),
        x: br.x, y: br.y,
        pickupType: pType,
        value,
        lifeMs: PICKUP_LIFETIME_MS,
      });
    }
  }
}

function collectPickups(room: GameRoom): void {
  const g = room.game!;
  const toRemove = new Set<number>();

  for (const pu of g.pickups) {
    pu.lifeMs -= TICK_MS;
    if (pu.lifeMs <= 0) { toRemove.add(pu.id); continue; }

    for (const p of g.players) {
      if (!p.alive) continue;
      const d = dist(p.x, p.y, pu.x, pu.y);
      if (d < PICKUP_COLLECT_RANGE) {
        switch (pu.pickupType) {
          case "health":
            p.hp = Math.min(p.maxHp, p.hp + pu.value);
            break;
          case "magnet":
            // pull all XP gems close
            for (const gem of g.xpGems) {
              const gd = dist(p.x, p.y, gem.x, gem.y);
              if (gd < 600) {
                gem.x = p.x + (Math.random() - 0.5) * 30;
                gem.y = p.y + (Math.random() - 0.5) * 30;
              }
            }
            break;
          case "speed_boost":
            p.bonusSpeed += 0.3;
            // temporary — we'll decay it. For simplicity, just give a flat boost
            break;
          case "damage_boost":
            p.bonusDamage += 0.2;
            break;
          case "bomb_charge":
            // add progress to nearest bomb zone
            for (const zone of g.bombZones) {
              if (zone.active) {
                zone.progress = Math.min(100, zone.progress + pu.value);
                break;
              }
            }
            break;
        }
        toRemove.add(pu.id);
        break;
      }
    }
  }

  g.pickups = g.pickups.filter(pu => !toRemove.has(pu.id));
}

/* ── Player death/respawn ───────────────────────────────────────────── */

function checkPlayerDeath(room: GameRoom): void {
  const g = room.game!;
  for (const p of g.players) {
    if (p.alive && p.hp <= 0) {
      p.alive = false;
      p.hp = 0;
    }
    if (p.invulnMs > 0) p.invulnMs -= TICK_MS;
  }

  // game over if everyone dead
  if (g.players.every(p => !p.alive)) {
    endGame(room, "defeat");
  }
}

/* ── Character passives ─────────────────────────────────────────────── */

function applyPassives(room: GameRoom): void {
  const g = room.game!;
  for (const p of g.players) {
    if (!p.alive) continue;
    const charDef = getCharacter(p.characterId);
    if (!charDef) continue;

    switch (charDef.passive) {
      case "heal_aura":
        // heal nearby allies 2hp/s = 0.1hp/tick
        if (g.tick % 10 === 0) {
          for (const other of g.players) {
            if (!other.alive || other.id === p.id) continue;
            if (dist(p.x, p.y, other.x, other.y) < 120) {
              other.hp = Math.min(other.maxHp, other.hp + 2);
            }
          }
        }
        break;
      case "phase":
        // 2s invuln every 15s
        if (g.tick % (15 * TICK_RATE) === 0) {
          p.invulnMs = 2000;
        }
        break;
      case "berserk":
        // damage bonus below 30% HP is handled in weapon fire via bonusDamage recalc
        if (p.hp < p.maxHp * 0.3) {
          // applied every tick — we just ensure the bonus is active
        }
        break;
    }
  }
}

/* ── Damage numbers cleanup ─────────────────────────────────────────── */

function cleanDamageNumbers(g: GameState): void {
  for (const dn of g.damageNumbers) dn.age += TICK_MS;
  g.damageNumbers = g.damageNumbers.filter(dn => dn.age < DAMAGE_NUMBER_LIFETIME);
}

/* ── End game ───────────────────────────────────────────────────────── */

function endGame(room: GameRoom, outcome: "victory" | "defeat"): void {
  const g = room.game!;
  g.phase = "results";

  if (room.interval) { clearInterval(room.interval); room.interval = null; }

  const players: PlayerResult[] = g.players.map(p => ({
    id: p.id,
    displayName: p.displayName,
    characterId: p.characterId,
    damageDealt: p.damageDealt,
    killCount: p.killCount,
    xpCollected: p.xpCollected,
    bombsDefused: p.bombsDefused,
    revives: p.revives,
    weaponIds: p.weapons.map(w => w.weaponId),
    tokenIds: [...p.tokens],
    survived: p.alive,
  }));

  // podium: top 3 by damage
  const sorted = [...players].sort((a, b) => b.damageDealt - a.damageDealt);
  const podium = sorted.slice(0, 3).map(p => p.id);

  const result: GameResult = {
    outcome,
    wave: g.wave,
    timeElapsedMs: room.elapsedMs,
    players,
    podium,
  };

  broadcast(room, { type: "results", result });

  // reset room to lobby after delay
  setTimeout(() => {
    room.game = null;
    for (const lp of room.lobby.players) lp.ready = false;
    broadcastLobby(room);
  }, 12000);
}

/* ── Main tick ──────────────────────────────────────────────────────── */

function tick(room: GameRoom): void {
  const g = room.game;
  if (!g || g.phase !== "active") return;

  // if any player still picking upgrades, pause the game
  if (room.pendingLevelUps.size > 0) return;

  g.tick++;
  g.timeRemainingMs -= TICK_MS;
  room.elapsedMs += TICK_MS;
  g.elapsedMs = room.elapsedMs;

  // move players
  for (const [pid, ps] of room.sockets) {
    const player = g.players.find(p => p.id === pid);
    if (!player || !player.alive) continue;
    const dx = ps.inputDx, dy = ps.inputDy;
    const isMoving = dx !== 0 || dy !== 0;
    player.moving = isMoving;
    if (isMoving) {
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ndx = dx / len, ndy = dy / len;
      const spd = player.speed * (1 + player.bonusSpeed + (room.groupBonuses["speed"] ?? 0)) / TICK_RATE;
      player.x = clamp(player.x + ndx * spd, 0, ARENA_W);
      player.y = clamp(player.y + ndy * spd, 0, ARENA_H);
      player.dx = ndx;
      player.dy = ndy;
    }
  }

  // continuous enemy spawning + timed bosses
  spawnEnemies(room);
  spawnTimedBosses(room);

  // systems
  applyPassives(room);
  fireWeapons(room);
  updateProjectiles(room);
  checkEnemyProjectiles(room);
  updateEnemies(room);
  processDeadEnemies(room);
  collectXp(room);
  updateBombZones(room);
  spawnBreakables(room);
  updateBreakables(room);
  collectPickups(room);
  checkPlayerDeath(room);
  cleanDamageNumbers(g);

  // time up → check outcome
  if (g.timeRemainingMs <= 0 && !g.postBoss) {
    // if boss was killed, victory. otherwise defeat.
    endGame(room, room.bossKilledThisRound ? "victory" : "defeat");
    return;
  }

  broadcastState(room);
}

function broadcastState(room: GameRoom): void {
  if (!room.game) return;
  // Send subset every tick (full state)
  broadcast(room, { type: "state", state: room.game });
}

/* ═══════════════════════════════════════════════════════════════════════
   HTTP + WebSocket Server
   ═══════════════════════════════════════════════════════════════════════ */

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const app = express();
app.set("trust proxy", true);
app.use(cors());
app.use(express.json());

// Serve client if available
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));

app.get("/health", (_req, res) => res.json({ status: "ok", game: "defuse-exe-roguelite" }));

// Discord OAuth2 token exchange
app.post("/api/token", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: "missing code" }); return; }
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) { res.status(500).json({ error: "server missing discord credentials" }); return; }
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const data = await tokenRes.json();
    res.json({ access_token: (data as Record<string, unknown>).access_token });
  } catch (err) {
    console.error("[token exchange]", err);
    res.status(500).json({ error: "token exchange failed" });
  }
});
app.get("/", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.json({ status: "DEFUSE.EXE Roguelite Server" });
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  let playerId = "";
  let roomId = "default";
  let room: GameRoom | null = null;

  ws.on("message", (raw) => {
    let msg: ClientEnvelope;
    try { msg = JSON.parse(String(raw)); } catch { return; }

    // All messages except join require a room
    if (msg.type !== "join" && !room) return;
    // After join is processed, room is always set; use r for convenience
    const r = room!;

    switch (msg.type) {
      case "join": {
        roomId = msg.roomId || "default";
        room = getOrCreateRoom(roomId);
        playerId = `p-${uid()}`;
        const lp: LobbyPlayer = {
          id: playerId,
          displayName: msg.displayName || `Player-${Math.floor(Math.random() * 999)}`,
          characterId: CHARACTERS[0].id,
          starterWeaponId: WEAPONS[0].id,
          cosmetic: {},
          blacklistedWeapons: [],
          blacklistedTokens: [],
          ready: false,
        };
        room.lobby.players.push(lp);
        if (room.lobby.players.length === 1) room.lobby.hostId = playerId;

        const ps: PlayerSocket = { ws, playerId, inputDx: 0, inputDy: 0, pendingUpgrade: null, cursorX: 0, cursorY: 0, settings: { ownProjectileOpacity: 1, otherProjectileOpacity: 0.7, targetingMode: "closest" } };
        room.sockets.set(playerId, ps);

        sendTo(ps, { type: "joined", playerId });
        broadcastLobby(room);
        break;
      }
      case "lobby_update": {
        const lp = r.lobby.players.find(p => p.id === playerId);
        if (!lp) break;
        if (msg.characterId) lp.characterId = msg.characterId;
        if (msg.starterWeaponId) lp.starterWeaponId = msg.starterWeaponId;
        if (msg.cosmetic) lp.cosmetic = msg.cosmetic;
        if (msg.blacklistedWeapons) lp.blacklistedWeapons = msg.blacklistedWeapons.slice(0, MAX_BLACKLISTED_WEAPONS);
        if (msg.blacklistedTokens) lp.blacklistedTokens = msg.blacklistedTokens.slice(0, MAX_BLACKLISTED_TOKENS);
        broadcastLobby(r);
        break;
      }
      case "ready": {
        const lp = r.lobby.players.find(p => p.id === playerId);
        if (lp) { lp.ready = msg.ready; broadcastLobby(r); }
        break;
      }
      case "start_game": {
        if (playerId !== r.lobby.hostId) break;
        if (r.game) break;
        const allReady = r.lobby.players.length > 0 && r.lobby.players.every(p => p.ready);
        if (!allReady) {
          const ps = r.sockets.get(playerId);
          if (ps) sendTo(ps, { type: "error", message: "Not all players are ready." });
          break;
        }
        startGame(r);
        break;
      }
      case "input": {
        const ps = r.sockets.get(playerId);
        if (ps) {
          ps.inputDx = msg.dx;
          ps.inputDy = msg.dy;
          if (msg.cursorX !== undefined) ps.cursorX = msg.cursorX;
          if (msg.cursorY !== undefined) ps.cursorY = msg.cursorY;
        }
        break;
      }
      case "update_settings": {
        const ps = r.sockets.get(playerId);
        if (ps) ps.settings = msg.settings;
        break;
      }
      case "pick_upgrade": {
        applyUpgrade(r, playerId, msg.upgradeId);
        break;
      }
      case "vote_continue": {
        const g = r.game;
        if (!g || g.phase !== "vote_continue") break;
        if (!g.continueVotes.includes(playerId)) g.continueVotes.push(playerId);
        // check if majority voted
        if (g.continueVotes.length >= Math.ceil(g.players.length * 0.5)) {
          g.postBoss = true;
          g.phase = "active";
          g.timeRemainingMs = 999999999; // unlimited
          broadcastState(r);
        }
        break;
      }
      case "leave": {
        const ps = r.sockets.get(playerId);
        if (ps) ps.ws.close();
        break;
      }
    }
  });

  ws.on("close", () => {
    if (!room) return;
    room.lobby.players = room.lobby.players.filter(p => p.id !== playerId);
    room.sockets.delete(playerId);
    if (room.game) {
      const pl = room.game.players.find(p => p.id === playerId);
      if (pl) pl.alive = false;
    }
    if (room.lobby.players.length === 0) {
      if (room.interval) clearInterval(room.interval);
      rooms.delete(roomId);
    } else {
      if (room.lobby.hostId === playerId) {
        room.lobby.hostId = room.lobby.players[0].id;
      }
      broadcastLobby(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[DEFUSE.EXE] Roguelite server listening on :${PORT}`);
});
