import {
  BombSpec,
  Capability,
  MatchState,
  ModuleRuntimeState,
  ModifierSpec,
  PlayerState,
  RoleBrief,
  RuleSpec,
  TalkMode
} from "../types";
import { LoadedConfigs } from "../config";
import { SeededRng } from "../rng";

const capabilityOrder: Capability[] = [
  "wire-vision",
  "dial-calibration",
  "glyph-decode",
  "stabilizer",
  "scanner",
  "buffer",
  "anchor",
  "auditor"
];

function chooseByWeight<T extends { id: string }>(rng: SeededRng, entries: Array<T & { weight?: number }>): T {
  const total = entries.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
  let cursor = rng.next() * total;
  for (const entry of entries) {
    cursor -= entry.weight ?? 1;
    if (cursor <= 0) {
      return entry;
    }
  }
  return entries[entries.length - 1];
}

function getModuleRange(playerCount: number, map: Record<string, [number, number]>): [number, number] {
  if (playerCount <= 1) return map["1"];
  if (playerCount <= 3) return map["2-3"];
  if (playerCount <= 6) return map["4-6"];
  return map["7-10"];
}

function getTierBucket(tier: number): string {
  if (tier <= 1) return "1";
  if (tier <= 2) return "2";
  return "3";
}

function randomModuleState(rng: SeededRng, moduleType: string, moduleId: string): ModuleRuntimeState {
  if (moduleType === "wires") {
    const wiresCount = rng.int(6, 12);
    const safeWire = rng.int(0, wiresCount - 1);
    const wires = Array.from({ length: wiresCount }, (_, index) => ({
      id: `${moduleId}-w-${index}`,
      color: rng.pick(["red", "blue", "yellow", "green", "white"]),
      thickness: rng.pick([1, 2, 3]),
      label: `L${rng.int(10, 99)}`,
      insulation: rng.pick(["basic", "shielded", "frayed"]),
      inspectedProperties: [] as string[],
      cut: false
    }));

    return {
      id: moduleId,
      moduleType: "wires",
      variantId: `wires-v${rng.int(1, 5)}`,
      solved: false,
      params: { wires, safeWire }
    };
  }

  if (moduleType === "dial") {
    return {
      id: moduleId,
      moduleType: "dial",
      variantId: `dial-v${rng.int(1, 4)}`,
      solved: false,
      params: {
        alphabet: rng.pick(["0-9", "A-F"]),
        value: rng.int(0, 15),
        targetMin: rng.int(0, 10),
        targetMax: rng.int(5, 15)
      }
    };
  }

  if (moduleType === "glyph") {
    const sequenceLength = rng.int(3, 5);
    const glyphs = Array.from({ length: 9 }, () => rng.pick(["Ω", "Ψ", "∆", "⊕", "✶", "☍", "⌬", "⋈", "⟁"]));
    const sequence = Array.from({ length: sequenceLength }, () => rng.int(0, 8));
    return {
      id: moduleId,
      moduleType: "glyph",
      variantId: `glyph-v${rng.int(1, 6)}`,
      solved: false,
      params: { glyphs, sequence, progress: 0 }
    };
  }

  return {
    id: moduleId,
    moduleType: "power",
    variantId: `power-v${rng.int(1, 4)}`,
    solved: false,
    params: {
      polarity: rng.pick(["POS", "NEG"]),
      targetPolarity: rng.pick(["POS", "NEG"]),
      voltage: rng.int(40, 95),
      vented: false
    }
  };
}

function buildGraph(rng: SeededRng, moduleIds: string[], maxEdges: number): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = [];
  const edgeBudget = Math.min(maxEdges, moduleIds.length + rng.int(0, moduleIds.length));
  for (let index = 0; index < edgeBudget; index += 1) {
    const fromIndex = rng.int(0, moduleIds.length - 1);
    const toIndex = rng.int(0, moduleIds.length - 1);
    if (fromIndex === toIndex || fromIndex > toIndex) continue;
    edges.push({ from: moduleIds[fromIndex], to: moduleIds[toIndex] });
  }
  return edges;
}

function chooseTalkMode(rng: SeededRng, weights: Record<string, number>): TalkMode {
  const entries = Object.entries(weights).map(([id, weight]) => ({ id, weight }));
  const selected = chooseByWeight(rng, entries);
  return selected.id as TalkMode;
}

export function assignCapabilities(players: PlayerState[]): Record<string, Capability[]> {
  const assignments: Record<string, Capability[]> = {};
  players.forEach((player) => {
    assignments[player.userId] = [];
  });

  if (players.length === 0) return assignments;

  capabilityOrder.forEach((capability, index) => {
    const player = players[index % players.length];
    assignments[player.userId].push(capability);
  });

  players.forEach((player) => {
    if (assignments[player.userId].length === 0) {
      assignments[player.userId].push(capabilityOrder[player.userId.length % capabilityOrder.length]);
    }
  });

  return assignments;
}

export function generateRoleBriefs(players: PlayerState[], bomb: BombSpec): Record<string, RoleBrief> {
  const capabilities = assignCapabilities(players);
  const names = ["Tech", "Analyst", "Operator", "Runner", "Stabilizer", "Scanner", "Anchor", "Auditor"];
  const briefs: Record<string, RoleBrief> = {};

  players.forEach((player, index) => {
    const ownedCapabilities = capabilities[player.userId];
    const privateHints: string[] = [];

    if (ownedCapabilities.includes("wire-vision")) {
      privateHints.push("Wire labels are trustworthy this round.");
    }
    if (ownedCapabilities.includes("dial-calibration")) {
      privateHints.push("Dial lock succeeds only inside safe range.");
    }
    if (ownedCapabilities.includes("glyph-decode")) {
      privateHints.push("Repeated glyphs invert the remaining sequence.");
    }
    if (ownedCapabilities.includes("stabilizer")) {
      privateHints.push("Venting grants stability at the cost of time.");
    }

    briefs[player.userId] = {
      userId: player.userId,
      roleName: names[index % names.length],
      capabilities: ownedCapabilities,
      privateHints
    };
  });

  return briefs;
}

export function generateBombSpec(seed: string, playerCount: number, tier: number, configs: LoadedConfigs): BombSpec {
  const rng = new SeededRng(seed);
  const [minModules, maxModules] = getModuleRange(playerCount, configs.balance.module_count_by_player);
  const moduleCount = rng.int(minModules, maxModules);

  const archetypeCandidates = configs.archetypes.map((archetype) => ({
    ...archetype,
    weight: archetype.ruleWeights.core ?? 1
  }));
  const archetype = chooseByWeight(rng, archetypeCandidates);

  const modules: ModuleRuntimeState[] = [];
  for (let index = 0; index < moduleCount; index += 1) {
    const moduleType = rng.pick(archetype.allowedModules);
    modules.push(randomModuleState(rng, moduleType, `m-${index + 1}`));
  }

  const graph = buildGraph(
    rng,
    modules.map((moduleState) => moduleState.id),
    configs.balance.max_graph_edges
  );

  const tierBucket = getTierBucket(tier);
  const ruleCounts = configs.balance.rule_count_by_tier[tierBucket];
  const coreRules = rng.shuffle(configs.rules.filter((rule) => rule.kind === "core")).slice(0, ruleCounts.core);
  const spiceRules = rng.shuffle(configs.rules.filter((rule) => rule.kind === "spice")).slice(0, ruleCounts.spice);
  const deceptionRules = rng
    .shuffle(configs.rules.filter((rule) => rule.kind === "deception"))
    .slice(0, ruleCounts.deception);

  const ruleStack: RuleSpec[] = [...coreRules, ...spiceRules, ...deceptionRules].map((rule) => ({
    id: rule.id,
    description: rule.description,
    kind: rule.kind,
    condition: rule.condition,
    effect: rule.effect
  }));

  const modifiers: ModifierSpec[] = [];
  if (rng.next() < configs.balance.deception_rate) {
    modifiers.push({ id: "ui-noise", description: "Minor UI delay appears for some players." });
  }
  if (rng.next() < 0.3) {
    modifiers.push({ id: "mislabel", description: "One visible hint may be fake." });
  }

  return {
    seed,
    archetypeId: archetype.id,
    difficultyTier: tier,
    playerCount,
    modules,
    graph,
    ruleStack,
    modifiers
  };
}

export function createInitialResources(playerCount: number, tier: number, configs: LoadedConfigs): MatchState["resources"] {
  const tierBucket = getTierBucket(tier);
  const timerSeconds = configs.balance.timer_seconds_by_tier[tierBucket] ?? 360;
  const talkBase = configs.balance.talk_budget_seconds_by_tier[tierBucket] ?? 90;
  const scale = playerCount <= 1 ? 0 : playerCount <= 3 ? 0.9 : playerCount <= 6 ? 1.1 : 1.5;

  return {
    timerMsRemaining: timerSeconds * 1000,
    commsSecondsRemaining: Math.max(0, Math.round(talkBase * scale)),
    stability: configs.balance.stability_start
  };
}

export function chooseTalkModeForBomb(configs: LoadedConfigs, bomb: BombSpec): TalkMode {
  const archetype = configs.archetypes.find((item) => item.id === bomb.archetypeId);
  if (!archetype) return "shared_pool";
  const rng = new SeededRng(`${bomb.seed}:talk`);
  return chooseTalkMode(rng, archetype.talkModeWeights);
}
