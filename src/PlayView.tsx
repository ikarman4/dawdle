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
import { beatSeconds, formatClock, quantizeTime, songForDate, windowPeaks } from "./daily";
import { EXAMPLE_TITLE } from "./example";
import { calmLine } from "./score";
import { bestAttempt, dockTotal, officialScore, picksNeeded } from "./progress";
import { shareHash } from "./share";
import { nameReady, useGame } from "./store";
import {
  DRUM_LABELS,
  INSTRUMENTS,
  SECTIONS,
  drumsFor,
  instrumentInfo,
  noteName,
  type DrumName,
  type InstrumentId,
  type NoteEvent,
  type SectionId,
  type Track,
} from "./types";
import { DrumGrid, Keyboard, Pads, Waveform } from "./widgets";

const KEY_OFFSET: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16, "'": 17,
};
const KIT_KEYS: Record<string, DrumName> = { a: "kick", s: "snare", d: "closedHat", f: "openHat", g: "tom", h: "clap" };
const MACHINE_KEYS: Record<string, DrumName> = { a: "kick", s: "snare", d: "hat", f: "clap" };

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
  const { state, day, dispatch, streak } = useGame();
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
  const [heldNotes, setHeldNotes] = useState<number[]>([]);
  const [instrumentsOpen, setInstrumentsOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [namePrompt, setNamePrompt] = useState(false);
  const [replacePrompt, setReplacePrompt] = useState(false);
  const [sectionPrompt, setSectionPrompt] = useState<null | "hint" | "submit">(null);
  const [pickPrompt, setPickPrompt] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [quantize, setQuantize] = useState(true);
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
      return;
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
    begin(0, existing, true);
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
    setHeldNotes((current) => (current.includes(midi) ? current : [...current, midi]));
    void resumeAudio().then(() => beginPitch(armed, midi));
    if (!recording || day.locked || info.kind !== "pitched") return;
    held.current.set(`p${midi}`, quantizeTime(playheadRef.current, song.bpm, quantize));
  }

  function pitchUp(midi: number) {
    endPitch(armed, midi);
    setHeldNotes((current) => current.filter((note) => note !== midi));
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

  const armedCount = day.tracks.find((track) => track.instrument === armed)?.events.length ?? 0;
  const docks = day.mode === "easy" ? dockTotal(day.hintTier) : 0;
  const official = day.attempts.length ? officialScore(day) : null;
  const best = bestAttempt(day.attempts);
  const calm = official != null && best ? calmLine(official, song.notes, best.events) : "";
  const nextDock = [4, 8, 8, 8, 15][Math.min(4, day.hintTier)] ?? 15;
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
  const status = counting ? `Count ${count}` : recording ? "Recording. The song is paused." : songPlaying ? "Listening" : "Ready";

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
      <header className="header">
        <div>
          <h1 className="wordmark">DAWdle</h1>
          <p className="date">{state.today} UTC · Streak {streak}</p>
        </div>
        <div className="header-actions">
          <div role="radiogroup" aria-label="Mode">
            <button type="button" role="radio" aria-checked={day.mode === "easy"} aria-label="Easy. Hints lower your score." disabled={day.modeLocked} onClick={() => dispatch({ type: "set-mode", mode: "easy" })}>
              Easy
            </button>
            <button type="button" role="radio" aria-checked={day.mode === "hard"} aria-label="Hard. Percentage only." disabled={day.modeLocked} onClick={() => dispatch({ type: "set-mode", mode: "hard" })}>
              Hard
            </button>
          </div>
          {day.mode === "easy" && !day.locked && !day.sectionFilled && day.hintTier < 5 && (
            <button type="button" onClick={onHint}>
              {picksOpen ? "Pick a hint" : `Hint (−${nextDock})`}
            </button>
          )}
          <button type="button" aria-label="How to play" onClick={() => dispatch({ type: "set-tutorial", open: true })}>
            Info
          </button>
          {day.locked && (
            <button type="button" onClick={() => setResultOpen(true)}>
              Result
            </button>
          )}
        </div>
      </header>

      <p className="meta">
        {song.title}
        <span>
          {song.artist} · {song.year}
        </span>
      </p>
      <p className={`mode-label mode-${mode}`} data-testid="mode-label">
        {status}
        {official != null ? ` · ${official}%` : ""}
        {docks > 0 ? ` · hints −${docks}` : ""}
      </p>
      <Waveform notes={[]} peaks={peaks} playhead={playhead} onScrub={onScrub} />
      <p className="time">
        {formatClock(playhead)} / 0:20
        {clipError ? " · This video cannot be embedded. You can still play your version." : ""}
      </p>

      <ClipPlayer
        ref={clip}
        videoId={song.id}
        date={state.today}
        volume={volume}
        hidden={mode !== "listen"}
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

      <div className="stage">
        {counting && (
          <p className="count-num" aria-live="assertive">
            {count}
          </p>
        )}
        <div data-testid="instrument">
          {info.kind === "pitched" ? (
            <Keyboard base={info.baseMidi} latched={latched} held={heldNotes} barred={armed === "glock" || armed === "xylo"} onDown={pitchDown} onUp={pitchUp} />
          ) : (
            <Pads drums={drumsFor(armed)} latched={latchedDrum} onHit={drumHit} />
          )}
        </div>
        <p className="latch">
          {info.kind === "drum"
            ? `${DRUM_LABELS[latchedDrum ?? drumsFor(armed)[0]]} is selected. Tap the wave to place one hit.`
            : latched == null
              ? "Tap a key, then tap the wave to place that note."
              : `${noteName(latched)} is selected. Tap the wave to place it.`}
          <span data-testid={`count-${armed}`}> {armedCount} notes</span>
        </p>
        <label className="snap">
          <input type="checkbox" checked={quantize} onChange={(event) => setQuantize(event.target.checked)} />
          Snap to the beat. Notes land on the count.
        </label>
        {info.kind === "drum" && (
          <details>
            <summary>Pattern. Tap the boxes, then repeat them for all 20 seconds.</summary>
            <DrumGrid key={armed} instrument={armed} bpm={song.bpm} onLoop={(events) => dispatch({ type: "add-events", instrument: armed, events })} />
          </details>
        )}
      </div>

      <div className="dock" data-testid="controls">
        <label className="volume">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            aria-label="Volume for the song and your instruments"
            onChange={(event) => setVolume(Number(event.target.value) / 100)}
          />
        </label>
        <button type="button" className="play" onClick={onPlay}>
          {songPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" className={mode === "listen" ? "record" : "record is-on"} onClick={onRecord} disabled={day.locked}>
          {counting ? "Count" : recording ? "Stop" : "Record"}
        </button>
        <button type="button" className="instrument" aria-label={`Instrument, ${info.name}`} onClick={() => setInstrumentsOpen(true)}>
          {info.name}
        </button>
        <button type="button" className="submit" onClick={onSubmit} disabled={day.locked || day.attempts.length >= 5}>
          {day.locked ? "Finished" : `Submit ${Math.min(5, day.attempts.length + 1)} of 5`}
        </button>
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
              <strong>Place one hit.</strong> Tap a drum, then tap the wave where that sound should go.
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

      {instrumentsOpen && (
        <div className="overlay">
          <div className="modal" role="dialog" aria-label="Instruments">
            <div className="modal-top">
              <h2>{info.name}</h2>
              <button type="button" onClick={() => setInstrumentsOpen(false)}>
                Done
              </button>
            </div>
            <div className="row">
              <button type="button" aria-pressed={day.tracks.find((track) => track.instrument === armed)?.mute ?? false} onClick={() => dispatch({ type: "mute", instrument: armed })}>
                Mute
              </button>
              <button type="button" aria-pressed={day.tracks.find((track) => track.instrument === armed)?.solo ?? false} onClick={() => dispatch({ type: "solo", instrument: armed })}>
                Solo
              </button>
              <button type="button" onClick={() => dispatch({ type: "clear", instrument: armed })}>
                Clear
              </button>
            </div>
            <p className="latch">Mute turns this one off. Solo plays only this one. Clear removes its notes.</p>
            {(["Keys", "Strings", "Drums", "Percussion"] as const).map((group) => (
              <div key={group}>
                <h3>{group}</h3>
                {INSTRUMENTS.filter((item) => item.group === group).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={armed === item.id ? "inst on" : "inst"}
                    aria-pressed={armed === item.id}
                    onClick={() => {
                      setArmed(item.id);
                      if (instrumentInfo(item.id).kind === "drum") setLatched(null);
                      setInstrumentsOpen(false);
                    }}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            ))}
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
