"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useStream } from "@/lib/stream/stream-context";
import { react } from "@/lib/api/endpoints/engagement/engagement";
import { CreateReactionDtoEmoji } from "@/lib/api/model/createReactionDtoEmoji";
import { Flame, Loader2, Pause, Play, Users, Volume2, VolumeX } from "lucide-react";

/**
 * Global persistent player — lives in the root layout so it never remounts on
 * navigation (v2-build/00 §5.5). Plays an HLS audio stream via hls.js (or
 * native HLS on Safari). Reads status from StreamContext (manifest + socket).
 *
 * Design: a low-key charcoal shelf rather than a toolbar. It shrank from ~61px
 * to ~48px and lost the near-black gradient and the 34px drop shadow, which
 * between them made a status bar read as the loudest element on every page.
 * The bar is intentionally the same surface in light and dark — like every
 * streaming player, it is its own always-dark chrome, not a themed surface.
 *
 * The controls added here are the ones a radio bar actually needs and stops
 * there: volume (desktop, where the OS isn't already one gesture away) and a
 * live listener count. No seek bar — see the activity strip note below.
 */
export function GlobalPlayer() {
  const { status, djs, listeners, isPlaying, phase, upNext, episodeId, play, pause, audioRef } =
    useStream();
  const pathname = usePathname();

  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  // The <audio> element is owned here but driven by StreamContext, so volume is
  // pushed onto the node rather than held as a React-controlled attribute.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted, audioRef]);

  const canPlay = status !== "OFF_AIR";
  const isListenPage = pathname === "/listen";

  const showTitle =
    status === "LIVE" && djs.length > 0 ? djs[0] : "Wildcat Radio";

  const showSub =
    status === "LIVE"
      ? djs.length > 1
        ? djs.slice(1).join(", ")
        : "Live on air"
      : status === "STATION_ROTATION"
        ? "Station rotation"
        : "Off air";

  const busy = phase === "connecting" || phase === "reconnecting";

  const handlePlayPause = useCallback(() => {
    // `phase` not `isPlaying`: pressing the button while buffering must cancel,
    // otherwise a slow connection traps the user with a control that appears
    // to do nothing.
    if (phase !== "idle") pause();
    else if (canPlay) play();
  }, [phase, canPlay, play, pause]);

  /* Spacebar play/pause — the convention in every player this was modelled on.
     Deliberately inert while the user is typing or focused on another control,
     otherwise it would hijack the chat composer and every button on the page.

     The handler is held in a ref so the window listener subscribes ONCE.
     Depending on `handlePlayPause` directly would tear down and re-attach the
     listener on every phase transition (idle→connecting→playing→…), which is
     the exact churn `advanced-event-handler-refs` warns about. */
  const playPauseRef = useRef(handlePlayPause);
  useEffect(() => {
    playPauseRef.current = handlePlayPause;
  }, [handlePlayPause]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "BUTTON" ||
          el.tagName === "A" ||
          el.isContentEditable ||
          el.getAttribute("role") === "textbox")
      ) {
        return;
      }
      e.preventDefault();
      playPauseRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* Reactions are a plain REST call, so unlike the chat/poll surfaces this
     needs no socket and is safe to expose from the global bar on any route. */
  const reactionMutation = useMutation({
    mutationFn: (emoji: CreateReactionDtoEmoji) =>
      react(episodeId as string, { emoji }),
  });
  const canReact = status === "LIVE" && !!episodeId;

  /* One definition, rendered either bare or wrapped in the /listen link —
     previously this markup was duplicated in full across both branches. */
  const coverAndMeta = (
    <>
      <div className="wc-art cover" />
      <div className="meta">
        <div className="title flex items-center gap-1.5">
          <span data-testid="now-playing">{showTitle}</span>
          {status === "LIVE" && (
            <span
              className="wc-badge-live"
              style={{ fontSize: ".55rem", padding: ".1rem .4rem", lineHeight: 1.4 }}
            >
              <span className="dot" />
              Live
            </span>
          )}
        </div>
        <div className="sub">
          {phase === "connecting"
            ? "Connecting…"
            : phase === "reconnecting"
              ? "Reconnecting…"
              : showSub}
        </div>
      </div>
    </>
  );

  return (
    <div className="wc-player" role="region" aria-label="Now playing">
      {/* Hidden audio element — controlled via ref from StreamContext */}
      <audio ref={audioRef} data-testid="player-audio" />

      {/*
        FE#50 — the player's signature gold strip. This is a LIVE stream, so
        there is no duration and therefore no meaningful playhead position:
        the prototype's static 38% fill would be a lie dressed as a control.
        It is an indeterminate shimmer that runs only while audio is actually
        playing, and it is aria-hidden because it conveys nothing a screen
        reader user cannot already get from the play/pause button's state.
      */}
      <div className="wc-player-progress" data-testid="player-progress" aria-hidden="true">
        <span style={{ width: isPlaying ? undefined : 0 }} />
      </div>

      <div className="wc-player-inner">
        {isListenPage ? (
          <div className="flex items-center gap-[.7rem] flex-1 min-w-0">{coverAndMeta}</div>
        ) : (
          <Link
            href="/listen"
            aria-label="Open the live listening room"
            className="flex items-center gap-[.7rem] flex-1 min-w-0 cursor-pointer no-underline text-inherit"
          >
            {coverAndMeta}
          </Link>
        )}

        {/* Up next — only exists while listening, because the queue arrives over
            the socket that only listening opens (see useStreamPresence). Absent
            rather than stale when idle. */}
        {upNext && (
          <span className="wc-player-upnext" data-testid="player-upnext">
            <span className="label">Up next</span>
            <span className="text">{upNext.text}</span>
          </span>
        )}

        {/* Listener count — real presence data, the one number a radio bar earns.
            Null until the presence socket reports, so it stays hidden rather
            than flashing a placeholder "0 listening". */}
        {listeners != null && listeners > 0 ? (
          <span
            className="wc-player-listeners"
            data-testid="player-listeners"
            title={`${listeners} listening now`}
          >
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{listeners}</span>
            <span className="sr-only">listening now</span>
          </span>
        ) : null}

        {/* EQ bars — animate while playing */}
        {isPlaying && (
          <div className="eq text-gold" aria-hidden="true">
            <i /><i /><i /><i />
          </div>
        )}

        {/* Status badge (for test targeting) */}
        <span data-testid="player-status" className="sr-only">
          {status}
        </span>

        {/* React from anywhere — REST, no socket, so it costs no connection on
            routes the listener is only passing through. */}
        {canReact && (
          <button
            type="button"
            className="wc-player-btn wc-player-react"
            data-testid="player-react"
            aria-label="Send a fire reaction"
            disabled={reactionMutation.isPending}
            onClick={() => reactionMutation.mutate(CreateReactionDtoEmoji["🔥"])}
          >
            <Flame className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

        {/* Volume — desktop only; on touch the OS volume keys are one press away
            and the slider would just eat width on a 375px bar. */}
        <div className="wc-player-vol">
          <button
            type="button"
            className="wc-player-btn"
            data-testid="player-mute"
            aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
            aria-pressed={muted}
            onClick={() => setMuted((m) => !m)}
          >
            {muted || volume === 0 ? (
              <VolumeX className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Volume2 className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
          {/* Native range: keyboard-operable for free, which a div-based slider
              would have had to reimplement. */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            data-testid="player-volume"
            aria-label="Volume"
            onChange={(e) => {
              const next = Number(e.target.value);
              setVolume(next);
              if (next > 0 && muted) setMuted(false);
            }}
          />
        </div>

        {/* Play / Pause — 44px hit area, 32px visual disc. */}
        <button
          type="button"
          aria-label={
            phase === "connecting"
              ? "Connecting — tap to cancel"
              : phase === "reconnecting"
                ? "Reconnecting — tap to stop"
                : isPlaying
                  ? "Pause"
                  : "Play live stream"
          }
          data-testid="player-play"
          onClick={handlePlayPause}
          disabled={!canPlay && !isPlaying}
          className="wc-play"
        >
          <span>
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4 translate-x-[1px]" aria-hidden="true" />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
