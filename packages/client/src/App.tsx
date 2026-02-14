/* ═══════════════════════════════════════════════════════════════════════
   DEFUSE.EXE — Multiplayer Roguelite Survivor — Client
   ═══════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientEnvelope, ServerEnvelope, GameState, LobbyState,
  LevelUpOffer, GameResult, UpgradeDef, CosmeticChoice,
  PlayerState, EnemyState, ProjectileState, BombZoneState,
  XpGemState, DamageNumber, BreakableState, PickupState,
  PlayerSettings,
} from "@defuse/shared";
import {
  CHARACTERS, WEAPONS, TOKENS, ASCENDED_WEAPONS, ASCENSION_RECIPES,
  ARENA_W, ARENA_H, PLAYER_RADIUS,
  getWeapon, getCharacter, getEnemy,
  HATS, TRAILS, COLOR_OVERRIDES,
  MAX_BLACKLISTED_WEAPONS, MAX_BLACKLISTED_TOKENS,
  WEAPON_ASCEND_LEVEL, WEAPON_TRANSCEND_LEVEL,
} from "@defuse/shared";
import { initDiscord, type DiscordSession } from "./discord.js";

/* ── Networking ─────────────────────────────────────────────────────── */

function normalizeUrl(_raw: string | undefined): string {
  // Always derive from current page — client and server share the same origin
  return window.location.origin;
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
  cw: number, ch: number, settings: PlayerSettings
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
    drawProjectile(ctx, proj, cam, cw, ch, myId, settings);
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
  const visual = charDef?.visual || "male";
  const s = cam.scale;

  // Stick figure proportions
  const headR = 5 * s;
  const bodyLen = 14 * s;
  const armLen = 10 * s;
  const legLen = 12 * s;

  const isMoving = p.moving;
  // Improved walk cycle — use sine + cosine for natural opposing motion
  const walkSpeed = 0.18;
  const walkCycle = isMoving ? tick * walkSpeed : 0;
  const idleBob = isMoving ? 0 : Math.sin(tick * 0.06) * 1.5;
  // Bob up/down while walking
  const walkBob = isMoving ? Math.abs(Math.sin(walkCycle * 2)) * 1.5 : 0;

  const headCY = sy - bodyLen - headR + idleBob - walkBob;
  const shoulderY = sy - bodyLen * 0.7 + idleBob - walkBob;
  const hipY = sy + idleBob;

  // ── Trail ──
  if (p.cosmetic.trail && p.cosmetic.trail !== "none" && isMoving) {
    drawTrail(ctx, sx, hipY + legLen * 0.5, p.cosmetic.trail, tick, s);
  }

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

  if (visual === "ghost_player") {
    // Ghost: wavy floaty shape, no legs
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(sx, headCY, headR * 1.2, 0, Math.PI * 2);
    ctx.stroke();
    // big dot eyes
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(sx - 2.5 * s, headCY - 1, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 2.5 * s, headCY - 1, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    // wavy body tapers down
    ctx.beginPath();
    ctx.moveTo(sx - headR * 1.1, headCY + headR * 0.6);
    for (let i = 0; i <= 6; i++) {
      const t2 = i / 6;
      const yy = headCY + headR + t2 * (bodyLen + legLen);
      const wave = Math.sin(tick * 0.15 + t2 * 4) * 3 * s;
      const taper = 1 - t2 * 0.6;
      ctx.lineTo(sx + wave + (i % 2 === 0 ? -1 : 1) * headR * taper, yy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (visual === "cat") {
    // Cat: round head with ears and tail
    ctx.beginPath(); ctx.arc(sx, headCY, headR, 0, Math.PI * 2); ctx.stroke();
    // ears
    ctx.beginPath(); ctx.moveTo(sx - headR * 0.7, headCY - headR * 0.4); ctx.lineTo(sx - headR * 0.3, headCY - headR * 1.4); ctx.lineTo(sx - headR * 0.0, headCY - headR * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + headR * 0.7, headCY - headR * 0.4); ctx.lineTo(sx + headR * 0.3, headCY - headR * 1.4); ctx.lineTo(sx + headR * 0.0, headCY - headR * 0.5); ctx.stroke();
    // dot eyes
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(sx - 2 * s, headCY - 0.5, 1.2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 2 * s, headCY - 0.5, 1.2 * s, 0, Math.PI * 2); ctx.fill();
    // body + 4 legs
    ctx.beginPath(); ctx.moveTo(sx, headCY + headR); ctx.lineTo(sx, hipY); ctx.stroke();
    const lSwing = isMoving ? Math.sin(walkCycle) * 0.6 : 0.3;
    // front legs
    ctx.beginPath(); ctx.moveTo(sx, shoulderY); ctx.lineTo(sx - legLen * 0.6 * Math.sin(lSwing + 0.3), shoulderY + legLen * 0.7 * Math.cos(lSwing + 0.3)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, shoulderY); ctx.lineTo(sx + legLen * 0.6 * Math.sin(-lSwing + 0.3), shoulderY + legLen * 0.7 * Math.cos(-lSwing + 0.3)); ctx.stroke();
    // back legs
    ctx.beginPath(); ctx.moveTo(sx, hipY); ctx.lineTo(sx - legLen * 0.7 * Math.sin(-lSwing + 0.3), hipY + legLen * 0.8 * Math.cos(-lSwing + 0.3)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, hipY); ctx.lineTo(sx + legLen * 0.7 * Math.sin(lSwing + 0.3), hipY + legLen * 0.8 * Math.cos(lSwing + 0.3)); ctx.stroke();
    // tail
    const tailWave = Math.sin(tick * 0.12) * 0.4;
    ctx.beginPath(); ctx.moveTo(sx, hipY); ctx.quadraticCurveTo(sx - 10 * s, hipY - 6 * s + tailWave * 10, sx - 14 * s, hipY - 10 * s); ctx.stroke();
  } else {
    // Standard humanoid (male/female/robot)
    // Head
    ctx.beginPath(); ctx.arc(sx, headCY, headR, 0, Math.PI * 2); ctx.stroke();

    // Hair/details based on visual
    if (visual === "female") {
      // longer hair lines
      ctx.beginPath(); ctx.moveTo(sx - headR * 0.9, headCY - headR * 0.2); ctx.lineTo(sx - headR * 1.1, headCY + headR * 1.8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + headR * 0.9, headCY - headR * 0.2); ctx.lineTo(sx + headR * 1.1, headCY + headR * 1.8); ctx.stroke();
    } else if (visual === "robot") {
      // antenna on top
      ctx.beginPath(); ctx.moveTo(sx, headCY - headR); ctx.lineTo(sx, headCY - headR - 5 * s); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(sx, headCY - headR - 5 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();
      // square jaw
      ctx.strokeRect(sx - headR * 0.5, headCY + headR * 0.3, headR, headR * 0.5);
    }

    // Eyes
    ctx.fillStyle = color;
    const eyeOff = p.dx > 0 ? 1.5 : p.dx < 0 ? -1.5 : 0;
    ctx.beginPath(); ctx.arc(sx - 2 * s + eyeOff, headCY - 1, 1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 2 * s + eyeOff, headCY - 1, 1 * s, 0, Math.PI * 2); ctx.fill();

    // Body
    ctx.beginPath(); ctx.moveTo(sx, headCY + headR); ctx.lineTo(sx, hipY); ctx.stroke();

    // Arms — natural opposing swing with bent elbows
    const armA = isMoving ? Math.sin(walkCycle) * 0.9 : Math.sin(tick * 0.04) * 0.15;
    const elbowBend = 0.4;
    // Left arm
    const laElbowX = sx - armLen * 0.5 * Math.cos(armA);
    const laElbowY = shoulderY + armLen * 0.5;
    ctx.beginPath(); ctx.moveTo(sx, shoulderY); ctx.lineTo(laElbowX, laElbowY); ctx.lineTo(laElbowX - armLen * 0.3 * Math.sin(armA + elbowBend), laElbowY + armLen * 0.4); ctx.stroke();
    // Right arm
    const raElbowX = sx + armLen * 0.5 * Math.cos(-armA);
    const raElbowY = shoulderY + armLen * 0.5;
    ctx.beginPath(); ctx.moveTo(sx, shoulderY); ctx.lineTo(raElbowX, raElbowY); ctx.lineTo(raElbowX + armLen * 0.3 * Math.sin(-armA + elbowBend), raElbowY + armLen * 0.4); ctx.stroke();

    // Legs — proper walk with knees
    const legA = isMoving ? Math.sin(walkCycle) * 1.0 : 0;
    const kneeRatio = 0.55;
    // Left leg
    const llKneeX = sx - legLen * 0.2 * Math.sin(legA);
    const llKneeY = hipY + legLen * kneeRatio;
    const llFootX = sx - legLen * 0.4 * Math.sin(legA);
    const llFootY = hipY + legLen;
    ctx.beginPath(); ctx.moveTo(sx, hipY); ctx.lineTo(llKneeX, llKneeY); ctx.lineTo(llFootX, llFootY); ctx.stroke();
    // Right leg
    const rlKneeX = sx + legLen * 0.2 * Math.sin(legA);
    const rlKneeY = hipY + legLen * kneeRatio;
    const rlFootX = sx + legLen * 0.4 * Math.sin(legA);
    const rlFootY = hipY + legLen;
    ctx.beginPath(); ctx.moveTo(sx, hipY); ctx.lineTo(rlKneeX, rlKneeY); ctx.lineTo(rlFootX, rlFootY); ctx.stroke();

    if (visual === "female") {
      // small skirt triangle
      ctx.beginPath(); ctx.moveTo(sx - 5 * s, hipY - 2 * s); ctx.lineTo(sx + 5 * s, hipY - 2 * s); ctx.lineTo(sx + 6 * s, hipY + 3 * s); ctx.lineTo(sx - 6 * s, hipY + 3 * s); ctx.closePath(); ctx.stroke();
    }
  }

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
  const footY = visual === "cat" ? hipY + legLen * 0.8 + 4 : (visual === "ghost_player" ? headCY + bodyLen + legLen + 4 : hipY + legLen + 12);
  ctx.fillText(p.displayName, sx, footY + idleBob);
}

/* ── Trail particles ── */
function drawTrail(ctx: CanvasRenderingContext2D, sx: number, sy: number, trail: string, tick: number, s: number): void {
  const colors: Record<string, string[]> = {
    spark: ["#fbbf24", "#fde68a", "#fff"],
    flame: ["#ef4444", "#f97316", "#fbbf24"],
    ice: ["#67e8f9", "#a5f3fc", "#fff"],
    shadow: ["#6b21a8", "#7c3aed", "#1e1b4b"],
    rainbow: ["#ef4444", "#fbbf24", "#4ade80", "#38bdf8", "#a855f7", "#ec4899"],
  };
  const cols = colors[trail] ?? colors.spark;
  for (let i = 0; i < 5; i++) {
    const age = (tick * 0.3 + i * 1.5) % 8;
    if (age > 5) continue;
    ctx.globalAlpha = 0.6 - age * 0.1;
    ctx.fillStyle = cols[i % cols.length];
    const ox = Math.sin(tick * 0.2 + i * 2) * 4 * s;
    const oy = age * 3 * s;
    const r = (3 - age * 0.4) * s;
    ctx.beginPath(); ctx.arc(sx + ox, sy + oy, Math.max(0.5, r), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
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
  const visual = def.visual || "male";

  // elite/boss glow
  if (e.rank !== "normal") {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = e.rank === "boss" ? "#dc2626" : e.rank === "miniboss" ? "#f97316" : "#fbbf24";
    ctx.beginPath(); ctx.arc(sx, sy - 6 * s, def.size * sc + 8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // armor shimmer
  if (e.armor > 0) {
    ctx.globalAlpha = 0.15 + Math.sin(tick * 0.1) * 0.05;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.arc(sx, sy - 4 * s, 12 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const walkCyc = tick * 0.18 + e.x * 0.01;
  const walkA = Math.sin(walkCyc) * 0.8;
  const headR = 4 * s;
  const bodyLen = 10 * s;
  const armLen = 7 * s;
  const legLen = 8 * s;
  const walkBob = Math.abs(Math.sin(walkCyc * 2)) * 1.2;

  ctx.strokeStyle = def.color;
  ctx.lineWidth = Math.max(1.5, 2 * s);
  ctx.lineCap = "round";

  if (visual === "spider") {
    // Spider: oval body + 8 legs
    const bodyRx = 5 * s, bodyRy = 3 * s;
    ctx.beginPath(); ctx.ellipse(sx, sy - 2 * s, bodyRx, bodyRy, 0, 0, Math.PI * 2); ctx.stroke();
    // smaller head
    ctx.beginPath(); ctx.arc(sx, sy - 2 * s - bodyRy - 2 * s, 2.5 * s, 0, Math.PI * 2); ctx.stroke();
    // 8 legs (4 per side)
    for (let li = 0; li < 4; li++) {
      const ang = (li / 4) * Math.PI * 0.6 + 0.3;
      const anim = Math.sin(walkCyc + li * 1.5) * 0.3;
      const lx = Math.cos(ang + anim) * legLen;
      const ly = Math.sin(ang + anim) * legLen * 0.5;
      ctx.beginPath(); ctx.moveTo(sx - bodyRx * 0.5, sy - 2 * s); ctx.lineTo(sx - bodyRx - lx, sy - 2 * s + ly); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + bodyRx * 0.5, sy - 2 * s); ctx.lineTo(sx + bodyRx + lx, sy - 2 * s + ly); ctx.stroke();
    }
    // fangs
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(sx - 1.5 * s, sy - bodyRy - 1 * s, 1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 1.5 * s, sy - bodyRy - 1 * s, 1 * s, 0, Math.PI * 2); ctx.fill();
  } else if (visual === "bird") {
    // Bird: wings + beak, flap animation
    const flapAngle = Math.sin(tick * 0.3) * 0.4;
    // body oval
    ctx.beginPath(); ctx.ellipse(sx, sy - 3 * s, 4 * s, 3 * s, 0, 0, Math.PI * 2); ctx.stroke();
    // head
    ctx.beginPath(); ctx.arc(sx + 4 * s, sy - 6 * s, 2.5 * s, 0, Math.PI * 2); ctx.stroke();
    // beak
    ctx.beginPath(); ctx.moveTo(sx + 6 * s, sy - 6 * s); ctx.lineTo(sx + 9 * s, sy - 5.5 * s); ctx.lineTo(sx + 6 * s, sy - 5 * s); ctx.stroke();
    // eye
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(sx + 5 * s, sy - 6.5 * s, 0.8 * s, 0, Math.PI * 2); ctx.fill();
    // wings
    ctx.beginPath(); ctx.moveTo(sx - 1 * s, sy - 5 * s); ctx.lineTo(sx - 8 * s, sy - 9 * s - flapAngle * 10); ctx.lineTo(sx - 3 * s, sy - 4 * s); ctx.stroke();
    // tail feathers
    ctx.beginPath(); ctx.moveTo(sx - 3 * s, sy - 2 * s); ctx.lineTo(sx - 7 * s, sy - 1 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 3 * s, sy - 3 * s); ctx.lineTo(sx - 7 * s, sy - 3 * s); ctx.stroke();
  } else if (visual === "slime") {
    // Slime: blobby shape that squishes
    const squish = 1 + Math.sin(tick * 0.15) * 0.15;
    const blobR = 8 * s;
    ctx.beginPath();
    ctx.ellipse(sx, sy - blobR * squish * 0.5, blobR / squish, blobR * squish, 0, 0, Math.PI * 2);
    ctx.fillStyle = def.color + "40";
    ctx.fill();
    ctx.stroke();
    // eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(sx - 2.5 * s, sy - blobR * squish * 0.6, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 2.5 * s, sy - blobR * squish * 0.6, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(sx - 2.5 * s, sy - blobR * squish * 0.6, 0.8 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 2.5 * s, sy - blobR * squish * 0.6, 0.8 * s, 0, Math.PI * 2); ctx.fill();
  } else if (visual === "snake") {
    // Snake: wavy line body
    ctx.lineWidth = Math.max(2, 3 * s);
    ctx.beginPath();
    ctx.moveTo(sx - 12 * s, sy);
    for (let si = 0; si < 8; si++) {
      const t2 = si / 8;
      const snakeX = sx - 12 * s + t2 * 24 * s;
      const snakeY = sy + Math.sin(tick * 0.2 + t2 * 6) * 3 * s;
      ctx.lineTo(snakeX, snakeY);
    }
    ctx.stroke();
    // head (larger circle at front)
    ctx.lineWidth = Math.max(1.5, 2 * s);
    ctx.beginPath(); ctx.arc(sx + 12 * s, sy, 3 * s, 0, Math.PI * 2); ctx.stroke();
    // tongue
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1;
    const tongueFlick = Math.sin(tick * 0.4) * 2 * s;
    ctx.beginPath(); ctx.moveTo(sx + 15 * s, sy); ctx.lineTo(sx + 18 * s, sy + tongueFlick); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 18 * s, sy + tongueFlick); ctx.lineTo(sx + 19 * s, sy + tongueFlick - 1.5 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 18 * s, sy + tongueFlick); ctx.lineTo(sx + 19 * s, sy + tongueFlick + 1.5 * s); ctx.stroke();
    ctx.strokeStyle = def.color;
  } else if (visual === "ghost") {
    // Ghost: floaty translucent body
    ctx.globalAlpha = 0.6;
    const ghostBob = Math.sin(tick * 0.1) * 3 * s;
    ctx.beginPath(); ctx.arc(sx, sy - 6 * s + ghostBob, headR * 1.3, 0, Math.PI * 2); ctx.stroke();
    // body drapes down
    ctx.beginPath();
    ctx.moveTo(sx - headR * 1.3, sy - 6 * s + ghostBob + headR * 0.5);
    ctx.lineTo(sx - headR * 1.5, sy + 4 * s + ghostBob);
    // wavy bottom
    for (let wi = 0; wi < 5; wi++) {
      const t2 = wi / 4;
      ctx.lineTo(sx - headR * 1.5 + t2 * headR * 3, sy + 4 * s + ghostBob + (wi % 2 === 0 ? 3 * s : 0));
    }
    ctx.lineTo(sx + headR * 1.3, sy - 6 * s + ghostBob + headR * 0.5);
    ctx.stroke();
    // eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(sx - 2 * s, sy - 7 * s + ghostBob, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 2 * s, sy - 7 * s + ghostBob, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  } else if (visual === "demon") {
    // Demon: horns + thick body + claws
    const headCY = sy - bodyLen - headR - walkBob;
    const shoulderY2 = sy - bodyLen * 0.65 - walkBob;
    const hipY2 = sy;
    ctx.lineWidth = Math.max(2, 2.5 * s);
    ctx.beginPath(); ctx.arc(sx, headCY, headR, 0, Math.PI * 2); ctx.stroke();
    // horns
    ctx.beginPath(); ctx.moveTo(sx - headR * 0.6, headCY - headR * 0.5); ctx.lineTo(sx - headR, headCY - headR * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + headR * 0.6, headCY - headR * 0.5); ctx.lineTo(sx + headR, headCY - headR * 2); ctx.stroke();
    // angry eyes
    ctx.fillStyle = "#ff0000";
    ctx.beginPath(); ctx.arc(sx - 1.5 * s, headCY - 0.5 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 1.5 * s, headCY - 0.5 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
    // body
    ctx.beginPath(); ctx.moveTo(sx, headCY + headR); ctx.lineTo(sx, hipY2); ctx.stroke();
    // beefy arms with claws
    const aSwing = Math.sin(walkCyc) * 0.5;
    ctx.beginPath(); ctx.moveTo(sx, shoulderY2); ctx.lineTo(sx - armLen * Math.cos(aSwing), shoulderY2 + armLen * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, shoulderY2); ctx.lineTo(sx + armLen * Math.cos(-aSwing), shoulderY2 + armLen * 0.8); ctx.stroke();
    // legs
    ctx.beginPath(); ctx.moveTo(sx, hipY2); ctx.lineTo(sx - legLen * 0.4 * Math.sin(walkA), hipY2 + legLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, hipY2); ctx.lineTo(sx + legLen * 0.4 * Math.sin(walkA), hipY2 + legLen); ctx.stroke();
    // tail
    ctx.beginPath(); ctx.moveTo(sx, hipY2); ctx.quadraticCurveTo(sx + 8 * s, hipY2 + 2 * s, sx + 12 * s, hipY2 - 4 * s); ctx.stroke();
    // arrow tip on tail
    ctx.beginPath(); ctx.moveTo(sx + 12 * s, hipY2 - 4 * s); ctx.lineTo(sx + 11 * s, hipY2 - 7 * s); ctx.lineTo(sx + 14 * s, hipY2 - 5 * s); ctx.closePath(); ctx.fill();
  } else if (visual === "robot") {
    // Robot: boxy head + body
    const bx = 5 * s, by = 7 * s;
    ctx.strokeRect(sx - bx, sy - bodyLen - bx * 2, bx * 2, bx * 2); // head
    ctx.strokeRect(sx - bx * 0.8, sy - bodyLen, bx * 1.6, by); // body
    // screen eyes
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(sx - 3 * s, sy - bodyLen - bx * 1.3, 2 * s, 1.5 * s);
    ctx.fillRect(sx + 1 * s, sy - bodyLen - bx * 1.3, 2 * s, 1.5 * s);
    // antenna
    ctx.beginPath(); ctx.moveTo(sx, sy - bodyLen - bx * 2); ctx.lineTo(sx, sy - bodyLen - bx * 2 - 4 * s); ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath(); ctx.arc(sx, sy - bodyLen - bx * 2 - 4 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    // arms
    const aSwing = Math.sin(walkCyc) * 0.4;
    ctx.beginPath(); ctx.moveTo(sx - bx * 0.8, sy - bodyLen + 2 * s); ctx.lineTo(sx - bx * 0.8 - armLen * Math.cos(aSwing), sy - bodyLen + armLen + 2 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + bx * 0.8, sy - bodyLen + 2 * s); ctx.lineTo(sx + bx * 0.8 + armLen * Math.cos(-aSwing), sy - bodyLen + armLen + 2 * s); ctx.stroke();
    // legs
    ctx.beginPath(); ctx.moveTo(sx - 2 * s, sy - bodyLen + by); ctx.lineTo(sx - 3 * s * Math.sin(walkA), sy - bodyLen + by + legLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 2 * s, sy - bodyLen + by); ctx.lineTo(sx + 3 * s * Math.sin(walkA), sy - bodyLen + by + legLen); ctx.stroke();
  } else {
    // Standard humanoid stick figure (male / female)
    const headCY = sy - bodyLen - headR - walkBob;
    const shoulderY2 = sy - bodyLen * 0.65 - walkBob;
    const hipY2 = sy;

    ctx.beginPath(); ctx.arc(sx, headCY, headR, 0, Math.PI * 2); ctx.stroke();

    if (visual === "female") {
      // hair lines
      ctx.beginPath(); ctx.moveTo(sx - headR * 0.8, headCY - headR * 0.2); ctx.lineTo(sx - headR, headCY + headR * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + headR * 0.8, headCY - headR * 0.2); ctx.lineTo(sx + headR, headCY + headR * 1.5); ctx.stroke();
    }

    // X eyes
    const ex = 1.5 * s;
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.beginPath(); ctx.moveTo(sx - 2 * s - ex * 0.4, headCY - ex * 0.4); ctx.lineTo(sx - 2 * s + ex * 0.4, headCY + ex * 0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 2 * s + ex * 0.4, headCY - ex * 0.4); ctx.lineTo(sx - 2 * s - ex * 0.4, headCY + ex * 0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 2 * s - ex * 0.4, headCY - ex * 0.4); ctx.lineTo(sx + 2 * s + ex * 0.4, headCY + ex * 0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 2 * s + ex * 0.4, headCY - ex * 0.4); ctx.lineTo(sx + 2 * s - ex * 0.4, headCY + ex * 0.4); ctx.stroke();
    ctx.lineWidth = Math.max(1.5, 2 * s);

    // body
    ctx.beginPath(); ctx.moveTo(sx, headCY + headR); ctx.lineTo(sx, hipY2); ctx.stroke();

    if (visual === "female") {
      // skirt
      ctx.beginPath(); ctx.moveTo(sx - 4 * s, hipY2 - 2 * s); ctx.lineTo(sx + 4 * s, hipY2 - 2 * s); ctx.lineTo(sx + 5 * s, hipY2 + 2 * s); ctx.lineTo(sx - 5 * s, hipY2 + 2 * s); ctx.closePath(); ctx.stroke();
    }

    // Arms with natural swing and bent elbows
    const aSwing = Math.sin(walkCyc) * 0.7;
    const elbX = armLen * 0.5;
    ctx.beginPath(); ctx.moveTo(sx, shoulderY2); ctx.lineTo(sx - elbX * Math.cos(aSwing), shoulderY2 + elbX);
    ctx.lineTo(sx - elbX * 0.6 * Math.sin(aSwing + 0.3), shoulderY2 + armLen * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, shoulderY2); ctx.lineTo(sx + elbX * Math.cos(-aSwing), shoulderY2 + elbX);
    ctx.lineTo(sx + elbX * 0.6 * Math.sin(-aSwing + 0.3), shoulderY2 + armLen * 0.9); ctx.stroke();

    // Legs with knees
    const lA = walkA;
    const knR = 0.55;
    const lkX = sx - legLen * 0.2 * Math.sin(lA);
    const lkY = hipY2 + legLen * knR;
    ctx.beginPath(); ctx.moveTo(sx, hipY2); ctx.lineTo(lkX, lkY); ctx.lineTo(sx - legLen * 0.35 * Math.sin(lA), hipY2 + legLen); ctx.stroke();
    const rkX = sx + legLen * 0.2 * Math.sin(lA);
    const rkY = hipY2 + legLen * knR;
    ctx.beginPath(); ctx.moveTo(sx, hipY2); ctx.lineTo(rkX, rkY); ctx.lineTo(sx + legLen * 0.35 * Math.sin(lA), hipY2 + legLen); ctx.stroke();
  }

  // health bar
  if (e.hp < e.maxHp) {
    const baseY = visual === "spider" ? sy - 10 * s : visual === "bird" ? sy - 10 * s : visual === "slime" ? sy - 14 * s : sy - bodyLen - headR * 2 - walkBob;
    const bw = 20 * s;
    const bx = sx - bw / 2;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bx, baseY, bw, 3);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(bx, baseY, bw * Math.max(0, e.hp / e.maxHp), 3);
  }

  // rank name
  if (e.rank === "boss" || e.rank === "miniboss") {
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.floor(10 * s)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(def.name, sx, sy + 16 * s);
  }
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: ProjectileState, cam: Camera, cw: number, ch: number, myId: string, settings: PlayerSettings): void {
  const [sx, sy] = worldToScreen(p.x, p.y, cam, cw, ch);
  const size = Math.max(3, p.area * 0.5 * cam.scale);

  // Apply opacity settings
  const isOwn = p.ownerId === myId;
  const isEnemy = p.ownerId === "__enemy__";
  if (!isEnemy) {
    ctx.globalAlpha = isOwn ? settings.ownProjectileOpacity : settings.otherProjectileOpacity;
  }

  if (p.pattern === "ring") {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha *= 0.6;
    ctx.beginPath(); ctx.arc(sx, sy, p.area * cam.scale, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  if (p.pattern === "ground") {
    ctx.fillStyle = p.color;
    ctx.globalAlpha *= 0.3;
    // Splatter pattern (irregular blobs)
    for (let i = 0; i < 5; i++) {
      const ox = Math.sin(p.x * 3 + i * 1.7) * p.area * 0.4 * cam.scale;
      const oy = Math.cos(p.y * 3 + i * 2.3) * p.area * 0.4 * cam.scale;
      const r = (0.3 + Math.sin(i * 5) * 0.2) * p.area * cam.scale;
      ctx.beginPath(); ctx.arc(sx + ox, sy + oy, Math.max(2, r), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (p.pattern === "beam") {
    // Highlighter beam — thick, semi-transparent with glow
    const endX = sx + p.dx * 300 * cam.scale;
    const endY = sy + p.dy * 300 * cam.scale;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 6;
    ctx.globalAlpha *= 0.3;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.globalAlpha = (isOwn ? settings.ownProjectileOpacity : settings.otherProjectileOpacity) * 0.8;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#fff";
    ctx.globalAlpha = (isOwn ? settings.ownProjectileOpacity : settings.otherProjectileOpacity) * 0.4;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
    return;
  }

  // Enemy projectile — spiky ink blob
  if (isEnemy) {
    ctx.fillStyle = "#ff6666";
    ctx.strokeStyle = "#cc3333";
    ctx.lineWidth = 1;
    const spikes = 6;
    ctx.beginPath();
    for (let i = 0; i <= spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const r = i % 2 === 0 ? size * 1.2 : size * 0.6;
      const px = sx + Math.cos(a) * r;
      const py = sy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  // Player projectile — stick-figure themed shapes based on weapon pattern
  const angle = Math.atan2(p.dy, p.dx);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);

  if (p.pattern === "orbit") {
    // Paper plane shape
    const s = size * 1.3;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.7, -s * 0.6);
    ctx.lineTo(-s * 0.3, 0);
    ctx.lineTo(-s * 0.7, s * 0.6);
    ctx.closePath();
    ctx.fill();
    // fold line
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.3, 0);
    ctx.strokeStyle = "#ffffff40";
    ctx.stroke();
  } else if (p.pattern === "cone") {
    // Crayon streak — tapered colored shape
    const s = size * 1.5;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.5, -s * 0.4);
    ctx.quadraticCurveTo(-s * 0.8, 0, -s * 0.5, s * 0.4);
    ctx.closePath();
    ctx.fill();
    // Crayon tip
    ctx.fillStyle = "#00000030";
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(s * 0.5, -s * 0.15);
    ctx.lineTo(s * 0.5, s * 0.15);
    ctx.closePath();
    ctx.fill();
  } else if (p.pattern === "chain") {
    // Staple shape
    const s = size * 0.8;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s, -s * 0.8);
    ctx.lineTo(-s, 0);
    ctx.lineTo(s, 0);
    ctx.lineTo(s, -s * 0.8);
    ctx.stroke();
  } else if (p.pattern === "homing") {
    // Dart shape — pointed with fins
    const s = size * 1.2;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.4, -s * 0.3);
    ctx.lineTo(-s * 0.2, 0);
    ctx.lineTo(-s * 0.4, s * 0.3);
    ctx.closePath();
    ctx.fill();
    // Fins
    ctx.fillStyle = p.color + "80";
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, 0);
    ctx.lineTo(-s * 0.8, -s * 0.5);
    ctx.lineTo(-s * 0.4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, 0);
    ctx.lineTo(-s * 0.8, s * 0.5);
    ctx.lineTo(-s * 0.4, 0);
    ctx.closePath();
    ctx.fill();
  } else {
    // Default: pencil shape (projectile / area)
    const s = size * 1.4;
    ctx.fillStyle = p.color;
    // Pencil body
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(s * 0.4, -s * 0.25);
    ctx.lineTo(-s * 0.6, -s * 0.25);
    ctx.lineTo(-s * 0.6, s * 0.25);
    ctx.lineTo(s * 0.4, s * 0.25);
    ctx.closePath();
    ctx.fill();
    // Pencil tip
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(s * 0.4, -s * 0.25);
    ctx.lineTo(s * 0.4, s * 0.25);
    ctx.closePath();
    ctx.fill();
    // Eraser end
    ctx.fillStyle = "#f472b6";
    ctx.fillRect(-s * 0.6, -s * 0.25, s * 0.2, s * 0.5);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
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
  ws: { weaponId: string; level: number; ascended: boolean; transcended: boolean };
  player: PlayerState;
  onClose: () => void;
}): JSX.Element {
  const wDef = getWeapon(ws.weaponId);
  if (!wDef) return <div className="inspect-panel"><p>Unknown weapon</p><button className="sm-btn" onClick={onClose}>Close</button></div>;

  const lvlMult = 1 + (ws.level - 1) * 0.08;
  const transcendMult = ws.transcended ? 1.5 : 1;
  const curDamage = Math.floor(wDef.baseDamage * lvlMult * transcendMult * (1 + player.bonusDamage));
  const curArea = Math.floor(wDef.baseArea * (1 + player.bonusArea) * (ws.transcended ? 1.25 : 1));
  const curProj = wDef.baseProjectiles + Math.floor(player.bonusProjectiles) + (ws.transcended ? 2 : 0);
  const curPierce = wDef.basePierce + Math.floor(player.bonusPierce) + (ws.transcended ? 3 : 0);
  const curCd = Math.max(50, Math.floor(wDef.baseCooldownMs * (1 / (1 + player.bonusAttackSpeed)) * (ws.transcended ? 0.8 : 1)));

  const recipe = ASCENSION_RECIPES.find(r => r.weaponId === ws.weaponId || r.ascendedWeaponId === ws.weaponId);
  const matchToken = recipe ? TOKENS.find(t => t.id === recipe.tokenId) : null;
  const hasToken = matchToken ? player.tokens.includes(matchToken.id) : false;

  const nextMilestone = !ws.ascended ? WEAPON_ASCEND_LEVEL : WEAPON_TRANSCEND_LEVEL;
  const milestoneLabel = !ws.ascended ? "Ascension" : "Transcendence";

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
        <small>Lv{ws.level}{ws.transcended ? " ✦" : ws.ascended ? " ★" : ""}</small>
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
        <div className="inspect-stat">
          <span className="inspect-label">Progress</span>
          <span className="inspect-base">{ws.level}/{nextMilestone}</span>
        </div>
      </div>
      {ws.transcended && (
        <div className="inspect-ascension" style={{ borderColor: "#c084fc" }}>
          <strong style={{ color: "#c084fc" }}>✦ TRANSCENDED ✦</strong>
          <p style={{ color: "#d4d4d8" }}>+50% damage, +25% area, +2 projectiles, +3 pierce, -20% cooldown</p>
        </div>
      )}
      {recipe && !ws.ascended && (
        <div className="inspect-ascension">
          <strong>{milestoneLabel}</strong>
          <p>
            Requires: <span className={ws.level >= WEAPON_ASCEND_LEVEL ? "green" : "red"}>Lv{WEAPON_ASCEND_LEVEL} ({ws.level}/{WEAPON_ASCEND_LEVEL})</span>
            {" + "}
            <span className={hasToken ? "green" : "red"}>{matchToken?.icon} {matchToken?.name ?? recipe.tokenId}</span>
          </p>
          {ws.level >= WEAPON_ASCEND_LEVEL && hasToken && <span className="ascension-ready">✦ READY TO ASCEND</span>}
        </div>
      )}
      {ws.ascended && !ws.transcended && (
        <div className="inspect-ascension" style={{ borderColor: "#c084fc" }}>
          <strong style={{ color: "#c084fc" }}>Transcendence</strong>
          <p>
            Reach <span className={ws.level >= WEAPON_TRANSCEND_LEVEL ? "green" : "red"}>Lv{WEAPON_TRANSCEND_LEVEL} ({ws.level}/{WEAPON_TRANSCEND_LEVEL})</span> to transcend
          </p>
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
          <p><span className="w-dot" style={{ background: matchWeapon.color }} /> {matchWeapon.name} at Lv{WEAPON_ASCEND_LEVEL}</p>
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
  const elapsed = state.elapsedMs ?? 0;
  const eMins = Math.floor(elapsed / 60000);
  const eSecs = Math.floor((elapsed % 60000) / 1000);
  const [inspectWeapon, setInspectWeapon] = useState<{ weaponId: string; level: number; ascended: boolean; transcended: boolean } | null>(null);
  const [inspectToken, setInspectToken] = useState<string | null>(null);
  const [inspectPlayer, setInspectPlayer] = useState<string | null>(null);
  const otherPlayers = state.players.filter(p => p.id !== myId);
  const inspectedPlayer = inspectPlayer ? state.players.find(p => p.id === inspectPlayer) : null;

  return (
    <div className="hud-overlay">
      <div className="hud-top">
        <div className="hud-stat">
          <small>Time</small><strong>{eMins}:{eSecs.toString().padStart(2, "0")}</strong>
        </div>
        <div className="hud-stat">
          <small>Level</small><strong>{state.sharedLevel}</strong>
        </div>
        <div className="hud-stat">
          <small>Enemies</small><strong>{state.enemies.length}</strong>
        </div>
        <div className="hud-stat">
          <small>Kills</small><strong>{me?.killCount ?? 0}</strong>
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
                  className={`weapon-slot ${ws.transcended ? "transcended" : ws.ascended ? "ascended" : ""} clickable`}
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
      <p>Survived {Math.floor(result.timeElapsedMs / 60000)}m {Math.floor((result.timeElapsedMs % 60000) / 1000)}s</p>

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

/* ── Settings Modal ─────────────────────────────────────────────────── */

function SettingsModal({ settings, onChange, onClose }: {
  settings: PlayerSettings;
  onChange: (s: PlayerSettings) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal settings-modal">
        <h2>Settings</h2>

        <div className="settings-group">
          <label>Your Projectile Opacity: {Math.round(settings.ownProjectileOpacity * 100)}%</label>
          <input
            type="range" min="10" max="100" step="5"
            value={settings.ownProjectileOpacity * 100}
            onChange={e => onChange({ ...settings, ownProjectileOpacity: Number(e.target.value) / 100 })}
          />
        </div>

        <div className="settings-group">
          <label>Other Players' Projectile Opacity: {Math.round(settings.otherProjectileOpacity * 100)}%</label>
          <input
            type="range" min="0" max="100" step="5"
            value={settings.otherProjectileOpacity * 100}
            onChange={e => onChange({ ...settings, otherProjectileOpacity: Number(e.target.value) / 100 })}
          />
        </div>

        <div className="settings-group">
          <label>Targeting Mode</label>
          <div className="row" style={{ gap: "8px", marginTop: "4px" }}>
            <button
              className={settings.targetingMode === "closest" ? "sm-btn selected" : "sm-btn"}
              onClick={() => onChange({ ...settings, targetingMode: "closest" })}
            >Closest Enemy</button>
            <button
              className={settings.targetingMode === "cursor" ? "sm-btn selected" : "sm-btn"}
              onClick={() => onChange({ ...settings, targetingMode: "cursor" })}
            >Cursor Aim</button>
          </div>
        </div>

        <button className="big-btn" onClick={onClose} style={{ marginTop: "16px" }}>Close</button>
      </div>
    </div>
  );
}

/* ── Pause Menu ─────────────────────────────────────────────────────── */

function PauseMenu({ onResume, onSettings }: { onResume: () => void; onSettings: () => void }): JSX.Element {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onResume(); }}>
      <div className="modal pause-modal">
        <h2>PAUSED</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
          <button className="big-btn accent" onClick={onResume}>Resume</button>
          <button className="big-btn" onClick={onSettings}>Settings</button>
        </div>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState("");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [levelUp, setLevelUp] = useState<LevelUpOffer | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [bossWarning, setBossWarning] = useState<string | null>(null);
  const [ascensionMsg, setAscensionMsg] = useState<string | null>(null);
  const [transcendMsg, setTranscendMsg] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting...");
  const [showPause, setShowPause] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<PlayerSettings>({
    ownProjectileOpacity: 1,
    otherProjectileOpacity: 0.7,
    targetingMode: "closest",
  });
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const lastGameStateRef = useRef<GameState | null>(null);
  const cursorWorldRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const send = useCallback((env: ClientEnvelope) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(env));
    }
  }, []);

  const handleSettingsChange = useCallback((newSettings: PlayerSettings) => {
    setSettings(newSettings);
    send({ type: "update_settings", settings: newSettings });
  }, [send]);

  // WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;

    (async () => {
      setStatus("Initializing...");
      let session: DiscordSession;
      try {
        session = await initDiscord();
      } catch (err) {
        console.error("Discord init failed, using local mode", err);
        setStatus(`Discord init error: ${err instanceof Error ? err.message : err} — falling back`);
        const fallback = localStorage.getItem("defuse-name") || `Player-${Math.floor(Math.random() * 9999)}`;
        localStorage.setItem("defuse-name", fallback);
        session = { displayName: fallback, roomId: "default", isDiscord: false };
      }
      if (cancelled) return;

      console.log("[WS] Connecting to", WS_URL);
      setStatus(`Connecting to ${WS_URL} ...`);
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setStatus("Connected");
        send({ type: "join", displayName: session.displayName, roomId: session.roomId } as ClientEnvelope);
      };
      ws.onerror = () => { setStatus(`WS error — target: ${WS_URL} | origin: ${window.location.origin}`); };
      ws.onclose = (ev) => { setConnected(false); setStatus(`Disconnected (code ${ev.code}) — target: ${WS_URL}`); };
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
          case "transcendence":
            setTranscendMsg(`${msg.weaponName} TRANSCENDED!`);
            setTimeout(() => setTranscendMsg(null), 4000);
            break;
          case "error":
            setStatus(msg.message);
            break;
        }
      };
    })();

    return () => { cancelled = true; if (ws) ws.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Input + cursor tracking + ESC key
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showSettings) { setShowSettings(false); return; }
        setShowPause(prev => !prev);
        return;
      }
      keysDown.add(e.key.toLowerCase());
    };
    const handleUp = (e: KeyboardEvent) => keysDown.delete(e.key.toLowerCase());

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const state = lastGameStateRef.current;
      if (!canvas || !state) return;
      const me = state.players.find(p => p.id === myId);
      if (!me) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my2 = e.clientY - rect.top;
      // Convert screen coords back to world coords
      cursorWorldRef.current = {
        x: me.x + (mx - canvas.clientWidth / 2),
        y: me.y + (my2 - canvas.clientHeight / 2),
      };
    };

    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    window.addEventListener("mousemove", handleMouseMove);

    const inputLoop = setInterval(() => {
      if (!gameState || gameState.phase !== "active") return;
      const v = inputVector();
      const cursor = cursorWorldRef.current;
      send({ type: "input", dx: v.dx, dy: v.dy, cursorX: cursor.x, cursorY: cursor.y });
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
      window.removeEventListener("mousemove", handleMouseMove);
      clearInterval(inputLoop);
    };
  }, [gameState, send, myId, showSettings]);

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
          renderGame(ctx, state, myId, canvas.width, canvas.height, settingsRef.current);
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

      {showPause && !showSettings && (
        <PauseMenu
          onResume={() => setShowPause(false)}
          onSettings={() => { setShowPause(false); setShowSettings(true); }}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}

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

      {transcendMsg && (
        <div className="ascension-banner" style={{ background: "rgba(139,92,246,0.15)", borderColor: "#c084fc" }}>
          <h2 style={{ color: "#c084fc" }}>✦ TRANSCENDENCE ✦</h2>
          <p>{transcendMsg}</p>
        </div>
      )}

      {!connected && <div className="disconnect-overlay"><p>{status}</p></div>}
    </div>
  );
}
