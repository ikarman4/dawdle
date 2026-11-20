import { useEffect, useMemo, useRef, useState } from "react";
import {
  beginPitch,
  endPitch,
  primeAudio,
  resumeAudio,
  setMixVolume,
  startPlayback,
  stopPlayback,
  triggerEvent,
} from "./audio";
import { ClipPlayer, type ClipControl } from "./ClipPlayer";
import { beatSeconds, songForDate, windowPeaks } from "./daily";
import { EXAMPLE_TITLE } from "./example";
import { calmLine } from "./score";
import { bestAttempt, dockTotal, ghostsFor, officialScore, songInstruments, stepsToFill } from "./progress";
import { shareHash } from "./share";
import { nameReady, useGame } from "./store";
import {
  INSTRUMENT_EMOJI,
  INSTRUMENTS,
  instrumentInfo,
  type InstrumentId,
  type NoteEvent,
  type Track,
} from "./types";
import { InstrumentGlyph, NoteRoll, Waveform, rowsFor } from "./widgets";

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
  const [armed, setArmed] = useState<InstrumentId>("piano");
  const [draft, setDraft] = useState<NoteEvent[]>([]);
  const [writer, setWriter] = useState<"closed" | "pick" | "roll">("closed");
  const [folded, setFolded] = useState<string[]>([]);
  const [mixOn, setMixOn] = useState(false);
  const [partOn, setPartOn] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [namePrompt, setNamePrompt] = useState(false);
  const [hintPick, setHintPick] = useState(false);
  const [pickerReturn, setPickerReturn] = useState<"closed" | "roll">("closed");
  const [volume, setVolume] = useState(0.85);
  const [copied, setCopied] = useState(false);
  const [clipError, setClipError] = useState(false);
  const playheadRef = useRef(0);
  const alive = useRef(true);
  const songPlayingRef = useRef(false);
  const draftRef = useRef<NoteEvent[]>([]);
  const armedRef = useRef<InstrumentId>("piano");
  const wasLocked = useRef(day.locked);
  const info = instrumentInfo(armed);
  const peaks = useMemo(() => windowPeaks(song.id, state.today, 120), [song.id, state.today]);

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
        setMixOn(false);
        setPartOn(false);
        playheadRef.current = 20;
        setPlayhead(20);
      },
      onBeat: () => undefined,
    });
  }

  function onPlay() {
    if (mixOn || partOn) {
      stopPlayback();
      setMixOn(false);
      setPartOn(false);
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

  function replaceDraft(next: NoteEvent[]) {
    draftRef.current = next;
    setDraft(next);
  }

  function commitDraft() {
    const events = draftRef.current;
    if (!events.length || day.locked) return;
    const instrument = armedRef.current;
    draftRef.current = [];
    setDraft([]);
    dispatch({ type: "save-track", instrument, events });
  }

  function stopMix() {
    stopPlayback();
    setPartOn(false);
    setMixOn(false);
  }

  function openPicker() {
    stopSong();
    stopMix();
    if (writer !== "pick") setPickerReturn(writer === "roll" ? "roll" : "closed");
    setWriter("pick");
  }

  function closePicker() {
    setWriter(pickerReturn);
  }

  function chooseInstrument(id: InstrumentId) {
    stopSong();
    stopMix();
    if (draftRef.current.length && !day.locked) {
      dispatch({ type: "save-track", instrument: armedRef.current, events: draftRef.current.slice() });
    }
    draftRef.current = [];
    setDraft([]);
    armedRef.current = id;
    setArmed(id);
    setPickerReturn("roll");
    setWriter("roll");
  }

  function onListen() {
    stopSong();
    if (partOn) {
      stopPlayback();
      setPartOn(false);
    }
    if (mixOn) {
      stopPlayback();
      setMixOn(false);
      return;
    }
    const events = mixEvents(day.tracks);
    if (!events.length) return;
    setMixOn(true);
    primeAudio();
    void resumeAudio().then(() => begin(0, events, false));
  }

  function onPlayPart() {
    stopSong();
    if (mixOn) {
      stopPlayback();
      setMixOn(false);
    }
    if (partOn) {
      stopPlayback();
      setPartOn(false);
      return;
    }
    const events = draftRef.current;
    if (!events.length) return;
    setPartOn(true);
    setPlayhead(0);
    playheadRef.current = 0;
    primeAudio();
    void resumeAudio().then(() => begin(0, events, false));
  }

  function onSave() {
    stopPlayback();
    setPartOn(false);
    setMixOn(false);
    commitDraft();
    setWriter("closed");
  }

  function onClear() {
    if (day.locked) return;
    stopPlayback();
    stopSong();
    setPartOn(false);
    setMixOn(false);
    draftRef.current = [];
    setDraft([]);
    dispatch({ type: "clear-song" });
  }

  function onScrub(time: number, phase: "down" | "move" | "up") {
    playheadRef.current = time;
    setPlayhead(time);
    if (songPlaying && phase !== "move") clip.current?.seek(time);
    if (songPlaying && phase === "move") clip.current?.seek(time);
  }

  function onSubmit() {
    if (day.locked || day.attempts.length >= 5) return;
    stopPlayback();
    stopSong();
    setPartOn(false);
    setMixOn(false);
    commitDraft();
    if (!nameReady(state.username)) {
      setNamePrompt(true);
      return;
    }
    dispatch({ type: "submit" });
  }

  function showHintInstrument(id: InstrumentId) {
    if (armedRef.current !== id) {
      if (draftRef.current.length && !day.locked) {
        dispatch({ type: "save-track", instrument: armedRef.current, events: draftRef.current.slice() });
      }
      draftRef.current = [];
      setDraft([]);
      armedRef.current = id;
      setArmed(id);
    }
    setPickerReturn("roll");
    setWriter("roll");
  }

  function onHint() {
    if (day.mode !== "easy" || day.locked || day.revealedAll) return;
    if (!day.instrumentsRevealed) {
      dispatch({ type: "reveal-instruments" });
      return;
    }
    setHintPick(true);
  }

  const docks = day.mode === "easy" ? dockTotal(day.hintCount) : 0;
  const official = day.attempts.length ? officialScore(day) : null;
  const best = bestAttempt(day.attempts);
  const calm = official != null && best ? calmLine(official, song.notes, best.events) : "";
  const presentIds = songInstruments(song.notes);
  const present = new Set(presentIds);
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
  const status = partOn ? "This instrument" : songPlaying ? "Listening" : mixOn ? "Your song" : "";
  const [year, month, dayOfMonth] = state.today.split("-");
  const prettyDate = `${Number(month)}/${Number(dayOfMonth)}/${year}`;
  const songLine = `${song.title} ${song.artist} · ${song.year}`;
  const savedTracks = day.tracks.filter((track) => track.events.length > 0);
  const hintOff = day.mode !== "easy" || day.locked || day.revealedAll;
  const ghosts = ghostsFor(song.notes, armed, day.hintSteps[armed] ?? 0);

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
    <div className="studio" data-mode="listen" data-part={partOn ? "on" : "off"} data-testid="listen">
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
          Hint
        </button>
      </div>

      {day.instrumentsRevealed && day.mode === "easy" && (
        <p className="hint-line">In this song: {presentIds.map((id) => instrumentInfo(id).name).join(", ")}</p>
      )}

      {status && (
        <p className="mode-label mode-listen" data-testid="mode-label">
          {status}
          {official != null ? ` · ${official}%` : ""}
          {docks > 0 ? ` · hints −${docks}` : ""}
        </p>
      )}
      {!status && <p className="mode-label" data-testid="mode-label" />}

      <div className="inst-row">
        <button type="button" className="inst-toggle" onClick={() => (writer === "pick" ? closePicker() : openPicker())}>
          {writer === "roll" ? info.name : "Select instrument"}
          <Caret up={writer !== "closed"} />
        </button>
        {writer === "roll" && (
          <div className="part-actions">
            <button
              type="button"
              className="rec"
              aria-label={partOn ? "Stop this instrument" : "Play this instrument"}
              disabled={!partOn && draft.length === 0}
              onClick={onPlayPart}
            >
              {partOn ? "Stop" : "Play"}
            </button>
          </div>
        )}
      </div>

      {writer === "pick" && (
        <div className="inst-grid" role="listbox" aria-label="Instruments">
          {INSTRUMENTS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={day.instrumentsRevealed && present.has(item.id) ? "in-song" : ""}
              aria-label={item.name}
              aria-pressed={armed === item.id}
              onClick={() => chooseInstrument(item.id)}
            >
              <InstrumentGlyph id={item.id} />
            </button>
          ))}
        </div>
      )}

      {writer === "roll" && (
        <div className="roll-card">
          <NoteRoll
            instrument={armed}
            rows={rowsFor(armed)}
            notes={draft}
            ghosts={ghosts}
            playhead={playhead}
            disabled={day.locked}
            step={beatSeconds(song.bpm) / 4}
            defaultDuration={beatSeconds(song.bpm)}
            follow={partOn}
            onChange={replaceDraft}
            onPreview={(note) => {
              primeAudio();
              void resumeAudio().then(() => triggerEvent({ ...note, duration: Math.min(0.4, Math.max(0.08, note.duration)) }));
            }}
            onKeyDown={(row) => {
              primeAudio();
              if (row.drum) {
                void resumeAudio().then(() => triggerEvent({ instrument: armed, drum: row.drum, time: 0, duration: 0.12, velocity: 0.86 }));
              } else if (row.midi != null) {
                void resumeAudio().then(() => beginPitch(armed, row.midi!));
              }
            }}
            onKeyUp={(row) => {
              if (row.midi != null) endPitch(armed, row.midi);
            }}
          />
          <button type="button" className="save-song" onClick={onSave} disabled={day.locked || draft.length === 0}>
            Save to song
          </button>
        </div>
      )}

      <section className="song-card">
        <div className="song-head">
          <h2>Your song</h2>
          <div className="song-actions">
            <button type="button" className="add-track" aria-label="Add instrument" onClick={openPicker}>
              +
            </button>
            <button type="button" className="listen-pill" aria-label={mixOn ? "Stop your song" : "Listen"} onClick={onListen} disabled={savedTracks.length === 0 && !mixOn}>
              {mixOn ? "Stop" : "Listen"}
            </button>
          </div>
        </div>
        {savedTracks.length === 0 && <p className="empty-tracks">Add an instrument to get started.</p>}
        {savedTracks.map((track) => {
          const item = instrumentInfo(track.instrument);
          const same = savedTracks.filter((entry) => entry.instrument === track.instrument);
          const number = same.findIndex((entry) => entry.id === track.id) + 1;
          const label = same.length > 1 ? `${item.name} ${number}` : item.name;
          const open = !folded.includes(track.id);
          const hit = mixOn
            ? track.events.findIndex((event) => playhead >= event.time && playhead < event.time + Math.max(event.duration, 0.09))
            : -1;
          return (
            <div className="track" key={track.id}>
              <div className="track-head">
                <button
                  type="button"
                  className="track-toggle"
                  aria-expanded={open}
                  aria-label={`${label} track`}
                  onClick={() => setFolded((current) => (current.includes(track.id) ? current.filter((id) => id !== track.id) : [...current, track.id]))}
                >
                  <span key={hit} className={hit >= 0 ? "track-emoji shake" : "track-emoji"} aria-hidden="true">
                    {INSTRUMENT_EMOJI[item.id]}
                  </span>
                  <span className="track-name">{label}</span>
                  <Caret up={open} />
                </button>
                <button
                  type="button"
                  className="track-trash"
                  aria-label={`Remove ${label}`}
                  disabled={day.locked}
                  onClick={() => dispatch({ type: "delete-track", id: track.id })}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {open && (
                <div className="lane-time">
                  {track.events.map((event, index) => (
                    <span
                      key={`${event.time}-${index}`}
                      className={item.kind === "drum" ? "lane-block drum" : "lane-block"}
                      style={{ left: `${(event.time / 20) * 100}%`, width: `${Math.max(1.2, (event.duration / 20) * 100)}%` }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className="clear-song" onClick={onClear} disabled={day.locked || (savedTracks.length === 0 && draft.length === 0)}>
          Clear
        </button>
      </section>

      {day.attempts.length > 0 && <div className="tries" aria-label="Tries">
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
      </div>}

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
            <p>Everyone hears the same 20 seconds of a real song. You write your own version on the rolls. You get five tries. Your best percentage is kept.</p>
            <h3>Write on the roll</h3>
            <p>Tap the roll to place a note. You hear it. Drag an edge to change the length. Drag a note up or down to change the pitch. On drums, that move switches the drum sound.</p>
            <p>Play, next to the instrument name, hears only the part you are editing. Save to song keeps that part. The plus starts another track, and the same instrument can be saved again. Listen plays the saved tracks together.</p>
            <div className="example" aria-label={`${EXAMPLE_TITLE} example`}>
              <p>A piano part saved to the song</p>
              <div className="ex-row">{Array.from({ length: 12 }, (_, index) => <span key={index} className="ex-note" />)}</div>
              <p>Kicks placed on the drum roll</p>
              <div className="ex-row">{Array.from({ length: 4 }, (_, index) => <span key={index} className="ex-hit" />)}</div>
            </div>
            <p>Hints are unlimited. The first one names the instruments. Later hints light the beats, then fill in one note at a time. Each hint takes 5% off your score. Hard is the percentage only.</p>
            <p>After five tries, you can share and see everyone who finished today.</p>
            <button
              type="button"
              disabled={day.locked}
              onClick={() => {
                dispatch({ type: "load-example" });
                draftRef.current = [];
                setDraft([]);
                setWriter("closed");
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
                dispatch({ type: "submit" });
              }}
            >
              Use this name
            </button>
          </div>
        </div>
      )}

      {hintPick && !state.tutorialOpen && (
        <div className="overlay">
          <div className="modal" role="dialog" aria-label="Hint instrument">
            <h2>Which instrument?</h2>
            <p>The next hint lights where a note belongs, then fills the pitch or drum for one spot at a time. This takes 5% off your score.</p>
            {presentIds.map((id) => {
              const done = (day.hintSteps[id] ?? 0) >= stepsToFill(song.notes, id);
              return (
                <button
                  type="button"
                  key={id}
                  disabled={done}
                  onClick={() => {
                    dispatch({ type: "hint-instrument", instrument: id });
                    setHintPick(false);
                    showHintInstrument(id);
                  }}
                >
                  {instrumentInfo(id).name}
                  {done ? " · complete" : ""}
                </button>
              );
            })}
            <button type="button" onClick={() => setHintPick(false)}>
              Not now
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
