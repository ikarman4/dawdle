import { useEffect, useMemo, useRef, useState } from "react";
import {
  beginPitch,
  endPitch,
  playClick,
  releaseAll,
  resumeAudio,
  setMixVolume,
  setQuietInstruments,
  startPlayback,
  stopPlayback,
  triggerEvent,
} from "./audio";
import { ClipPlayer, type ClipControl } from "./ClipPlayer";
import { beatSeconds, quantizeTime, songForDate, windowPeaks } from "./daily";
import { EXAMPLE_TITLE } from "./example";
import { calmLine } from "./score";
import { bestAttempt, dockTotal, officialScore, picksNeeded } from "./progress";
import { shareHash } from "./share";
import { nameReady, useGame } from "./store";
import {
  INSTRUMENTS,
  SECTIONS,
  drumsFor,
  instrumentInfo,
  type DrumName,
  type InstrumentId,
  type NoteEvent,
  type SectionId,
  type Track,
} from "./types";
import { DrumLanes, InstrumentGlyph, PianoRoll, Waveform } from "./widgets";

const KEY_OFFSET: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16, "'": 17,
};
const KIT_KEYS: Record<string, DrumName> = { a: "kick", s: "snare", d: "closedHat", f: "openHat", g: "tom", h: "clap" };
const MACHINE_KEYS: Record<string, DrumName> = { a: "kick", s: "snare", d: "hat", f: "clap" };

function Caret({ up }: { up: boolean }) {
  return (
    <svg className={up ? "caret up" : "caret"} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function mixEvents(tracks: Track[]): NoteEvent[] {
  const soloing = tracks.some((track) => track.solo);
  return tracks.filter((track) => !track.mute && (!soloing || track.solo)).flatMap((track) => track.events);
}

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

function square(raw: number): string {
  if (raw >= 80) return "🟩";
  if (raw >= 40) return "🟨";
  return "⬛";
}

export function PlayView() {
  const { state, day, dispatch } = useGame();
  const song = songForDate(state.today);
  const clip = useRef<ClipControl>(null);
  const [playhead, setPlayhead] = useState(0);
  const [songPlaying, setSongPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [counting, setCounting] = useState(false);
  const [count, setCount] = useState(4);
  const [armed, setArmed] = useState<InstrumentId>("piano");
  const [latched, setLatched] = useState<number | null>(null);
  const [latchedDrum, setLatchedDrum] = useState<DrumName | null>("kick");
  const [writer, setWriter] = useState<"closed" | "pick" | "roll">("closed");
  const [folded, setFolded] = useState<InstrumentId[]>([]);
  const [mixOn, setMixOn] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [namePrompt, setNamePrompt] = useState(false);
  const [replacePrompt, setReplacePrompt] = useState(false);
  const [sectionPrompt, setSectionPrompt] = useState<null | "hint" | "submit">(null);
  const [pickPrompt, setPickPrompt] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const quantize = true;
  const [copied, setCopied] = useState(false);
  const [clipError, setClipError] = useState(false);
  const playheadRef = useRef(0);
  const held = useRef<Map<string, number>>(new Map());
  const alive = useRef(true);
  const cancelCount = useRef(false);
  const scrubOrigin = useRef(0);
  const songPlayingRef = useRef(false);
  const wasLocked = useRef(day.locked);
  const info = instrumentInfo(armed);
  const peaks = useMemo(() => windowPeaks(song.id, state.today, 120), [song.id, state.today]);
  const mode = counting ? "count" : recording ? "record" : "listen";

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopPlayback();
    };
  }, []);

  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  useEffect(() => {
    songPlayingRef.current = songPlaying;
  }, [songPlaying]);

  useEffect(() => {
    setMixVolume(volume);
    clip.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const present = new Set(song.notes.map((note) => note.instrument));
    const next = day.mode === "easy" && day.hintTier >= 1 ? INSTRUMENTS.map((item) => item.id).filter((id) => !present.has(id)) : [];
    setQuietInstruments(next);
  }, [day.mode, day.hintTier, song]);

  useEffect(() => {
    if (!wasLocked.current && day.locked) setResultOpen(true);
    wasLocked.current = day.locked;
  }, [day.locked]);

  useEffect(() => {
    if (!state.tutorialOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "set-tutorial", open: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.tutorialOpen, dispatch]);

  function stopSong() {
    songPlayingRef.current = false;
    setSongPlaying(false);
    clip.current?.pause();
  }

  function begin(from: number, events: NoteEvent[], withClick: boolean) {
    startPlayback({
      from,
      events,
      bpm: song.bpm,
      metronome: withClick,
      onTick: (time) => {
        if (!alive.current) return;
        playheadRef.current = time;
        setPlayhead(time);
      },
      onEnd: () => {
        if (!alive.current) return;
        setRecording(false);
        setMixOn(false);
        playheadRef.current = 20;
        setPlayhead(20);
      },
      onBeat: () => undefined,
    });
  }

  function onPlay() {
    if (recording || counting) {
      cancelCount.current = true;
      stopPlayback();
      setRecording(false);
      setCounting(false);
      setMixOn(false);
      return;
    }
    if (mixOn) {
      stopPlayback();
      setMixOn(false);
    }
    if (songPlaying) {
      stopSong();
      return;
    }
    const from = playhead >= 19.9 ? 0 : playhead;
    playheadRef.current = from;
    setPlayhead(from);
    songPlayingRef.current = true;
    setSongPlaying(true);
    void resumeAudio();
    clip.current?.setVolume(volume);
    clip.current?.playFrom(from);
  }

  async function startRecord(take: "replace" | "overdub") {
    if (day.locked) return;
    stopSong();
    cancelCount.current = false;
    await resumeAudio();
    const existing = mixEvents(day.tracks).filter((event) => take === "overdub" || event.instrument !== armed);
    if (take === "replace") dispatch({ type: "clear", instrument: armed });
    stopPlayback();
    setPlayhead(0);
    playheadRef.current = 0;
    setCounting(true);
    const beat = beatSeconds(song.bpm);
    for (let index = 0; index < 4; index++) {
      if (cancelCount.current) {
        setCounting(false);
        return;
      }
      setCount(4 - index);
      playClick(index === 0);
      await new Promise((resolve) => window.setTimeout(resolve, beat * 1000));
    }
    if (cancelCount.current || !alive.current) {
      setCounting(false);
      return;
    }
    setCounting(false);
    setRecording(true);
    setMixOn(false);
    begin(0, existing, true);
  }

  function onListen() {
    if (recording || counting) return;
    stopSong();
    if (mixOn) {
      stopPlayback();
      setMixOn(false);
      return;
    }
    const events = mixEvents(day.tracks);
    if (!events.length) return;
    setMixOn(true);
    void resumeAudio().then(() => begin(0, events, false));
  }

  function placePitch(midi: number, time: number) {
    if (day.locked || recording || counting) return;
    const when = quantizeTime(time, song.bpm, quantize);
    setLatched(midi);
    const event: NoteEvent = {
      instrument: armed,
      time: when,
      duration: Math.min(beatSeconds(song.bpm), 20 - when),
      velocity: 0.8,
      pitch: midi,
    };
    dispatch({ type: "add-events", instrument: armed, events: [event] });
    void resumeAudio().then(() => triggerEvent(event));
  }

  function placeDrum(drum: DrumName, time: number) {
    if (day.locked || recording || counting) return;
    const event: NoteEvent = {
      instrument: armed,
      drum,
      time: quantizeTime(time, song.bpm, quantize),
      duration: 0.12,
      velocity: 0.86,
    };
    dispatch({ type: "add-events", instrument: armed, events: [event] });
    void resumeAudio().then(() => triggerEvent(event));
  }

  function onRecord() {
    if (day.locked) return;
    if (recording || counting) {
      cancelCount.current = true;
      stopPlayback();
      releaseAll();
      setRecording(false);
      setCounting(false);
      return;
    }
    const track = day.tracks.find((item) => item.instrument === armed);
    if (track && track.events.length > 0) {
      setReplacePrompt(true);
      return;
    }
    void startRecord("overdub");
  }

  function pitchDown(midi: number) {
    setLatched(midi);
    void resumeAudio().then(() => beginPitch(armed, midi));
    if (!recording || day.locked || info.kind !== "pitched") return;
    held.current.set(`p${midi}`, quantizeTime(playheadRef.current, song.bpm, quantize));
  }

  function pitchUp(midi: number) {
    endPitch(armed, midi);
    const start = held.current.get(`p${midi}`);
    held.current.delete(`p${midi}`);
    if (start == null || !recording || day.locked) return;
    const step = beatSeconds(song.bpm) / 4;
    const end = quantizeTime(Math.max(start + 0.05, playheadRef.current), song.bpm, quantize);
    const duration = Math.min(20 - start, Math.max(quantize ? step : 0.08, end - start));
    dispatch({
      type: "add-events",
      instrument: armed,
      events: [{ instrument: armed, time: start, duration, velocity: 0.8, pitch: midi }],
    });
  }

  function drumHit(drum: DrumName) {
    setLatchedDrum(drum);
    const preview: NoteEvent = { instrument: armed, drum, time: 0, duration: 0.12, velocity: 0.86 };
    void resumeAudio().then(() => triggerEvent(preview));
    if (!recording || day.locked) return;
    dispatch({
      type: "add-events",
      instrument: armed,
      events: [{ ...preview, time: quantizeTime(playheadRef.current, song.bpm, quantize) }],
    });
  }

  function dropAt(time: number) {
    if (day.locked || recording || counting) return;
    const when = quantizeTime(time, song.bpm, quantize);
    if (info.kind === "drum") {
      const drum = latchedDrum ?? drumsFor(armed)[0];
      const event: NoteEvent = { instrument: armed, drum, time: when, duration: 0.12, velocity: 0.86 };
      dispatch({ type: "add-events", instrument: armed, events: [event] });
      void resumeAudio().then(() => triggerEvent(event));
      return;
    }
    if (latched == null) return;
    const event: NoteEvent = {
      instrument: armed,
      time: when,
      duration: Math.min(beatSeconds(song.bpm), 20 - when),
      velocity: 0.8,
      pitch: latched,
    };
    dispatch({ type: "add-events", instrument: armed, events: [event] });
    void resumeAudio().then(() => triggerEvent(event));
  }

  function onScrub(time: number, phase: "down" | "move" | "up") {
    if (recording || counting) return;
    if (phase === "down") scrubOrigin.current = time;
    playheadRef.current = time;
    setPlayhead(time);
    if (songPlaying) clip.current?.seek(time);
    if (phase === "up" && !songPlaying && Math.abs(time - scrubOrigin.current) < 0.45) dropAt(time);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || typingTarget(event.target) || day.locked || state.tutorialOpen) return;
      if (info.kind === "drum") {
        const map = armed === "machine" ? MACHINE_KEYS : KIT_KEYS;
        const drum = map[event.key.toLowerCase()];
        if (!drum) return;
        event.preventDefault();
        drumHit(drum);
        return;
      }
      const offset = KEY_OFFSET[event.key.toLowerCase()];
      if (offset == null || offset > 24) return;
      event.preventDefault();
      pitchDown(info.baseMidi + offset);
    }
    function onKeyUp(event: KeyboardEvent) {
      if (info.kind !== "pitched") return;
      const offset = KEY_OFFSET[event.key.toLowerCase()];
      if (offset == null) return;
      pitchUp(info.baseMidi + offset);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  function finishSubmit(declineSection = false) {
    if (day.mode === "easy" && day.attempts.length === 4 && !day.sectionFilled && !day.declinedSection && !declineSection) {
      setSectionPrompt("submit");
      return;
    }
    dispatch({ type: "submit", declineSection });
  }

  function onSubmit() {
    if (day.locked || day.attempts.length >= 5) return;
    cancelCount.current = true;
    stopPlayback();
    stopSong();
    setRecording(false);
    setCounting(false);
    if (!nameReady(state.username)) {
      setNamePrompt(true);
      return;
    }
    finishSubmit();
  }

  function onHint() {
    if (day.mode !== "easy" || day.locked || day.sectionFilled) return;
    if (day.hintedInstruments.length < picksNeeded(day.hintTier)) {
      setPickPrompt(true);
      return;
    }
    if (day.hintTier >= 4) {
      setSectionPrompt("hint");
      return;
    }
    dispatch({ type: "hint" });
  }

  const docks = day.mode === "easy" ? dockTotal(day.hintTier) : 0;
  const official = day.attempts.length ? officialScore(day) : null;
  const best = bestAttempt(day.attempts);
  const calm = official != null && best ? calmLine(official, song.notes, best.events) : "";
  const picksOpen = day.mode === "easy" && !day.locked && day.hintedInstruments.length < picksNeeded(day.hintTier);
  const songInstruments = new Set(song.notes.map((note) => note.instrument));
  const choices = INSTRUMENTS.filter((item) => songInstruments.has(item.id) && !day.hintedInstruments.includes(item.id));
  const shareCard =
    day.locked && best && state.username
      ? {
          id: `you:${state.today}`,
          username: state.username.trim(),
          score: official ?? 0,
          date: state.today,
          bpm: song.bpm,
          title: song.title,
          events: best.events,
          follows: state.follows,
          source: "you" as const,
          locked: true,
        }
      : null;
  const shareUrl = shareCard ? `${location.origin}${location.pathname}${location.search}#${shareHash(shareCard)}` : "";
  const resultCopy = shareCard ? `DAWdle ${state.today}\n${shareCard.score}%\n${day.attempts.map((attempt) => square(attempt.raw)).join("")}\n${shareUrl}` : "";
  const status = counting ? `Count ${count}` : recording ? "Recording. The song is paused." : songPlaying ? "Listening" : mixOn ? "Your song" : "";
  const [year, month, dayOfMonth] = state.today.split("-");
  const prettyDate = `${Number(month)}/${Number(dayOfMonth)}/${year}`;
  const songLine = `${song.title} ${song.artist} · ${song.year}`;
  const usedTracks = INSTRUMENTS.filter((item) => (day.tracks.find((track) => track.instrument === item.id)?.events.length ?? 0) > 0).sort(
    (a, b) => Number(a.kind !== "drum") - Number(b.kind !== "drum"),
  );
  const armedNotes = day.tracks.find((track) => track.instrument === armed)?.events ?? [];
  const hintOff = day.mode !== "easy" || day.locked || day.sectionFilled != null || day.hintTier >= 5;

  async function copyResult() {
    if (!resultCopy) return;
    try {
      await navigator.clipboard.writeText(resultCopy);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="studio" data-mode={mode} data-testid="listen">
      <header className="top">
        <div className="brand">
          <h1>DAWdle</h1>
          <p className="date">{prettyDate}</p>
          <p className="songline">{songLine}</p>
        </div>
        <div className="top-tools">
          <button type="button" className="icon-btn" aria-label="How to play" onClick={() => dispatch({ type: "set-tutorial", open: true })}>
            i
          </button>
          <a className="icon-btn" href="#you" aria-label="You">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="9" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M6 18.5c1.4-2.6 3.4-3.8 6-3.8s4.6 1.2 6 3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </a>
          <button
            type="button"
            className="hard-pill"
            role="switch"
            aria-checked={day.mode === "hard"}
            aria-label={day.mode === "hard" ? "Hard. Percentage only." : "Easy. Hints lower your score."}
            disabled={day.modeLocked}
            onClick={() => dispatch({ type: "set-mode", mode: day.mode === "hard" ? "easy" : "hard" })}
          >
            Hard
            <span className="knob" />
          </button>
        </div>
      </header>

      <ClipPlayer
        ref={clip}
        videoId={song.id}
        date={state.today}
        volume={volume}
        hidden={false}
        onLocal={(seconds) => {
          if (!songPlayingRef.current) return;
          playheadRef.current = seconds;
          setPlayhead(seconds);
        }}
        onEnded={() => {
          songPlayingRef.current = false;
          setSongPlaying(false);
        }}
        onReady={() => setClipError(false)}
        onError={() => setClipError(true)}
      />
      {clipError && <p className="clip-error">This video cannot be embedded. You can still play your version.</p>}

      <div className="play-row">
        <button type="button" className="play-pill" onClick={onPlay}>
          {songPlaying ? "Pause" : "Play"}
        </button>
        <Waveform notes={[]} peaks={peaks} playhead={playhead} onScrub={onScrub} />
      </div>

      <div className="vol-row">
        <svg className="speaker" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          <path d="M16 9.5a4 4 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          aria-label="Volume for the song and your instruments"
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
        />
        <button type="button" className="hint-pill" onClick={onHint} disabled={hintOff}>
          {picksOpen ? "Pick" : "Hint"}
        </button>
      </div>

      {status && (
        <p className={`mode-label mode-${mode}`} data-testid="mode-label">
          {status}
          {official != null ? ` · ${official}%` : ""}
          {docks > 0 ? ` · hints −${docks}` : ""}
        </p>
      )}
      {!status && <p className="mode-label" data-testid="mode-label" />}

      <div className="inst-row">
        <button type="button" className="inst-toggle" onClick={() => setWriter(writer === "closed" ? "pick" : "closed")}>
          {writer === "roll" ? info.name : "Select instrument"}
          <Caret up={writer !== "closed"} />
        </button>
        {writer === "roll" && (
          <button type="button" className={mode === "listen" ? "rec" : "rec is-on"} onClick={onRecord} disabled={day.locked} aria-label={counting || recording ? "Stop" : "Record"}>
            {counting ? count : recording ? "stop" : "record"}
          </button>
        )}
      </div>

      {writer === "pick" && (
        <div className="inst-grid" role="listbox" aria-label="Instruments">
          {INSTRUMENTS.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-label={item.name}
              aria-pressed={armed === item.id}
              onClick={() => {
                setArmed(item.id);
                if (instrumentInfo(item.id).kind === "drum") setLatched(null);
                setWriter("roll");
              }}
            >
              <InstrumentGlyph id={item.id} />
            </button>
          ))}
        </div>
      )}

      {writer === "roll" && (
        <div className="roll-card">
          {counting && (
            <p className="count-num" aria-live="assertive">
              {count}
            </p>
          )}
          {info.kind === "pitched" ? (
            <PianoRoll base={info.baseMidi} notes={armedNotes} playhead={playhead} recording={recording} onPlace={placePitch} onDown={pitchDown} onUp={pitchUp} />
          ) : (
            <DrumLanes drums={drumsFor(armed)} notes={armedNotes} playhead={playhead} onPlace={placeDrum} onHit={drumHit} />
          )}
        </div>
      )}

      <section className="song-card">
        <div className="song-head">
          <h2>Your song</h2>
          <button type="button" className="listen-pill" onClick={onListen} disabled={!mixEvents(day.tracks).length}>
            {mixOn ? "Stop" : "Listen"}
          </button>
        </div>
        {usedTracks.length === 0 && <p className="empty-tracks">Notes you add show up here.</p>}
        {usedTracks.map((item) => {
          const events = day.tracks.find((track) => track.instrument === item.id)?.events ?? [];
          const open = !folded.includes(item.id);
          return (
            <div className="track" key={item.id}>
              <button
                type="button"
                className="track-toggle"
                aria-expanded={open}
                aria-label={`${item.name} track`}
                onClick={() => setFolded((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]))}
              >
                <InstrumentGlyph id={item.id} />
                <Caret up={open} />
              </button>
              <div className={open ? "lane open" : "lane"}>
                {open &&
                  events.map((event, index) => (
                    <span
                      key={`${event.time}-${index}`}
                      className={item.kind === "drum" ? "blk yel" : "blk pur"}
                      style={{ left: `${(event.time / 20) * 100}%`, width: `${Math.max(1.5, (event.duration / 20) * 100)}%` }}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      </section>

      <div className="tries" aria-label="Tries">
        {Array.from({ length: 5 }, (_, index) => {
          const attempt = day.attempts[index];
          return (
            <div className="try" key={index}>
              <span>{attempt ? `${attempt.raw}%` : ""}</span>
              <div className="try-track">
                <div className="try-fill" style={{ width: attempt ? `${Math.max(0, Math.min(100, attempt.raw))}%` : "0%" }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="submit-wrap">
        <button type="button" className="submit-pill" onClick={onSubmit} disabled={day.locked || day.attempts.length >= 5}>
          {day.locked ? "Finished" : "Submit"}
        </button>
        {day.locked && (
          <button type="button" className="submit-pill" onClick={() => setResultOpen(true)}>
            Result
          </button>
        )}
      </div>

      {state.tutorialOpen && (
        <div className="overlay">
          <div className="modal" role="dialog" aria-label="How to play">
            <div className="modal-top">
              <h2>How to play</h2>
              <button type="button" aria-label="Close instructions" onClick={() => dispatch({ type: "set-tutorial", open: false })}>
                Close
              </button>
            </div>
            <p>Everyone hears the same 20 seconds of a real song. You play your own version. You get five tries. Your best percentage is kept.</p>
            <h3>Two ways to add notes</h3>
            <p>
              <strong>Play along.</strong> Press record, wait for the count of four, then play for the whole 20 seconds. The song stays quiet while you record.
            </p>
            <p>
              <strong>Place one hit.</strong> Open an instrument, then tap the grid where that sound should go.
            </p>
            <div className="example" aria-label={`${EXAMPLE_TITLE} example`}>
              <p>Piano, played the whole way</p>
              <div className="ex-row">{Array.from({ length: 12 }, (_, index) => <span key={index} className="ex-note" />)}</div>
              <p>Kicks, one tap on each beat</p>
              <div className="ex-row">{Array.from({ length: 4 }, (_, index) => <span key={index} className="ex-hit" />)}</div>
            </div>
            <p>Easy can reveal pieces of a hidden arrangement. Those hints lower your score. Hard is the percentage only.</p>
            <p>After five tries, you can share and see everyone who finished today.</p>
            <button
              type="button"
              disabled={day.locked}
              onClick={() => {
                dispatch({ type: "load-example" });
                setArmed("piano");
                setWriter("roll");
                dispatch({ type: "set-tutorial", open: false });
              }}
            >
              Try the example
            </button>
            <button type="button" className="play lets" onClick={() => dispatch({ type: "set-tutorial", open: false })}>
              Let's play
            </button>
          </div>
        </div>
      )}

      {namePrompt && (
        <div className="overlay">
          <div className="modal" role="dialog" aria-label="Your name">
            <h2>What should we call you?</h2>
            <p>Your name shows up after the five tries, with everyone else who finished.</p>
            <label className="name-field">
              <span>Your name</span>
              <input value={state.username} maxLength={20} autoComplete="nickname" onChange={(event) => dispatch({ type: "set-name", name: event.target.value })} />
            </label>
            <button
              type="button"
              className="play"
              disabled={!nameReady(state.username)}
              onClick={() => {
                setNamePrompt(false);
                finishSubmit();
              }}
            >
              Use this name
            </button>
          </div>
        </div>
      )}

      {sectionPrompt && (
        <div className="overlay">
          <div className="modal" role="dialog" aria-label="Fill a section">
            <h2>{sectionPrompt === "submit" ? "Last hint" : "Fill one part"}</h2>
            <p>This copies part of the hidden arrangement onto your sketch and lowers your score.</p>
            {SECTIONS.map((section) => {
              const available = section.instruments.some((id) => songInstruments.has(id));
              return (
                <button
                  type="button"
                  key={section.id}
                  disabled={!available}
                  onClick={() => {
                    dispatch({ type: "fill-section", section: section.id as SectionId, submit: sectionPrompt === "submit" });
                    setSectionPrompt(null);
                  }}
                >
                  {section.label}
                </button>
              );
            })}
            {sectionPrompt === "submit" && (
              <button
                type="button"
                onClick={() => {
                  setSectionPrompt(null);
                  dispatch({ type: "submit", declineSection: true });
                }}
              >
                Keep my sketch
              </button>
            )}
            {sectionPrompt === "hint" && (
              <button type="button" onClick={() => setSectionPrompt(null)}>
                Not now
              </button>
            )}
          </div>
        </div>
      )}

      {pickPrompt && picksOpen && !state.tutorialOpen && (
        <div className="overlay">
          <div className="modal" role="dialog" aria-label="Hint instrument">
            <h2>Pick one instrument</h2>
            <p>About a third of its hidden notes land on your sketch. This lowers your score.</p>
            {choices.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  dispatch({ type: "pick-instrument", instrument: item.id });
                  setPickPrompt(false);
                }}
              >
                {item.name}
              </button>
            ))}
            <button type="button" onClick={() => setPickPrompt(false)}>
              Not now
            </button>
          </div>
        </div>
      )}

      {replacePrompt && (
        <div className="overlay">
          <div className="modal" role="dialog" aria-label="This instrument already has notes">
            <h2>{info.name} already has notes</h2>
            <p>Replace them, or add more on top?</p>
            <button type="button" onClick={() => { setReplacePrompt(false); void startRecord("replace"); }}>
              Replace
            </button>
            <button type="button" onClick={() => { setReplacePrompt(false); void startRecord("overdub"); }}>
              Add more
            </button>
            <button type="button" onClick={() => setReplacePrompt(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {resultOpen && day.locked && best && (
        <div className="overlay">
          <div className="modal" role="dialog" aria-label="Today's result">
            <div className="modal-top">
              <h2>Today's result</h2>
              <button type="button" onClick={() => setResultOpen(false)}>
                Close
              </button>
            </div>
            <p className="score-num" data-testid="score">
              {official}%
            </p>
            {docks > 0 && <p>Hints lowered this by {docks}.</p>}
            <p className="calm">{calm}</p>
            <pre className="wordle">{resultCopy}</pre>
            <button type="button" onClick={() => void copyResult()}>
              {copied ? "Copied" : "Copy result"}
            </button>
            <button type="button" onClick={() => { stopSong(); void resumeAudio().then(() => begin(0, best.events, false)); }}>
              Hear your sketch
            </button>
            <button type="button" onClick={() => { stopSong(); void resumeAudio().then(() => begin(0, song.notes, false)); }}>
              Hear the hidden arrangement
            </button>
            <button
              type="button"
              className="play"
              onClick={() => {
                setResultOpen(false);
                location.hash = "#leaderboard";
              }}
            >
              Everyone today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
