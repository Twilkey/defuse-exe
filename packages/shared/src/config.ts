import fs from "node:fs";
import path from "node:path";

export type GameBalanceConfig = {
  module_count_by_player: Record<string, [number, number]>;
  max_graph_edges: number;
  rule_count_by_tier: Record<string, { core: number; spice: number; deception: number }>;
  deception_rate: number;
  penalty_scale: number;
  talk_budget_seconds_by_tier: Record<string, number>;
  talk_modes_weights: Record<string, number>;
  drain_per_second: number;
  overlap_multiplier: number;
  grace_seconds: number;
  lockout_on_zero: boolean;
  stability_start: number;
  timer_seconds_by_tier: Record<string, number>;
};

export type ArchetypeConfig = {
  id: string;
  name: string;
  allowedModules: string[];
  ruleWeights: Record<string, number>;
  talkModeWeights: Record<string, number>;
  skinTheme: string;
};

export type ModuleConfig = {
  id: string;
  params: Record<string, [number, number] | string[] | number | string>;
  difficultyWeight: number;
  uiHints: string[];
  errorPenalty: number;
};

export type RuleConfig = {
  id: string;
  kind: "core" | "spice" | "deception";
  description: string;
  condition: string;
  effect: string;
  weight: number;
};

export type LoadedConfigs = {
  balance: GameBalanceConfig;
  archetypes: ArchetypeConfig[];
  modules: ModuleConfig[];
  rules: RuleConfig[];
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function listJsonFiles(dirPath: string): string[] {
  return fs.readdirSync(dirPath).filter((entry) => entry.endsWith(".json"));
}

export function loadConfigs(configRoot = path.resolve(process.cwd(), "../shared/config")): LoadedConfigs {
  const balance = readJson<GameBalanceConfig>(path.join(configRoot, "game.balance.json"));

  const archetypes = listJsonFiles(path.join(configRoot, "archetypes")).map((name) =>
    readJson<ArchetypeConfig>(path.join(configRoot, "archetypes", name))
  );

  const modules = listJsonFiles(path.join(configRoot, "modules")).map((name) =>
    readJson<ModuleConfig>(path.join(configRoot, "modules", name))
  );

  const rules = listJsonFiles(path.join(configRoot, "rules")).flatMap((name) => {
    const payload = readJson<RuleConfig | RuleConfig[]>(path.join(configRoot, "rules", name));
    return Array.isArray(payload) ? payload : [payload];
  });

  return { balance, archetypes, modules, rules };
}
