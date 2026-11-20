import { useEffect, useRef, useState } from "react";
import {
  beginPitch,
  endPitch,
  playClick,
  releaseAll,
  resumeAudio,
  setQuietInstruments,
  startPlayback,
  stopPlayback,
  triggerEvent,
} from "./audio";
import { beatSeconds, formatClock, quantizeTime, songForDate } from "./daily";
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
import { DrumGrid, Keyboard, Pads, Timeline, Waveform } from "./widgets";

const KEY_OFFSET: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ";": 16,
  "'": 17,
};

const KIT_KEYS: Record<string, DrumName> = {
  a: "kick",
  s: "snare",
  d: "closedHat",
  f: "openHat",
  g: "tom",
  h: "clap",
};
const MACHINE_KEYS: Record<string, DrumName> = { a: "kick", s: "snare", d: "hat", f: "clap" };

function useDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 960px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 960px)");
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return desktop;
}

function mixEvents(tracks: Track[]): NoteEvent[] {
  const soloing = tracks.some((track) => track.solo);
  return tracks.filter((track) => !track.mute && (!soloing || track.solo)).flatMap((track) => track.events);
}

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function PlayView() {
  const { state, day, dispatch, streak } = useGame();
  const song = songForDate(state.today);
  const desktop = useDesktop();
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [counting, setCounting] = useState(false);
  const [hear, setHear] = useState(true);
  const [metronome, setMetronome] = useState(false);
  const [countIn, setCountIn] = useState(false);
  const [quantize, setQuantize] = useState(false);
  const [armed, setArmed] = useState<InstrumentId>("piano");
  const [latched, setLatched] = useState<number | null>(null);
  const [latchedDrum, setLatchedDrum] = useState<DrumName | null>("kick");
  const [heldNotes, setHeldNotes] = useState<number[]>([]);
  const [sheet, setSheet] = useState(false);
  const [lamp, setLamp] = useState({ on: false, accent: false });
  const [needName, setNeedName] = useState(false);
  const [replacePrompt, setReplacePrompt] = useState(false);
  const [sectionPrompt, setSectionPrompt] = useState<null | "hint" | "submit">(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const playheadRef = useRef(0);
  const held = useRef<Map<string, number>>(new Map());
  const alive = useRef(true);
  const cancelCount = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const wasPlaying = useRef(false);
  const info = instrumentInfo(armed);
  const songInstruments = new Set(song.notes.map((note) => note.instrument));

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
    const quiet =
      day.mode === "easy" && day.hintTier >= 1
        ? INSTRUMENTS.map((item) => item.id).filter((id) => !songInstruments.has(id))
        : [];
    setQuietInstruments(quiet);
  }, [day.mode, day.hintTier, song.id, songInstruments]);

  useEffect(() => {
    if (day.mode === "easy" && !day.locked && day.hintedInstruments.length < picksNeeded(day.hintTier)) {
      setSectionPrompt(null);
    }
  }, [day.mode, day.locked, day.hintTier, day.hintedInstruments.length]);

  function begin(from: number, events: NoteEvent[], withClick: boolean) {
    setPlaying(true);
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
        setPlaying(false);
        setRecording(false);
        playheadRef.current = 20;
        setPlayhead(20);
      },
      onBeat: (_beat, accent) => {
        if (!alive.current) return;
        setLamp({ on: true, accent });
        window.setTimeout(() => {
          if (alive.current) setLamp({ on: false, accent: false });
        }, 100);
      },
    });
  }

  async function onPlay() {
    if (!day.revealed) dispatch({ type: "reveal" });
    await resumeAudio();
    if (playing || recording || counting) {
      cancelCount.current = true;
      stopPlayback();
      setPlaying(false);
      setRecording(false);
      setCounting(false);
      return;
    }
    const from = playhead >= 19.9 ? 0 : playhead;
    playheadRef.current = from;
    setPlayhead(from);
    begin(from, hear ? song.notes : mixEvents(day.tracks), metronome);
  }

  async function startRecord(mode: "replace" | "overdub") {
    if (day.locked) return;
    cancelCount.current = false;
    await resumeAudio();
    const existing = mixEvents(day.tracks).filter((event) => mode === "overdub" || event.instrument !== armed);
    if (mode === "replace") dispatch({ type: "clear", instrument: armed });
    stopPlayback();
    setPlayhead(0);
    playheadRef.current = 0;
    setMetronome(true);
    if (countIn) {
      setCounting(true);
      const beat = beatSeconds(song.bpm);
      for (let index = 0; index < 4; index++) {
        if (cancelCount.current) {
          setCounting(false);
          return;
        }
        playClick(index === 0);
        setLamp({ on: true, accent: index === 0 });
        await new Promise((resolve) => window.setTimeout(resolve, beat * 1000));
      }
      setCounting(false);
      if (cancelCount.current) return;
    }
    setRecording(true);
    begin(0, [...(hear ? song.notes : []), ...existing], true);
  }

  function onRecord() {
    if (day.locked) return;
    if (recording || counting) {
      cancelCount.current = true;
      stopPlayback();
      setRecording(false);
      setCounting(false);
      setPlaying(false);
      releaseAll();
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
    if (day.locked) return;
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
    if (phase === "down") {
      wasPlaying.current = playing && !recording;
      if (playing) {
        stopPlayback();
        setPlaying(false);
      }
    }
    playheadRef.current = time;
    setPlayhead(time);
    if (phase === "up" && wasPlaying.current) {
      wasPlaying.current = false;
      void resumeAudio().then(() => begin(time, hear ? song.notes : mixEvents(day.tracks), metronome));
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || typingTarget(event.target) || day.locked) return;
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

  function choose(id: InstrumentId) {
    setArmed(id);
    if (!desktop) setSheet(false);
    if (instrumentInfo(id).kind === "drum") setLatched(null);
  }

  function onHint() {
    if (day.mode !== "easy" || day.locked || day.sectionFilled) return;
    if (day.hintedInstruments.length < picksNeeded(day.hintTier)) return;
    if (day.hintTier >= 4) {
      setSectionPrompt("hint");
      return;
    }
    dispatch({ type: "hint" });
  }

  function onSubmit() {
    if (day.locked || day.attempts.length >= 5) return;
    if (!nameReady(state.username)) {
      setNeedName(true);
      nameRef.current?.focus();
      return;
    }
    setNeedName(false);
    if (day.mode === "easy" && day.attempts.length === 4 && !day.sectionFilled && !day.declinedSection) {
      setSectionPrompt("submit");
      return;
    }
    dispatch({ type: "submit" });
  }

  const armedTrack = day.tracks.find((track) => track.instrument === armed);
  const timelineEvents = armedTrack?.events ?? [];
  const docks = day.mode === "easy" ? dockTotal(day.hintTier) : 0;
  const official = day.attempts.length ? officialScore(day) : null;
  const best = bestAttempt(day.attempts);
  const calm = official != null && best ? calmLine(official, song.notes, best.events) : "";
  const nextDock = [4, 8, 8, 8, 15][Math.min(4, day.hintTier)] ?? 15;
  const picksOpen = day.mode === "easy" && !day.locked && day.hintedInstruments.length < picksNeeded(day.hintTier);
  const choices = INSTRUMENTS.filter((item) => songInstruments.has(item.id) && !day.hintedInstruments.includes(item.id));
  const shareCard = day.locked && best && state.username
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

  async function share() {
    if (!shareCard) return;
    const url = `${location.origin}${location.pathname}${location.search}#${shareHash(shareCard)}`;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const recordLabel = counting ? "Count-in" : recording ? "Stop recording" : "Record";

  return (
    <div className="studio">
      <header className="header">
        <div>
          <h1 className="wordmark">DAWdle</h1>
          <p className="date">{state.today} UTC</p>
        </div>
        <div className="status">
          <p className="score-num" data-testid="score">
            {official == null ? "–" : `${official}%`}
          </p>
          <p className="streak">Streak {streak}</p>
          {docks > 0 && <p className="docks">hints −{docks}</p>}
        </div>
      </header>

      <section className="wave-block">
        <Waveform notes={song.notes} playhead={playhead} onScrub={onScrub} />
        <p className="time" data-testid="time-readout" data-seconds={playhead.toFixed(3)}>
          {formatClock(playhead)} / 0:20
        </p>
        {day.revealed ? (
          <p className="meta">
            {song.title} · {song.year} · {song.bpm} BPM · {song.key} · 0:20
          </p>
        ) : (
          <p className="meta">Press play to hear today's song.</p>
        )}
        {notice && <p>{notice}</p>}
        {calm && (
          <p className="calm" aria-live="polite">
            {calm}
          </p>
        )}
      </section>

      <div className="transport">
        <button type="button" className="play" aria-label={playing ? "Pause" : "Play"} onClick={() => void onPlay()}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" className={recording ? "record is-on" : "record"} aria-label={recordLabel} onClick={onRecord} disabled={day.locked}>
          {counting ? "Count-in" : recording ? "Recording" : "Record"}
        </button>
        <span className={lamp.on ? (lamp.accent ? "lamp accent" : "lamp on") : "lamp"} aria-hidden="true" />
        <button type="button" aria-pressed={hear} onClick={() => setHear((value) => !value)}>
          Hear the song
        </button>
        <button type="button" aria-pressed={metronome} onClick={() => setMetronome((value) => !value)}>
          Metronome
        </button>
        <button type="button" aria-pressed={countIn} onClick={() => setCountIn((value) => !value)}>
          Count-in
        </button>
        <button type="button" aria-pressed={quantize} onClick={() => setQuantize((value) => !value)}>
          Quantize
        </button>
      </div>

      <div className="mode-row">
        <div role="radiogroup" aria-label="Mode" data-testid="mode-toggle">
          <button type="button" role="radio" aria-checked={day.mode === "easy"} disabled={day.modeLocked} onClick={() => dispatch({ type: "set-mode", mode: "easy" })}>
            Easy
          </button>
          <button type="button" role="radio" aria-checked={day.mode === "hard"} disabled={day.modeLocked} onClick={() => dispatch({ type: "set-mode", mode: "hard" })}>
            Hard
          </button>
        </div>
        {day.mode === "easy" && !day.locked && !day.sectionFilled && day.hintTier < 5 && (
          <button type="button" onClick={onHint}>
            {picksOpen ? "Choose a hint instrument" : `Get a hint (−${nextDock})`}
          </button>
        )}
        {day.mode === "easy" && day.hintTier >= 1 && <p>Glowing instruments are in the song. The others still play, only quieter.</p>}
        {picksOpen && (
          <div className="choices" aria-label="Hint instrument">
            <p>Pick an instrument in the song. About 30% of its notes land on your track.</p>
            {choices.map((item) => (
              <button type="button" key={item.id} onClick={() => dispatch({ type: "pick-instrument", instrument: item.id })}>
                {item.name}
              </button>
            ))}
          </div>
        )}
        {sectionPrompt && (
          <div className="choices" aria-label="Section hint">
            <p>{sectionPrompt === "submit" ? "Last hint before the day locks. Fill a section, or keep the sketch you have." : "Fill one section of the real arrangement."}</p>
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
                  {available ? `Fill ${section.label}` : `${section.label}. Nothing in today's song`}
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
                Lock my sketch
              </button>
            )}
            {sectionPrompt === "hint" && (
              <button type="button" onClick={() => setSectionPrompt(null)}>
                Not now
              </button>
            )}
          </div>
        )}
      </div>

      {day.locked && best && (
        <section className="compare" aria-label="Today's comparison">
          <h2>Today's sketch</h2>
          <p className="calm">{calm}</p>
          <p>
            Official {official}%{docks > 0 ? ` · hints −${docks}` : ""} · streak {streak}
          </p>
          <div className="row">
            <button type="button" onClick={() => void resumeAudio().then(() => begin(0, best.events, false))}>
              Play yours
            </button>
            <button type="button" onClick={() => void resumeAudio().then(() => begin(0, song.notes, false))}>
              Play the song
            </button>
            <button type="button" onClick={() => void resumeAudio().then(() => begin(0, [...best.events, ...song.notes], false))}>
              Play both
            </button>
            <button type="button" onClick={() => void share()}>
              Share
            </button>
          </div>
          {copied && <p>Link copied.</p>}
          {shareUrl && <input readOnly value={shareUrl} aria-label="Share link" />}
          {INSTRUMENTS.filter((item) => best.events.some((note) => note.instrument === item.id) || song.notes.some((note) => note.instrument === item.id)).map((item) => (
            <div className="lane" key={item.id}>
              <h3>{item.name}</h3>
              <div className="lane-row you" aria-label={`${item.name} yours`}>
                {best.events
                  .filter((note) => note.instrument === item.id)
                  .map((note, index) => (
                    <span key={index} className="blip you" style={{ left: `${(note.time / 20) * 100}%`, width: `${Math.max(0.8, (note.duration / 20) * 100)}%` }} />
                  ))}
              </div>
              <div className="lane-row ref" aria-label={`${item.name} song`}>
                {song.notes
                  .filter((note) => note.instrument === item.id)
                  .map((note, index) => (
                    <span key={index} className="blip ref" style={{ left: `${(note.time / 20) * 100}%`, width: `${Math.max(0.8, (note.duration / 20) * 100)}%` }} />
                  ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="tutorial" aria-label="How to play">
        <div className="row">
          <h2>How to play</h2>
          <button type="button" onClick={() => dispatch({ type: "toggle-tutorial" })}>
            {state.tutorialOpen ? "Hide instructions" : "Show instructions"}
          </button>
        </div>
        {state.tutorialOpen && (
          <>
            <ol>
              <li>Hit play and scrub the 20 seconds.</li>
              <li>Pick an instrument and record a full pass over the metronome.</li>
              <li>Or drop a single note, or paint a drum pattern, and put a kick on a specific beat.</li>
              <li>Five tries. Keep the best percentage.</li>
              <li>Easy mode nudges and docks a little. Hard mode is the percentage only.</li>
              <li>Then the board.</li>
            </ol>
            <p>
              Example sketch: {EXAMPLE_TITLE}. The piano line is a full pass. The kicks were punched in on beat 1 of each bar.
              Loading it does not submit and does not touch your streak.
            </p>
            <button
              type="button"
              onClick={() => {
                if (day.locked) return;
                dispatch({ type: "load-example" });
                setHear(false);
                setArmed("piano");
                setNotice(`${EXAMPLE_TITLE} is in the studio. Press play to hear it.`);
              }}
              disabled={day.locked}
            >
              Load the example
            </button>
          </>
        )}
      </section>

      {!desktop && (
        <button type="button" className="instrument-launch" onClick={() => setSheet(true)}>
          Instruments
        </button>
      )}

      <div className="player">
        {info.kind === "pitched" ? (
          <Keyboard
            base={info.baseMidi}
            latched={latched}
            held={heldNotes}
            barred={armed === "glock" || armed === "xylo"}
            onDown={pitchDown}
            onUp={pitchUp}
          />
        ) : (
          <Pads drums={drumsFor(armed)} latched={latchedDrum} onHit={drumHit} />
        )}
        {info.kind === "drum" && <DrumGrid key={armed} instrument={armed} bpm={song.bpm} onLoop={(events) => dispatch({ type: "add-events", instrument: armed, events })} />}
        <p className="latch">
          {info.kind === "pitched"
            ? latched == null
              ? "Tap a key to latch it, then drop it on the timeline."
              : `Latched ${noteName(latched)}. Tap the timeline or drop it at the playhead.`
            : `Placing ${DRUM_LABELS[latchedDrum ?? drumsFor(armed)[0]]}. Tap the timeline for one hit, or paint a bar.`}
        </p>
        <p className="keys-help">Computer keys: A row and W row.</p>
        <button type="button" onClick={() => dropAt(playheadRef.current)} disabled={day.locked || (info.kind === "pitched" && latched == null)}>
          Drop at playhead
        </button>
      </div>

      <ul className="tracks">
        {(day.tracks.some((track) => track.instrument === armed) ? day.tracks : [...day.tracks, { instrument: armed, events: [], mute: false, solo: false }]).map((track) => {
          const name = instrumentInfo(track.instrument).name;
          return (
            <li key={track.instrument} className={track.instrument === armed ? "armed" : ""}>
              <button type="button" aria-label={`Arm ${name}`} aria-pressed={track.instrument === armed} onClick={() => choose(track.instrument)}>
                {name}
              </button>
              {track.technique && <span className="tag">{track.technique}</span>}
              <span data-testid={`count-${track.instrument}`}>{track.events.length} notes</span>
              <button type="button" aria-label={`Mute ${name}`} aria-pressed={track.mute} onClick={() => dispatch({ type: "mute", instrument: track.instrument })}>
                Mute
              </button>
              <button type="button" aria-label={`Solo ${name}`} aria-pressed={track.solo} onClick={() => dispatch({ type: "solo", instrument: track.instrument })}>
                Solo
              </button>
              <button type="button" aria-label={`Clear ${name}`} onClick={() => dispatch({ type: "clear", instrument: track.instrument })}>
                Clear
              </button>
            </li>
          );
        })}
      </ul>

      <Timeline
        events={timelineEvents}
        playhead={playhead}
        disabled={day.locked}
        onDrop={dropAt}
        onDelete={(index) => dispatch({ type: "delete-event", instrument: armed, index })}
        onResize={(index, duration) =>
          dispatch({
            type: "resize-event",
            instrument: armed,
            index,
            duration: quantize ? Math.max(beatSeconds(song.bpm) / 4, quantizeTime(duration, song.bpm, true)) : duration,
          })
        }
      />

      <section className="tries">
        <label className="name-field">
          <span>Your name</span>
          <input
            ref={nameRef}
            value={state.username}
            maxLength={20}
            autoComplete="nickname"
            onChange={(event) => dispatch({ type: "set-name", name: event.target.value })}
          />
        </label>
        {needName && <p>Add a name and the board will know this sketch.</p>}
        <ol className="attempts" data-testid="attempts">
          {Array.from({ length: 5 }, (_, index) => {
            const attempt = day.attempts[index];
            const isBest = attempt && best ? attempt.raw === best.raw && day.attempts.findIndex((item) => item.raw === best.raw) === index : false;
            return (
              <li key={index}>
                <span>Try {index + 1}</span>
                <span>{attempt ? `${attempt.raw}%` : "—"}</span>
                {isBest && <span className="tag">best</span>}
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={onSubmit} disabled={day.locked || day.attempts.length >= 5}>
          {day.locked ? "Day locked" : "Submit try"}
        </button>
      </section>

      {(desktop || sheet) && (
        <div
          className={desktop ? "picker" : "sheet"}
          role={desktop ? "region" : "dialog"}
          aria-label="Instruments"
          data-testid={desktop ? "instrument-column" : "instrument-sheet"}
        >
          {!desktop && (
            <button type="button" onClick={() => setSheet(false)}>
              Done
            </button>
          )}
          {(["Keys", "Strings", "Drums", "Percussion"] as const).map((group) => (
            <div key={group}>
              <h2>{group}</h2>
              {INSTRUMENTS.filter((item) => item.group === group).map((item) => {
                const glow = day.mode === "easy" && day.hintTier >= 1 && songInstruments.has(item.id);
                const quiet = day.mode === "easy" && day.hintTier >= 1 && !songInstruments.has(item.id);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={glow ? "inst glow" : quiet ? "inst quiet" : "inst"}
                    aria-pressed={armed === item.id}
                    onClick={() => choose(item.id)}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {replacePrompt && (
        <div className="sheet" role="dialog" aria-label="This track has notes">
          <p>This track has notes. Replace them, or overdub?</p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                setReplacePrompt(false);
                void startRecord("replace");
              }}
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => {
                setReplacePrompt(false);
                void startRecord("overdub");
              }}
            >
              Overdub
            </button>
            <button type="button" onClick={() => setReplacePrompt(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
