/* ─── DEFUSE.EXE — Multiplayer Roguelite Survivor — Shared Types ─── */

// ── Enums / Literals ────────────────────────────────────────────────

export type WeaponPattern =
  | "projectile"
  | "area"
  | "orbit"
  | "cone"
  | "chain"
  | "ring"
  | "ground"
  | "beam"
  | "homing";

export type EnemyClass = "melee" | "ranged" | "caster";

export type EnemyRank = "normal" | "elite" | "miniboss" | "boss";

export type GamePhase =
  | "lobby"
  | "active"
  | "level_up"
  | "boss_warning"
  | "vote_continue"
  | "results";

export type UpgradeKind =
  | "new_weapon"
  | "weapon_level"
  | "new_token"
  | "player_stat"
  | "group_stat";

// ── Data Definitions ────────────────────────────────────────────────

export type CharacterVisual = "male" | "female" | "cat" | "robot" | "ghost_player";

export interface CharacterDef {
  id: string;
  name: string;
  description: string;
  baseSpeed: number;
  baseHp: number;
  passive: string;
  passiveDesc: string;
  color: string;         // render color
  accentColor: string;
  visual: CharacterVisual;
}

export interface WeaponDef {
  id: string;
  name: string;
  description: string;
  pattern: WeaponPattern;
  starter: boolean;
  baseDamage: number;
  baseCooldownMs: number;
  baseArea: number;        // effect radius
  baseProjectiles: number;
  basePierce: number;
  baseSpeed: number;       // projectile speed (px/tick)
  baseDuration: number;    // effect duration ticks
  baseKnockback: number;
  maxLevel: number;
  color: string;
  ascendedId?: string;     // id of ascended form
  matchingTokenId?: string;
}

export interface AscendedWeaponDef extends WeaponDef {
  baseWeaponId: string;
  requiredTokenId: string;
  ascensionDesc: string;
}

export interface TokenDef {
  id: string;
  name: string;
  description: string;
  stat: string;
  value: number;
  group: boolean;        // is this a group-wide buff?
  matchingWeaponId?: string;
  color: string;
  icon: string;          // emoji/symbol for display
}

export type EnemyVisual = "male" | "female" | "beast" | "spider" | "bird" | "slime" | "snake" | "demon" | "ghost" | "robot";

export interface EnemyDef {
  id: string;
  name: string;
  enemyClass: EnemyClass;
  baseHp: number;
  baseDamage: number;
  baseSpeed: number;
  xpValue: number;
  size: number;
  color: string;
  shape: "circle" | "triangle" | "diamond" | "square" | "hexagon";
  visual: EnemyVisual;
  abilities?: string[];
  spawnWeight: number;   // higher = more common
  minWave: number;       // earliest wave to appear
}

export interface UpgradeDef {
  id: string;
  kind: UpgradeKind;
  name: string;
  description: string;
  stat?: string;
  value?: number;
  weaponId?: string;
  tokenId?: string;
  group: boolean;
}

export interface AscensionRecipe {
  weaponId: string;
  tokenId: string;
  ascendedWeaponId: string;
  requiredWeaponLevel: number;
}

// ── Runtime State (Server → Client) ────────────────────────────────

export interface PlayerWeaponState {
  weaponId: string;
  level: number;
  xp: number;
  ascended: boolean;
}

export interface PlayerState {
  id: string;
  displayName: string;
  characterId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  weapons: PlayerWeaponState[];
  tokens: string[];           // token ids
  cosmetic: CosmeticChoice;
  alive: boolean;
  damageDealt: number;
  killCount: number;
  xpCollected: number;
  bombsDefused: number;
  revives: number;
  dx: number;  // facing
  dy: number;
  invulnMs: number;
  // computed stat bonuses from tokens + upgrades
  bonusDamage: number;
  bonusSpeed: number;
  bonusArea: number;
  bonusProjectiles: number;
  bonusPierce: number;
  bonusCrit: number;
  bonusPickupRange: number;
  bonusMaxHp: number;
  bonusDamageReduction: number;
  bonusLifesteal: number;
  bonusAttackSpeed: number;
  bonusXpGain: number;
}

export interface EnemyState {
  id: number;
  defId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  rank: EnemyRank;
  targetPlayerId?: string;
  abilityCooldowns?: Record<string, number>;
  stunMs: number;
  speedMult: number;       // wave modifier speed multiplier
  armor: number;           // flat damage reduction from wave modifier
}

export interface ProjectileState {
  id: number;
  ownerId: string;
  weaponId: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  damage: number;
  pierce: number;
  pierced: number;
  area: number;
  lifeMs: number;
  pattern: WeaponPattern;
  color: string;
  hitEnemies: number[];
}

export interface XpGemState {
  id: number;
  x: number;
  y: number;
  value: number;
}

export interface BombZoneState {
  id: number;
  x: number;
  y: number;
  radius: number;
  progress: number;       // 0-100
  playersInside: number;
  active: boolean;
  xpReward: number;
  timeLeftMs: number;
}

// ── Breakable Objects ───────────────────────────────────────────────

export type PickupType = "coins" | "health" | "magnet" | "speed_boost" | "damage_boost" | "bomb_charge";

export interface BreakableState {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  kind: "crate" | "barrel" | "crystal";
}

export interface PickupState {
  id: number;
  x: number;
  y: number;
  pickupType: PickupType;
  value: number;
  lifeMs: number;
}

export interface DamageNumber {
  x: number;
  y: number;
  value: number;
  crit: boolean;
  age: number;
}

export interface CosmeticChoice {
  colorOverride?: string;
  hat?: string;
  trail?: string;
}

export interface GameState {
  phase: GamePhase;
  tick: number;
  timeRemainingMs: number;
  wave: number;
  totalWaves: number;
  sharedXp: number;
  sharedLevel: number;
  xpToNext: number;
  players: PlayerState[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  xpGems: XpGemState[];
  bombZones: BombZoneState[];
  breakables: BreakableState[];
  pickups: PickupState[];
  damageNumbers: DamageNumber[];
  arenaWidth: number;
  arenaHeight: number;
  bossActive: boolean;
  waveEnemiesRemaining: number;
  postBoss: boolean;         // after wave 20 boss
  continueVotes: string[];   // player ids who voted
  hostId: string;
  waveModifier?: string;     // active wave modifier label
}

// ── Level-up offer ──────────────────────────────────────────────────

export interface LevelUpOffer {
  playerId: string;
  options: UpgradeDef[];
}

// ── Results ─────────────────────────────────────────────────────────

export interface PlayerResult {
  id: string;
  displayName: string;
  characterId: string;
  damageDealt: number;
  killCount: number;
  xpCollected: number;
  bombsDefused: number;
  revives: number;
  weaponIds: string[];
  tokenIds: string[];
  survived: boolean;
}

export interface GameResult {
  outcome: "victory" | "defeat";
  wave: number;
  timeElapsedMs: number;
  players: PlayerResult[];
  podium: string[];  // top 3 player ids by damage
}

// ── Lobby ───────────────────────────────────────────────────────────

export interface LobbyPlayer {
  id: string;
  displayName: string;
  characterId: string;
  starterWeaponId: string;
  cosmetic: CosmeticChoice;
  blacklistedWeapons: string[];
  blacklistedTokens: string[];
  ready: boolean;
}

export interface LobbyState {
  hostId: string;
  players: LobbyPlayer[];
  countdown: number;  // -1 = not started
}

// ── Network Envelopes ───────────────────────────────────────────────

export type ClientEnvelope =
  | { type: "join"; displayName: string; roomId?: string }
  | { type: "lobby_update"; characterId?: string; starterWeaponId?: string; cosmetic?: CosmeticChoice; blacklistedWeapons?: string[]; blacklistedTokens?: string[] }
  | { type: "ready"; ready: boolean }
  | { type: "start_game" }
  | { type: "input"; dx: number; dy: number }
  | { type: "pick_upgrade"; upgradeId: string }
  | { type: "vote_continue" }
  | { type: "leave" };

export type ServerEnvelope =
  | { type: "joined"; playerId: string }
  | { type: "lobby"; lobby: LobbyState }
  | { type: "state"; state: GameState }
  | { type: "level_up"; offer: LevelUpOffer }
  | { type: "ascension"; playerId: string; weaponName: string; ascendedName: string }
  | { type: "boss_warning"; bossName: string }
  | { type: "results"; result: GameResult }
  | { type: "error"; message: string };
