/* ═══════════════════════════════════════════════════════════════════════
   DEFUSE.EXE — Multiplayer Roguelite Survivor — Client
   ═══════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientEnvelope, ServerEnvelope, GameState, LobbyState,
  LevelUpOffer, GameResult, UpgradeDef, CosmeticChoice,
  PlayerState, EnemyState, ProjectileState, BombZoneState,
  XpGemState, DamageNumber, BreakableState, PickupState,
} from "@defuse/shared";
import {
  CHARACTERS, WEAPONS, TOKENS, ASCENDED_WEAPONS, ASCENSION_RECIPES,
  ARENA_W, ARENA_H, PLAYER_RADIUS,
  getWeapon, getCharacter, getEnemy,
  HATS, TRAILS, COLOR_OVERRIDES,
  MAX_BLACKLISTED_WEAPONS, MAX_BLACKLISTED_TOKENS,
} from "@defuse/shared";

/* ── Networking ─────────────────────────────────────────────────────── */

function normalizeUrl(raw: string | undefined): string {
  const v = (raw ?? "http://localhost:3001").trim();
  if (!v) return "http://localhost:3001";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v}`;
}
function wsUrl(http: string): string {
  const u = new URL(http);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws"; u.search = ""; u.hash = "";
  return u.toString();
}
const SERVER = normalizeUrl(import.meta.env.VITE_SERVER_URL);
const WS_URL = wsUrl(SERVER);

/* ── Input ──────────────────────────────────────────────────────────── */

const keysDown = new Set<string>();
function inputVector(): { dx: number; dy: number } {
  let dx = 0, dy = 0;
  if (keysDown.has("a") || keysDown.has("arrowleft")) dx -= 1;
  if (keysDown.has("d") || keysDown.has("arrowright")) dx += 1;
  if (keysDown.has("w") || keysDown.has("arrowup")) dy -= 1;
  if (keysDown.has("s") || keysDown.has("arrowdown")) dy += 1;
  return { dx, dy };
}

/* ── Canvas Renderer ────────────────────────────────────────────────── */

interface Camera { x: number; y: number; scale: number; }

function worldToScreen(wx: number, wy: number, cam: Camera, cw: number, ch: number): [number, number] {
  return [(wx - cam.x) * cam.scale + cw / 2, (wy - cam.y) * cam.scale + ch / 2];
}

function renderGame(
  ctx: CanvasRenderingContext2D, state: GameState, myId: string,
  cw: number, ch: number
): void {
  const me = state.players.find(p => p.id === myId);
  const cam: Camera = { x: me?.x ?? ARENA_W / 2, y: me?.y ?? ARENA_H / 2, scale: 1.0 };

  ctx.clearRect(0, 0, cw, ch);

  // background
  ctx.fillStyle = "#0a0f1a";
  ctx.fillRect(0, 0, cw, ch);

  // arena bounds
  const [ax, ay] = worldToScreen(0, 0, cam, cw, ch);
  const [bx, by] = worldToScreen(ARENA_W, ARENA_H, cam, cw, ch);
  ctx.strokeStyle = "rgba(56,189,248,0.15)";
  ctx.lineWidth = 2;
  ctx.strokeRect(ax, ay, bx - ax, by - ay);

  // grid
  ctx.strokeStyle = "rgba(148,163,184,0.05)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= ARENA_W; gx += 200) {
    const [sx] = worldToScreen(gx, 0, cam, cw, ch);
    ctx.beginPath(); ctx.moveTo(sx, ay); ctx.lineTo(sx, by); ctx.stroke();
  }
  for (let gy = 0; gy <= ARENA_H; gy += 200) {
    const [, sy] = worldToScreen(0, gy, cam, cw, ch);
    ctx.beginPath(); ctx.moveTo(ax, sy); ctx.lineTo(bx, sy); ctx.stroke();
  }

  // bomb zones
  for (const zone of state.bombZones) {
    drawBombZone(ctx, zone, cam, cw, ch, state.tick);
  }

  // breakables
  for (const br of state.breakables) {
    drawBreakable(ctx, br, cam, cw, ch);
  }

  // pickups
  for (const pu of state.pickups) {
    drawPickup(ctx, pu, cam, cw, ch, state.tick);
  }

  // XP gems
  for (const gem of state.xpGems) {
    drawXpGem(ctx, gem, cam, cw, ch);
  }

  // projectiles
  for (const proj of state.projectiles) {
    drawProjectile(ctx, proj, cam, cw, ch);
  }

  // enemies
  for (const enemy of state.enemies) {
    drawEnemy(ctx, enemy, cam, cw, ch, state.tick);
  }

  // players
  for (const player of state.players) {
    drawPlayer(ctx, player, cam, cw, ch, player.id === myId, state.tick);
  }

  // damage numbers
  for (const dn of state.damageNumbers) {
    drawDamageNumber(ctx, dn, cam, cw, ch);
  }

  // minimap
  drawMinimap(ctx, state, myId, cw, ch);
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerState, cam: Camera, cw: number, ch: number, isMe: boolean, tick: number): void {
  if (!p.alive) return;
  const [sx, sy] = worldToScreen(p.x, p.y, cam, cw, ch);
  const charDef = getCharacter(p.characterId);
  const color = p.cosmetic.colorOverride || charDef?.color || "#38bdf8";
  const s = cam.scale;

  // Stick figure proportions
  const headR = 5 * s;
  const bodyLen = 14 * s;
  const armLen = 10 * s;
  const legLen = 12 * s;

  // The player position (sx, sy) maps to the hip (center of the figure)
  const isMoving = p.dx !== 0 || p.dy !== 0;
  const walkCycle = isMoving ? tick * 0.25 : 0;
  const armSwing = isMoving ? Math.sin(walkCycle) * 0.7 : 0;
  const legSwing = isMoving ? Math.sin(walkCycle) * 0.8 : 0;
  const idleBob = isMoving ? 0 : Math.sin(tick * 0.08) * 1;

  const headCY = sy - bodyLen - headR + idleBob;
  const shoulderY = sy - bodyLen * 0.7 + idleBob;
  const hipY = sy + idleBob;

  // invuln glow
  if (p.invulnMs > 0) {
    ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.2;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4 * s;
    ctx.beginPath(); ctx.arc(sx, sy - bodyLen / 2, bodyLen + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 * s;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Head
  ctx.beginPath();
  ctx.arc(sx, headCY, headR, 0, Math.PI * 2);
  ctx.stroke();

  // Eyes (tiny dots)
  ctx.fillStyle = color;
  const eyeOff = p.dx > 0 ? 1.5 : p.dx < 0 ? -1.5 : 0;
  ctx.beginPath(); ctx.arc(sx - 2 * s + eyeOff, headCY - 1, 1 * s, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(sx + 2 * s + eyeOff, headCY - 1, 1 * s, 0, Math.PI * 2); ctx.fill();

  // Body
  ctx.beginPath();
  ctx.moveTo(sx, headCY + headR);
  ctx.lineTo(sx, hipY);
  ctx.stroke();

  // Arms
  // Left arm
  ctx.beginPath();
  ctx.moveTo(sx, shoulderY);
  ctx.lineTo(sx - armLen * Math.cos(armSwing), shoulderY + armLen * Math.abs(Math.sin(armSwing + Math.PI / 3)));
  ctx.stroke();
  // Right arm
  ctx.beginPath();
  ctx.moveTo(sx, shoulderY);
  ctx.lineTo(sx + armLen * Math.cos(-armSwing), shoulderY + armLen * Math.abs(Math.sin(-armSwing + Math.PI / 3)));
  ctx.stroke();

  // Legs
  // Left leg
  ctx.beginPath();
  ctx.moveTo(sx, hipY);
  ctx.lineTo(sx - legLen * Math.sin(legSwing + 0.35), hipY + legLen * Math.cos(legSwing + 0.35));
  ctx.stroke();
  // Right leg
  ctx.beginPath();
  ctx.moveTo(sx, hipY);
  ctx.lineTo(sx + legLen * Math.sin(-legSwing + 0.35), hipY + legLen * Math.cos(-legSwing + 0.35));
  ctx.stroke();

  // Hat
  if (p.cosmetic.hat && p.cosmetic.hat !== "none") {
    drawHat(ctx, sx, headCY, headR, p.cosmetic.hat);
  }

  // outline for local player
  if (isMe) {
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(sx, sy - bodyLen / 2 + idleBob, bodyLen + headR + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // health bar
  if (p.hp < p.maxHp) {
    const bw = 30 * s;
    const bx = sx - bw / 2;
    const bTop = headCY - headR - 8;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bx, bTop, bw, 4);
    ctx.fillStyle = p.hp / p.maxHp > 0.3 ? "#4ade80" : "#ef4444";
    ctx.fillRect(bx, bTop, bw * (p.hp / p.maxHp), 4);
  }

  // name
  ctx.fillStyle = "#fff";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(p.displayName, sx, hipY + legLen + 12 + idleBob);
}

function drawHat(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, hat: string): void {
  ctx.fillStyle = "#fde68a";
  switch (hat) {
    case "halo":
      ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx, sy - r - 4, r * 0.7, 3, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case "crown":
      ctx.beginPath();
      ctx.moveTo(sx - r * 0.6, sy - r);
      ctx.lineTo(sx - r * 0.4, sy - r - 8);
      ctx.lineTo(sx, sy - r - 3);
      ctx.lineTo(sx + r * 0.4, sy - r - 8);
      ctx.lineTo(sx + r * 0.6, sy - r);
      ctx.closePath(); ctx.fill();
      break;
    case "horns":
      ctx.fillStyle = "#ef4444";
      ctx.beginPath(); ctx.moveTo(sx - r * 0.5, sy - r); ctx.lineTo(sx - r * 0.8, sy - r - 10); ctx.lineTo(sx - r * 0.2, sy - r); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx + r * 0.5, sy - r); ctx.lineTo(sx + r * 0.8, sy - r - 10); ctx.lineTo(sx + r * 0.2, sy - r); ctx.fill();
      break;
    case "antenna":
      ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy - r - 12); ctx.stroke();
      ctx.fillStyle = "#4ade80";
      ctx.beginPath(); ctx.arc(sx, sy - r - 12, 3, 0, Math.PI * 2); ctx.fill();
      break;
    case "tophat":
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(sx - r * 0.5, sy - r - 10, r, 10);
      ctx.fillRect(sx - r * 0.7, sy - r, r * 1.4, 3);
      break;
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: EnemyState, cam: Camera, cw: number, ch: number, tick: number): void {
  const [sx, sy] = worldToScreen(e.x, e.y, cam, cw, ch);
  const def = getEnemy(e.defId);
  if (!def) return;
  const sc = cam.scale * (e.rank === "boss" ? 2.5 : e.rank === "miniboss" ? 1.8 : e.rank === "elite" ? 1.3 : 1);
  const s = sc * 0.8;

  // elite/boss glow
  if (e.rank !== "normal") {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = e.rank === "boss" ? "#dc2626" : e.rank === "miniboss" ? "#f97316" : "#fbbf24";
    ctx.beginPath(); ctx.arc(sx, sy - 6 * s, def.size * sc + 8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Animated enemy stick figure
  const walkAnim = Math.sin(tick * 0.2 + e.x * 0.01) * 0.5;
  const headR = 4 * s;
  const bodyLen = 10 * s;
  const armLen = 7 * s;
  const legLen = 8 * s;

  const headCY = sy - bodyLen - headR;
  const shoulderY = sy - bodyLen * 0.65;
  const hipY = sy;

  ctx.strokeStyle = def.color;
  ctx.lineWidth = Math.max(1.5, 2 * s);
  ctx.lineCap = "round";

  // Head
  ctx.beginPath();
  ctx.arc(sx, headCY, headR, 0, Math.PI * 2);
  ctx.stroke();

  // X eyes for enemies
  const ex = 1.5 * s;
  ctx.lineWidth = Math.max(1, 1.5 * s);
  // left X
  ctx.beginPath(); ctx.moveTo(sx - 2 * s - ex * 0.4, headCY - ex * 0.4); ctx.lineTo(sx - 2 * s + ex * 0.4, headCY + ex * 0.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx - 2 * s + ex * 0.4, headCY - ex * 0.4); ctx.lineTo(sx - 2 * s - ex * 0.4, headCY + ex * 0.4); ctx.stroke();
  // right X
  ctx.beginPath(); ctx.moveTo(sx + 2 * s - ex * 0.4, headCY - ex * 0.4); ctx.lineTo(sx + 2 * s + ex * 0.4, headCY + ex * 0.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx + 2 * s + ex * 0.4, headCY - ex * 0.4); ctx.lineTo(sx + 2 * s - ex * 0.4, headCY + ex * 0.4); ctx.stroke();

  ctx.lineWidth = Math.max(1.5, 2 * s);

  // Body
  ctx.beginPath();
  ctx.moveTo(sx, headCY + headR);
  ctx.lineTo(sx, hipY);
  ctx.stroke();

  // Arms - pose based on enemy class
  if (def.enemyClass === "melee") {
    // arms reaching forward
    ctx.beginPath(); ctx.moveTo(sx, shoulderY); ctx.lineTo(sx - armLen * 0.3, shoulderY - armLen * 0.7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, shoulderY); ctx.lineTo(sx + armLen * 0.3, shoulderY - armLen * 0.7); ctx.stroke();
  } else if (def.enemyClass === "ranged") {
    // one arm aiming forward
    ctx.beginPath(); ctx.moveTo(sx, shoulderY); ctx.lineTo(sx - armLen, shoulderY + armLen * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, shoulderY); ctx.lineTo(sx + armLen * 0.7, shoulderY - armLen * 0.5); ctx.stroke();
  } else {
    // caster - arms raised
    ctx.beginPath(); ctx.moveTo(sx, shoulderY); ctx.lineTo(sx - armLen * 0.8, shoulderY - armLen * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, shoulderY); ctx.lineTo(sx + armLen * 0.8, shoulderY - armLen * 0.6); ctx.stroke();
  }

  // Legs with walk animation
  ctx.beginPath();
  ctx.moveTo(sx, hipY);
  ctx.lineTo(sx - legLen * Math.sin(walkAnim + 0.3), hipY + legLen * Math.cos(walkAnim + 0.3));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx, hipY);
  ctx.lineTo(sx + legLen * Math.sin(-walkAnim + 0.3), hipY + legLen * Math.cos(-walkAnim + 0.3));
  ctx.stroke();

  // health bar
  if (e.hp < e.maxHp) {
    const bw = 20 * s;
    const bx = sx - bw / 2;
    const bTop = headCY - headR - 6;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bx, bTop, bw, 3);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(bx, bTop, bw * Math.max(0, e.hp / e.maxHp), 3);
  }

  // rank indicator
  if (e.rank === "boss" || e.rank === "miniboss") {
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.floor(10 * s)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(def.name, sx, hipY + legLen + 12 * s);
  }
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: ProjectileState, cam: Camera, cw: number, ch: number): void {
  const [sx, sy] = worldToScreen(p.x, p.y, cam, cw, ch);
  const size = Math.max(3, p.area * 0.5 * cam.scale);

  if (p.pattern === "ring") {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(sx, sy, p.area * cam.scale, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  if (p.pattern === "ground") {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(sx, sy, p.area * cam.scale, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  if (p.pattern === "beam") {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + p.dx * 300 * cam.scale, sy + p.dy * 300 * cam.scale);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  // default dot
  ctx.fillStyle = p.ownerId === "__enemy__" ? "#ff6666" : p.color;
  ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill();
}

function drawXpGem(ctx: CanvasRenderingContext2D, gem: XpGemState, cam: Camera, cw: number, ch: number): void {
  const [sx, sy] = worldToScreen(gem.x, gem.y, cam, cw, ch);
  const s = gem.value > 10 ? 5 : 3;
  ctx.fillStyle = gem.value > 10 ? "#fbbf24" : "#86efac";
  ctx.beginPath();
  ctx.moveTo(sx, sy - s);
  ctx.lineTo(sx + s, sy);
  ctx.lineTo(sx, sy + s);
  ctx.lineTo(sx - s, sy);
  ctx.closePath();
  ctx.fill();
}

function drawBombZone(ctx: CanvasRenderingContext2D, zone: BombZoneState, cam: Camera, cw: number, ch: number, tick: number): void {
  const [sx, sy] = worldToScreen(zone.x, zone.y, cam, cw, ch);
  const r = zone.radius * cam.scale;
  const pulse = Math.sin(tick * 0.1) * 0.15 + 0.85;

  // outer ring
  ctx.strokeStyle = `rgba(20,184,166,${0.4 * pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(sx, sy, r * pulse, 0, Math.PI * 2); ctx.stroke();

  // fill
  ctx.fillStyle = `rgba(20,184,166,${0.08 * pulse})`;
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();

  // progress arc
  if (zone.progress > 0) {
    ctx.strokeStyle = "#14b8a6";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(sx, sy, r - 6, -Math.PI / 2, -Math.PI / 2 + (zone.progress / 100) * Math.PI * 2);
    ctx.stroke();
  }

  // label
  ctx.fillStyle = "#5eead4";
  ctx.font = "bold 12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`BOMB ${Math.floor(zone.progress)}%`, sx, sy - 4);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px Inter, sans-serif";
  ctx.fillText(`${zone.playersInside} inside · ${Math.ceil(zone.timeLeftMs / 1000)}s`, sx, sy + 10);
}

function drawBreakable(ctx: CanvasRenderingContext2D, br: BreakableState, cam: Camera, cw: number, ch: number): void {
  const [sx, sy] = worldToScreen(br.x, br.y, cam, cw, ch);
  const size = 14 * cam.scale;
  const colors: Record<string, string> = { crate: "#d97706", barrel: "#78716c", crystal: "#a78bfa" };
  const color = colors[br.kind] ?? "#d97706";

  ctx.fillStyle = color;
  if (br.kind === "crate") {
    ctx.fillRect(sx - size, sy - size, size * 2, size * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - size, sy - size, size * 2, size * 2);
    // cross lines
    ctx.beginPath(); ctx.moveTo(sx - size, sy - size); ctx.lineTo(sx + size, sy + size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + size, sy - size); ctx.lineTo(sx - size, sy + size); ctx.stroke();
  } else if (br.kind === "barrel") {
    ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // bands
    ctx.strokeStyle = "#57534e";
    ctx.beginPath(); ctx.moveTo(sx - size, sy - size * 0.3); ctx.lineTo(sx + size, sy - size * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - size, sy + size * 0.3); ctx.lineTo(sx + size, sy + size * 0.3); ctx.stroke();
  } else {
    // crystal - diamond shape
    ctx.beginPath();
    ctx.moveTo(sx, sy - size * 1.3);
    ctx.lineTo(sx + size * 0.8, sy);
    ctx.lineTo(sx, sy + size * 0.6);
    ctx.lineTo(sx - size * 0.8, sy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c4b5fd";
    ctx.lineWidth = 1;
    ctx.stroke();
    // shimmer
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(sx - size * 0.2, sy - size * 0.8);
    ctx.lineTo(sx + size * 0.2, sy - size * 0.3);
    ctx.lineTo(sx - size * 0.1, sy - size * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  // HP bar if damaged
  if (br.hp < br.maxHp) {
    const bw = size * 2.5;
    const bx = sx - bw / 2;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bx, sy - size - 6, bw, 3);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(bx, sy - size - 6, bw * (br.hp / br.maxHp), 3);
  }
}

function drawPickup(ctx: CanvasRenderingContext2D, pu: PickupState, cam: Camera, cw: number, ch: number, tick: number): void {
  const [sx, sy] = worldToScreen(pu.x, pu.y, cam, cw, ch);
  const bob = Math.sin(tick * 0.12) * 3;
  const size = 8 * cam.scale;

  // fading when about to expire
  if (pu.lifeMs < 3000) {
    ctx.globalAlpha = 0.4 + Math.sin(tick * 0.2) * 0.3;
  }

  const colors: Record<string, string> = {
    health: "#4ade80", magnet: "#c084fc", speed_boost: "#38bdf8",
    damage_boost: "#ef4444", bomb_charge: "#14b8a6", coins: "#fbbf24",
  };
  const icons: Record<string, string> = {
    health: "+", magnet: "⊕", speed_boost: "»",
    damage_boost: "⚔", bomb_charge: "◉", coins: "$",
  };

  ctx.fillStyle = colors[pu.pickupType] ?? "#fff";
  ctx.beginPath(); ctx.arc(sx, sy + bob, size, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.floor(size * 1.4)}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icons[pu.pickupType] ?? "?", sx, sy + bob);

  ctx.globalAlpha = 1;
  ctx.textBaseline = "alphabetic";
}

function drawDamageNumber(ctx: CanvasRenderingContext2D, dn: DamageNumber, cam: Camera, cw: number, ch: number): void {
  const [sx, sy] = worldToScreen(dn.x, dn.y, cam, cw, ch);
  const fade = 1 - dn.age / 800;
  if (fade <= 0) return;
  ctx.globalAlpha = fade;
  ctx.fillStyle = dn.crit ? "#fbbf24" : "#fff";
  ctx.font = dn.crit ? "bold 16px Inter, sans-serif" : "12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(String(dn.value), sx, sy - dn.age * 0.04);
  ctx.globalAlpha = 1;
}

function drawMinimap(ctx: CanvasRenderingContext2D, state: GameState, myId: string, cw: number, ch: number): void {
  const mw = 140, mh = 140, mx = cw - mw - 10, my = ch - mh - 10;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = "rgba(56,189,248,0.3)";
  ctx.strokeRect(mx, my, mw, mh);

  const sx = mw / ARENA_W, sy2 = mh / ARENA_H;

  // bomb zones
  for (const z of state.bombZones) {
    ctx.fillStyle = "rgba(20,184,166,0.6)";
    ctx.beginPath(); ctx.arc(mx + z.x * sx, my + z.y * sy2, 4, 0, Math.PI * 2); ctx.fill();
  }

  // enemies (dots)
  ctx.fillStyle = "rgba(239,68,68,0.4)";
  for (const e of state.enemies) {
    if (e.rank === "boss" || e.rank === "miniboss") {
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath(); ctx.arc(mx + e.x * sx, my + e.y * sy2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(239,68,68,0.4)";
    } else {
      ctx.fillRect(mx + e.x * sx - 1, my + e.y * sy2 - 1, 2, 2);
    }
  }

  // players
  for (const p of state.players) {
    if (!p.alive) continue;
    ctx.fillStyle = p.id === myId ? "#fff" : "#38bdf8";
    ctx.beginPath(); ctx.arc(mx + p.x * sx, my + p.y * sy2, 3, 0, Math.PI * 2); ctx.fill();
  }
}

/* ── Starter weapon / Token display names ───────────────────────────── */

const starterWeapons = WEAPONS.filter(w => w.starter);
const allNonStarterWeapons = WEAPONS.filter(w => !w.starter);

/* ── Stick figure preview (for cosmetics) ───────────────────────────── */

function drawStickPreview(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  color: string, hat: string, tick: number
): void {
  const s = 2.2;
  const headR = 5 * s;
  const bodyLen = 14 * s;
  const armLen = 10 * s;
  const legLen = 12 * s;

  const bob = Math.sin(tick * 0.06) * 2;
  const armWave = Math.sin(tick * 0.08) * 0.3;

  const headCY = cy - bodyLen - headR + bob;
  const shoulderY = cy - bodyLen * 0.7 + bob;
  const hipY = cy + bob;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 * s;
  ctx.lineCap = "round";

  // Head
  ctx.beginPath(); ctx.arc(cx, headCY, headR, 0, Math.PI * 2); ctx.stroke();

  // Eyes
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx - 3 * s, headCY - 1, 1.2 * s, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 3 * s, headCY - 1, 1.2 * s, 0, Math.PI * 2); ctx.fill();

  // Smile
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.arc(cx, headCY + 1 * s, 2.5 * s, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  ctx.lineWidth = 2.5 * s;

  // Body
  ctx.beginPath(); ctx.moveTo(cx, headCY + headR); ctx.lineTo(cx, hipY); ctx.stroke();

  // Arms (idle wave)
  ctx.beginPath(); ctx.moveTo(cx, shoulderY);
  ctx.lineTo(cx - armLen * Math.cos(armWave), shoulderY + armLen * Math.abs(Math.sin(armWave + Math.PI / 3)));
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, shoulderY);
  ctx.lineTo(cx + armLen * Math.cos(-armWave + 0.5), shoulderY + armLen * Math.abs(Math.sin(-armWave + Math.PI / 4)));
  ctx.stroke();

  // Legs
  ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx - legLen * 0.35, hipY + legLen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx + legLen * 0.35, hipY + legLen); ctx.stroke();

  // Hat
  if (hat && hat !== "none") {
    drawHat(ctx, cx, headCY, headR, hat);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   React Components
   ═══════════════════════════════════════════════════════════════════════ */

function LobbyScreen({
  lobby, myId, send,
}: {
  lobby: LobbyState; myId: string;
  send: (e: ClientEnvelope) => void;
}): JSX.Element {
  const me = lobby.players.find(p => p.id === myId);
  const [tab, setTab] = useState(0);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const previewTick = useRef(0);
  const previewAnim = useRef(0);

  if (!me) return <div className="menu-screen"><p style={{ textAlign: "center", paddingTop: 80 }}>Joining...</p></div>;

  // Cosmetic preview animation loop
  useEffect(() => {
    function renderPreview() {
      previewTick.current++;
      const canvas = previewRef.current;
      if (canvas && me) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = 140;
          canvas.height = 180;
          ctx.clearRect(0, 0, 140, 180);
          const charDef = getCharacter(me.characterId);
          const color = me.cosmetic.colorOverride || charDef?.color || "#38bdf8";
          drawStickPreview(ctx, 70, 110, color, me.cosmetic.hat ?? "none", previewTick.current);
        }
      }
      previewAnim.current = requestAnimationFrame(renderPreview);
    }
    previewAnim.current = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(previewAnim.current);
  }, [me.characterId, me.cosmetic]);

  const tabs = ["HERO", "ARMS", "STYLE", "BANS"];

  return (
    <div className="menu-screen">
      <div className="menu-header">
        <h1 className="menu-title">DEFUSE.EXE</h1>
        <p className="menu-subtitle">Stick Figure Survivor</p>
      </div>

      <div className="menu-tabs">
        {tabs.map((t, i) => (
          <button
            key={t}
            className={tab === i ? "menu-tab active" : "menu-tab"}
            onClick={() => setTab(i)}
          >{t}</button>
        ))}
      </div>

      <div className="menu-content">
        {/* ── HERO tab ── */}
        {tab === 0 && (
          <div className="tab-panel">
            <div className="char-grid">
              {CHARACTERS.map(c => (
                <button
                  key={c.id}
                  className={me.characterId === c.id ? "char-card selected" : "char-card"}
                  onClick={() => send({ type: "lobby_update", characterId: c.id })}
                >
                  <div className="char-icon" style={{ borderColor: c.color, color: c.color }}>
                    <svg width="32" height="40" viewBox="0 0 32 40">
                      <circle cx="16" cy="8" r="5" fill="none" stroke={c.color} strokeWidth="2"/>
                      <line x1="16" y1="13" x2="16" y2="26" stroke={c.color} strokeWidth="2" strokeLinecap="round"/>
                      <line x1="16" y1="17" x2="8" y2="23" stroke={c.color} strokeWidth="2" strokeLinecap="round"/>
                      <line x1="16" y1="17" x2="24" y2="23" stroke={c.color} strokeWidth="2" strokeLinecap="round"/>
                      <line x1="16" y1="26" x2="10" y2="36" stroke={c.color} strokeWidth="2" strokeLinecap="round"/>
                      <line x1="16" y1="26" x2="22" y2="36" stroke={c.color} strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <strong>{c.name}</strong>
                  <small>{c.passiveDesc}</small>
                  <small className="char-stats">HP {c.baseHp} · SPD {c.baseSpeed}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── ARMS tab ── */}
        {tab === 1 && (
          <div className="tab-panel">
            <div className="weapon-grid">
              {starterWeapons.map(w => (
                <button
                  key={w.id}
                  className={me.starterWeaponId === w.id ? "weapon-card selected" : "weapon-card"}
                  onClick={() => send({ type: "lobby_update", starterWeaponId: w.id })}
                >
                  <span className="dot" style={{ background: w.color }} />
                  <strong>{w.name}</strong>
                  <small>{w.description}</small>
                  <small className="weapon-meta">{w.pattern} · {w.baseDamage} dmg · {w.baseCooldownMs}ms</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STYLE tab ── */}
        {tab === 2 && (
          <div className="tab-panel cosmetic-tab">
            <div className="cosmetic-options">
              <div className="cosmetic-group">
                <label>Color</label>
                <div className="color-swatches">
                  {COLOR_OVERRIDES.map(c => (
                    <button
                      key={c || "default"}
                      className={me.cosmetic.colorOverride === c ? "swatch selected" : "swatch"}
                      style={{ background: c || "transparent", border: !c ? "1px dashed #94a3b8" : "none" }}
                      onClick={() => send({ type: "lobby_update", cosmetic: { ...me.cosmetic, colorOverride: c || undefined } })}
                    />
                  ))}
                </div>
              </div>
              <div className="cosmetic-group">
                <label>Hat</label>
                <div className="row">
                  {HATS.map(h => (
                    <button
                      key={h}
                      className={(me.cosmetic.hat ?? "none") === h ? "sm-btn selected" : "sm-btn"}
                      onClick={() => send({ type: "lobby_update", cosmetic: { ...me.cosmetic, hat: h } })}
                    >{h}</button>
                  ))}
                </div>
              </div>
              <div className="cosmetic-group">
                <label>Trail</label>
                <div className="row">
                  {TRAILS.map(t => (
                    <button
                      key={t}
                      className={(me.cosmetic.trail ?? "none") === t ? "sm-btn selected" : "sm-btn"}
                      onClick={() => send({ type: "lobby_update", cosmetic: { ...me.cosmetic, trail: t } })}
                    >{t}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="cosmetic-preview">
              <canvas ref={previewRef} width={140} height={180} />
              <span className="preview-label">Preview</span>
            </div>
          </div>
        )}

        {/* ── BANS tab ── */}
        {tab === 3 && (
          <div className="tab-panel">
            <div className="bans-columns">
              <div className="ban-col">
                <h4>Weapons ({me.blacklistedWeapons.length}/{MAX_BLACKLISTED_WEAPONS})</h4>
                <div className="ban-grid">
                  {allNonStarterWeapons.map(w => {
                    const bl = me.blacklistedWeapons.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        className={bl ? "bl-btn active" : "bl-btn"}
                        onClick={() => {
                          const next = bl
                            ? me.blacklistedWeapons.filter(x => x !== w.id)
                            : me.blacklistedWeapons.length < MAX_BLACKLISTED_WEAPONS
                              ? [...me.blacklistedWeapons, w.id]
                              : me.blacklistedWeapons;
                          send({ type: "lobby_update", blacklistedWeapons: next });
                        }}
                      >{w.name}</button>
                    );
                  })}
                </div>
              </div>
              <div className="ban-col">
                <h4>Tokens ({me.blacklistedTokens.length}/{MAX_BLACKLISTED_TOKENS})</h4>
                <div className="ban-grid">
                  {TOKENS.map(t => {
                    const bl = me.blacklistedTokens.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        className={bl ? "bl-btn active" : "bl-btn"}
                        onClick={() => {
                          const next = bl
                            ? me.blacklistedTokens.filter(x => x !== t.id)
                            : me.blacklistedTokens.length < MAX_BLACKLISTED_TOKENS
                              ? [...me.blacklistedTokens, t.id]
                              : me.blacklistedTokens;
                          send({ type: "lobby_update", blacklistedTokens: next });
                        }}
                      >{t.icon} {t.name}</button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Players */}
      <div className="menu-players">
        {lobby.players.map(p => {
          const c = getCharacter(p.characterId);
          const w = getWeapon(p.starterWeaponId);
          return (
            <div key={p.id} className="player-card">
              <span className="dot" style={{ background: c?.color ?? "#fff" }} />
              <span>{p.displayName}</span>
              <small>{c?.name} · {w?.name}</small>
              <span className={p.ready ? "ready-badge ready" : "ready-badge"}>{p.ready ? "READY" : "..."}</span>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="menu-actions">
        <button className="big-btn" onClick={() => send({ type: "ready", ready: !me.ready })}>
          {me.ready ? "Unready" : "Ready Up"}
        </button>
        {lobby.hostId === myId && (
          <button className="big-btn accent" onClick={() => send({ type: "start_game" })}>
            Start Game
          </button>
        )}
      </div>
    </div>
  );
}

/* ── HUD ────────────────────────────────────────────────────────────── */

function WeaponInspectPanel({ ws, player, onClose }: {
  ws: { weaponId: string; level: number; ascended: boolean };
  player: PlayerState;
  onClose: () => void;
}): JSX.Element {
  const wDef = getWeapon(ws.weaponId);
  if (!wDef) return <div className="inspect-panel"><p>Unknown weapon</p><button className="sm-btn" onClick={onClose}>Close</button></div>;

  const lvlMult = 1 + (ws.level - 1) * 0.2;
  const curDamage = Math.floor(wDef.baseDamage * lvlMult * (1 + player.bonusDamage));
  const curArea = Math.floor(wDef.baseArea * (1 + player.bonusArea));
  const curProj = wDef.baseProjectiles + Math.floor(player.bonusProjectiles);
  const curPierce = wDef.basePierce + Math.floor(player.bonusPierce);
  const curCd = Math.max(50, Math.floor(wDef.baseCooldownMs * (1 / (1 + player.bonusAttackSpeed))));

  const recipe = ASCENSION_RECIPES.find(r => r.weaponId === ws.weaponId || r.ascendedWeaponId === ws.weaponId);
  const matchToken = recipe ? TOKENS.find(t => t.id === recipe.tokenId) : null;
  const hasToken = matchToken ? player.tokens.includes(matchToken.id) : false;

  const stat = (label: string, base: number, cur: number) => (
    <div className="inspect-stat">
      <span className="inspect-label">{label}</span>
      <span className="inspect-base">{base}</span>
      {cur !== base && <span className="inspect-current"> → <span className="green">{cur}</span></span>}
    </div>
  );

  return (
    <div className="inspect-panel">
      <div className="inspect-header">
        <span className="w-dot" style={{ background: wDef.color }} />
        <strong>{wDef.name}</strong>
        <small>Lv{ws.level}{ws.ascended ? " ★" : ""}</small>
        <button className="inspect-close" onClick={onClose}>✕</button>
      </div>
      <p className="inspect-desc">{wDef.description}</p>
      <div className="inspect-stats">
        {stat("Damage", wDef.baseDamage, curDamage)}
        {stat("Area", wDef.baseArea, curArea)}
        {stat("Projectiles", wDef.baseProjectiles, curProj)}
        {stat("Pierce", wDef.basePierce, curPierce)}
        {stat("Cooldown", wDef.baseCooldownMs, curCd)}
        <div className="inspect-stat">
          <span className="inspect-label">Pattern</span>
          <span className="inspect-base">{wDef.pattern}</span>
        </div>
      </div>
      {recipe && !ws.ascended && (
        <div className="inspect-ascension">
          <strong>Ascension</strong>
          <p>
            Requires: <span className={ws.level >= 5 ? "green" : "red"}>Lv5 ({ws.level}/5)</span>
            {" + "}
            <span className={hasToken ? "green" : "red"}>{matchToken?.icon} {matchToken?.name ?? recipe.tokenId}</span>
          </p>
          {ws.level >= 5 && hasToken && <span className="ascension-ready">✦ READY TO ASCEND</span>}
        </div>
      )}
    </div>
  );
}

function TokenInspectPanel({ tokenId, onClose }: { tokenId: string; onClose: () => void }): JSX.Element {
  const tDef = TOKENS.find(t => t.id === tokenId);
  if (!tDef) return <div className="inspect-panel"><p>Unknown token</p><button className="sm-btn" onClick={onClose}>Close</button></div>;

  const recipe = ASCENSION_RECIPES.find(r => r.tokenId === tokenId);
  const matchWeapon = recipe ? getWeapon(recipe.weaponId) : null;

  return (
    <div className="inspect-panel">
      <div className="inspect-header">
        <span>{tDef.icon}</span>
        <strong>{tDef.name}</strong>
        {tDef.group && <span className="group-badge">GROUP</span>}
        <button className="inspect-close" onClick={onClose}>✕</button>
      </div>
      <p className="inspect-desc">{tDef.description}</p>
      <div className="inspect-stats">
        <div className="inspect-stat">
          <span className="inspect-label">Stat</span>
          <span className="inspect-base">{tDef.stat}</span>
        </div>
        <div className="inspect-stat">
          <span className="inspect-label">Value</span>
          <span className="green">+{tDef.value < 1 ? `${Math.floor(tDef.value * 100)}%` : tDef.value}</span>
        </div>
      </div>
      {recipe && matchWeapon && (
        <div className="inspect-ascension">
          <strong>Ascends with</strong>
          <p><span className="w-dot" style={{ background: matchWeapon.color }} /> {matchWeapon.name} at Lv5</p>
        </div>
      )}
    </div>
  );
}

function PlayerInspectPanel({ player, onClose }: { player: PlayerState; onClose: () => void }): JSX.Element {
  const charDef = getCharacter(player.characterId);
  return (
    <div className="inspect-panel player-inspect">
      <div className="inspect-header">
        <span className="dot" style={{ background: charDef?.color ?? "#38bdf8" }} />
        <strong>{player.displayName}</strong>
        <small>{charDef?.name}</small>
        <button className="inspect-close" onClick={onClose}>✕</button>
      </div>
      <div className="inspect-stats">
        <div className="inspect-stat"><span className="inspect-label">HP</span><span>{player.hp}/{player.maxHp}</span></div>
        <div className="inspect-stat"><span className="inspect-label">Kills</span><span>{player.killCount}</span></div>
        <div className="inspect-stat"><span className="inspect-label">Damage</span><span>{player.damageDealt.toLocaleString()}</span></div>
        <div className="inspect-stat"><span className="inspect-label">Bombs</span><span>{player.bombsDefused}</span></div>
      </div>
      <div className="inspect-sub">
        <strong>Weapons</strong>
        {player.weapons.map(ws => {
          const w = getWeapon(ws.weaponId);
          return <div key={ws.weaponId} className="inspect-item"><span className="w-dot" style={{ background: w?.color ?? "#fff" }} /> {w?.name ?? ws.weaponId} Lv{ws.level}{ws.ascended ? " ★" : ""}</div>;
        })}
      </div>
      <div className="inspect-sub">
        <strong>Tokens</strong>
        {player.tokens.map(tid => {
          const t = TOKENS.find(tt => tt.id === tid);
          return <div key={tid} className="inspect-item">{t?.icon ?? "?"} {t?.name ?? tid}</div>;
        })}
        {player.tokens.length === 0 && <div className="inspect-item dim">None</div>}
      </div>
    </div>
  );
}

function HUD({ state, myId }: { state: GameState; myId: string }): JSX.Element {
  const me = state.players.find(p => p.id === myId);
  const mins = Math.floor(state.timeRemainingMs / 60000);
  const secs = Math.floor((state.timeRemainingMs % 60000) / 1000);
  const [inspectWeapon, setInspectWeapon] = useState<{ weaponId: string; level: number; ascended: boolean } | null>(null);
  const [inspectToken, setInspectToken] = useState<string | null>(null);
  const [inspectPlayer, setInspectPlayer] = useState<string | null>(null);
  const otherPlayers = state.players.filter(p => p.id !== myId);
  const inspectedPlayer = inspectPlayer ? state.players.find(p => p.id === inspectPlayer) : null;

  return (
    <div className="hud-overlay">
      <div className="hud-top">
        <div className="hud-stat">
          <small>Wave</small><strong>{state.wave}</strong>
        </div>
        <div className="hud-stat">
          <small>Time</small><strong>{state.postBoss ? "∞" : `${mins}:${secs.toString().padStart(2, "0")}`}</strong>
        </div>
        <div className="hud-stat">
          <small>Level</small><strong>{state.sharedLevel}</strong>
        </div>
        <div className="hud-stat">
          <small>Enemies</small><strong>{state.enemies.length}</strong>
        </div>
      </div>

      {/* XP bar */}
      <div className="xp-bar-container">
        <div className="xp-bar-fill" style={{ width: `${(state.sharedXp / state.xpToNext) * 100}%` }} />
        <span className="xp-text">XP {state.sharedXp}/{state.xpToNext}</span>
      </div>

      {/* Player HP + weapons + tokens */}
      {me && (
        <div className="hud-bottom-left">
          <div className="hp-bar-container">
            <div className="hp-bar-fill" style={{ width: `${(me.hp / me.maxHp) * 100}%` }} />
            <span className="hp-text">{me.hp}/{me.maxHp} HP</span>
          </div>
          <div className="weapon-slots">
            {me.weapons.map(ws => {
              const wDef = getWeapon(ws.weaponId);
              return (
                <div
                  key={ws.weaponId}
                  className={`weapon-slot ${ws.ascended ? "ascended" : ""} clickable`}
                  onClick={() => setInspectWeapon(inspectWeapon?.weaponId === ws.weaponId ? null : ws)}
                >
                  <span className="w-dot" style={{ background: wDef?.color ?? "#fff" }} />
                  <span>{wDef?.name ?? ws.weaponId}</span>
                  <small>Lv{ws.level}</small>
                </div>
              );
            })}
          </div>
          <div className="token-slots">
            {me.tokens.map(tid => {
              const t = TOKENS.find(tt => tt.id === tid);
              return (
                <div
                  key={tid}
                  className="token-slot clickable"
                  onClick={() => setInspectToken(inspectToken === tid ? null : tid)}
                >
                  <span>{t?.icon ?? "?"}</span>
                  <small>{t?.name ?? tid}</small>
                </div>
              );
            })}
          </div>

          {/* Weapon inspect */}
          {inspectWeapon && me && (
            <WeaponInspectPanel ws={inspectWeapon} player={me} onClose={() => setInspectWeapon(null)} />
          )}
          {/* Token inspect */}
          {inspectToken && (
            <TokenInspectPanel tokenId={inspectToken} onClose={() => setInspectToken(null)} />
          )}
        </div>
      )}

      {/* Party health bars (other players) */}
      {otherPlayers.length > 0 && (
        <div className="party-bars">
          {otherPlayers.map(p => {
            const charDef = getCharacter(p.characterId);
            const hpPct = p.maxHp > 0 ? (p.hp / p.maxHp) * 100 : 0;
            return (
              <div key={p.id} className="party-member">
                <div className="party-info">
                  <span className="dot-sm" style={{ background: charDef?.color ?? "#38bdf8" }} />
                  <span className="party-name">{p.displayName}</span>
                  <button className="party-inspect-btn" onClick={() => setInspectPlayer(inspectPlayer === p.id ? null : p.id)} title="Inspect">🔍</button>
                </div>
                <div className="party-hp-bar">
                  <div
                    className="party-hp-fill"
                    style={{
                      width: `${hpPct}%`,
                      background: !p.alive ? "#6b7280" : hpPct > 30 ? "#4ade80" : "#ef4444",
                    }}
                  />
                </div>
                {!p.alive && <span className="party-dead">DEAD</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Player inspect popup */}
      {inspectedPlayer && (
        <PlayerInspectPanel player={inspectedPlayer} onClose={() => setInspectPlayer(null)} />
      )}
    </div>
  );
}

/* ── Level-up modal ─────────────────────────────────────────────────── */

function LevelUpModal({ offer, send, onClose }: { offer: LevelUpOffer; send: (e: ClientEnvelope) => void; onClose: () => void }): JSX.Element {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Level Up!</h2>
        <p>Choose an upgrade:</p>
        <div className="upgrade-options">
          {offer.options.map(opt => (
            <button
              key={opt.id}
              className="upgrade-card"
              onClick={() => { send({ type: "pick_upgrade", upgradeId: opt.id }); onClose(); }}
            >
              <strong>{opt.name}</strong>
              <p>{opt.description}</p>
              {opt.group && <span className="group-badge">GROUP</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Vote continue modal ────────────────────────────────────────────── */

function VoteContinueModal({ state, send }: { state: GameState; send: (e: ClientEnvelope) => void }): JSX.Element {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Boss Defeated!</h2>
        <p>Keep going? Bosses will continue spawning every {5} waves.</p>
        <p>Votes: {state.continueVotes.length}/{Math.ceil(state.players.length * 0.5)} needed</p>
        <button className="big-btn accent" onClick={() => send({ type: "vote_continue" })}>
          Keep Going!
        </button>
      </div>
    </div>
  );
}

/* ── Results screen ─────────────────────────────────────────────────── */

function ResultsScreen({ result, send }: { result: GameResult; send: (e: ClientEnvelope) => void }): JSX.Element {
  const podiumPlayers = result.podium.map(id => result.players.find(p => p.id === id)!).filter(Boolean);

  return (
    <div className="screen results-screen">
      <h1 className={result.outcome === "victory" ? "victory-title" : "defeat-title"}>
        {result.outcome === "victory" ? "MISSION COMPLETE" : "MISSION FAILED"}
      </h1>
      <p>Wave {result.wave} · {Math.floor(result.timeElapsedMs / 60000)}m {Math.floor((result.timeElapsedMs % 60000) / 1000)}s</p>

      {/* Podium */}
      {podiumPlayers.length > 0 && (
        <div className="podium">
          {podiumPlayers.map((p, i) => {
            const char = getCharacter(p.characterId);
            return (
              <div key={p.id} className={`podium-slot rank-${i + 1}`}>
                <div className="podium-rank">#{i + 1}</div>
                <div className="podium-avatar" style={{ background: char?.color ?? "#38bdf8" }} />
                <div className="podium-name">{p.displayName}</div>
                <div className="podium-stat">{p.damageDealt.toLocaleString()} dmg</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full breakdown */}
      <div className="breakdown">
        <h3>Player Breakdown</h3>
        <table>
          <thead>
            <tr>
              <th>Player</th><th>Damage</th><th>Kills</th><th>XP</th><th>Bombs</th><th>Revives</th><th>Weapons</th><th>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {result.players.map(p => (
              <tr key={p.id}>
                <td>{p.displayName}</td>
                <td>{p.damageDealt.toLocaleString()}</td>
                <td>{p.killCount}</td>
                <td>{p.xpCollected}</td>
                <td>{p.bombsDefused}</td>
                <td>{p.revives}</td>
                <td>{p.weaponIds.map(id => getWeapon(id)?.name ?? id).join(", ")}</td>
                <td>{p.tokenIds.map(id => TOKENS.find(t => t.id === id)?.icon ?? id).join(" ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main App
   ═══════════════════════════════════════════════════════════════════════ */

export function App(): JSX.Element {
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState("");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [levelUp, setLevelUp] = useState<LevelUpOffer | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [bossWarning, setBossWarning] = useState<string | null>(null);
  const [ascensionMsg, setAscensionMsg] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting...");
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const lastGameStateRef = useRef<GameState | null>(null);

  const send = useCallback((env: ClientEnvelope) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(env));
    }
  }, []);

  // WebSocket
  useEffect(() => {
    const name = localStorage.getItem("defuse-name") || `Player-${Math.floor(Math.random() * 9999)}`;
    localStorage.setItem("defuse-name", name);

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setStatus("Connected");
      send({ type: "join", displayName: name } as ClientEnvelope);
    };
    ws.onclose = () => { setConnected(false); setStatus("Disconnected"); };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as ServerEnvelope;
      switch (msg.type) {
        case "joined":
          setMyId(msg.playerId);
          break;
        case "lobby":
          setLobby(msg.lobby);
          setGameState(null);
          setResult(null);
          setLevelUp(null);
          break;
        case "state":
          setGameState(msg.state);
          lastGameStateRef.current = msg.state;
          setLobby(null);
          setResult(null);
          if (msg.state.phase === "vote_continue") setLevelUp(null);
          break;
        case "level_up":
          setLevelUp(msg.offer);
          break;
        case "results":
          setResult(msg.result);
          setGameState(null);
          setLevelUp(null);
          break;
        case "boss_warning":
          setBossWarning(msg.bossName);
          setTimeout(() => setBossWarning(null), 3000);
          break;
        case "ascension":
          setAscensionMsg(`${msg.weaponName} → ${msg.ascendedName}!`);
          setTimeout(() => setAscensionMsg(null), 4000);
          break;
        case "error":
          setStatus(msg.message);
          break;
      }
    };

    return () => ws.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Input
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => keysDown.add(e.key.toLowerCase());
    const handleUp = (e: KeyboardEvent) => keysDown.delete(e.key.toLowerCase());
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);

    const inputLoop = setInterval(() => {
      if (!gameState || gameState.phase !== "active") return;
      const v = inputVector();
      send({ type: "input", dx: v.dx, dy: v.dy });
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
      clearInterval(inputLoop);
    };
  }, [gameState, send]);

  // Canvas render loop
  useEffect(() => {
    function frame() {
      const canvas = canvasRef.current;
      const state = lastGameStateRef.current;
      if (canvas && state) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = canvas.clientWidth;
          canvas.height = canvas.clientHeight;
          renderGame(ctx, state, myId, canvas.width, canvas.height);
        }
      }
      animRef.current = requestAnimationFrame(frame);
    }
    animRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animRef.current);
  }, [myId]);

  // Results screen
  if (result) {
    return <ResultsScreen result={result} send={send} />;
  }

  // Lobby
  if (lobby) {
    return <LobbyScreen lobby={lobby} myId={myId} send={send} />;
  }

  // Game
  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      {gameState && <HUD state={gameState} myId={myId} />}
      {levelUp && <LevelUpModal offer={levelUp} send={send} onClose={() => setLevelUp(null)} />}
      {gameState?.phase === "vote_continue" && <VoteContinueModal state={gameState} send={send} />}

      {bossWarning && (
        <div className="boss-warning">
          <h2>⚠ {bossWarning} INCOMING ⚠</h2>
        </div>
      )}

      {ascensionMsg && (
        <div className="ascension-banner">
          <h2>★ ASCENSION ★</h2>
          <p>{ascensionMsg}</p>
        </div>
      )}

      {!connected && <div className="disconnect-overlay"><p>{status}</p></div>}
    </div>
  );
}
