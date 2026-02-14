import { useEffect, useMemo, useRef, useState } from "react";
import type { BombSpec, ClientEnvelope, MatchAction, PublicMatchView, RoleBrief, ServerEnvelope } from "@defuse/shared";

type Session = {
  userId: string;
  displayName: string;
  instanceId: string;
};

function normalizeServerUrl(rawValue: string | undefined): string {
  const fallback = "http://localhost:3001";
  const value = (rawValue ?? fallback).trim();

  if (!value) return fallback;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;

  return `https://${value}`;
}

function buildWsUrl(httpUrl: string): string {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

const serverUrl = normalizeServerUrl(import.meta.env.VITE_SERVER_URL);
const wsUrl = buildWsUrl(serverUrl);
const tutorialLevelKey = "defuse-tutorial-level";

function getStoredTutorialLevel(): number {
  const raw = Number(localStorage.getItem(tutorialLevelKey) ?? "1");
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(3, Math.floor(raw)));
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getInstanceId(): string {
  const url = new URL(window.location.href);
  return (
    url.searchParams.get("instance_id") ??
    url.searchParams.get("instanceId") ??
    localStorage.getItem("defuse-instance-id") ??
    "local-instance"
  );
}

function formatHex(value: number): string {
  return value.toString(16).toUpperCase();
}

function DialVisualizer({ value, max }: { value: number; max: number }): JSX.Element {
  const angle = (value / max) * 300 - 150;
  return (
    <svg className="dial-svg" viewBox="0 0 140 140" role="img" aria-label="Dial Visualizer">
      <circle cx="70" cy="70" r="58" className="dial-ring" />
      <circle cx="70" cy="70" r="45" className="dial-core" />
      <line
        x1="70"
        y1="70"
        x2={70 + 42 * Math.cos((angle * Math.PI) / 180)}
        y2={70 + 42 * Math.sin((angle * Math.PI) / 180)}
        className="dial-needle"
      />
    </svg>
  );
}

function ConduitVisualizer({
  fromNodes,
  toNodes,
  links
}: {
  fromNodes: string[];
  toNodes: string[];
  links: Array<{ from: string; to: string }>;
}): JSX.Element {
  return (
    <svg className="conduit-svg" viewBox="0 0 280 160" role="img" aria-label="Conduit Routing Visualizer">
      {fromNodes.map((node, index) => (
        <g key={`f-${node}`}>
          <circle cx="30" cy={30 + index * 34} r="10" className="node from" />
          <text x="30" y={34 + index * 34} className="node-text">{node}</text>
        </g>
      ))}
      {toNodes.map((node, index) => (
        <g key={`t-${node}`}>
          <circle cx="250" cy={30 + index * 34} r="10" className="node to" />
          <text x="250" y={34 + index * 34} className="node-text">{node}</text>
        </g>
      ))}
      {links.map((link) => {
        const fromIndex = fromNodes.indexOf(link.from);
        const toIndex = toNodes.indexOf(link.to);
        if (fromIndex < 0 || toIndex < 0) return null;
        return (
          <line
            key={`${link.from}-${link.to}`}
            x1="40"
            y1={30 + fromIndex * 34}
            x2="240"
            y2={30 + toIndex * 34}
            className="conduit-line"
          />
        );
      })}
    </svg>
  );
}

function moduleCard(moduleState: BombSpec["modules"][number], onAction: (action: MatchAction) => void): JSX.Element {
  if (moduleState.moduleType === "wires") {
    const wires = moduleState.params.wires as Array<{
      id: string;
      color: string;
      thickness: number;
      label: string;
      insulation: string;
      conduitTag: number;
      inspectedProperties: string[];
      cut: boolean;
    }>;
    const safeOrder = moduleState.params.safeOrder as number[];
    const cutProgress = Number(moduleState.params.cutProgress ?? 0);

    return (
      <div className="module-card wires-card">
        <h3>Wire Lattice · {moduleState.id}</h3>
        <p className="module-help">Cut in clue order. Conduit outputs map to wire tags.</p>
        <div className="sequence-strip">
          {safeOrder.map((wireIndex, index) => (
            <span key={`${moduleState.id}-step-${index}`} className={index < cutProgress ? "step on" : "step"}>
              {index + 1}:{wireIndex + 1}
            </span>
          ))}
        </div>
        <div className="wire-list">
          {wires.map((wire, wireIndex) => (
            <div key={wire.id} className="wire-row">
              <span className="wire-color" data-wire-color={wire.color}>{wire.color.toUpperCase()}</span>
              <span>{wire.id} · Tag {wire.conduitTag}</span>
              <span>{wire.cut ? "CUT" : "INTACT"}</span>
              <button onClick={() => onAction({ type: "inspect_wire", moduleId: moduleState.id, wireId: wire.id, property: "color" })}>
                Inspect
              </button>
              <button onClick={() => onAction({ type: "cut_wire", moduleId: moduleState.id, wireId: wire.id })}>Cut</button>
              <small>
                Slot {wireIndex + 1} · {wire.inspectedProperties.length > 0 ? `Known: ${wire.inspectedProperties.join(",")}` : "Unknown"}
              </small>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (moduleState.moduleType === "dial") {
    const value = Number(moduleState.params.value ?? 0);
    const alphabet = String(moduleState.params.alphabet ?? "0-9");

    return (
      <div className="module-card dial-card">
        <h3>Rotary Dial · {moduleState.id}</h3>
        <p className="module-help">Tune then lock inside hidden safe band.</p>
        <DialVisualizer value={value} max={alphabet === "A-F" ? 15 : 9} />
        <div className="dial-value">{alphabet === "A-F" ? formatHex(value) : value}</div>
        <div className="row">
          <button onClick={() => onAction({ type: "rotate_dial", moduleId: moduleState.id, delta: -1 })}>-1</button>
          <button onClick={() => onAction({ type: "rotate_dial", moduleId: moduleState.id, delta: 1 })}>+1</button>
          <button onClick={() => onAction({ type: "lock_dial", moduleId: moduleState.id })}>Lock In</button>
        </div>
      </div>
    );
  }

  if (moduleState.moduleType === "glyph") {
    const glyphs = moduleState.params.glyphs as string[];
    const progress = Number(moduleState.params.progress ?? 0);
    const sequence = moduleState.params.sequence as number[];

    return (
      <div className="module-card glyph-card">
        <h3>Glyph Grid · {moduleState.id}</h3>
        <p>
          Progress {progress}/{sequence.length}
        </p>
        <div className="glyph-grid">
          {glyphs.map((glyph, index) => (
            <button key={`${moduleState.id}-${index}`} onClick={() => onAction({ type: "press_glyph", moduleId: moduleState.id, glyphIndex: index })}>
              {glyph}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (moduleState.moduleType === "conduit") {
    const fromNodes = moduleState.params.fromNodes as string[];
    const toNodes = moduleState.params.toNodes as string[];
    const currentLinks = moduleState.params.currentLinks as Array<{ from: string; to: string }>;
    const desiredLinks = moduleState.params.desiredLinks as Array<{ from: string; to: string }>;

    return (
      <div className="module-card conduit-card">
        <h3>Conduit Matrix · {moduleState.id}</h3>
        <p className="module-help">Route each source node to correct output port.</p>
        <ConduitVisualizer fromNodes={fromNodes} toNodes={toNodes} links={currentLinks} />
        <div className="conduit-grid">
          {fromNodes.map((fromNode) => (
            <div key={`${moduleState.id}-${fromNode}`} className="conduit-row">
              <strong>{fromNode}</strong>
              {toNodes.map((toNode) => {
                const active = currentLinks.some((link) => link.from === fromNode && link.to === toNode);
                return (
                  <button
                    key={`${moduleState.id}-${fromNode}-${toNode}`}
                    className={active ? "chip active" : "chip"}
                    onClick={() => onAction({ type: "connect_conduit", moduleId: moduleState.id, from: fromNode, to: toNode })}
                  >
                    {toNode}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <button onClick={() => onAction({ type: "clear_conduits", moduleId: moduleState.id })}>Clear Routing</button>
        <small className="module-hint">Target signature: {desiredLinks.map((link) => `${link.from}->${link.to}`).join(" | ")}</small>
      </div>
    );
  }

  if (moduleState.moduleType === "memory") {
    const padCount = Number(moduleState.params.padCount ?? 6);
    const sequence = moduleState.params.sequence as number[];
    const input = moduleState.params.input as number[];

    return (
      <div className="module-card memory-card">
        <h3>Memory Pulse · {moduleState.id}</h3>
        <p className="module-help">Replay the pattern. Wrong input resets.</p>
        <p>Input: {input.length}/{sequence.length}</p>
        <div className="memory-grid">
          {Array.from({ length: padCount }, (_, index) => (
            <button key={`${moduleState.id}-pad-${index}`} onClick={() => onAction({ type: "press_memory", moduleId: moduleState.id, padIndex: index })}>
              Pad {index + 1}
            </button>
          ))}
        </div>
        <button onClick={() => onAction({ type: "reset_memory", moduleId: moduleState.id })}>Reset Memory</button>
      </div>
    );
  }

  if (moduleState.moduleType === "switches") {
    const states = moduleState.params.states as number[];
    const targetMask = moduleState.params.targetMask as number[];

    return (
      <div className="module-card switch-card">
        <h3>Switch Matrix · {moduleState.id}</h3>
        <p className="module-help">Match current row to target row.</p>
        <div className="switch-rows">
          <div className="switch-row">
            <span>Target</span>
            {targetMask.map((target, index) => (
              <span key={`${moduleState.id}-target-${index}`} className={target === 1 ? "switch-led on" : "switch-led"}>
                {target}
              </span>
            ))}
          </div>
          <div className="switch-row">
            <span>Now</span>
            {states.map((value, index) => (
              <button
                key={`${moduleState.id}-state-${index}`}
                className={value === 1 ? "switch-toggle on" : "switch-toggle"}
                onClick={() => onAction({ type: "toggle_switch", moduleId: moduleState.id, switchIndex: index })}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (moduleState.moduleType === "reactor") {
    const heat = Number(moduleState.params.heat ?? 50);
    const safeMin = Number(moduleState.params.safeMin ?? 42);
    const safeMax = Number(moduleState.params.safeMax ?? 58);
    const stableTicks = Number(moduleState.params.stableTicks ?? 0);
    const inSafe = heat >= safeMin && heat <= safeMax;

    return (
      <div className="module-card reactor-card">
        <h3>Reactor Core · {moduleState.id}</h3>
        <p className="module-help">Keep heat in green zone, stabilize 3 cycles.</p>
        <div className="heat-bar">
          <div className={inSafe ? "heat-fill safe" : "heat-fill"} style={{ width: `${heat}%` }} />
        </div>
        <p>
          Heat {heat} · Safe {safeMin}-{safeMax} · Stability Cycles {stableTicks}/3
        </p>
        <div className="row">
          <button onClick={() => onAction({ type: "adjust_reactor", moduleId: moduleState.id, delta: -5 })}>Cool -5</button>
          <button onClick={() => onAction({ type: "adjust_reactor", moduleId: moduleState.id, delta: 5 })}>Heat +5</button>
          <button onClick={() => onAction({ type: "stabilize_reactor", moduleId: moduleState.id })}>Stabilize</button>
        </div>
      </div>
    );
  }

  const polarity = String(moduleState.params.polarity ?? "POS");
  const voltage = Number(moduleState.params.voltage ?? 0);
  return (
    <div className="module-card power-card">
      <h3>Power Cell · {moduleState.id}</h3>
      <p>Polarity: {polarity}</p>
      <p>Voltage: {voltage}</p>
      <div className="row">
        <button onClick={() => onAction({ type: "swap_polarity", moduleId: moduleState.id })}>Swap Polarity</button>
        <button onClick={() => onAction({ type: "vent_power", moduleId: moduleState.id })}>Vent (-10s)</button>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<PublicMatchView | null>(null);
  const [brief, setBrief] = useState<RoleBrief | undefined>();
  const [status, setStatus] = useState("Booting Discord activity...");
  const [panicOpen, setPanicOpen] = useState(false);
  const [tutorialLevel, setTutorialLevel] = useState<number>(() => getStoredTutorialLevel());
  const [eventCue, setEventCue] = useState<"positive" | "negative" | "neutral">("neutral");
  const socketRef = useRef<WebSocket | null>(null);
  const prevPhaseRef = useRef<PublicMatchView["phase"] | undefined>(undefined);
  const lastEventRef = useRef<string>("");

  const me = useMemo(() => {
    if (!session || !state) return undefined;
    return state.players.find((player) => player.userId === session.userId);
  }, [session, state]);

  const tutorialStep = useMemo(() => {
    if (!state?.tutorialMode || !state.bomb) return undefined;
    const moduleSolved = new Map(state.bomb.modules.map((moduleState) => [moduleState.id, moduleState.solved]));
    if (!moduleSolved.get("t-conduit")) return "Step 1: Complete Conduit Matrix routing.";
    if (!moduleSolved.get("t-wires")) return "Step 2: Cut wires in mapped order (watch wire tag clues).";
    if (!moduleSolved.get("t-memory")) return "Step 3: Enter the Memory Pulse sequence.";
    if (!moduleSolved.get("t-reactor")) return "Step 4: Hold Reactor in safe band and stabilize 3 times.";
    return "Tutorial complete. Great work — start a full procedural match.";
  }, [state]);

  useEffect(() => {
    localStorage.setItem(tutorialLevelKey, String(tutorialLevel));
  }, [tutorialLevel]);

  useEffect(() => {
    if (!state || state.eventLog.length === 0) return;
    const latest = state.eventLog[0];
    if (!latest || latest === lastEventRef.current) return;
    lastEventRef.current = latest;

    const lower = latest.toLowerCase();
    const isNegative =
      lower.includes("strike") ||
      lower.includes("penalty") ||
      lower.includes("failed") ||
      lower.includes("wrong") ||
      lower.includes("lockout");
    const isPositive = lower.includes("solved") || lower.includes("stabilized") || lower.includes("defused");

    const cue: "positive" | "negative" | "neutral" = isNegative ? "negative" : isPositive ? "positive" : "neutral";
    setEventCue(cue);

    if (cue !== "neutral") {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.type = cue === "positive" ? "triangle" : "square";
      oscillator.frequency.value = cue === "positive" ? 720 : 200;
      gain.gain.value = 0.0001;
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.stop(context.currentTime + 0.2);
      void oscillator.addEventListener("ended", () => {
        void context.close();
      });

      const timeout = window.setTimeout(() => setEventCue("neutral"), 400);
      return () => window.clearTimeout(timeout);
    }
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const previousPhase = prevPhaseRef.current;
    if (previousPhase === "active" && state.phase === "results" && state.tutorialMode && state.result?.outcome === "defused") {
      setTutorialLevel((current) => Math.min(3, current + 1));
    }
    prevPhaseRef.current = state.phase;
  }, [state]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap(): Promise<void> {
      const instanceId = getInstanceId();
      localStorage.setItem("defuse-instance-id", instanceId);

      const defaultSession = {
        userId: localStorage.getItem("defuse-user-id") ?? randomId("user"),
        displayName: localStorage.getItem("defuse-name") ?? `Player-${Math.floor(Math.random() * 999)}`,
        instanceId
      };

      try {
        const discordClientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
        if (discordClientId) {
          const sdkModule: any = await import("@discord/embedded-app-sdk");
          const sdk = new sdkModule.DiscordSDK(discordClientId);
          await sdk.ready();
          const auth = await sdk.commands.authorize({
            client_id: discordClientId,
            response_type: "code",
            state: "defuse",
            prompt: "none",
            scope: ["identify"]
          });

          const exchange = await fetch(`${serverUrl}/api/auth/exchange`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: auth.code })
          });

          if (exchange.ok) {
            const payload = await exchange.json();
            defaultSession.userId = payload.user.id;
            defaultSession.displayName = payload.user.username;
          }
        }
      } catch {
        setStatus("Running in local dev mode (Discord SDK unavailable).");
      }

      if (!mounted) return;
      localStorage.setItem("defuse-user-id", defaultSession.userId);
      localStorage.setItem("defuse-name", defaultSession.displayName);

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        setStatus("Connected.");
        const joinPayload: ClientEnvelope = {
          type: "join_instance",
          instanceId: defaultSession.instanceId,
          userId: defaultSession.userId,
          displayName: defaultSession.displayName
        };
        ws.send(JSON.stringify(joinPayload));
      };

      ws.onclose = () => {
        setConnected(false);
        setStatus("Disconnected from server.");
      };

      ws.onmessage = (event) => {
        const envelope = JSON.parse(String(event.data)) as ServerEnvelope;

        if (envelope.type === "joined") {
          setSession(defaultSession);
          return;
        }

        if (envelope.type === "state_patch") {
          setState(envelope.state);
          setBrief(envelope.privateBrief);
          return;
        }

        if (envelope.type === "error") {
          setStatus(envelope.message);
        }
      };
    }

    void bootstrap();

    return () => {
      mounted = false;
      socketRef.current?.close();
    };
  }, []);

  function send(payload: ClientEnvelope): void {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function sendAction(action: MatchAction): void {
    send({ type: "action", action });
  }

  return (
    <div className="app">
      <header className={`topbar cue-${eventCue}`}>
        <div>
          <h1>DEFUSE.EXE</h1>
          <p>{status}</p>
        </div>
        <div className="status-pill">{connected ? "LIVE" : "OFFLINE"}</div>
      </header>

      <section className="hud">
        <div className="metric">
          <span>Instance</span>
          <strong>{session?.instanceId ?? "-"}</strong>
        </div>
        <div className="metric">
          <span>Timer</span>
          <strong>{state ? Math.ceil(state.resources.timerMsRemaining / 1000) : "-"}s</strong>
        </div>
        <div className="metric">
          <span>Comms</span>
          <strong>{state ? Math.max(0, Math.floor(state.resources.commsSecondsRemaining)) : "-"}s</strong>
        </div>
        <div className="metric">
          <span>Stability</span>
          <strong>{state?.resources.stability ?? "-"}</strong>
        </div>
        <div className="metric">
          <span>Voice</span>
          <strong>{state?.voice.mode ?? "-"}</strong>
        </div>
      </section>

      <section className="brief-box">
        <h2>How To Defuse (Fast)</h2>
        <ul>
          <li>Use Conduit Matrix to reveal wire order clues (wire tags follow conduit outputs).</li>
          <li>Cut Wire Lattice in exact order shown by clue sequence.</li>
          <li>Run parallel: Dial + Glyph + Memory + Switches while one player controls Reactor heat band.</li>
          <li>Use support abilities only when your role grants that capability.</li>
          <li>Press Panic Button to inspect penalties when a mechanic fails.</li>
        </ul>
      </section>

      <section className="lobby-row">
        <div>
          <h2>Players ({state?.players.length ?? 0})</h2>
          <ul>
            {state?.players.map((player) => (
              <li key={player.userId}>
                {player.displayName} · {player.roleName} · {player.connected ? "online" : "offline"}
              </li>
            ))}
          </ul>
        </div>
        <div className="action-stack">
          <button onClick={() => send({ type: "start_match" })} disabled={state?.phase !== "lobby"}>
            Start
          </button>
          <button onClick={() => send({ type: "start_tutorial", level: tutorialLevel })} disabled={state?.phase !== "lobby"}>
            Start Tutorial · Stage {tutorialLevel}
          </button>
          <button onClick={() => send({ type: "play_again" })} disabled={state?.phase !== "results"}>
            Play Again
          </button>
          <button onClick={() => send({ type: "request_scan" })}>Request Scan</button>
          <button onClick={() => setPanicOpen((value) => !value)}>Panic Button</button>
        </div>
      </section>

      {brief && (
        <section className="brief-box">
          <h2>Private Brief · {brief.roleName}</h2>
          <p>Capabilities: {brief.capabilities.join(", ") || "None"}</p>
          <ul>
            {brief.privateHints.map((hint, index) => (
              <li key={`${brief.userId}-${index}`}>{hint}</li>
            ))}
          </ul>
        </section>
      )}

      {state?.phase === "active" && state.bomb && (
        <section className="modules-grid">
          {state.bomb.modules.map((moduleState) => (
            <div key={moduleState.id}>
              {moduleCard(moduleState, sendAction)}
              <button className="observer-btn" onClick={() => sendAction({ type: "observer_ping", moduleId: moduleState.id })}>
                Observer Ping
              </button>
            </div>
          ))}
        </section>
      )}

      {tutorialStep && (
        <section className="brief-box tutorial-box">
          <h2>Tutorial Objective</h2>
          <p>{tutorialStep}</p>
          <small>Stage {tutorialLevel}/3 · Complete tutorial defuse to unlock the next stage.</small>
        </section>
      )}

      {state?.phase === "active" && (
        <section className="abilities">
          <h2>Support Abilities</h2>
          <div className="row">
            <button onClick={() => sendAction({ type: "use_ability", ability: "time_dilation" })}>Time Dilation</button>
            <button onClick={() => sendAction({ type: "use_ability", ability: "comms_battery" })}>Comms Battery</button>
            <button onClick={() => sendAction({ type: "use_ability", ability: "noise_gate" })}>Noise Gate</button>
            <button onClick={() => sendAction({ type: "use_ability", ability: "echo_cancel" })}>Echo Cancel</button>
          </div>
        </section>
      )}

      {state?.phase === "results" && (
        <section className="results">
          <h2>Round Result</h2>
          <p>
            {state.result?.outcome?.toUpperCase()} · {state.result?.reason}
          </p>
          <p>Archetype: {state.bomb?.archetypeId}</p>
        </section>
      )}

      {panicOpen && (
        <section className="panic-feed">
          <h2>Recent Actions / Penalties</h2>
          <ul>
            {(state?.eventLog ?? []).map((event, index) => (
              <li key={`${event}-${index}`}>{event}</li>
            ))}
          </ul>
        </section>
      )}

      <footer>
        <small>
          {me ? `${me.displayName} · ${me.roleName}` : "Connecting..."} · speaking now: {state?.voice.speakingCount ?? 0}
        </small>
      </footer>
    </div>
  );
}
