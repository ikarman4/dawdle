import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { clipOffset } from "./daily";

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setVolume: (volume: number) => void;
  destroy: () => void;
}

export interface ClipControl {
  playFrom: (local: number) => void;
  pause: () => void;
  seek: (local: number) => void;
  setVolume: (value: number) => void;
}

interface ClipPlayerProps {
  videoId: string;
  date: string;
  volume: number;
  hidden: boolean;
  onLocal: (seconds: number) => void;
  onEnded: () => void;
  onReady: () => void;
  onError: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement, options: unknown) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

function loadYouTube(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

export const ClipPlayer = forwardRef<ClipControl, ClipPlayerProps>(function ClipPlayer(
  { videoId, date, volume, hidden, onLocal, onEnded, onReady, onError },
  ref,
) {
  const shell = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const offsetRef = useRef(0);
  const playingRef = useRef(false);
  const volumeRef = useRef(volume);
  const dateRef = useRef(date);
  const onLocalRef = useRef(onLocal);
  const onEndedRef = useRef(onEnded);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  volumeRef.current = volume;
  dateRef.current = date;
  onLocalRef.current = onLocal;
  onEndedRef.current = onEnded;
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useImperativeHandle(ref, () => ({
    playFrom(local: number) {
      const player = playerRef.current;
      if (!player) return;
      const at = offsetRef.current + Math.min(19.95, Math.max(0, local));
      player.setVolume(Math.round(volumeRef.current * 100));
      player.seekTo(at, true);
      player.playVideo();
      playingRef.current = true;
    },
    pause() {
      playingRef.current = false;
      playerRef.current?.pauseVideo();
    },
    seek(local: number) {
      const at = offsetRef.current + Math.min(19.95, Math.max(0, local));
      playerRef.current?.seekTo(at, true);
    },
    setVolume(value: number) {
      volumeRef.current = value;
      playerRef.current?.setVolume(Math.round(value * 100));
    },
  }));

  useEffect(() => {
    const node = shell.current;
    if (!node) return;
    const mount = document.createElement("div");
    node.appendChild(mount);
    let dead = false;
    let player: YTPlayer | null = null;
    void loadYouTube().then(() => {
      if (dead || !window.YT) return;
      player = new window.YT.Player(mount, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          origin: location.origin,
        },
        events: {
          onReady: (event: { target: YTPlayer }) => {
            const duration = event.target.getDuration();
            offsetRef.current = clipOffset(dateRef.current, duration);
            event.target.seekTo(offsetRef.current, true);
            event.target.pauseVideo();
            event.target.setVolume(Math.round(volumeRef.current * 100));
            playerRef.current = event.target;
            onReadyRef.current();
          },
          onError: () => onErrorRef.current(),
        },
      });
    });
    return () => {
      dead = true;
      playingRef.current = false;
      playerRef.current = null;
      player?.destroy();
      mount.remove();
    };
  }, [videoId]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const player = playerRef.current;
      if (player && playingRef.current) {
        const local = player.getCurrentTime() - offsetRef.current;
        if (local >= 19.98 || local < -0.35) {
          if (local < -0.35) player.seekTo(offsetRef.current, true);
          else {
            playingRef.current = false;
            player.pauseVideo();
            player.seekTo(offsetRef.current + 19.95, true);
            onLocalRef.current(20);
            onEndedRef.current();
          }
        } else {
          onLocalRef.current(Math.max(0, local));
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    playerRef.current?.setVolume(Math.round(volume * 100));
  }, [volume]);

  useEffect(() => {
    if (!hidden) return;
    playingRef.current = false;
    playerRef.current?.pauseVideo();
  }, [hidden]);

  return <div className={hidden ? "clip is-hidden" : "clip"} ref={shell} />;
});
