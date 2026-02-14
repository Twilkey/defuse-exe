/* ─── DEFUSE.EXE — Game Data ─── */
import type {
  CharacterDef, WeaponDef, AscendedWeaponDef, TokenDef,
  EnemyDef, AscensionRecipe, UpgradeDef
} from "./types.js";

// ══════════════════════════════════════════════════════════════════════
// CHARACTERS
// ══════════════════════════════════════════════════════════════════════

export const CHARACTERS: CharacterDef[] = [
  { id: "scout",      name: "Scout",      description: "Fast recon unit with extended pickup magnet.",    baseSpeed: 140, baseHp: 80,  passive: "pickup_range", passiveDesc: "+30% pickup range",            color: "#38bdf8", accentColor: "#0ea5e9" },
  { id: "juggernaut", name: "Juggernaut", description: "Heavy armor plating absorbs punishment.",         baseSpeed: 80,  baseHp: 150, passive: "knockback",    passiveDesc: "+20% knockback",               color: "#ef4444", accentColor: "#b91c1c" },
  { id: "hacker",     name: "Hacker",     description: "Extracts bonus data from defeated targets.",      baseSpeed: 100, baseHp: 100, passive: "xp_gain",      passiveDesc: "+15% XP gain",                 color: "#a3e635", accentColor: "#65a30d" },
  { id: "medic",      name: "Medic",      description: "Nano-field heals nearby allies passively.",       baseSpeed: 95,  baseHp: 110, passive: "heal_aura",    passiveDesc: "Heals nearby allies 2 HP/s",   color: "#f472b6", accentColor: "#db2777" },
  { id: "berserker",  name: "Berserker",  description: "Damage spikes when health drops below 30%.",      baseSpeed: 120, baseHp: 90,  passive: "berserk",      passiveDesc: "+30% damage below 30% HP",     color: "#fb923c", accentColor: "#ea580c" },
  { id: "phantom",    name: "Phantom",    description: "Phase-shifts through damage periodically.",       baseSpeed: 105, baseHp: 85,  passive: "phase",        passiveDesc: "2s invuln every 15s",          color: "#c084fc", accentColor: "#9333ea" },
];

// ══════════════════════════════════════════════════════════════════════
// WEAPONS — Starters
// ══════════════════════════════════════════════════════════════════════

export const WEAPONS: WeaponDef[] = [
  // ── Starters ──
  { id: "plasma_pistol",  name: "Plasma Pistol",  description: "Reliable energy projectile.",          pattern: "projectile", starter: true,  baseDamage: 10, baseCooldownMs: 600,  baseArea: 8,   baseProjectiles: 1, basePierce: 0, baseSpeed: 12, baseDuration: 60,  baseKnockback: 2,  maxLevel: 5, color: "#38bdf8", ascendedId: "supernova_cannon",  matchingTokenId: "solar_medal" },
  { id: "energy_blade",   name: "Energy Blade",   description: "Short-range arc slash.",               pattern: "area",       starter: true,  baseDamage: 15, baseCooldownMs: 450,  baseArea: 50,  baseProjectiles: 1, basePierce: 99,baseSpeed: 0,  baseDuration: 10,  baseKnockback: 3,  maxLevel: 5, color: "#f97316", ascendedId: "void_scythe",       matchingTokenId: "shadow_medal" },
  { id: "drone_swarm",    name: "Drone Swarm",    description: "Orbiting drones damage on contact.",   pattern: "orbit",      starter: true,  baseDamage: 8,  baseCooldownMs: 200,  baseArea: 70,  baseProjectiles: 3, basePierce: 99,baseSpeed: 3,  baseDuration: 999, baseKnockback: 1,  maxLevel: 5, color: "#4ade80", ascendedId: "hivemind_swarm",    matchingTokenId: "hive_medal" },
  { id: "pulse_rifle",    name: "Pulse Rifle",    description: "Rapid-fire low-damage shots.",         pattern: "projectile", starter: true,  baseDamage: 5,  baseCooldownMs: 200,  baseArea: 6,   baseProjectiles: 1, basePierce: 0, baseSpeed: 16, baseDuration: 40,  baseKnockback: 1,  maxLevel: 5, color: "#e879f9", ascendedId: "annihilator",       matchingTokenId: "overcharge_medal" },
  { id: "flame_emitter",  name: "Flame Emitter",  description: "Cone of fire in facing direction.",    pattern: "cone",       starter: true,  baseDamage: 7,  baseCooldownMs: 150,  baseArea: 60,  baseProjectiles: 3, basePierce: 99,baseSpeed: 8,  baseDuration: 15,  baseKnockback: 1,  maxLevel: 5, color: "#fbbf24", ascendedId: "inferno_storm",     matchingTokenId: "ember_medal" },

  // ── Regular (from level-ups) ──
  { id: "railgun",           name: "Railgun",           description: "Piercing beam that punches through.",    pattern: "beam",       starter: false, baseDamage: 30, baseCooldownMs: 1200, baseArea: 10,  baseProjectiles: 1, basePierce: 5, baseSpeed: 40, baseDuration: 5,   baseKnockback: 6,  maxLevel: 5, color: "#67e8f9", ascendedId: "omega_railgun",     matchingTokenId: "precision_medal" },
  { id: "grenade_launcher",  name: "Grenade Launcher",  description: "Lobbed explosive with blast radius.",    pattern: "projectile", starter: false, baseDamage: 25, baseCooldownMs: 1400, baseArea: 70,  baseProjectiles: 1, basePierce: 0, baseSpeed: 8,  baseDuration: 50,  baseKnockback: 8,  maxLevel: 5, color: "#a3e635", ascendedId: "cluster_nuke",      matchingTokenId: "blast_medal" },
  { id: "lightning_coil",    name: "Lightning Coil",    description: "Arc chains between nearby enemies.",     pattern: "chain",      starter: false, baseDamage: 12, baseCooldownMs: 800,  baseArea: 120, baseProjectiles: 1, basePierce: 3, baseSpeed: 0,  baseDuration: 8,   baseKnockback: 2,  maxLevel: 5, color: "#c084fc", ascendedId: "storm_caller",      matchingTokenId: "storm_medal" },
  { id: "frost_ring",        name: "Frost Ring",        description: "Expanding ring of ice slows enemies.",   pattern: "ring",       starter: false, baseDamage: 8,  baseCooldownMs: 2000, baseArea: 150, baseProjectiles: 1, basePierce: 99,baseSpeed: 4,  baseDuration: 40,  baseKnockback: 0,  maxLevel: 5, color: "#22d3ee", ascendedId: "absolute_zero",     matchingTokenId: "cryo_medal" },
  { id: "toxic_sprayer",     name: "Toxic Sprayer",     description: "Leaves poison puddles on the ground.",   pattern: "ground",     starter: false, baseDamage: 6,  baseCooldownMs: 1000, baseArea: 45,  baseProjectiles: 1, basePierce: 99,baseSpeed: 0,  baseDuration: 80,  baseKnockback: 0,  maxLevel: 5, color: "#86efac", ascendedId: "plague_engine",     matchingTokenId: "blight_medal" },
  { id: "homing_rockets",    name: "Homing Rockets",    description: "Seeking missiles find nearest targets.", pattern: "homing",     starter: false, baseDamage: 18, baseCooldownMs: 900,  baseArea: 30,  baseProjectiles: 2, basePierce: 0, baseSpeed: 7,  baseDuration: 80,  baseKnockback: 4,  maxLevel: 5, color: "#fb7185" },
  { id: "boomerang_disc",    name: "Boomerang Disc",    description: "Pierces and returns to sender.",         pattern: "projectile", starter: false, baseDamage: 14, baseCooldownMs: 1100, baseArea: 12,  baseProjectiles: 1, basePierce: 4, baseSpeed: 10, baseDuration: 60,  baseKnockback: 3,  maxLevel: 5, color: "#fde68a" },
  { id: "shockwave_stamp",   name: "Shockwave Stamp",   description: "AoE blast centered on player.",         pattern: "area",       starter: false, baseDamage: 20, baseCooldownMs: 1500, baseArea: 90,  baseProjectiles: 1, basePierce: 99,baseSpeed: 0,  baseDuration: 8,   baseKnockback: 10, maxLevel: 5, color: "#fca5a5" },
  { id: "laser_drill",       name: "Laser Drill",       description: "Continuous beam to nearest enemy.",      pattern: "beam",       starter: false, baseDamage: 4,  baseCooldownMs: 100,  baseArea: 8,   baseProjectiles: 1, basePierce: 0, baseSpeed: 50, baseDuration: 3,   baseKnockback: 0,  maxLevel: 5, color: "#fcd34d" },
  { id: "mine_deployer",     name: "Mine Deployer",     description: "Drops proximity mines behind you.",      pattern: "ground",     starter: false, baseDamage: 35, baseCooldownMs: 1600, baseArea: 55,  baseProjectiles: 1, basePierce: 0, baseSpeed: 0,  baseDuration: 200, baseKnockback: 5,  maxLevel: 5, color: "#94a3b8" },
];

// ══════════════════════════════════════════════════════════════════════
// ASCENDED WEAPONS
// ══════════════════════════════════════════════════════════════════════

export const ASCENDED_WEAPONS: AscendedWeaponDef[] = [
  { id: "supernova_cannon",  name: "Supernova Cannon",  description: "Massive explosive energy spheres.",      pattern: "projectile", starter: false, baseDamage: 40,  baseCooldownMs: 500,  baseArea: 60,  baseProjectiles: 3,  basePierce: 2,  baseSpeed: 14, baseDuration: 50,  baseKnockback: 8,  maxLevel: 5, color: "#fbbf24", baseWeaponId: "plasma_pistol",    requiredTokenId: "solar_medal",      ascensionDesc: "Plasma Pistol evolves into Supernova Cannon!" },
  { id: "void_scythe",       name: "Void Scythe",       description: "Dark arc that drains life on hit.",      pattern: "area",       starter: false, baseDamage: 35,  baseCooldownMs: 350,  baseArea: 80,  baseProjectiles: 1,  basePierce: 99, baseSpeed: 0,  baseDuration: 12,  baseKnockback: 5,  maxLevel: 5, color: "#a855f7", baseWeaponId: "energy_blade",     requiredTokenId: "shadow_medal",     ascensionDesc: "Energy Blade evolves into Void Scythe!" },
  { id: "hivemind_swarm",    name: "Hivemind Swarm",    description: "Seeking drones that multiply on kill.",  pattern: "orbit",      starter: false, baseDamage: 15,  baseCooldownMs: 150,  baseArea: 120, baseProjectiles: 8,  basePierce: 99, baseSpeed: 5,  baseDuration: 999, baseKnockback: 2,  maxLevel: 5, color: "#34d399", baseWeaponId: "drone_swarm",      requiredTokenId: "hive_medal",       ascensionDesc: "Drone Swarm evolves into Hivemind Swarm!" },
  { id: "annihilator",       name: "Annihilator",       description: "Triple rapid laser streams.",            pattern: "projectile", starter: false, baseDamage: 12,  baseCooldownMs: 120,  baseArea: 8,   baseProjectiles: 3,  basePierce: 1,  baseSpeed: 20, baseDuration: 35,  baseKnockback: 2,  maxLevel: 5, color: "#f0abfc", baseWeaponId: "pulse_rifle",      requiredTokenId: "overcharge_medal", ascensionDesc: "Pulse Rifle evolves into Annihilator!" },
  { id: "inferno_storm",     name: "Inferno Storm",     description: "Perpetual fire tornado around player.",  pattern: "area",       starter: false, baseDamage: 12,  baseCooldownMs: 100,  baseArea: 110, baseProjectiles: 1,  basePierce: 99, baseSpeed: 0,  baseDuration: 999, baseKnockback: 3,  maxLevel: 5, color: "#f59e0b", baseWeaponId: "flame_emitter",    requiredTokenId: "ember_medal",      ascensionDesc: "Flame Emitter evolves into Inferno Storm!" },
  { id: "omega_railgun",     name: "Omega Railgun",     description: "Multi-beam splits on enemy hit.",        pattern: "beam",       starter: false, baseDamage: 50,  baseCooldownMs: 1000, baseArea: 14,  baseProjectiles: 3,  basePierce: 10, baseSpeed: 50, baseDuration: 6,   baseKnockback: 12, maxLevel: 5, color: "#06b6d4", baseWeaponId: "railgun",          requiredTokenId: "precision_medal",  ascensionDesc: "Railgun evolves into Omega Railgun!" },
  { id: "cluster_nuke",      name: "Cluster Nuke",      description: "Chain explosions that cascade outward.", pattern: "projectile", starter: false, baseDamage: 45,  baseCooldownMs: 1200, baseArea: 110, baseProjectiles: 3,  basePierce: 0,  baseSpeed: 8,  baseDuration: 40,  baseKnockback: 15, maxLevel: 5, color: "#84cc16", baseWeaponId: "grenade_launcher", requiredTokenId: "blast_medal",      ascensionDesc: "Grenade Launcher evolves into Cluster Nuke!" },
  { id: "storm_caller",      name: "Storm Caller",      description: "Constant lightning field around you.",   pattern: "chain",      starter: false, baseDamage: 20,  baseCooldownMs: 400,  baseArea: 180, baseProjectiles: 1,  basePierce: 6,  baseSpeed: 0,  baseDuration: 10,  baseKnockback: 4,  maxLevel: 5, color: "#d946ef", baseWeaponId: "lightning_coil",   requiredTokenId: "storm_medal",      ascensionDesc: "Lightning Coil evolves into Storm Caller!" },
  { id: "absolute_zero",     name: "Absolute Zero",     description: "Permanent slow aura + freeze chance.",   pattern: "ring",       starter: false, baseDamage: 15,  baseCooldownMs: 1500, baseArea: 200, baseProjectiles: 1,  basePierce: 99, baseSpeed: 3,  baseDuration: 60,  baseKnockback: 0,  maxLevel: 5, color: "#67e8f9", baseWeaponId: "frost_ring",       requiredTokenId: "cryo_medal",       ascensionDesc: "Frost Ring evolves into Absolute Zero!" },
  { id: "plague_engine",     name: "Plague Engine",     description: "Massive spreading poison field.",        pattern: "ground",     starter: false, baseDamage: 10,  baseCooldownMs: 600,  baseArea: 100, baseProjectiles: 3,  basePierce: 99, baseSpeed: 0,  baseDuration: 120, baseKnockback: 0,  maxLevel: 5, color: "#4ade80", baseWeaponId: "toxic_sprayer",    requiredTokenId: "blight_medal",     ascensionDesc: "Toxic Sprayer evolves into Plague Engine!" },
];

// ══════════════════════════════════════════════════════════════════════
// TOKENS / MEDALS
// ══════════════════════════════════════════════════════════════════════

export const TOKENS: TokenDef[] = [
  // Weapon-matching tokens
  { id: "solar_medal",      name: "Solar Medal",      description: "+25% fire damage.",         stat: "damage",          value: 0.25, group: false, matchingWeaponId: "plasma_pistol",    color: "#fbbf24", icon: "☀" },
  { id: "shadow_medal",     name: "Shadow Medal",     description: "+15% crit chance.",         stat: "crit",            value: 0.15, group: false, matchingWeaponId: "energy_blade",     color: "#a855f7", icon: "🌑" },
  { id: "hive_medal",       name: "Hive Medal",       description: "+2 projectiles.",           stat: "projectiles",     value: 2,    group: false, matchingWeaponId: "drone_swarm",      color: "#34d399", icon: "🐝" },
  { id: "overcharge_medal", name: "Overcharge Medal", description: "+30% attack speed.",        stat: "attackSpeed",     value: 0.30, group: false, matchingWeaponId: "pulse_rifle",      color: "#f0abfc", icon: "⚡" },
  { id: "ember_medal",      name: "Ember Medal",      description: "+40% area of effect.",      stat: "area",            value: 0.40, group: false, matchingWeaponId: "flame_emitter",    color: "#f59e0b", icon: "🔥" },
  { id: "precision_medal",  name: "Precision Medal",  description: "+3 pierce.",                stat: "pierce",          value: 3,    group: false, matchingWeaponId: "railgun",          color: "#06b6d4", icon: "🎯" },
  { id: "blast_medal",      name: "Blast Medal",      description: "+50% explosion radius.",    stat: "area",            value: 0.50, group: false, matchingWeaponId: "grenade_launcher", color: "#84cc16", icon: "💥" },
  { id: "storm_medal",      name: "Storm Medal",      description: "+2 chain targets.",         stat: "pierce",          value: 2,    group: false, matchingWeaponId: "lightning_coil",   color: "#d946ef", icon: "🌩" },
  { id: "cryo_medal",       name: "Cryo Medal",       description: "+30% slow effect.",         stat: "knockback",       value: 0.30, group: false, matchingWeaponId: "frost_ring",       color: "#67e8f9", icon: "❄" },
  { id: "blight_medal",     name: "Blight Medal",     description: "+50% effect duration.",     stat: "duration",        value: 0.50, group: false, matchingWeaponId: "toxic_sprayer",    color: "#4ade80", icon: "☠" },
  // Group / utility tokens
  { id: "titan_medal",      name: "Titan Medal",      description: "+25% max HP (group).",      stat: "maxHp",           value: 0.25, group: true,  color: "#94a3b8", icon: "🛡" },
  { id: "swift_medal",      name: "Swift Medal",      description: "+15% move speed (group).",  stat: "speed",           value: 0.15, group: true,  color: "#38bdf8", icon: "💨" },
  { id: "fortune_medal",    name: "Fortune Medal",    description: "+20% XP gain (group).",     stat: "xpGain",          value: 0.20, group: true,  color: "#fde68a", icon: "🍀" },
  { id: "barrier_medal",    name: "Barrier Medal",    description: "+20% damage reduction.",     stat: "damageReduction", value: 0.20, group: false, color: "#60a5fa", icon: "🔷" },
  { id: "vampiric_medal",   name: "Vampiric Medal",   description: "+5% life steal.",           stat: "lifesteal",       value: 0.05, group: false, color: "#dc2626", icon: "🩸" },
];

// ══════════════════════════════════════════════════════════════════════
// ASCENSION RECIPES
// ══════════════════════════════════════════════════════════════════════

export const ASCENSION_RECIPES: AscensionRecipe[] = [
  { weaponId: "plasma_pistol",    tokenId: "solar_medal",      ascendedWeaponId: "supernova_cannon", requiredWeaponLevel: 5 },
  { weaponId: "energy_blade",     tokenId: "shadow_medal",     ascendedWeaponId: "void_scythe",      requiredWeaponLevel: 5 },
  { weaponId: "drone_swarm",      tokenId: "hive_medal",       ascendedWeaponId: "hivemind_swarm",   requiredWeaponLevel: 5 },
  { weaponId: "pulse_rifle",      tokenId: "overcharge_medal", ascendedWeaponId: "annihilator",      requiredWeaponLevel: 5 },
  { weaponId: "flame_emitter",    tokenId: "ember_medal",      ascendedWeaponId: "inferno_storm",    requiredWeaponLevel: 5 },
  { weaponId: "railgun",          tokenId: "precision_medal",  ascendedWeaponId: "omega_railgun",    requiredWeaponLevel: 5 },
  { weaponId: "grenade_launcher", tokenId: "blast_medal",      ascendedWeaponId: "cluster_nuke",     requiredWeaponLevel: 5 },
  { weaponId: "lightning_coil",   tokenId: "storm_medal",      ascendedWeaponId: "storm_caller",     requiredWeaponLevel: 5 },
  { weaponId: "frost_ring",       tokenId: "cryo_medal",       ascendedWeaponId: "absolute_zero",    requiredWeaponLevel: 5 },
  { weaponId: "toxic_sprayer",    tokenId: "blight_medal",     ascendedWeaponId: "plague_engine",    requiredWeaponLevel: 5 },
];

// ══════════════════════════════════════════════════════════════════════
// ENEMIES
// ══════════════════════════════════════════════════════════════════════

export const ENEMIES: EnemyDef[] = [
  // Melee
  { id: "crawler",     name: "Crawler",       enemyClass: "melee",  baseHp: 15,  baseDamage: 8,   baseSpeed: 1.6, xpValue: 2,   size: 12, color: "#ef4444", shape: "circle",   spawnWeight: 10, minWave: 1 },
  { id: "charger",     name: "Charger",       enemyClass: "melee",  baseHp: 20,  baseDamage: 12,  baseSpeed: 3.5, xpValue: 4,   size: 14, color: "#f97316", shape: "triangle", spawnWeight: 6,  minWave: 3 },
  { id: "brute",       name: "Brute",         enemyClass: "melee",  baseHp: 60,  baseDamage: 20,  baseSpeed: 1.0, xpValue: 8,   size: 22, color: "#991b1b", shape: "circle",   spawnWeight: 3,  minWave: 5 },
  { id: "swarmer",     name: "Swarmer",       enemyClass: "melee",  baseHp: 5,   baseDamage: 3,   baseSpeed: 3.0, xpValue: 1,   size: 7,  color: "#fda4af", shape: "circle",   spawnWeight: 15, minWave: 2 },
  // Ranged
  { id: "spitter",     name: "Spitter",       enemyClass: "ranged", baseHp: 12,  baseDamage: 10,  baseSpeed: 1.2, xpValue: 3,   size: 13, color: "#22c55e", shape: "diamond",  spawnWeight: 5,  minWave: 2 },
  { id: "sniper",      name: "Sniper",        enemyClass: "ranged", baseHp: 10,  baseDamage: 18,  baseSpeed: 0.8, xpValue: 5,   size: 11, color: "#a855f7", shape: "diamond",  spawnWeight: 3,  minWave: 6 },
  { id: "turret",      name: "Turret",        enemyClass: "ranged", baseHp: 35,  baseDamage: 6,   baseSpeed: 0.0, xpValue: 6,   size: 16, color: "#6b7280", shape: "square",   spawnWeight: 2,  minWave: 8 },
  // Casters
  { id: "warper",      name: "Warper",        enemyClass: "caster", baseHp: 18,  baseDamage: 14,  baseSpeed: 1.4, xpValue: 5,   size: 14, color: "#3b82f6", shape: "hexagon",  spawnWeight: 3,  minWave: 7 },
  { id: "necromancer", name: "Necromancer",   enemyClass: "caster", baseHp: 25,  baseDamage: 5,   baseSpeed: 0.9, xpValue: 8,   size: 16, color: "#581c87", shape: "hexagon",  spawnWeight: 2,  minWave: 9,  abilities: ["summon"] },
  { id: "shaman",      name: "Shaman",        enemyClass: "caster", baseHp: 20,  baseDamage: 8,   baseSpeed: 1.1, xpValue: 6,   size: 14, color: "#14b8a6", shape: "diamond",  spawnWeight: 2,  minWave: 10, abilities: ["buff_aura"] },
  // Mini-bosses
  { id: "siege_titan", name: "Siege Titan",   enemyClass: "melee",  baseHp: 300, baseDamage: 25,  baseSpeed: 0.7, xpValue: 80,  size: 30, color: "#b91c1c", shape: "circle",   spawnWeight: 0,  minWave: 10, abilities: ["ground_slam", "charge", "summon_minions"] },
  { id: "storm_witch", name: "Storm Witch",   enemyClass: "caster", baseHp: 200, baseDamage: 18,  baseSpeed: 1.5, xpValue: 80,  size: 26, color: "#7c3aed", shape: "hexagon",  spawnWeight: 0,  minWave: 10, abilities: ["spread_shot", "vortex", "teleport"] },
  { id: "hive_queen",  name: "Hive Queen",    enemyClass: "caster", baseHp: 250, baseDamage: 12,  baseSpeed: 0.8, xpValue: 80,  size: 28, color: "#15803d", shape: "hexagon",  spawnWeight: 0,  minWave: 10, abilities: ["spawn_swarm", "poison_aura"] },
  // Bosses
  { id: "detonator",   name: "The Detonator", enemyClass: "melee",  baseHp: 2000,baseDamage: 30,  baseSpeed: 0.6, xpValue: 500, size: 50, color: "#dc2626", shape: "circle",   spawnWeight: 0,  minWave: 20, abilities: ["carpet_bomb", "laser_sweep", "spawn_turrets", "enrage"] },
  { id: "void_archon", name: "Void Archon",   enemyClass: "caster", baseHp: 2500,baseDamage: 28,  baseSpeed: 1.0, xpValue: 600, size: 48, color: "#6d28d9", shape: "hexagon",  spawnWeight: 0,  minWave: 20, abilities: ["gravity_well", "clone_split", "dark_nova", "teleport"] },
];

export const MINIBOSS_IDS = ["siege_titan", "storm_witch", "hive_queen"];
export const BOSS_IDS = ["detonator", "void_archon"];

// ══════════════════════════════════════════════════════════════════════
// UPGRADES
// ══════════════════════════════════════════════════════════════════════

export const PLAYER_UPGRADES: UpgradeDef[] = [
  { id: "dmg_10",         kind: "player_stat", name: "+10% Damage",         description: "All weapons deal 10% more damage.",      stat: "damage",      value: 0.10, group: false },
  { id: "aspd_10",        kind: "player_stat", name: "+10% Attack Speed",   description: "All weapons fire 10% faster.",            stat: "attackSpeed", value: 0.10, group: false },
  { id: "area_20",        kind: "player_stat", name: "+20% Area",           description: "All weapon areas grow by 20%.",            stat: "area",        value: 0.20, group: false },
  { id: "spd_10",         kind: "player_stat", name: "+10% Move Speed",     description: "Move 10% faster.",                         stat: "speed",       value: 0.10, group: false },
  { id: "proj_1",         kind: "player_stat", name: "+1 Projectile",       description: "Projectile weapons fire one more.",        stat: "projectiles", value: 1,    group: false },
  { id: "pierce_1",       kind: "player_stat", name: "+1 Pierce",           description: "Projectiles pierce one more enemy.",       stat: "pierce",      value: 1,    group: false },
  { id: "hp_20",          kind: "player_stat", name: "+20 Max HP",          description: "Increase maximum health by 20.",           stat: "maxHp",       value: 20,   group: false },
  { id: "crit_5",         kind: "player_stat", name: "+5% Crit Chance",     description: "Hits have 5% more crit chance.",           stat: "crit",        value: 0.05, group: false },
  { id: "pickup_30",      kind: "player_stat", name: "+30% Pickup Range",   description: "XP gems are attracted from further.",      stat: "pickupRange", value: 0.30, group: false },
  { id: "dr_5",           kind: "player_stat", name: "+5% Damage Reduction",description: "Take 5% less damage from all sources.",    stat: "damageReduction", value: 0.05, group: false },
  { id: "lifesteal_3",    kind: "player_stat", name: "+3% Life Steal",      description: "Heal 3% of damage dealt.",                 stat: "lifesteal",   value: 0.03, group: false },
];

export const GROUP_UPGRADES: UpgradeDef[] = [
  { id: "g_dmg_5",   kind: "group_stat", name: "Team +5% Damage",     description: "All allies deal 5% more damage.",    stat: "damage",      value: 0.05, group: true },
  { id: "g_spd_5",   kind: "group_stat", name: "Team +5% Speed",      description: "All allies move 5% faster.",         stat: "speed",       value: 0.05, group: true },
  { id: "g_hp_10",   kind: "group_stat", name: "Team +10 Max HP",     description: "All allies gain 10 max HP.",         stat: "maxHp",       value: 10,   group: true },
  { id: "g_dr_3",    kind: "group_stat", name: "Team +3% DR",         description: "All allies take 3% less damage.",    stat: "damageReduction", value: 0.03, group: true },
  { id: "g_pickup_15", kind: "group_stat", name: "Team +15% Pickup",  description: "All allies pickup range +15%.",      stat: "pickupRange", value: 0.15, group: true },
  { id: "g_xp_10",   kind: "group_stat", name: "Team +10% XP Gain",   description: "All XP collected boosted by 10%.",   stat: "xpGain",      value: 0.10, group: true },
];

// ══════════════════════════════════════════════════════════════════════
// COSMETICS
// ══════════════════════════════════════════════════════════════════════

export const HATS = ["none", "halo", "crown", "horns", "antenna", "tophat"] as const;
export const TRAILS = ["none", "spark", "flame", "ice", "shadow", "rainbow"] as const;
export const COLOR_OVERRIDES = [
  "", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#14b8a6", "#a3e635"
] as const;

// ══════════════════════════════════════════════════════════════════════
// Helper lookups
// ══════════════════════════════════════════════════════════════════════

const _allWeapons = [...WEAPONS, ...ASCENDED_WEAPONS];
const _weaponMap = new Map(_allWeapons.map(w => [w.id, w]));
const _tokenMap = new Map(TOKENS.map(t => [t.id, t]));
const _charMap = new Map(CHARACTERS.map(c => [c.id, c]));
const _enemyMap = new Map(ENEMIES.map(e => [e.id, e]));

export function getWeapon(id: string): WeaponDef | undefined { return _weaponMap.get(id); }
export function getToken(id: string): TokenDef | undefined { return _tokenMap.get(id); }
export function getCharacter(id: string): CharacterDef | undefined { return _charMap.get(id); }
export function getEnemy(id: string): EnemyDef | undefined { return _enemyMap.get(id); }
export function getStarterWeapons(): WeaponDef[] { return WEAPONS.filter(w => w.starter); }
export function getNonStarterWeapons(): WeaponDef[] { return WEAPONS.filter(w => !w.starter); }
