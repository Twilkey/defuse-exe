import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { GameState, LevelUpOffer, PlayerSettings } from "@defuse/shared";
import { GameScene } from "./GameScene.js";

export function PhaserGame({
  state,
  myId,
  settings,
  levelUpOffer,
  onPickUpgrade,
  onVoteContinue,
  bossWarning,
  ascensionMsg,
  transcendMsg,
}: {
  state: GameState;
  myId: string;
  settings: PlayerSettings;
  levelUpOffer?: LevelUpOffer | null;
  onPickUpgrade?: (upgradeId: string) => void;
  onVoteContinue?: () => void;
  bossWarning?: string | null;
  ascensionMsg?: string | null;
  transcendMsg?: string | null;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<GameScene | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    const scene = new GameScene();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: container.clientWidth || 1280,
      height: container.clientHeight || 720,
      parent: container,
      scene: [scene],
      backgroundColor: "#0a0f1a",
      audio: { noAudio: true },
      render: { antialias: true, pixelArt: false },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    gameRef.current = game;
    sceneRef.current = scene;

    const onResize = () => {
      const nextW = container.clientWidth || 1280;
      const nextH = container.clientHeight || 720;
      game.scale.resize(nextW, nextH);
    };

    window.addEventListener("resize", onResize);
    onResize();

    return () => {
      window.removeEventListener("resize", onResize);
      sceneRef.current = null;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setFrame({
      state,
      myId,
      settings,
      levelUpOffer,
      bossWarning,
      ascensionMsg,
      transcendMsg,
    });
  }, [state, myId, settings, levelUpOffer, bossWarning, ascensionMsg, transcendMsg]);

  useEffect(() => {
    sceneRef.current?.setOnPickUpgrade(onPickUpgrade ?? null);
  }, [onPickUpgrade]);

  useEffect(() => {
    sceneRef.current?.setOnVoteContinue(onVoteContinue ?? null);
  }, [onVoteContinue]);

  return <div ref={containerRef} className="game-canvas phaser-root" />;
}
