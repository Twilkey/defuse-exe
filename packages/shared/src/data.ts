/* ─── DEFUSE.EXE — Game Data ─── */
import type {
  CharacterDef, WeaponDef, AscendedWeaponDef, TokenDef,
  EnemyDef, AscensionRecipe, UpgradeDef
} from "./types.js";

// ══════════════════════════════════════════════════════════════════════
// CHARACTERS
// ══════════════════════════════════════════════════════════════════════

export const CHARACTERS: CharacterDef[] = [
  { id: "scout",      name: "Dasher",     description: "Nimble stick figure with a wide grab range.",     baseSpeed: 140, baseHp: 80,  passive: "pickup_range", passiveDesc: "+30% pickup range",            color: "#38bdf8", accentColor: "#0ea5e9", visual: "male" },
  { id: "juggernaut", name: "Tank",       description: "Thick-lined stick figure that soaks up damage.",  baseSpeed: 80,  baseHp: 150, passive: "knockback",    passiveDesc: "+20% knockback",               color: "#ef4444", accentColor: "#b91c1c", visual: "male" },
  { id: "hacker",     name: "Brainiac",   description: "Clever stick figure that extracts bonus XP.",     baseSpeed: 100, baseHp: 100, passive: "xp_gain",      passiveDesc: "+15% XP gain",                 color: "#a3e635", accentColor: "#65a30d", visual: "female" },
  { id: "medic",      name: "Doc",        description: "Stick figure medic who heals nearby allies.",     baseSpeed: 95,  baseHp: 110, passive: "heal_aura",    passiveDesc: "Heals nearby allies 2 HP/s",   color: "#f472b6", accentColor: "#db2777", visual: "female" },
  { id: "berserker",  name: "Rager",      description: "Scribbled stick figure that rages when hurt.",    baseSpeed: 120, baseHp: 90,  passive: "berserk",      passiveDesc: "+30% damage below 30% HP",     color: "#fb923c", accentColor: "#ea580c", visual: "cat" },
  { id: "phantom",    name: "Ghost",      description: "Faint stick figure that phases through damage.",  baseSpeed: 105, baseHp: 85,  passive: "phase",        passiveDesc: "2s invuln every 15s",          color: "#c084fc", accentColor: "#9333ea", visual: "ghost_player" },
];

// ══════════════════════════════════════════════════════════════════════
// WEAPONS — Starters
// ══════════════════════════════════════════════════════════════════════

export const WEAPONS: WeaponDef[] = [
  // ── Starters ──
  { id: "plasma_pistol",  name: "Pencil Toss",    description: "Throws sharp pencil projectiles.",     pattern: "projectile", starter: true,  baseDamage: 10, baseCooldownMs: 600,  baseArea: 8,   baseProjectiles: 1, basePierce: 0, baseSpeed: 12, baseDuration: 60,  baseKnockback: 2,  maxLevel: 5, color: "#38bdf8", ascendedId: "supernova_cannon",  matchingTokenId: "solar_medal" },
  { id: "energy_blade",   name: "Eraser Slash",   description: "Wide erasing arc at close range.",     pattern: "area",       starter: true,  baseDamage: 15, baseCooldownMs: 450,  baseArea: 50,  baseProjectiles: 1, basePierce: 99,baseSpeed: 0,  baseDuration: 10,  baseKnockback: 3,  maxLevel: 5, color: "#f97316", ascendedId: "void_scythe",       matchingTokenId: "shadow_medal" },
  { id: "drone_swarm",    name: "Paper Planes",   description: "Orbiting paper planes deal contact damage.", pattern: "orbit",  starter: true,  baseDamage: 8,  baseCooldownMs: 200,  baseArea: 70,  baseProjectiles: 3, basePierce: 99,baseSpeed: 3,  baseDuration: 999, baseKnockback: 1,  maxLevel: 5, color: "#4ade80", ascendedId: "hivemind_swarm",    matchingTokenId: "hive_medal" },
  { id: "pulse_rifle",    name: "Pen Shooter",    description: "Rapid-fire pen ink shots.",             pattern: "projectile", starter: true,  baseDamage: 5,  baseCooldownMs: 200,  baseArea: 6,   baseProjectiles: 1, basePierce: 0, baseSpeed: 16, baseDuration: 40,  baseKnockback: 1,  maxLevel: 5, color: "#e879f9", ascendedId: "annihilator",       matchingTokenId: "overcharge_medal" },
  { id: "flame_emitter",  name: "Crayon Blast",   description: "Cone of colorful crayon streaks.",      pattern: "cone",       starter: true,  baseDamage: 7,  baseCooldownMs: 150,  baseArea: 60,  baseProjectiles: 3, basePierce: 99,baseSpeed: 8,  baseDuration: 15,  baseKnockback: 1,  maxLevel: 5, color: "#fbbf24", ascendedId: "inferno_storm",     matchingTokenId: "ember_medal" },

  // ── Regular (from level-ups) ──
  { id: "railgun",           name: "Ruler Beam",        description: "Piercing ruler beam punches through.",   pattern: "beam",       starter: false, baseDamage: 30, baseCooldownMs: 1200, baseArea: 10,  baseProjectiles: 1, basePierce: 5, baseSpeed: 40, baseDuration: 5,   baseKnockback: 6,  maxLevel: 5, color: "#67e8f9", ascendedId: "omega_railgun",     matchingTokenId: "precision_medal" },
  { id: "grenade_launcher",  name: "Ink Bomb",          description: "Lobbed ink blob that splatters.",        pattern: "projectile", starter: false, baseDamage: 25, baseCooldownMs: 1400, baseArea: 70,  baseProjectiles: 1, basePierce: 0, baseSpeed: 8,  baseDuration: 50,  baseKnockback: 8,  maxLevel: 5, color: "#a3e635", ascendedId: "cluster_nuke",      matchingTokenId: "blast_medal" },
  { id: "lightning_coil",    name: "Staple Chain",      description: "Staples chain between nearby enemies.",  pattern: "chain",      starter: false, baseDamage: 12, baseCooldownMs: 800,  baseArea: 120, baseProjectiles: 1, basePierce: 3, baseSpeed: 0,  baseDuration: 8,   baseKnockback: 2,  maxLevel: 5, color: "#c084fc", ascendedId: "storm_caller",      matchingTokenId: "storm_medal" },
  { id: "frost_ring",        name: "Whiteout Ring",     description: "Expanding ring of correction fluid.",   pattern: "ring",       starter: false, baseDamage: 8,  baseCooldownMs: 2000, baseArea: 150, baseProjectiles: 1, basePierce: 99,baseSpeed: 4,  baseDuration: 40,  baseKnockback: 0,  maxLevel: 5, color: "#22d3ee", ascendedId: "absolute_zero",     matchingTokenId: "cryo_medal" },
  { id: "toxic_sprayer",     name: "Glue Puddle",       description: "Leaves sticky glue on the ground.",      pattern: "ground",     starter: false, baseDamage: 6,  baseCooldownMs: 1000, baseArea: 45,  baseProjectiles: 1, basePierce: 99,baseSpeed: 0,  baseDuration: 80,  baseKnockback: 0,  maxLevel: 5, color: "#86efac", ascendedId: "plague_engine",     matchingTokenId: "blight_medal" },
  { id: "homing_rockets",    name: "Dart Seekers",      description: "Homing darts find nearest targets.",     pattern: "homing",     starter: false, baseDamage: 18, baseCooldownMs: 900,  baseArea: 30,  baseProjectiles: 2, basePierce: 0, baseSpeed: 7,  baseDuration: 80,  baseKnockback: 4,  maxLevel: 5, color: "#fb7185" },
  { id: "boomerang_disc",    name: "Compass Spin",      description: "Spinning compass that returns.",         pattern: "projectile", starter: false, baseDamage: 14, baseCooldownMs: 1100, baseArea: 12,  baseProjectiles: 1, basePierce: 4, baseSpeed: 10, baseDuration: 60,  baseKnockback: 3,  maxLevel: 5, color: "#fde68a" },
  { id: "shockwave_stamp",   name: "Stamp Slam",        description: "AoE stamp blast centered on you.",       pattern: "area",       starter: false, baseDamage: 20, baseCooldownMs: 1500, baseArea: 90,  baseProjectiles: 1, basePierce: 99,baseSpeed: 0,  baseDuration: 8,   baseKnockback: 10, maxLevel: 5, color: "#fca5a5" },
  { id: "laser_drill",       name: "Highlighter",       description: "Continuous highlight beam to nearest.",  pattern: "beam",       starter: false, baseDamage: 4,  baseCooldownMs: 100,  baseArea: 8,   baseProjectiles: 1, basePierce: 0, baseSpeed: 50, baseDuration: 3,   baseKnockback: 0,  maxLevel: 5, color: "#fcd34d" },
  { id: "mine_deployer",     name: "Tack Trap",         description: "Drops thumbtack mines behind you.",      pattern: "ground",     starter: false, baseDamage: 35, baseCooldownMs: 1600, baseArea: 55,  baseProjectiles: 1, basePierce: 0, baseSpeed: 0,  baseDuration: 200, baseKnockback: 5,  maxLevel: 5, color: "#94a3b8" },
];

// ══════════════════════════════════════════════════════════════════════
// ASCENDED WEAPONS
// ══════════════════════════════════════════════════════════════════════

export const ASCENDED_WEAPONS: AscendedWeaponDef[] = [
  { id: "supernova_cannon",  name: "Golden Pencil",     description: "Massive gilded pencil projectiles.",     pattern: "projectile", starter: false, baseDamage: 40,  baseCooldownMs: 500,  baseArea: 60,  baseProjectiles: 3,  basePierce: 2,  baseSpeed: 14, baseDuration: 50,  baseKnockback: 8,  maxLevel: 5, color: "#fbbf24", baseWeaponId: "plasma_pistol",    requiredTokenId: "solar_medal",      ascensionDesc: "Pencil Toss evolves into Golden Pencil!" },
  { id: "void_scythe",       name: "Sharpener Blade",   description: "Dark sharpener arc that drains ink.",    pattern: "area",       starter: false, baseDamage: 35,  baseCooldownMs: 350,  baseArea: 80,  baseProjectiles: 1,  basePierce: 99, baseSpeed: 0,  baseDuration: 12,  baseKnockback: 5,  maxLevel: 5, color: "#a855f7", baseWeaponId: "energy_blade",     requiredTokenId: "shadow_medal",     ascensionDesc: "Eraser Slash evolves into Sharpener Blade!" },
  { id: "hivemind_swarm",    name: "Origami Fleet",     description: "Seeking origami that multiplies on kill.", pattern: "orbit",    starter: false, baseDamage: 15,  baseCooldownMs: 150,  baseArea: 120, baseProjectiles: 8,  basePierce: 99, baseSpeed: 5,  baseDuration: 999, baseKnockback: 2,  maxLevel: 5, color: "#34d399", baseWeaponId: "drone_swarm",      requiredTokenId: "hive_medal",       ascensionDesc: "Paper Planes evolves into Origami Fleet!" },
  { id: "annihilator",       name: "Fountain Pen",      description: "Triple rapid ink streams.",              pattern: "projectile", starter: false, baseDamage: 12,  baseCooldownMs: 120,  baseArea: 8,   baseProjectiles: 3,  basePierce: 1,  baseSpeed: 20, baseDuration: 35,  baseKnockback: 2,  maxLevel: 5, color: "#f0abfc", baseWeaponId: "pulse_rifle",      requiredTokenId: "overcharge_medal", ascensionDesc: "Pen Shooter evolves into Fountain Pen!" },
  { id: "inferno_storm",     name: "Rainbow Storm",     description: "Perpetual crayon tornado around you.",   pattern: "area",       starter: false, baseDamage: 12,  baseCooldownMs: 100,  baseArea: 110, baseProjectiles: 1,  basePierce: 99, baseSpeed: 0,  baseDuration: 999, baseKnockback: 3,  maxLevel: 5, color: "#f59e0b", baseWeaponId: "flame_emitter",    requiredTokenId: "ember_medal",      ascensionDesc: "Crayon Blast evolves into Rainbow Storm!" },
  { id: "omega_railgun",     name: "Yard Stick",        description: "Multi-beam ruler splits on hit.",        pattern: "beam",       starter: false, baseDamage: 50,  baseCooldownMs: 1000, baseArea: 14,  baseProjectiles: 3,  basePierce: 10, baseSpeed: 50, baseDuration: 6,   baseKnockback: 12, maxLevel: 5, color: "#06b6d4", baseWeaponId: "railgun",          requiredTokenId: "precision_medal",  ascensionDesc: "Ruler Beam evolves into Yard Stick!" },
  { id: "cluster_nuke",      name: "Paint Bomb",        description: "Chain paint explosions cascade out.",    pattern: "projectile", starter: false, baseDamage: 45,  baseCooldownMs: 1200, baseArea: 110, baseProjectiles: 3,  basePierce: 0,  baseSpeed: 8,  baseDuration: 40,  baseKnockback: 15, maxLevel: 5, color: "#84cc16", baseWeaponId: "grenade_launcher", requiredTokenId: "blast_medal",      ascensionDesc: "Ink Bomb evolves into Paint Bomb!" },
  { id: "storm_caller",      name: "Staple Storm",      description: "Constant staple field around you.",      pattern: "chain",      starter: false, baseDamage: 20,  baseCooldownMs: 400,  baseArea: 180, baseProjectiles: 1,  basePierce: 6,  baseSpeed: 0,  baseDuration: 10,  baseKnockback: 4,  maxLevel: 5, color: "#d946ef", baseWeaponId: "lightning_coil",   requiredTokenId: "storm_medal",      ascensionDesc: "Staple Chain evolves into Staple Storm!" },
  { id: "absolute_zero",     name: "Liquid Paper",      description: "Permanent whiteout aura + freeze.",      pattern: "ring",       starter: false, baseDamage: 15,  baseCooldownMs: 1500, baseArea: 200, baseProjectiles: 1,  basePierce: 99, baseSpeed: 3,  baseDuration: 60,  baseKnockback: 0,  maxLevel: 5, color: "#67e8f9", baseWeaponId: "frost_ring",       requiredTokenId: "cryo_medal",       ascensionDesc: "Whiteout Ring evolves into Liquid Paper!" },
  { id: "plague_engine",     name: "Super Glue",        description: "Massive spreading glue field.",          pattern: "ground",     starter: false, baseDamage: 10,  baseCooldownMs: 600,  baseArea: 100, baseProjectiles: 3,  basePierce: 99, baseSpeed: 0,  baseDuration: 120, baseKnockback: 0,  maxLevel: 5, color: "#4ade80", baseWeaponId: "toxic_sprayer",    requiredTokenId: "blight_medal",     ascensionDesc: "Glue Puddle evolves into Super Glue!" },
];

// ══════════════════════════════════════════════════════════════════════
// TOKENS / MEDALS
// ══════════════════════════════════════════════════════════════════════

export const TOKENS: TokenDef[] = [
  // Weapon-matching tokens
  { id: "solar_medal",      name: "Pencil Badge",     description: "+25% pencil damage.",       stat: "damage",          value: 0.25, group: false, matchingWeaponId: "plasma_pistol",    color: "#fbbf24", icon: "✏" },
  { id: "shadow_medal",     name: "Eraser Badge",     description: "+15% crit chance.",         stat: "crit",            value: 0.15, group: false, matchingWeaponId: "energy_blade",     color: "#a855f7", icon: "◼" },
  { id: "hive_medal",       name: "Paper Badge",      description: "+2 projectiles.",           stat: "projectiles",     value: 2,    group: false, matchingWeaponId: "drone_swarm",      color: "#34d399", icon: "✈" },
  { id: "overcharge_medal", name: "Pen Badge",        description: "+30% attack speed.",        stat: "attackSpeed",     value: 0.30, group: false, matchingWeaponId: "pulse_rifle",      color: "#f0abfc", icon: "🖊" },
  { id: "ember_medal",      name: "Crayon Badge",     description: "+40% area of effect.",      stat: "area",            value: 0.40, group: false, matchingWeaponId: "flame_emitter",    color: "#f59e0b", icon: "🖍" },
  { id: "precision_medal",  name: "Ruler Badge",      description: "+3 pierce.",                stat: "pierce",          value: 3,    group: false, matchingWeaponId: "railgun",          color: "#06b6d4", icon: "📏" },
  { id: "blast_medal",      name: "Ink Badge",        description: "+50% splatter radius.",     stat: "area",            value: 0.50, group: false, matchingWeaponId: "grenade_launcher", color: "#84cc16", icon: "💧" },
  { id: "storm_medal",      name: "Staple Badge",     description: "+2 chain targets.",         stat: "pierce",          value: 2,    group: false, matchingWeaponId: "lightning_coil",   color: "#d946ef", icon: "📎" },
  { id: "cryo_medal",       name: "Whiteout Badge",   description: "+30% slow effect.",         stat: "knockback",       value: 0.30, group: false, matchingWeaponId: "frost_ring",       color: "#67e8f9", icon: "⬜" },
  { id: "blight_medal",     name: "Glue Badge",       description: "+50% effect duration.",     stat: "duration",        value: 0.50, group: false, matchingWeaponId: "toxic_sprayer",    color: "#4ade80", icon: "🧴" },
  // Group / utility tokens
  { id: "titan_medal",      name: "Notebook Badge",   description: "+25% max HP (group).",      stat: "maxHp",           value: 0.25, group: true,  color: "#94a3b8", icon: "📓" },
  { id: "swift_medal",      name: "Sneaker Badge",    description: "+15% move speed (group).",  stat: "speed",           value: 0.15, group: true,  color: "#38bdf8", icon: "💨" },
  { id: "fortune_medal",    name: "Star Sticker",     description: "+20% XP gain (group).",     stat: "xpGain",          value: 0.20, group: true,  color: "#fde68a", icon: "⭐" },
  { id: "barrier_medal",    name: "Binder Shield",    description: "+20% damage reduction.",     stat: "damageReduction", value: 0.20, group: false, color: "#60a5fa", icon: "📕" },
  { id: "vampiric_medal",   name: "Red Pen Badge",    description: "+5% life steal.",           stat: "lifesteal",       value: 0.05, group: false, color: "#dc2626", icon: "❤" },
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
  { id: "crawler",     name: "Scribble",        enemyClass: "melee",  baseHp: 15,  baseDamage: 8,   baseSpeed: 3.2, xpValue: 2,   size: 12, color: "#ef4444", shape: "circle",   visual: "male",   spawnWeight: 10, minWave: 1 },
  { id: "charger",     name: "Doodle Bull",     enemyClass: "melee",  baseHp: 20,  baseDamage: 12,  baseSpeed: 5.5, xpValue: 4,   size: 14, color: "#f97316", shape: "triangle", visual: "beast",  spawnWeight: 6,  minWave: 3 },
  { id: "brute",       name: "Ink Blob",        enemyClass: "melee",  baseHp: 60,  baseDamage: 20,  baseSpeed: 2.2, xpValue: 8,   size: 22, color: "#991b1b", shape: "circle",   visual: "slime",  spawnWeight: 3,  minWave: 5 },
  { id: "swarmer",     name: "Dot",             enemyClass: "melee",  baseHp: 5,   baseDamage: 3,   baseSpeed: 5.0, xpValue: 1,   size: 7,  color: "#fda4af", shape: "circle",   visual: "spider", spawnWeight: 15, minWave: 2 },
  // Ranged
  { id: "spitter",     name: "Sketch Archer",   enemyClass: "ranged", baseHp: 12,  baseDamage: 10,  baseSpeed: 2.6, xpValue: 3,   size: 13, color: "#22c55e", shape: "diamond",  visual: "female", spawnWeight: 5,  minWave: 2 },
  { id: "sniper",      name: "Fine Liner",      enemyClass: "ranged", baseHp: 10,  baseDamage: 18,  baseSpeed: 2.0, xpValue: 5,   size: 11, color: "#a855f7", shape: "diamond",  visual: "bird",   spawnWeight: 3,  minWave: 6 },
  { id: "turret",      name: "Pencil Tower",    enemyClass: "ranged", baseHp: 35,  baseDamage: 6,   baseSpeed: 0.0, xpValue: 6,   size: 16, color: "#6b7280", shape: "square",   visual: "robot",  spawnWeight: 2,  minWave: 8 },
  // Casters
  { id: "warper",      name: "Smudge",          enemyClass: "caster", baseHp: 18,  baseDamage: 14,  baseSpeed: 2.8, xpValue: 5,   size: 14, color: "#3b82f6", shape: "hexagon",  visual: "ghost",  spawnWeight: 3,  minWave: 7 },
  { id: "necromancer", name: "Dark Pen",        enemyClass: "caster", baseHp: 25,  baseDamage: 5,   baseSpeed: 2.0, xpValue: 8,   size: 16, color: "#581c87", shape: "hexagon",  visual: "demon",  spawnWeight: 2,  minWave: 9,  abilities: ["summon"] },
  { id: "shaman",      name: "Marker Spirit",   enemyClass: "caster", baseHp: 20,  baseDamage: 8,   baseSpeed: 2.2, xpValue: 6,   size: 14, color: "#14b8a6", shape: "diamond",  visual: "snake",  spawnWeight: 2,  minWave: 10, abilities: ["buff_aura"] },
  // Mini-bosses
  { id: "siege_titan", name: "Giant Doodle",    enemyClass: "melee",  baseHp: 300, baseDamage: 25,  baseSpeed: 1.4, xpValue: 80,  size: 30, color: "#b91c1c", shape: "circle",   visual: "demon",  spawnWeight: 0,  minWave: 10, abilities: ["ground_slam", "charge", "summon_minions"] },
  { id: "storm_witch", name: "Chaos Scribble",  enemyClass: "caster", baseHp: 200, baseDamage: 18,  baseSpeed: 2.6, xpValue: 80,  size: 26, color: "#7c3aed", shape: "hexagon",  visual: "female", spawnWeight: 0,  minWave: 10, abilities: ["spread_shot", "vortex", "teleport"] },
  { id: "hive_queen",  name: "Ink Mother",      enemyClass: "caster", baseHp: 250, baseDamage: 12,  baseSpeed: 1.8, xpValue: 80,  size: 28, color: "#15803d", shape: "hexagon",  visual: "spider", spawnWeight: 0,  minWave: 10, abilities: ["spawn_swarm", "poison_aura"] },
  // Bosses
  { id: "detonator",   name: "The Eraser",      enemyClass: "melee",  baseHp: 2000,baseDamage: 30,  baseSpeed: 1.3, xpValue: 500, size: 50, color: "#dc2626", shape: "circle",   visual: "demon",  spawnWeight: 0,  minWave: 20, abilities: ["carpet_bomb", "laser_sweep", "spawn_turrets", "enrage"] },
  { id: "void_archon", name: "The Shredder",    enemyClass: "caster", baseHp: 2500,baseDamage: 28,  baseSpeed: 1.8, xpValue: 600, size: 48, color: "#6d28d9", shape: "hexagon",  visual: "ghost",  spawnWeight: 0,  minWave: 20, abilities: ["gravity_well", "clone_split", "dark_nova", "teleport"] },
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
