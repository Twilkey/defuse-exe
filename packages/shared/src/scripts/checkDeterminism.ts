import path from "node:path";
import { generateBombSpec } from "../bomb/generator";
import { loadConfigs } from "../config";

const configs = loadConfigs(path.resolve(process.cwd(), "config"));
const seeds = ["alpha", "beta", "gamma", "delta", "epsilon"];

let failed = false;

for (const seed of seeds) {
  const first = JSON.stringify(generateBombSpec(seed, 4, 2, configs));
  const second = JSON.stringify(generateBombSpec(seed, 4, 2, configs));
  if (first !== second) {
    failed = true;
    console.error(`Determinism check failed for seed ${seed}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log("Determinism check passed for all seeds.");
