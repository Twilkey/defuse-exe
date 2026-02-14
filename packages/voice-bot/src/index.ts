import dotenv from "dotenv";
import { Client, GatewayIntentBits, VoiceBasedChannel } from "discord.js";
import { EndBehaviorType, VoiceConnectionStatus, entersState, joinVoiceChannel } from "@discordjs/voice";

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const voiceChannelId = process.env.DISCORD_VOICE_CHANNEL_ID;
const instanceId = process.env.INSTANCE_ID ?? "local-instance";
const serverUrl = process.env.SERVER_URL ?? "http://localhost:3001";
const sourceToken = process.env.VOICE_SOURCE_TOKEN ?? "local-voice-source";

if (!token || !guildId || !voiceChannelId) {
  throw new Error("Missing DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, or DISCORD_VOICE_CHANNEL_ID");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

async function sendVoiceEvent(payload: {
  userId: string;
  event: "SPEAK_START" | "SPEAK_END";
  timestampMs: number;
  channelId: string;
}): Promise<void> {
  await fetch(`${serverUrl}/api/voice/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instanceId,
      userId: payload.userId,
      guildId,
      channelId: payload.channelId,
      event: payload.event,
      timestampMs: payload.timestampMs,
      sourceToken
    })
  });
}

client.once("ready", async () => {
  console.log(`Voice bot ready as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(guildId);
  const channel = (await guild.channels.fetch(voiceChannelId)) as VoiceBasedChannel;
  if (!channel?.isVoiceBased()) {
    throw new Error("Configured channel is not voice based.");
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator as any,
    selfDeaf: false,
    selfMute: true
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  console.log(`Connected to voice channel ${channel.name}.`);

  const receiver = connection.receiver;

  receiver.speaking.on("start", (userId) => {
    void sendVoiceEvent({ userId, event: "SPEAK_START", timestampMs: Date.now(), channelId: channel.id });

    const audioStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 300
      }
    });

    audioStream.on("end", () => {
      void sendVoiceEvent({ userId, event: "SPEAK_END", timestampMs: Date.now(), channelId: channel.id });
    });
  });
});

void client.login(token);
