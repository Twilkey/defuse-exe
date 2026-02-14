/* ═══════════════════════════════════════════════════════════════════════
   Discord Embedded App SDK — Bootstrap
   ═══════════════════════════════════════════════════════════════════════
   Initialises the SDK when running inside a Discord Activity iframe.
   Falls back to local/browser mode when opened outside Discord.
   ═══════════════════════════════════════════════════════════════════════ */

import { DiscordSDK, DiscordSDKMock } from "@discord/embedded-app-sdk";

export interface DiscordSession {
  /** User's Discord display name (or local fallback) */
  displayName: string;
  /** Channel ID used as room key — players in the same voice channel share a room */
  roomId: string;
  /** Whether we're running inside Discord */
  isDiscord: boolean;
}

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;

/**
 * Detects whether we're inside a Discord Activity iframe,
 * initialises the SDK, performs OAuth, and returns session info.
 */
export async function initDiscord(): Promise<DiscordSession> {
  // If no client ID is configured or we're not in an iframe, use local mode
  if (!CLIENT_ID || !isRunningInDiscord()) {
    const stored = localStorage.getItem("defuse-name")
      || `Player-${Math.floor(Math.random() * 9999)}`;
    localStorage.setItem("defuse-name", stored);
    return { displayName: stored, roomId: "default", isDiscord: false };
  }

  // ── Discord SDK init ──
  const discordSdk = new DiscordSDK(CLIENT_ID);
  await discordSdk.ready();

  // Authorize — this pops the Discord consent & returns a code
  const { code } = await discordSdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify"],
  });

  // Exchange code for access token via our server
  const tokenRes = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${errBody}`);
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error("Token exchange returned no access_token — check DISCORD_CLIENT_SECRET on server");
  }

  // Authenticate with the SDK so we can read user info
  const auth = await discordSdk.commands.authenticate({ access_token: tokenData.access_token });

  const displayName =
    (auth.user as { global_name?: string; username?: string })?.global_name
    ?? (auth.user as { username?: string })?.username
    ?? `Player-${Math.floor(Math.random() * 9999)}`;

  // Use the channel ID as the room key — everyone in the same voice channel
  // ends up in the same game room
  const roomId = discordSdk.channelId ?? "default";

  return { displayName, roomId, isDiscord: true };
}

/** Quick check: are we inside a cross-origin iframe (Discord's embed)? */
function isRunningInDiscord(): boolean {
  try {
    // Discord Activities always run in a nested iframe
    if (window.self === window.top) return false;
    // Also check for the frame_id search param Discord injects
    const params = new URLSearchParams(window.location.search);
    return params.has("frame_id");
  } catch {
    // cross-origin iframes throw on window.top access — that's Discord
    return true;
  }
}
