import Phaser from "phaser";
import type { GameState, LevelUpOffer, PlayerSettings } from "@defuse/shared";
import {
  ARENA_H,
  ARENA_W,
  ASCENSION_RECIPES,
  TOKENS,
  WEAPON_ASCEND_LEVEL,
  WEAPON_TRANSCEND_LEVEL,
  getCharacter,
  getEnemy,
  getWeapon,
} from "@defuse/shared";

type FramePayload = {
  state: GameState;
  myId: string;
  settings: PlayerSettings;
  levelUpOffer?: LevelUpOffer | null;
  bossWarning?: string | null;
  ascensionMsg?: string | null;
  transcendMsg?: string | null;
};

type RectHit = { x: number; y: number; w: number; h: number; id: string };

function toColor(input: string | undefined, fallback = 0xffffff): number {
  if (!input) return fallback;
  try {
    return Phaser.Display.Color.HexStringToColor(input).color;
  } catch {
    return fallback;
  }
}

function worldToScreen(
  wx: number,
  wy: number,
  camX: number,
  camY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: wx - camX + width / 2, y: wy - camY + height / 2 };
}

export class GameScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private frameData: FramePayload | null = null;
  private playerRender = new Map<string, { x: number; y: number; hp: number }>();
  private playerTrails = new Map<string, Array<{ x: number; y: number; life: number }>>();
  private cameraPos: { x: number; y: number } | null = null;
  private nameTexts = new Map<string, Phaser.GameObjects.Text>();
  private damageTexts: Phaser.GameObjects.Text[] = [];
  private uiTexts: Phaser.GameObjects.Text[] = [];
  private hudTopText!: Phaser.GameObjects.Text;
  private hudXpText!: Phaser.GameObjects.Text;
  private hudHpText!: Phaser.GameObjects.Text;
  private hudSpectateText!: Phaser.GameObjects.Text;
  private inspectTitle!: Phaser.GameObjects.Text;
  private inspectBody!: Phaser.GameObjects.Text;
  private weaponHits: RectHit[] = [];
  private tokenHits: RectHit[] = [];
  private playerHits: RectHit[] = [];
  private selectedWeaponId: string | null = null;
  private selectedTokenId: string | null = null;
  private selectedPlayerId: string | null = null;
  private levelUpHits: RectHit[] = [];
  private voteContinueHit: RectHit | null = null;
  private onPickUpgrade: ((upgradeId: string) => void) | null = null;
  private onVoteContinue: (() => void) | null = null;

  constructor() {
    super("defuse-game");
  }

  create(): void {
    this.gfx = this.add.graphics();
    this.hudTopText = this.add.text(0, 0, "", {
      fontFamily: "Inter, sans-serif",
      fontSize: "12px",
      color: "#e2e8f0",
      stroke: "#0b1220",
      strokeThickness: 3,
    }).setOrigin(0.5, 0);
    this.hudXpText = this.add.text(0, 0, "", {
      fontFamily: "Inter, sans-serif",
      fontSize: "11px",
      color: "#d1fae5",
      stroke: "#0b1220",
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);
    this.hudHpText = this.add.text(0, 0, "", {
      fontFamily: "Inter, sans-serif",
      fontSize: "11px",
      color: "#ffffff",
      stroke: "#0b1220",
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);
    this.hudSpectateText = this.add.text(0, 0, "", {
      fontFamily: "Inter, sans-serif",
      fontSize: "12px",
      color: "#cbd5e1",
      stroke: "#0b1220",
      strokeThickness: 3,
    }).setOrigin(0.5, 0);

    this.inspectTitle = this.add.text(0, 0, "", {
      fontFamily: "Inter, sans-serif",
      fontSize: "14px",
      color: "#e2e8f0",
      fontStyle: "bold",
      stroke: "#0b1220",
      strokeThickness: 3,
      wordWrap: { width: 300 },
    }).setOrigin(0, 0);
    this.inspectBody = this.add.text(0, 0, "", {
      fontFamily: "Inter, sans-serif",
      fontSize: "12px",
      color: "#cbd5e1",
      stroke: "#0b1220",
      strokeThickness: 2,
      lineSpacing: 4,
      wordWrap: { width: 300 },
    }).setOrigin(0, 0);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const px = pointer.x;
      const py = pointer.y;
      const inRect = (r: RectHit) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

      if (this.voteContinueHit && inRect(this.voteContinueHit)) {
        this.onVoteContinue?.();
        return;
      }

      const upHit = this.levelUpHits.find(inRect);
      if (upHit) {
        this.onPickUpgrade?.(upHit.id);
        return;
      }

      const wHit = this.weaponHits.find(inRect);
      if (wHit) {
        this.selectedWeaponId = this.selectedWeaponId === wHit.id ? null : wHit.id;
        this.selectedTokenId = null;
        this.selectedPlayerId = null;
        return;
      }
      const tHit = this.tokenHits.find(inRect);
      if (tHit) {
        this.selectedTokenId = this.selectedTokenId === tHit.id ? null : tHit.id;
        this.selectedWeaponId = null;
        this.selectedPlayerId = null;
        return;
      }
      const pHit = this.playerHits.find(inRect);
      if (pHit) {
        this.selectedPlayerId = this.selectedPlayerId === pHit.id ? null : pHit.id;
        this.selectedWeaponId = null;
        this.selectedTokenId = null;
      }
    });
  }

  setFrame(payload: FramePayload): void {
    this.frameData = payload;
  }

  setOnPickUpgrade(handler: ((upgradeId: string) => void) | null): void {
    this.onPickUpgrade = handler;
  }

  setOnVoteContinue(handler: (() => void) | null): void {
    this.onVoteContinue = handler;
  }

  update(): void {
    if (!this.frameData) return;

    const { state, myId, settings } = this.frameData;
    const me = state.players.find((p) => p.id === myId);

    const alivePlayers = state.players.filter((p) => p.alive);
    let followTarget = me ?? null;
    if (!followTarget?.alive) {
      if (alivePlayers.length > 0 && me) {
        followTarget = alivePlayers.reduce((best, p) => {
          const bestD = Phaser.Math.Distance.Between(best.x, best.y, me.x, me.y);
          const d = Phaser.Math.Distance.Between(p.x, p.y, me.x, me.y);
          return d < bestD ? p : best;
        }, alivePlayers[0]);
      } else {
        followTarget = alivePlayers[0] ?? me ?? null;
      }
    }

    const targetCamX = followTarget?.x ?? ARENA_W / 2;
    const targetCamY = followTarget?.y ?? ARENA_H / 2;
    if (!this.cameraPos) {
      this.cameraPos = { x: targetCamX, y: targetCamY };
    } else {
      this.cameraPos.x = Phaser.Math.Linear(this.cameraPos.x, targetCamX, 0.18);
      this.cameraPos.y = Phaser.Math.Linear(this.cameraPos.y, targetCamY, 0.18);
    }

    const camX = this.cameraPos.x;
    const camY = this.cameraPos.y;
    const width = this.scale.width;
    const height = this.scale.height;

    const liveIds = new Set(state.players.map((p) => p.id));
    for (const id of this.playerRender.keys()) {
      if (!liveIds.has(id)) this.playerRender.delete(id);
    }
    for (const id of this.playerTrails.keys()) {
      if (!liveIds.has(id)) this.playerTrails.delete(id);
    }
    for (const [id, label] of this.nameTexts.entries()) {
      if (!liveIds.has(id)) {
        label.destroy();
        this.nameTexts.delete(id);
      }
    }
    for (const label of this.nameTexts.values()) label.setVisible(false);
    for (const txt of this.damageTexts) txt.setVisible(false);
    for (const txt of this.uiTexts) txt.setVisible(false);
    let uiTextIndex = 0;
    const useUiText = (
      x: number,
      y: number,
      text: string,
      color = "#e2e8f0",
      size = 11,
    ) => {
      if (!this.uiTexts[uiTextIndex]) {
        this.uiTexts[uiTextIndex] = this.add.text(0, 0, "", {
          fontFamily: "Inter, sans-serif",
          fontSize: `${size}px`,
          color,
          stroke: "#0b1220",
          strokeThickness: 2,
        }).setOrigin(0, 0);
      }
      const t = this.uiTexts[uiTextIndex++];
      t.setText(text);
      t.setPosition(x, y);
      t.setColor(color);
      t.setVisible(true);
      return t;
    };
    this.weaponHits = [];
    this.tokenHits = [];
    this.playerHits = [];
    this.levelUpHits = [];
    this.voteContinueHit = null;

    if (this.selectedWeaponId && !state.players.some((p) => p.weapons.some((w) => w.weaponId === this.selectedWeaponId))) {
      this.selectedWeaponId = null;
    }
    if (this.selectedTokenId && !state.players.some((p) => p.tokens.includes(this.selectedTokenId!))) {
      this.selectedTokenId = null;
    }
    if (this.selectedPlayerId && !state.players.some((p) => p.id === this.selectedPlayerId)) {
      this.selectedPlayerId = null;
    }

    for (const player of state.players) {
      const prev = this.playerRender.get(player.id);
      if (!prev) {
        this.playerRender.set(player.id, { x: player.x, y: player.y, hp: player.hp });
      } else {
        const lerpPos = player.id === myId ? 0.42 : 0.28;
        prev.x = Phaser.Math.Linear(prev.x, player.x, lerpPos);
        prev.y = Phaser.Math.Linear(prev.y, player.y, lerpPos);
        prev.hp = Phaser.Math.Linear(prev.hp, player.hp, 0.35);
      }

      if (!player.alive || !player.moving || !player.cosmetic.trail || player.cosmetic.trail === "none") continue;
      const rp = this.playerRender.get(player.id);
      if (!rp) continue;
      const arr = this.playerTrails.get(player.id) ?? [];
      const tx = rp.x;
      const ty = rp.y + 14;
      const last = arr[arr.length - 1];
      if (!last || Phaser.Math.Distance.Between(last.x, last.y, tx, ty) > 2.2) {
        arr.push({ x: tx, y: ty, life: 28 });
      }
      while (arr.length > 48) arr.shift();
      this.playerTrails.set(player.id, arr);
    }

    for (const arr of this.playerTrails.values()) {
      for (const p of arr) p.life -= 1;
      while (arr.length > 0 && arr[0].life <= 0) arr.shift();
    }

    this.gfx.clear();

    this.gfx.fillStyle(0x0a0f1a, 1);
    this.gfx.fillRect(0, 0, width, height);

    const arenaTL = worldToScreen(0, 0, camX, camY, width, height);
    const arenaBR = worldToScreen(ARENA_W, ARENA_H, camX, camY, width, height);

    this.gfx.lineStyle(2, 0x38bdf8, 0.16);
    this.gfx.strokeRect(arenaTL.x, arenaTL.y, arenaBR.x - arenaTL.x, arenaBR.y - arenaTL.y);

    this.gfx.lineStyle(1, 0x94a3b8, 0.08);
    for (let gx = 0; gx <= ARENA_W; gx += 200) {
      const p = worldToScreen(gx, 0, camX, camY, width, height);
      this.gfx.lineBetween(p.x, arenaTL.y, p.x, arenaBR.y);
    }
    for (let gy = 0; gy <= ARENA_H; gy += 200) {
      const p = worldToScreen(0, gy, camX, camY, width, height);
      this.gfx.lineBetween(arenaTL.x, p.y, arenaBR.x, p.y);
    }

    for (const zone of state.bombZones) {
      const p = worldToScreen(zone.x, zone.y, camX, camY, width, height);
      this.gfx.lineStyle(2, 0x14b8a6, 0.45);
      this.gfx.strokeCircle(p.x, p.y, zone.radius);
      this.gfx.fillStyle(0x14b8a6, 0.08);
      this.gfx.fillCircle(p.x, p.y, zone.radius);
    }

    for (const gem of state.xpGems) {
      const p = worldToScreen(gem.x, gem.y, camX, camY, width, height);
      this.gfx.fillStyle(gem.value > 10 ? 0xfbbf24 : 0x86efac, 1);
      this.gfx.fillCircle(p.x, p.y, gem.value > 10 ? 4 : 3);
    }

    for (const pickup of state.pickups) {
      const p = worldToScreen(pickup.x, pickup.y, camX, camY, width, height);
      this.gfx.fillStyle(0xffffff, 0.8);
      this.gfx.fillCircle(p.x, p.y, 5);
    }

    for (const proj of state.projectiles) {
      const p = worldToScreen(proj.x, proj.y, camX, camY, width, height);
      const isEnemy = proj.ownerId === "__enemy__";
      const alpha = isEnemy
        ? 0.95
        : proj.ownerId === myId
          ? settings.ownProjectileOpacity
          : settings.otherProjectileOpacity;

      if (proj.pattern === "beam") {
        const len = 300;
        const beamColor = toColor(proj.color, 0xffffff);
        this.gfx.lineStyle(8, beamColor, Math.max(0.08, alpha * 0.25));
        this.gfx.lineBetween(p.x, p.y, p.x + proj.dx * len, p.y + proj.dy * len);
        this.gfx.lineStyle(3, beamColor, Math.max(0.2, alpha));
        this.gfx.lineBetween(p.x, p.y, p.x + proj.dx * len, p.y + proj.dy * len);
        if (proj.weaponId === "laser_drill") {
          this.gfx.lineStyle(1, 0xffffff, Math.max(0.1, alpha * 0.6));
          this.gfx.lineBetween(p.x, p.y, p.x + proj.dx * len, p.y + proj.dy * len);
        }
        continue;
      }

      if (proj.pattern === "ring") {
        this.gfx.lineStyle(2, toColor(proj.color, 0xffffff), Math.max(0.1, alpha * 0.8));
        this.gfx.strokeCircle(p.x, p.y, proj.area);
        if (proj.weaponId === "absolute_zero") {
          this.gfx.lineStyle(1, 0xffffff, Math.max(0.1, alpha * 0.5));
          this.gfx.strokeCircle(p.x, p.y, proj.area * 0.7);
        }
        continue;
      }

      if (proj.pattern === "ground") {
        const splatColor = toColor(proj.color, 0xffffff);
        this.gfx.fillStyle(splatColor, Math.max(0.08, alpha * 0.22));
        this.gfx.fillCircle(p.x, p.y, proj.area);
        this.gfx.fillStyle(splatColor, Math.max(0.08, alpha * 0.18));
        this.gfx.fillCircle(p.x + proj.area * 0.25, p.y - proj.area * 0.15, proj.area * 0.35);
        this.gfx.fillCircle(p.x - proj.area * 0.2, p.y + proj.area * 0.2, proj.area * 0.25);
        if (proj.weaponId === "mine_deployer") {
          this.gfx.lineStyle(1, 0xffffff, Math.max(0.12, alpha * 0.7));
          this.gfx.lineBetween(p.x, p.y - 6, p.x, p.y + 6);
          this.gfx.lineBetween(p.x - 6, p.y, p.x + 6, p.y);
        }
        continue;
      }

      const size = Math.max(3, proj.area * 0.5);
      const color = isEnemy ? 0xff6666 : toColor(proj.color, 0xffffff);

      this.gfx.fillStyle(color, Math.max(0.15, alpha));
      if (isEnemy) {
        this.gfx.fillCircle(p.x, p.y, size * 0.9);
        this.gfx.lineStyle(1, 0xcc3333, Math.max(0.2, alpha));
        this.gfx.strokeCircle(p.x, p.y, size * 1.2);
      } else if (proj.weaponId === "plasma_pistol" || proj.weaponId === "supernova_cannon") {
        const a = Math.atan2(proj.dy, proj.dx);
        const tipX = p.x + Math.cos(a) * size * 1.7;
        const tipY = p.y + Math.sin(a) * size * 1.7;
        const baseX = p.x - Math.cos(a) * size * 1.2;
        const baseY = p.y - Math.sin(a) * size * 1.2;
        this.gfx.fillTriangle(tipX, tipY, baseX + Math.sin(a) * size * 0.5, baseY - Math.cos(a) * size * 0.5, baseX - Math.sin(a) * size * 0.5, baseY + Math.cos(a) * size * 0.5);
        this.gfx.fillStyle(0xfde68a, Math.max(0.2, alpha * 0.8));
        this.gfx.fillCircle(tipX, tipY, Math.max(1.5, size * 0.2));
      } else if (proj.weaponId === "pulse_rifle" || proj.weaponId === "annihilator") {
        this.gfx.fillRoundedRect(p.x - size * 1.3, p.y - size * 0.35, size * 2.6, size * 0.7, 2);
      } else if (proj.weaponId === "grenade_launcher" || proj.weaponId === "cluster_nuke") {
        this.gfx.fillCircle(p.x, p.y, size);
        this.gfx.fillStyle(0x111827, Math.max(0.2, alpha * 0.8));
        this.gfx.fillCircle(p.x, p.y, size * 0.35);
      } else if (proj.weaponId === "boomerang_disc") {
        this.gfx.fillCircle(p.x, p.y, size * 1.1);
        this.gfx.fillStyle(0x1f2937, Math.max(0.15, alpha * 0.8));
        this.gfx.fillCircle(p.x, p.y, size * 0.6);
      } else if (proj.weaponId === "shockwave_stamp") {
        this.gfx.fillRoundedRect(p.x - size, p.y - size, size * 2, size * 2, 3);
      } else if (proj.weaponId === "homing_rockets") {
        const a = Math.atan2(proj.dy, proj.dx);
        const noseX = p.x + Math.cos(a) * size * 1.3;
        const noseY = p.y + Math.sin(a) * size * 1.3;
        this.gfx.fillEllipse(p.x, p.y, size * 2.4, size * 0.95);
        this.gfx.fillStyle(0xf59e0b, Math.max(0.2, alpha * 0.8));
        this.gfx.fillCircle(noseX, noseY, size * 0.25);
      } else if (proj.pattern === "orbit") {
        const a = Math.atan2(proj.dy, proj.dx);
        const tipX = p.x + Math.cos(a) * size * 1.5;
        const tipY = p.y + Math.sin(a) * size * 1.5;
        const leftX = p.x + Math.cos(a + 2.5) * size;
        const leftY = p.y + Math.sin(a + 2.5) * size;
        const rightX = p.x + Math.cos(a - 2.5) * size;
        const rightY = p.y + Math.sin(a - 2.5) * size;
        this.gfx.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);
      } else if (proj.pattern === "homing") {
        this.gfx.fillEllipse(p.x, p.y, size * 2.6, size * 1.1);
      } else if (proj.pattern === "chain") {
        this.gfx.fillRoundedRect(p.x - size, p.y - size * 0.45, size * 2, size * 0.9, 2);
      } else if (proj.pattern === "cone") {
        const a = Math.atan2(proj.dy, proj.dx);
        const tipX = p.x + Math.cos(a) * size * 1.4;
        const tipY = p.y + Math.sin(a) * size * 1.4;
        const leftX = p.x + Math.cos(a + 2.2) * size * 0.8;
        const leftY = p.y + Math.sin(a + 2.2) * size * 0.8;
        const rightX = p.x + Math.cos(a - 2.2) * size * 0.8;
        const rightY = p.y + Math.sin(a - 2.2) * size * 0.8;
        this.gfx.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);
      } else {
        this.gfx.fillEllipse(p.x, p.y, size * 2.4, size * 0.95);
      }
    }

    for (const enemy of state.enemies) {
      const p = worldToScreen(enemy.x, enemy.y, camX, camY, width, height);
      const def = getEnemy(enemy.defId);
      const baseColor = toColor(def?.color, 0xef4444);
      const scale = enemy.rank === "boss" ? 2.2 : enemy.rank === "miniboss" ? 1.7 : enemy.rank === "elite" ? 1.3 : 1;
      const r = (def?.size ?? 12) * scale;

      this.gfx.fillStyle(baseColor, 0.9);
      this.gfx.fillCircle(p.x, p.y, r * 0.5);

      if (enemy.rank !== "normal") {
        const ringColor = enemy.rank === "boss" ? 0xdc2626 : enemy.rank === "miniboss" ? 0xf97316 : 0xfbbf24;
        this.gfx.lineStyle(2, ringColor, 0.8);
        this.gfx.strokeCircle(p.x, p.y, r * 0.75);
      }
    }

    const trailColors: Record<string, number[]> = {
      spark: [0xfbbf24, 0xfde68a, 0xffffff],
      flame: [0xef4444, 0xf97316, 0xfbbf24],
      ice: [0x67e8f9, 0xa5f3fc, 0xffffff],
      shadow: [0x6b21a8, 0x7c3aed, 0x1e1b4b],
      rainbow: [0xef4444, 0xfbbf24, 0x4ade80, 0x38bdf8, 0xa855f7, 0xec4899],
    };

    for (const player of state.players) {
      if (!player.alive || !player.cosmetic.trail || player.cosmetic.trail === "none") continue;
      const arr = this.playerTrails.get(player.id);
      if (!arr || arr.length === 0) continue;
      const cols = trailColors[player.cosmetic.trail] ?? trailColors.spark;
      for (let i = 0; i < arr.length; i++) {
        const t = arr[i];
        const sPos = worldToScreen(t.x, t.y, camX, camY, width, height);
        const a = Math.max(0, t.life / 28);
        this.gfx.fillStyle(cols[i % cols.length], a * 0.65);
        this.gfx.fillCircle(sPos.x, sPos.y, Math.max(1.3, 4 * a));
      }
    }

    for (const player of state.players) {
      if (!player.alive) continue;
      const rp = this.playerRender.get(player.id) ?? { x: player.x, y: player.y, hp: player.hp };
      const p = worldToScreen(rp.x, rp.y, camX, camY, width, height);
      const charDef = getCharacter(player.characterId);
      const color = toColor(player.cosmetic.colorOverride || charDef?.color, 0x38bdf8);

      this.gfx.lineStyle(2, color, 1);
      this.gfx.strokeCircle(p.x, p.y - 16, 5);
      this.gfx.lineBetween(p.x, p.y - 11, p.x, p.y + 4);
      this.gfx.lineBetween(p.x, p.y - 6, p.x - 7, p.y + 1);
      this.gfx.lineBetween(p.x, p.y - 6, p.x + 7, p.y + 1);
      this.gfx.lineBetween(p.x, p.y + 4, p.x - 6, p.y + 13);
      this.gfx.lineBetween(p.x, p.y + 4, p.x + 6, p.y + 13);

      if (player.id === myId) {
        this.gfx.lineStyle(1, 0xffffff, 0.35);
        this.gfx.strokeCircle(p.x, p.y - 4, 22);
      }

      if (player.hp < player.maxHp) {
        const w = 30;
        const hpRatio = Math.max(0, Math.min(1, rp.hp / player.maxHp));
        this.gfx.fillStyle(0x000000, 0.6);
        this.gfx.fillRect(p.x - w / 2, p.y - 28, w, 4);
        this.gfx.fillStyle(hpRatio > 0.3 ? 0x4ade80 : 0xef4444, 1);
        this.gfx.fillRect(p.x - w / 2, p.y - 28, w * hpRatio, 4);
      }

      let label = this.nameTexts.get(player.id);
      if (!label) {
        label = this.add.text(0, 0, player.displayName, {
          fontFamily: "Inter, sans-serif",
          fontSize: "11px",
          color: "#ffffff",
          stroke: "#0b1220",
          strokeThickness: 3,
        }).setOrigin(0.5, 1);
        this.nameTexts.set(player.id, label);
      }
      label.setText(player.displayName);
      label.setPosition(p.x, p.y + 26);
      label.setAlpha(player.id === myId ? 1 : 0.85);
      label.setVisible(true);
    }

    const mmW = 150;
    const mmH = 150;
    const mmX = width - mmW - 12;
    const mmY = height - mmH - 12;
    const sx = mmW / ARENA_W;
    const sy = mmH / ARENA_H;
    this.gfx.fillStyle(0x000000, 0.45);
    this.gfx.fillRect(mmX, mmY, mmW, mmH);
    this.gfx.lineStyle(1, 0x38bdf8, 0.35);
    this.gfx.strokeRect(mmX, mmY, mmW, mmH);

    for (const z of state.bombZones) {
      this.gfx.fillStyle(0x14b8a6, 0.55);
      this.gfx.fillCircle(mmX + z.x * sx, mmY + z.y * sy, 3);
    }
    for (const e of state.enemies) {
      if (e.rank === "boss" || e.rank === "miniboss") {
        this.gfx.fillStyle(0xfbbf24, 0.9);
        this.gfx.fillCircle(mmX + e.x * sx, mmY + e.y * sy, 3);
      } else {
        this.gfx.fillStyle(0xef4444, 0.4);
        this.gfx.fillRect(mmX + e.x * sx - 1, mmY + e.y * sy - 1, 2, 2);
      }
    }
    for (const p of state.players) {
      if (!p.alive) continue;
      this.gfx.fillStyle(p.id === myId ? 0xffffff : 0x38bdf8, 1);
      this.gfx.fillCircle(mmX + p.x * sx, mmY + p.y * sy, 3);
    }

    for (let i = 0; i < state.damageNumbers.length; i++) {
      const dn = state.damageNumbers[i];
      const pos = worldToScreen(dn.x, dn.y, camX, camY, width, height);
      const alpha = Math.max(0, 1 - dn.age / 800);
      if (alpha <= 0) continue;

      if (!this.damageTexts[i]) {
        this.damageTexts[i] = this.add.text(0, 0, "", {
          fontFamily: "Inter, sans-serif",
          fontSize: "13px",
          color: "#ffffff",
          stroke: "#0b1220",
          strokeThickness: 3,
        }).setOrigin(0.5, 0.5);
      }
      const txt = this.damageTexts[i];
      txt.setText(String(dn.value));
      txt.setPosition(pos.x, pos.y - dn.age * 0.04);
      txt.setColor(dn.crit ? "#fbbf24" : "#ffffff");
      txt.setAlpha(alpha);
      txt.setVisible(true);
      txt.setScale(dn.crit ? 1.08 : 1);
    }

    if (me) {
      const panelX = 12;
      const panelW = 290;
      const panelY = height - 235;
      this.gfx.fillStyle(0x08101d, 0.78);
      this.gfx.fillRoundedRect(panelX, panelY, panelW, 150, 10);
      this.gfx.lineStyle(1, 0x94a3b8, 0.24);
      this.gfx.strokeRoundedRect(panelX, panelY, panelW, 150, 10);

      const chipW = 136;
      const chipH = 18;
      for (let i = 0; i < me.weapons.length; i++) {
        const ws = me.weapons[i];
        const def = getWeapon(ws.weaponId);
        const col = i % 2;
        const row = Math.floor(i / 2);
        if (row > 2) break;
        const x = panelX + 8 + col * (chipW + 8);
        const y = panelY + 10 + row * (chipH + 6);
        const active = this.selectedWeaponId === ws.weaponId;
        this.gfx.fillStyle(active ? 0x1e293b : 0x0f172a, 0.9);
        this.gfx.fillRoundedRect(x, y, chipW, chipH, 5);
        this.gfx.lineStyle(1, ws.transcended ? 0xc084fc : ws.ascended ? 0xfbbf24 : 0x64748b, active ? 0.9 : 0.6);
        this.gfx.strokeRoundedRect(x, y, chipW, chipH, 5);
        this.weaponHits.push({ x, y, w: chipW, h: chipH, id: ws.weaponId });

        useUiText(x + 6, y + 3, `${def?.name ?? ws.weaponId} Lv${ws.level}`, "#e2e8f0", 10).setDepth(2);
      }

      const tokenY = panelY + 78;
      const tokenW = 86;
      const tokenH = 18;
      for (let i = 0; i < me.tokens.length; i++) {
        const tid = me.tokens[i];
        const tDef = TOKENS.find((t) => t.id === tid);
        const col = i % 3;
        const row = Math.floor(i / 3);
        if (row > 2) break;
        const x = panelX + 8 + col * (tokenW + 6);
        const y = tokenY + row * (tokenH + 6);
        const active = this.selectedTokenId === tid;
        this.gfx.fillStyle(active ? 0x1e293b : 0x0f172a, 0.9);
        this.gfx.fillRoundedRect(x, y, tokenW, tokenH, 5);
        this.gfx.lineStyle(1, 0x64748b, active ? 0.9 : 0.6);
        this.gfx.strokeRoundedRect(x, y, tokenW, tokenH, 5);
        this.tokenHits.push({ x, y, w: tokenW, h: tokenH, id: tid });

        useUiText(x + 6, y + 3, `${tDef?.icon ?? "?"} ${tDef?.name ?? tid}`, "#dbeafe", 10).setDepth(2);
      }
    }

    const others = state.players.filter((p) => p.id !== myId);
    if (others.length > 0) {
      const baseX = width - 212;
      const baseY = 88;
      for (let i = 0; i < others.length; i++) {
        const p = others[i];
        const y = baseY + i * 34;
        const hpRatio = p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
        const active = this.selectedPlayerId === p.id;
        this.gfx.fillStyle(active ? 0x1e293b : 0x08101d, 0.84);
        this.gfx.fillRoundedRect(baseX, y, 198, 28, 7);
        this.gfx.lineStyle(1, active ? 0x5eead4 : 0x64748b, 0.45);
        this.gfx.strokeRoundedRect(baseX, y, 198, 28, 7);
        this.gfx.fillStyle(0x0f172a, 0.95);
        this.gfx.fillRoundedRect(baseX + 8, y + 15, 182, 7, 4);
        this.gfx.fillStyle(!p.alive ? 0x6b7280 : hpRatio > 0.3 ? 0x4ade80 : 0xef4444, 0.95);
        this.gfx.fillRoundedRect(baseX + 8, y + 15, 182 * hpRatio, 7, 4);
        this.playerHits.push({ x: baseX, y, w: 198, h: 28, id: p.id });

        useUiText(baseX + 10, y + 4, p.displayName, "#e2e8f0", 11).setDepth(2);
      }
    }

    const elapsed = state.elapsedMs ?? 0;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const myKills = me?.killCount ?? 0;

    const topW = 420;
    const topH = 32;
    const topX = width / 2 - topW / 2;
    const topY = 8;
    this.gfx.fillStyle(0x08101d, 0.82);
    this.gfx.fillRoundedRect(topX, topY, topW, topH, 8);
    this.gfx.lineStyle(1, 0x94a3b8, 0.28);
    this.gfx.strokeRoundedRect(topX, topY, topW, topH, 8);
    this.hudTopText.setText(`Time ${mins}:${secs.toString().padStart(2, "0")}   •   Level ${state.sharedLevel}   •   Enemies ${state.enemies.length}   •   Kills ${myKills}`);
    this.hudTopText.setPosition(width / 2, topY + 7);

    const xpW = 360;
    const xpH = 14;
    const xpX = width / 2 - xpW / 2;
    const xpY = topY + topH + 8;
    const xpRatio = state.xpToNext > 0 ? Math.max(0, Math.min(1, state.sharedXp / state.xpToNext)) : 0;
    this.gfx.fillStyle(0x0f172a, 0.85);
    this.gfx.fillRoundedRect(xpX, xpY, xpW, xpH, 7);
    this.gfx.fillStyle(0x22c55e, 0.92);
    this.gfx.fillRoundedRect(xpX, xpY, xpW * xpRatio, xpH, 7);
    this.gfx.lineStyle(1, 0x5eead4, 0.35);
    this.gfx.strokeRoundedRect(xpX, xpY, xpW, xpH, 7);
    this.hudXpText.setText(`XP ${state.sharedXp}/${state.xpToNext}`);
    this.hudXpText.setPosition(width / 2, xpY + xpH / 2);

    if (me) {
      const hpW = 230;
      const hpH = 16;
      const hpX = 12;
      const hpY = height - hpH - 14;
      const hpRatio = me.maxHp > 0 ? Math.max(0, Math.min(1, me.hp / me.maxHp)) : 0;
      this.gfx.fillStyle(0x0f172a, 0.85);
      this.gfx.fillRoundedRect(hpX, hpY, hpW, hpH, 8);
      this.gfx.fillStyle(hpRatio > 0.3 ? 0x22c55e : 0xef4444, 0.95);
      this.gfx.fillRoundedRect(hpX, hpY, hpW * hpRatio, hpH, 8);
      this.gfx.lineStyle(1, 0x94a3b8, 0.3);
      this.gfx.strokeRoundedRect(hpX, hpY, hpW, hpH, 8);
      this.hudHpText.setText(`${Math.round(me.hp)}/${me.maxHp} HP`);
      this.hudHpText.setPosition(hpX + hpW / 2, hpY + hpH / 2);
      this.hudHpText.setVisible(true);
    } else {
      this.hudHpText.setVisible(false);
    }

    if (me && !me.alive && followTarget && followTarget.id !== me.id) {
      this.hudSpectateText.setText(`SPECTATING ${followTarget.displayName}`);
      this.hudSpectateText.setPosition(width / 2, xpY + xpH + 8);
      this.hudSpectateText.setVisible(true);
    } else {
      this.hudSpectateText.setVisible(false);
    }

    let inspectTitle = "";
    let inspectBody = "";
    if (me && this.selectedWeaponId) {
      const ws = me.weapons.find((w) => w.weaponId === this.selectedWeaponId);
      const wDef = ws ? getWeapon(ws.weaponId) : null;
      if (ws && wDef) {
        const recipe = ASCENSION_RECIPES.find((r) => r.weaponId === ws.weaponId || r.ascendedWeaponId === ws.weaponId);
        const reqToken = recipe ? TOKENS.find((t) => t.id === recipe.tokenId) : null;
        inspectTitle = `${wDef.name}  Lv${ws.level}`;
        inspectBody = [
          `Pattern: ${wDef.pattern}`,
          `Damage: ${wDef.baseDamage}  Cooldown: ${wDef.baseCooldownMs}ms`,
          `Projectiles: ${wDef.baseProjectiles}  Pierce: ${wDef.basePierce}`,
          ws.transcended
            ? "Status: TRANSCENDED"
            : ws.ascended
              ? `Status: Ascended · Reach Lv${WEAPON_TRANSCEND_LEVEL} to transcend`
              : `Ascend at Lv${WEAPON_ASCEND_LEVEL}${reqToken ? ` + ${reqToken.icon} ${reqToken.name}` : ""}`,
        ].join("\n");
      }
    } else if (this.selectedTokenId) {
      const tDef = TOKENS.find((t) => t.id === this.selectedTokenId);
      if (tDef) {
        inspectTitle = `${tDef.icon} ${tDef.name}`;
        inspectBody = [
          tDef.description,
          `Stat: ${tDef.stat}`,
          `Value: +${tDef.value < 1 ? `${Math.round(tDef.value * 100)}%` : tDef.value}`,
          tDef.group ? "Type: Group token" : "Type: Personal token",
        ].join("\n");
      }
    } else if (this.selectedPlayerId) {
      const p = state.players.find((x) => x.id === this.selectedPlayerId);
      if (p) {
        inspectTitle = p.displayName;
        inspectBody = [
          `HP: ${Math.round(p.hp)}/${p.maxHp}  ${p.alive ? "ALIVE" : "DEAD"}`,
          `Damage: ${p.damageDealt.toLocaleString()}  Kills: ${p.killCount}`,
          `Bombs: ${p.bombsDefused}  Revives: ${p.revives}`,
          `Weapons: ${p.weapons.map((w) => `${getWeapon(w.weaponId)?.name ?? w.weaponId} Lv${w.level}`).join(", ") || "None"}`,
        ].join("\n");
      }
    }

    if (inspectTitle) {
      const ix = 16;
      const iy = 88;
      const iw = 320;
      const ih = 150;
      this.gfx.fillStyle(0x08101d, 0.92);
      this.gfx.fillRoundedRect(ix, iy, iw, ih, 10);
      this.gfx.lineStyle(1, 0x5eead4, 0.4);
      this.gfx.strokeRoundedRect(ix, iy, iw, ih, 10);
      this.inspectTitle.setText(inspectTitle).setPosition(ix + 10, iy + 8).setVisible(true);
      this.inspectBody.setText(inspectBody).setPosition(ix + 10, iy + 32).setVisible(true);
    } else {
      this.inspectTitle.setVisible(false);
      this.inspectBody.setVisible(false);
    }

    if (this.frameData.levelUpOffer) {
      const offer = this.frameData.levelUpOffer;
      this.gfx.fillStyle(0x000000, 0.6);
      this.gfx.fillRect(0, 0, width, height);

      const panelW = Math.min(760, width - 40);
      const panelX = width / 2 - panelW / 2;
      const panelY = Math.max(40, height / 2 - 180);
      this.gfx.fillStyle(0x08101d, 0.95);
      this.gfx.fillRoundedRect(panelX, panelY, panelW, 320, 12);
      this.gfx.lineStyle(1, 0x5eead4, 0.4);
      this.gfx.strokeRoundedRect(panelX, panelY, panelW, 320, 12);

      useUiText(panelX + 20, panelY + 14, "LEVEL UP!", "#5eead4", 20);
      useUiText(panelX + 20, panelY + 44, "Choose an upgrade", "#94a3b8", 12);

      const cards = offer.options.slice(0, 3);
      const gap = 12;
      const cardW = (panelW - 40 - gap * 2) / 3;
      const cardH = 220;
      for (let i = 0; i < cards.length; i++) {
        const opt = cards[i];
        const x = panelX + 20 + i * (cardW + gap);
        const y = panelY + 72;
        this.gfx.fillStyle(0x0f172a, 0.95);
        this.gfx.fillRoundedRect(x, y, cardW, cardH, 10);
        this.gfx.lineStyle(1, opt.group ? 0x7dd3fc : 0x64748b, 0.65);
        this.gfx.strokeRoundedRect(x, y, cardW, cardH, 10);
        this.levelUpHits.push({ x, y, w: cardW, h: cardH, id: opt.id });

        useUiText(x + 12, y + 10, opt.name, "#e2e8f0", 13);
        const lines = opt.description.match(/.{1,44}(\s|$)/g) ?? [opt.description];
        for (let li = 0; li < Math.min(7, lines.length); li++) {
          useUiText(x + 12, y + 40 + li * 18, lines[li].trim(), "#94a3b8", 11);
        }
        if (opt.group) {
          this.gfx.fillStyle(0x083344, 0.95);
          this.gfx.fillRoundedRect(x + 12, y + cardH - 30, 70, 18, 9);
          useUiText(x + 22, y + cardH - 27, "GROUP", "#7dd3fc", 10);
        }
        useUiText(x + 12, y + cardH - 28, "Click to pick", "#5eead4", 11);
      }
    }

    if (state.phase === "vote_continue") {
      this.gfx.fillStyle(0x000000, 0.55);
      this.gfx.fillRect(0, 0, width, height);
      const panelW = 470;
      const panelH = 210;
      const panelX = width / 2 - panelW / 2;
      const panelY = height / 2 - panelH / 2;
      this.gfx.fillStyle(0x08101d, 0.95);
      this.gfx.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
      this.gfx.lineStyle(1, 0x5eead4, 0.45);
      this.gfx.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);
      useUiText(panelX + 20, panelY + 18, "BOSS DEFEATED", "#5eead4", 22);
      useUiText(panelX + 20, panelY + 56, "Keep going? Bosses continue spawning over time.", "#94a3b8", 13);
      const needed = Math.ceil(state.players.length * 0.5);
      useUiText(panelX + 20, panelY + 82, `Votes: ${state.continueVotes.length}/${needed}`, "#d1fae5", 13);

      const btnW = 190;
      const btnH = 44;
      const btnX = panelX + panelW / 2 - btnW / 2;
      const btnY = panelY + panelH - btnH - 20;
      this.gfx.fillStyle(0x0d9488, 0.95);
      this.gfx.fillRoundedRect(btnX, btnY, btnW, btnH, 10);
      this.gfx.lineStyle(1, 0x5eead4, 0.75);
      this.gfx.strokeRoundedRect(btnX, btnY, btnW, btnH, 10);
      useUiText(btnX + 44, btnY + 13, "KEEP GOING", "#e6fffb", 14);
      this.voteContinueHit = { x: btnX, y: btnY, w: btnW, h: btnH, id: "vote_continue" };
    }

    if (me && !me.alive && state.phase === "active") {
      const panelW = 560;
      const panelH = 200;
      const panelX = width / 2 - panelW / 2;
      const panelY = height / 2 - panelH / 2;
      this.gfx.fillStyle(0x000000, 0.35);
      this.gfx.fillRect(0, 0, width, height);
      this.gfx.fillStyle(0x08101d, 0.94);
      this.gfx.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
      this.gfx.lineStyle(1, 0xef4444, 0.45);
      this.gfx.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);
      useUiText(panelX + 18, panelY + 14, "YOU DIED", "#ef4444", 24);
      const spectating = followTarget && followTarget.id !== me.id ? ` · Spectating ${followTarget.displayName}` : "";
      useUiText(panelX + 18, panelY + 45, `Final breakdown so far${spectating}`, "#fca5a5", 12);
      useUiText(panelX + 18, panelY + 76, `Damage ${me.damageDealt.toLocaleString()}   •   Kills ${me.killCount}   •   XP ${me.xpCollected}   •   Bombs ${me.bombsDefused}`, "#e2e8f0", 12);
      useUiText(panelX + 18, panelY + 104, `Weapons: ${me.weapons.map((w) => `${getWeapon(w.weaponId)?.name ?? w.weaponId} Lv${w.level}`).join(", ") || "None"}`, "#cbd5e1", 11);
      useUiText(panelX + 18, panelY + 126, `Tokens: ${me.tokens.map((id) => TOKENS.find((t) => t.id === id)?.icon ?? id).join(" ") || "None"}`, "#cbd5e1", 11);
    }

    if (this.frameData.bossWarning) {
      const bw = 420;
      const bx = width / 2 - bw / 2;
      const by = height * 0.24;
      this.gfx.fillStyle(0x2b0a0a, 0.85);
      this.gfx.fillRoundedRect(bx, by, bw, 56, 10);
      this.gfx.lineStyle(1, 0xef4444, 0.85);
      this.gfx.strokeRoundedRect(bx, by, bw, 56, 10);
      useUiText(bx + 22, by + 18, `⚠ ${this.frameData.bossWarning} INCOMING ⚠`, "#fecaca", 20);
    }

    if (this.frameData.ascensionMsg) {
      const aw = 420;
      const ax = width / 2 - aw / 2;
      const ay = height * 0.12;
      this.gfx.fillStyle(0x3b2c05, 0.85);
      this.gfx.fillRoundedRect(ax, ay, aw, 64, 10);
      this.gfx.lineStyle(1, 0xfbbf24, 0.9);
      this.gfx.strokeRoundedRect(ax, ay, aw, 64, 10);
      useUiText(ax + 16, ay + 10, "★ ASCENSION ★", "#fde68a", 20);
      useUiText(ax + 16, ay + 36, this.frameData.ascensionMsg, "#fef3c7", 12);
    }

    if (this.frameData.transcendMsg) {
      const tw = 430;
      const tx = width / 2 - tw / 2;
      const ty = height * 0.12 + (this.frameData.ascensionMsg ? 72 : 0);
      this.gfx.fillStyle(0x24103a, 0.86);
      this.gfx.fillRoundedRect(tx, ty, tw, 64, 10);
      this.gfx.lineStyle(1, 0xc084fc, 0.9);
      this.gfx.strokeRoundedRect(tx, ty, tw, 64, 10);
      useUiText(tx + 16, ty + 10, "✦ TRANSCENDENCE ✦", "#e9d5ff", 20);
      useUiText(tx + 16, ty + 36, this.frameData.transcendMsg, "#f3e8ff", 12);
    }
  }
}
