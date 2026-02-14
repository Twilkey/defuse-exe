/* ═══════════════════════════════════════════════════════════════════════
   DEFUSE.EXE — Multiplayer Roguelite Survivor — Client
   ═══════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientEnvelope, ServerEnvelope, GameState, LobbyState,
  LevelUpOffer, GameResult, UpgradeDef, CosmeticChoice,
  PlayerState, EnemyState, ProjectileState, BombZoneState,
  XpGemState, DamageNumber,
} from "@defuse/shared";
import {
  CHARACTERS, WEAPONS, TOKENS, ASCENDED_WEAPONS,
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
    drawEnemy(ctx, enemy, cam, cw, ch);
  }

  // players
  for (const player of state.players) {
    drawPlayer(ctx, player, cam, cw, ch, player.id === myId);
  }

  // damage numbers
  for (const dn of state.damageNumbers) {
    drawDamageNumber(ctx, dn, cam, cw, ch);
  }

  // minimap
  drawMinimap(ctx, state, myId, cw, ch);
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerState, cam: Camera, cw: number, ch: number, isMe: boolean): void {
  if (!p.alive) return;
  const [sx, sy] = worldToScreen(p.x, p.y, cam, cw, ch);
  const charDef = getCharacter(p.characterId);
  const color = p.cosmetic.colorOverride || charDef?.color || "#38bdf8";
  const r = PLAYER_RADIUS * cam.scale;

  // invuln glow
  if (p.invulnMs > 0) {
    ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.2;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // body
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();

  // outline for local player
  if (isMe) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // direction indicator
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + p.dx * r * 1.4, sy + p.dy * r * 1.4);
  ctx.stroke();

  // hat
  if (p.cosmetic.hat && p.cosmetic.hat !== "none") {
    drawHat(ctx, sx, sy, r, p.cosmetic.hat);
  }

  // health bar
  if (p.hp < p.maxHp) {
    const bw = r * 2.5;
    const bx = sx - bw / 2;
    const bTop = sy - r - 8;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bx, bTop, bw, 4);
    ctx.fillStyle = p.hp / p.maxHp > 0.3 ? "#4ade80" : "#ef4444";
    ctx.fillRect(bx, bTop, bw * (p.hp / p.maxHp), 4);
  }

  // name
  ctx.fillStyle = "#fff";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(p.displayName, sx, sy + r + 14);
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

function drawEnemy(ctx: CanvasRenderingContext2D, e: EnemyState, cam: Camera, cw: number, ch: number): void {
  const [sx, sy] = worldToScreen(e.x, e.y, cam, cw, ch);
  const def = getEnemy(e.defId);
  if (!def) return;
  const size = def.size * cam.scale * (e.rank === "boss" ? 2.5 : e.rank === "miniboss" ? 1.8 : e.rank === "elite" ? 1.3 : 1);

  // elite/boss glow
  if (e.rank !== "normal") {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = e.rank === "boss" ? "#dc2626" : e.rank === "miniboss" ? "#f97316" : "#fbbf24";
    ctx.beginPath(); ctx.arc(sx, sy, size + 6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = def.color;
  switch (def.shape) {
    case "circle":
      ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill();
      break;
    case "triangle":
      ctx.beginPath();
      ctx.moveTo(sx, sy - size);
      ctx.lineTo(sx - size, sy + size * 0.7);
      ctx.lineTo(sx + size, sy + size * 0.7);
      ctx.closePath(); ctx.fill();
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(sx, sy - size);
      ctx.lineTo(sx + size, sy);
      ctx.lineTo(sx, sy + size);
      ctx.lineTo(sx - size, sy);
      ctx.closePath(); ctx.fill();
      break;
    case "square":
      ctx.fillRect(sx - size, sy - size, size * 2, size * 2);
      break;
    case "hexagon": {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const hx = sx + size * Math.cos(angle);
        const hy = sy + size * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
      }
      ctx.closePath(); ctx.fill();
      break;
    }
  }

  // health bar
  if (e.hp < e.maxHp) {
    const bw = size * 2.5;
    const bx = sx - bw / 2;
    const bTop = sy - size - 6;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bx, bTop, bw, 3);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(bx, bTop, bw * Math.max(0, e.hp / e.maxHp), 3);
  }

  // rank indicator
  if (e.rank === "boss" || e.rank === "miniboss") {
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.floor(size * 0.6)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(def.name, sx, sy + size + 14);
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
  if (!me) return <div className="screen lobby-screen"><p>Joining...</p></div>;

  return (
    <div className="screen lobby-screen">
      <h1>DEFUSE.EXE</h1>
      <p className="subtitle">Multiplayer Roguelite Survivor</p>

      <div className="lobby-grid">
        {/* Character pick */}
        <div className="lobby-section">
          <h3>Character</h3>
          <div className="option-grid">
            {CHARACTERS.map(c => (
              <button
                key={c.id}
                className={me.characterId === c.id ? "option-btn selected" : "option-btn"}
                onClick={() => send({ type: "lobby_update", characterId: c.id })}
              >
                <span className="dot" style={{ background: c.color }} />
                <strong>{c.name}</strong>
                <small>{c.passiveDesc}</small>
                <small>HP {c.baseHp} · SPD {c.baseSpeed}</small>
              </button>
            ))}
          </div>
        </div>

        {/* Starter weapon */}
        <div className="lobby-section">
          <h3>Starter Weapon</h3>
          <div className="option-grid">
            {starterWeapons.map(w => (
              <button
                key={w.id}
                className={me.starterWeaponId === w.id ? "option-btn selected" : "option-btn"}
                onClick={() => send({ type: "lobby_update", starterWeaponId: w.id })}
              >
                <span className="dot" style={{ background: w.color }} />
                <strong>{w.name}</strong>
                <small>{w.description}</small>
              </button>
            ))}
          </div>
        </div>

        {/* Cosmetics */}
        <div className="lobby-section">
          <h3>Cosmetics</h3>
          <div className="cosmetic-row">
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
          <div className="cosmetic-row">
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
          <div className="cosmetic-row">
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

        {/* Blacklist */}
        <div className="lobby-section">
          <h3>Blacklist (won't appear in level-ups)</h3>
          <details>
            <summary>Weapons ({me.blacklistedWeapons.length}/{MAX_BLACKLISTED_WEAPONS})</summary>
            <div className="bl-grid">
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
          </details>
          <details>
            <summary>Tokens ({me.blacklistedTokens.length}/{MAX_BLACKLISTED_TOKENS})</summary>
            <div className="bl-grid">
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
          </details>
        </div>
      </div>

      {/* Players */}
      <div className="lobby-section">
        <h3>Players ({lobby.players.length})</h3>
        <div className="player-list">
          {lobby.players.map(p => {
            const c = getCharacter(p.characterId);
            const w = getWeapon(p.starterWeaponId);
            return (
              <div key={p.id} className="player-card">
                <span className="dot" style={{ background: c?.color ?? "#fff" }} />
                <span>{p.displayName}</span>
                <small>{c?.name} · {w?.name}</small>
                <span className={p.ready ? "ready-badge ready" : "ready-badge"}>{p.ready ? "READY" : "NOT READY"}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="lobby-actions">
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

function HUD({ state, myId }: { state: GameState; myId: string }): JSX.Element {
  const me = state.players.find(p => p.id === myId);
  const mins = Math.floor(state.timeRemainingMs / 60000);
  const secs = Math.floor((state.timeRemainingMs % 60000) / 1000);

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

      {/* Player HP */}
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
                <div key={ws.weaponId} className={`weapon-slot ${ws.ascended ? "ascended" : ""}`}>
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
                <div key={tid} className="token-slot">
                  <span>{t?.icon ?? "?"}</span>
                  <small>{t?.name ?? tid}</small>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Level-up modal ─────────────────────────────────────────────────── */

function LevelUpModal({ offer, send }: { offer: LevelUpOffer; send: (e: ClientEnvelope) => void }): JSX.Element {
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
              onClick={() => send({ type: "pick_upgrade", upgradeId: opt.id })}
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
      {levelUp && <LevelUpModal offer={levelUp} send={send} />}
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
