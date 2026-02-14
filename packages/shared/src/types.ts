import { z } from "zod";

export const moduleTypeSchema = z.enum(["wires", "dial", "glyph", "power", "conduit", "memory", "switches", "reactor"]);
export type ModuleType = z.infer<typeof moduleTypeSchema>;

export const capabilitySchema = z.enum([
  "wire-vision",
  "dial-calibration",
  "glyph-decode",
  "stabilizer",
  "scanner",
  "buffer",
  "anchor",
  "auditor"
]);
export type Capability = z.infer<typeof capabilitySchema>;

export const talkModeSchema = z.enum([
  "shared_pool",
  "tokenized_burst",
  "silence_windows",
  "one_speaker_rule"
]);
export type TalkMode = z.infer<typeof talkModeSchema>;

export type RoleBrief = {
  userId: string;
  roleName: string;
  capabilities: Capability[];
  privateHints: string[];
};

export type WireData = {
  id: string;
  color: "red" | "blue" | "yellow" | "green" | "white";
  thickness: 1 | 2 | 3;
  label: string;
  insulation: "basic" | "shielded" | "frayed";
  inspectedProperties: Array<"color" | "thickness" | "label" | "insulation">;
  cut: boolean;
};

export type ModuleRuntimeState = {
  id: string;
  moduleType: ModuleType;
  variantId: string;
  solved: boolean;
  lockedUntilMs?: number;
  params: Record<string, unknown>;
};

export type RuleSpec = {
  id: string;
  description: string;
  kind: "core" | "spice" | "deception";
  condition: string;
  effect: string;
};

export type ModifierSpec = {
  id: string;
  description: string;
};

export type BombSpec = {
  seed: string;
  archetypeId: string;
  difficultyTier: number;
  playerCount: number;
  modules: ModuleRuntimeState[];
  graph: Array<{ from: string; to: string }>;
  ruleStack: RuleSpec[];
  modifiers: ModifierSpec[];
};

export type MatchResources = {
  timerMsRemaining: number;
  commsSecondsRemaining: number;
  stability: number;
};

export type MatchOutcome = "defused" | "exploded" | "timeout";
export type MatchPhase = "lobby" | "active" | "results";

export type MatchAction =
  | { type: "inspect_wire"; moduleId: string; wireId: string; property: "color" | "thickness" | "label" | "insulation" }
  | { type: "cut_wire"; moduleId: string; wireId: string }
  | { type: "reroute_wire"; moduleId: string }
  | { type: "connect_conduit"; moduleId: string; from: string; to: string }
  | { type: "clear_conduits"; moduleId: string }
  | { type: "rotate_dial"; moduleId: string; delta: number }
  | { type: "lock_dial"; moduleId: string }
  | { type: "press_glyph"; moduleId: string; glyphIndex: number }
  | { type: "press_memory"; moduleId: string; padIndex: number }
  | { type: "reset_memory"; moduleId: string }
  | { type: "toggle_switch"; moduleId: string; switchIndex: number }
  | { type: "swap_polarity"; moduleId: string }
  | { type: "vent_power"; moduleId: string }
  | { type: "adjust_reactor"; moduleId: string; delta: number }
  | { type: "stabilize_reactor"; moduleId: string }
  | { type: "use_ability"; ability: "time_dilation" | "comms_battery" | "noise_gate" | "echo_cancel" }
  | { type: "observer_ping"; moduleId: string };

export type PlayerState = {
  userId: string;
  displayName: string;
  isHost: boolean;
  connected: boolean;
  capabilities: Capability[];
  roleName: string;
  joinedAtMs: number;
  privateHints: string[];
  stats: {
    actions: number;
    penalties: number;
    supportActions: number;
  };
};

export type VoiceState = {
  mode: TalkMode;
  speakingUsers: Record<string, number>;
  overlapPenaltyArmed: boolean;
  silenceWindowUntilMs?: number;
  noiseGateUntilMs?: number;
};

export type MatchState = {
  instanceId: string;
  phase: MatchPhase;
  tutorialMode?: boolean;
  seed: string;
  hostUserId?: string;
  createdAtMs: number;
  updatedAtMs: number;
  players: Record<string, PlayerState>;
  bomb?: BombSpec;
  resources: MatchResources;
  voice: VoiceState;
  eventLog: string[];
  result?: {
    outcome: MatchOutcome;
    reason: string;
    endedAtMs: number;
  };
};

export type PublicPlayerView = {
  userId: string;
  displayName: string;
  isHost: boolean;
  connected: boolean;
  roleName: string;
  capabilities: Capability[];
};

export type PublicMatchView = {
  instanceId: string;
  phase: MatchPhase;
  tutorialMode?: boolean;
  seed: string;
  resources: MatchResources;
  voice: {
    mode: TalkMode;
    speakingCount: number;
    silenceWindowUntilMs?: number;
    noiseGateUntilMs?: number;
  };
  bomb?: BombSpec;
  players: PublicPlayerView[];
  eventLog: string[];
  result?: MatchState["result"];
};

export type ClientEnvelope =
  | { type: "join_instance"; instanceId: string; userId: string; displayName: string }
  | { type: "presence"; status: "active" | "idle" }
  | { type: "start_match" }
  | { type: "start_tutorial"; level?: number }
  | { type: "play_again" }
  | { type: "action"; action: MatchAction }
  | { type: "request_scan" };

export type ServerEnvelope =
  | { type: "joined"; instanceId: string; userId: string }
  | { type: "state_patch"; state: PublicMatchView; privateBrief?: RoleBrief }
  | { type: "error"; message: string };

export const voiceEventSchema = z.object({
  instanceId: z.string().min(1),
  userId: z.string().min(1),
  guildId: z.string().optional(),
  channelId: z.string().optional(),
  event: z.enum(["SPEAK_START", "SPEAK_END"]),
  timestampMs: z.number().int().positive(),
  sourceToken: z.string().min(1)
});

export type VoiceEvent = z.infer<typeof voiceEventSchema>;
