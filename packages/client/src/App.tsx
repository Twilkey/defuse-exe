import { useEffect, useMemo, useRef, useState } from "react";
import type { BombSpec, ClientEnvelope, MatchAction, PublicMatchView, RoleBrief, ServerEnvelope } from "@defuse/shared";

type Session = {
  userId: string;
  displayName: string;
  instanceId: string;
};

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
const wsUrl = serverUrl.replace("http://", "ws://").replace("https://", "wss://") + "/ws";

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

function moduleCard(moduleState: BombSpec["modules"][number], onAction: (action: MatchAction) => void): JSX.Element {
  if (moduleState.moduleType === "wires") {
    const wires = moduleState.params.wires as Array<{
      id: string;
      color: string;
      thickness: number;
      label: string;
      insulation: string;
      inspectedProperties: string[];
      cut: boolean;
    }>;

    return (
      <div className="module-card">
        <h3>Wire Lattice · {moduleState.id}</h3>
        <div className="wire-list">
          {wires.map((wire) => (
            <div key={wire.id} className="wire-row">
              <span>{wire.id}</span>
              <span>{wire.cut ? "CUT" : "INTACT"}</span>
              <button onClick={() => onAction({ type: "inspect_wire", moduleId: moduleState.id, wireId: wire.id, property: "color" })}>
                Inspect
              </button>
              <button onClick={() => onAction({ type: "cut_wire", moduleId: moduleState.id, wireId: wire.id })}>Cut</button>
              <small>{wire.inspectedProperties.length > 0 ? `Known: ${wire.inspectedProperties.join(",")}` : "Unknown"}</small>
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
      <div className="module-card">
        <h3>Rotary Dial · {moduleState.id}</h3>
        <div className="dial-value">{alphabet === "A-F" ? value.toString(16).toUpperCase() : value}</div>
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
      <div className="module-card">
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

  const polarity = String(moduleState.params.polarity ?? "POS");
  const voltage = Number(moduleState.params.voltage ?? 0);
  return (
    <div className="module-card">
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
  const socketRef = useRef<WebSocket | null>(null);

  const me = useMemo(() => {
    if (!session || !state) return undefined;
    return state.players.find((player) => player.userId === session.userId);
  }, [session, state]);

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
      <header className="topbar">
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
