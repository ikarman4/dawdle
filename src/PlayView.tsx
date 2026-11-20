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
import { NoteRoll, Waveform, rowsFor } from "./widgets";

interface SongRow {
  id: string;
  instrument: InstrumentId | null;
  trackId: string | null;
}

let rowSerial = 0;

function newRowId(): string {
  rowSerial += 1;
  return `row-${rowSerial.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function rowsFromTracks(tracks: Track[]): SongRow[] {
  return tracks.map((track) => ({ id: track.id, instrument: track.instrument, trackId: track.id }));
}

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
  const [rollPlayhead, setRollPlayhead] = useState(0);
  const [songPlaying, setSongPlaying] = useState(false);
  const [armed, setArmed] = useState<InstrumentId>("piano");
  const [draft, setDraft] = useState<NoteEvent[]>([]);
  const [writer, setWriter] = useState<"closed" | "pick" | "roll">("closed");
  const [place, setPlace] = useState<"playground" | "row">("playground");
  const [rows, setRows] = useState<SongRow[]>(() => rowsFromTracks(day.tracks));
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const [mixOn, setMixOn] = useState(false);
  const [partOn, setPartOn] = useState(false);
  const [confirmClear, setConfirmClear] = useState<null | "playground" | "song">(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [namePrompt, setNamePrompt] = useState(false);
  const [hintPick, setHintPick] = useState(false);
  const [rowFlash, setRowFlash] = useState<Record<string, "new" | "have">>({});
  const rowsRef = useRef<SongRow[]>(rowsFromTracks(day.tracks));
  const activeRowRef = useRef<string | null>(null);
  const drafts = useRef<Record<string, NoteEvent[]>>({});
  const placeRef = useRef<"playground" | "row">("playground");
  const playDraft = useRef<NoteEvent[]>([]);
  const playArmed = useRef<InstrumentId>("piano");
  const playChosen = useRef(false);
  const flashTimer = useRef<number | null>(null);
  const [volume, setVolume] = useState(0.85);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  const [copied, setCopied] = useState(false);
  const [clipError, setClipError] = useState(false);
  const playheadRef = useRef(0);
  const rollPlayheadRef = useRef(0);
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
      if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  useEffect(() => {
    rollPlayheadRef.current = rollPlayhead;
  }, [rollPlayhead]);

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
    setRows((current) => {
      const live = new Set(day.tracks.map((track) => track.id));
      const kept = current.filter((row) => row.trackId == null || live.has(row.trackId));
      const known = new Set(kept.map((row) => row.trackId).filter((id): id is string => id != null));
      const added = day.tracks.filter((track) => !known.has(track.id)).map((track) => ({ id: track.id, instrument: track.instrument, trackId: track.id }));
      if (added.length === 0 && kept.length === current.length) return current;
      const next = [...kept, ...added];
      rowsRef.current = next;
      return next;
    });
  }, [day.tracks]);

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
        rollPlayheadRef.current = time;
        setRollPlayhead(time);
      },
      onEnd: () => {
        if (!alive.current) return;
        setMixOn(false);
        setPartOn(false);
        rollPlayheadRef.current = 20;
        setRollPlayhead(20);
      },
      onBeat: () => undefined,
      rate: speedRef.current,
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
    rollPlayheadRef.current = from;
    setRollPlayhead(from);
    songPlayingRef.current = true;
    setSongPlaying(true);
    void resumeAudio();
    clip.current?.setVolume(volume);
    clip.current?.setPlaybackRate(speedRef.current);
    clip.current?.playFrom(from);
  }

  function onSpeed(next: number) {
    speedRef.current = next;
    setSpeed(next);
    clip.current?.setPlaybackRate(next);
    if (mixOn) begin(rollPlayheadRef.current, eventsForListen(), false);
    else if (partOn) begin(rollPlayheadRef.current, draftRef.current, false);
  }

  function replaceDraft(next: NoteEvent[]) {
    draftRef.current = next;
    setDraft(next);
  }

  function stashDraft() {
    const notes = draftRef.current.map((event) => ({ ...event }));
    if (placeRef.current === "playground") {
      playDraft.current = notes;
      return;
    }
    const id = activeRowRef.current;
    if (!id) return;
    drafts.current[id] = notes;
  }

  function showPlaygroundDraft() {
    const next = playDraft.current.map((event) => ({ ...event }));
    draftRef.current = next;
    setDraft(next);
    if (playChosen.current) {
      armedRef.current = playArmed.current;
      setArmed(playArmed.current);
    }
  }

  function movePlace(next: "playground" | "row") {
    placeRef.current = next;
    setPlace(next);
  }

  function rememberRows(next: SongRow[]) {
    rowsRef.current = next;
    setRows(next);
  }

  function loadRow(row: SongRow) {
    const stored = drafts.current[row.id];
    const fromTrack = row.trackId ? (day.tracks.find((track) => track.id === row.trackId)?.events ?? []) : [];
    const next = (stored ?? fromTrack).map((event) => ({ ...event }));
    draftRef.current = next;
    setDraft(next);
    if (row.instrument) {
      armedRef.current = row.instrument;
      setArmed(row.instrument);
    }
  }

  function persistActive() {
    const row = rowsRef.current.find((item) => item.id === activeRowRef.current);
    const events = draftRef.current;
    if (!row?.instrument || !events.length || day.locked) return;
    const instrument = row.instrument;
    const tagged = events.map((event) => ({ ...event, instrument }));
    if (row.trackId) {
      dispatch({ type: "replace-track", id: row.trackId, instrument, events: tagged });
    } else {
      const id = `track-${row.id}`;
      dispatch({ type: "save-track", id, instrument, events: tagged });
      rememberRows(rowsRef.current.map((item) => (item.id === row.id ? { ...item, trackId: id } : item)));
    }
    delete drafts.current[row.id];
  }

  function stopMix() {
    stopPlayback();
    setPartOn(false);
    setMixOn(false);
  }

  function addRow() {
    const row: SongRow = { id: newRowId(), instrument: null, trackId: null };
    rememberRows([...rowsRef.current, row]);
  }

  function openPlayground() {
    stopSong();
    stopMix();
    const here = placeRef.current === "playground";
    stashDraft();
    if (here && writer === "pick") {
      if (playChosen.current) {
        showPlaygroundDraft();
        setWriter("roll");
      } else {
        setWriter("closed");
      }
      return;
    }
    if (here && writer === "roll") {
      setWriter("pick");
      return;
    }
    movePlace("playground");
    activeRowRef.current = null;
    setActiveRow(null);
    showPlaygroundDraft();
    setWriter("pick");
  }

  function openRow(rowId: string) {
    stopSong();
    stopMix();
    stashDraft();
    const row = rowsRef.current.find((item) => item.id === rowId);
    if (!row) return;
    if (placeRef.current === "row" && activeRowRef.current === rowId && writer === "pick") {
      setWriter(row.instrument ? "roll" : "closed");
      if (row.instrument) loadRow(row);
      return;
    }
    if (placeRef.current === "row" && activeRowRef.current === rowId && writer === "roll" && row.instrument) {
      setWriter("closed");
      return;
    }
    movePlace("row");
    activeRowRef.current = rowId;
    setActiveRow(rowId);
    if (row.instrument) {
      loadRow(row);
      setWriter("roll");
      return;
    }
    const next = (drafts.current[rowId] ?? []).map((event) => ({ ...event }));
    draftRef.current = next;
    setDraft(next);
    setWriter("pick");
  }

  function chooseInstrument(id: InstrumentId) {
    if (day.locked) return;
    stopSong();
    stopMix();
    if (placeRef.current === "playground") {
      const previous = playChosen.current ? playArmed.current : null;
      const nextKind = instrumentInfo(id).kind;
      const prevKind = previous ? instrumentInfo(previous).kind : null;
      let notes = draftRef.current.map((event) => ({ ...event }));
      if (previous && previous !== id && prevKind !== nextKind) notes = [];
      notes = notes.map((event) => ({ ...event, instrument: id }));
      playDraft.current = notes;
      playArmed.current = id;
      playChosen.current = true;
      draftRef.current = notes.slice();
      setDraft(notes);
      armedRef.current = id;
      setArmed(id);
      setWriter("roll");
      return;
    }
    const rowId = activeRowRef.current;
    const row = rowsRef.current.find((item) => item.id === rowId);
    if (!row) return;
    const previous = row.instrument;
    const nextKind = instrumentInfo(id).kind;
    const prevKind = previous ? instrumentInfo(previous).kind : null;
    let notes = draftRef.current.map((event) => ({ ...event }));
    if (previous && previous !== id && prevKind !== nextKind) notes = [];
    notes = notes.map((event) => ({ ...event, instrument: id }));
    drafts.current[row.id] = notes;
    draftRef.current = notes.slice();
    setDraft(notes);
    armedRef.current = id;
    setArmed(id);
    rememberRows(rowsRef.current.map((item) => (item.id === row.id ? { ...item, instrument: id } : item)));
    if (row.trackId && previous !== id) {
      dispatch({ type: "replace-track", id: row.trackId, instrument: id, events: notes });
      delete drafts.current[row.id];
    }
    setWriter("roll");
  }

  function removeRow(row: SongRow) {
    if (day.locked) return;
    stopPlayback();
    setPartOn(false);
    setMixOn(false);
    if (row.trackId) dispatch({ type: "delete-track", id: row.trackId });
    delete drafts.current[row.id];
    rememberRows(rowsRef.current.filter((item) => item.id !== row.id));
    if (activeRowRef.current === row.id) {
      activeRowRef.current = null;
      setActiveRow(null);
      draftRef.current = [];
      setDraft([]);
      setWriter("closed");
    }
  }

  function eventsForListen(): NoteEvent[] {
    const open = writer !== "closed";
    const editingId =
      open && placeRef.current === "row" ? (rowsRef.current.find((row) => row.id === activeRowRef.current)?.trackId ?? null) : null;
    const saved = mixEvents(day.tracks.filter((track) => track.id !== editingId));
    if (!open) return saved;
    const instrument = placeRef.current === "playground" && playChosen.current ? playArmed.current : armedRef.current;
    const live = draftRef.current.map((event) => ({ ...event, instrument }));
    return [...saved, ...live];
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
    const events = eventsForListen();
    setMixOn(true);
    rollPlayheadRef.current = 0;
    setRollPlayhead(0);
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
    setRollPlayhead(0);
    rollPlayheadRef.current = 0;
    primeAudio();
    void resumeAudio().then(() => begin(0, events, false));
  }

  function savePlayground(keepOpen = true) {
    const events = draftRef.current;
    if (!playChosen.current || !events.length || day.locked) return;
    const instrument = playArmed.current;
    const rowId = newRowId();
    const trackId = `track-${rowId}`;
    const tagged = events.map((event) => ({ ...event, instrument }));
    dispatch({ type: "save-track", id: trackId, instrument, events: tagged });
    rememberRows([...rowsRef.current, { id: rowId, instrument, trackId }]);
    playDraft.current = [];
    playChosen.current = false;
    if (!keepOpen) {
      draftRef.current = [];
      setDraft([]);
      setWriter("closed");
      return;
    }
    movePlace("row");
    activeRowRef.current = rowId;
    setActiveRow(rowId);
    armedRef.current = instrument;
    setArmed(instrument);
    const notes = tagged.map((event) => ({ ...event }));
    draftRef.current = notes;
    setDraft(notes);
    setWriter("roll");
  }

  function onSave() {
    stopPlayback();
    setPartOn(false);
    setMixOn(false);
    if (placeRef.current === "playground") {
      savePlayground();
      return;
    }
    persistActive();
  }

  function clearPlayground() {
    stopPlayback();
    setPartOn(false);
    setMixOn(false);
    playDraft.current = [];
    if (placeRef.current !== "playground") return;
    draftRef.current = [];
    setDraft([]);
  }

  function clearSong() {
    if (day.locked) return;
    stopPlayback();
    stopSong();
    setPartOn(false);
    setMixOn(false);
    drafts.current = {};
    playDraft.current = [];
    playChosen.current = false;
    movePlace("playground");
    activeRowRef.current = null;
    setActiveRow(null);
    draftRef.current = [];
    setDraft([]);
    setWriter("closed");
    rememberRows([]);
    dispatch({ type: "clear-song" });
  }

  function askClear(which: "playground" | "song") {
    if (day.locked) return;
    if (confirmClear !== which) {
      setConfirmClear(which);
      return;
    }
    setConfirmClear(null);
    if (which === "playground") clearPlayground();
    else clearSong();
  }

  function onScrub(time: number, phase: "down" | "move" | "up") {
    playheadRef.current = time;
    setPlayhead(time);
    if (!songPlaying) return;
    rollPlayheadRef.current = time;
    setRollPlayhead(time);
    if (phase !== "move") clip.current?.seek(time);
    if (phase === "move") clip.current?.seek(time);
  }

  function onSubmit() {
    if (day.locked || day.attempts.length >= 5) return;
    stopPlayback();
    stopSong();
    setPartOn(false);
    setMixOn(false);
    if (placeRef.current === "playground") savePlayground(false);
    else persistActive();
    draftRef.current = [];
    setDraft([]);
    if (!nameReady(state.username)) {
      setNamePrompt(true);
      return;
    }
    dispatch({ type: "submit" });
  }

  function showHintInstrument(id: InstrumentId) {
    stashDraft();
    let row = rowsRef.current.find((item) => item.instrument === id);
    if (!row) {
      const empty = rowsRef.current.find((item) => item.instrument == null);
      if (empty) {
        row = { ...empty, instrument: id };
        rememberRows(rowsRef.current.map((item) => (item.id === empty.id ? row! : item)));
      } else {
        row = { id: newRowId(), instrument: id, trackId: null };
        rememberRows([...rowsRef.current, row]);
      }
    }
    movePlace("row");
    activeRowRef.current = row.id;
    setActiveRow(row.id);
    armedRef.current = id;
    setArmed(id);
    const stored = drafts.current[row.id];
    const fromTrack = row.trackId ? (day.tracks.find((track) => track.id === row.trackId)?.events ?? []) : [];
    const next = (stored ?? fromTrack).map((event) => ({ ...event }));
    draftRef.current = next;
    setDraft(next);
    setWriter("roll");
  }

  function flashSongRows() {
    const flashes: Record<string, "new" | "have"> = {};
    let next = rowsRef.current.slice();
    for (const id of songInstruments(song.notes)) {
      const matches = next.filter((row) => row.instrument === id);
      if (matches.length) {
        for (const row of matches) flashes[row.id] = "have";
        continue;
      }
      const row: SongRow = { id: newRowId(), instrument: id, trackId: null };
      next = [...next, row];
      flashes[row.id] = "new";
    }
    rememberRows(next);
    if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    setRowFlash(flashes);
    flashTimer.current = window.setTimeout(() => {
      if (!alive.current) return;
      setRowFlash({});
      flashTimer.current = null;
    }, 1200);
  }

  function onHint() {
    if (day.mode !== "easy" || day.locked || day.revealedAll) return;
    if (!day.instrumentsRevealed) {
      dispatch({ type: "reveal-instruments" });
      flashSongRows();
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
  function labelFor(row: SongRow): string {
    if (!row.instrument) return "Select instrument";
    const name = instrumentInfo(row.instrument).name;
    const same = rows.filter((item) => item.instrument === row.instrument);
    const number = same.findIndex((item) => item.id === row.id) + 1;
    return same.length > 1 ? `${name} ${number}` : name;
  }
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

  function instrumentGrid(pressed: InstrumentId | null) {
    return (
      <div className="inst-grid" role="listbox" aria-label="Instruments">
        {INSTRUMENTS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={day.instrumentsRevealed && present.has(item.id) ? "in-song" : ""}
            aria-label={item.name}
            aria-pressed={pressed === item.id}
            onClick={() => chooseInstrument(item.id)}
          >
            <span className="pick-emoji" aria-hidden="true">
              {INSTRUMENT_EMOJI[item.id]}
            </span>
          </button>
        ))}
      </div>
    );
  }

  function rollCard() {
    return (
      <div className="roll-card">
        <NoteRoll
          instrument={armed}
          rows={rowsFor(armed)}
          notes={draft}
          ghosts={ghosts}
          playhead={rollPlayhead}
          disabled={day.locked}
          step={beatSeconds(song.bpm) / 4}
          defaultDuration={beatSeconds(song.bpm)}
          follow={songPlaying || mixOn || partOn}
          onChange={replaceDraft}
          onPreview={(note) => {
            primeAudio();
            triggerEvent({ ...note, duration: Math.min(0.4, Math.max(0.08, note.duration)) });
            void resumeAudio();
          }}
          onKeyDown={(row) => {
            primeAudio();
            if (row.drum) {
              triggerEvent({ instrument: armed, drum: row.drum, time: 0, duration: 0.12, velocity: 0.86 });
            } else if (row.midi != null) {
              beginPitch(armed, row.midi!);
            }
            void resumeAudio();
          }}
          onKeyUp={(row) => {
            if (row.midi != null) endPitch(armed, row.midi);
          }}
        />
        <button type="button" className="save-song" onClick={onSave} disabled={day.locked || draft.length === 0}>
          Save to song
        </button>
      </div>
    );
  }

  const playControl = (
    <button
      type="button"
      className="rec"
      aria-label={partOn ? "Stop this instrument" : "Play this instrument"}
      disabled={!partOn && draft.length === 0}
      onClick={onPlayPart}
    >
      {partOn ? "Stop" : "Play"}
    </button>
  );

  return (
    <div className="studio" data-mode="listen" data-part={partOn ? "on" : "off"} data-song={songPlaying ? "on" : "off"} data-testid="listen">
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
          rollPlayheadRef.current = seconds;
          setRollPlayhead(seconds);
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
        <select className="speed" aria-label="Playback speed" value={speed} onChange={(event) => onSpeed(Number(event.target.value))}>
          {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
            <option key={rate} value={rate}>
              {rate}x
            </option>
          ))}
        </select>
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

      <div className="playground">
        <div className="inst-row">
          <button type="button" className="inst-toggle" aria-label="Instrument playground" onClick={openPlayground}>
            Instrument playground
            <Caret up={place === "playground" && writer === "pick"} />
          </button>
          {place === "playground" && writer === "roll" && (
            <div className="part-actions">
              <span className="track-name">{info.name}</span>
              {playControl}
              <button
                type="button"
                className={confirmClear === "playground" ? "clear-part is-confirm" : "clear-part"}
                aria-label={confirmClear === "playground" ? "Confirm clear playground" : "Clear playground"}
                onClick={() => askClear("playground")}
                disabled={day.locked || draft.length === 0}
              >
                {confirmClear === "playground" ? "Confirm" : "Clear"}
              </button>
            </div>
          )}
        </div>
        {place === "playground" && writer === "pick" && instrumentGrid(playChosen.current ? armed : null)}
        {place === "playground" && writer === "roll" && rollCard()}
      </div>

      <section className="song-card">
        <div className="song-head">
          <h2>Your song</h2>
          <div className="song-actions">
            <button type="button" className="add-track" aria-label="Add instrument" onClick={addRow}>
              +
            </button>
            <button type="button" className="listen-pill" aria-label={mixOn ? "Stop your song" : "Listen"} onClick={onListen}>
              {mixOn ? "Stop" : "Listen"}
            </button>
          </div>
        </div>
        {rows.length === 0 && <p className="empty-tracks">Add an instrument to get started.</p>}
        {rows.map((row) => {
          const label = labelFor(row);
          const item = row.instrument ? instrumentInfo(row.instrument) : null;
          const track = row.trackId ? day.tracks.find((entry) => entry.id === row.trackId) : undefined;
          const events = track?.events ?? [];
          const open = place === "row" && activeRow === row.id && writer !== "closed";
          const hit = mixOn
            ? events.findIndex((event) => rollPlayhead >= event.time && rollPlayhead < event.time + Math.max(event.duration, 0.09))
            : -1;
          return (
            <div className={rowFlash[row.id] ? `track flash-${rowFlash[row.id]}` : "track"} key={row.id}>
              <div className="track-head">
                <button
                  type="button"
                  className="track-toggle"
                  aria-expanded={open}
                  aria-label={row.instrument ? `${label} track` : "Select instrument"}
                  onClick={() => openRow(row.id)}
                >
                  {item && (
                    <span key={hit} className={hit >= 0 ? "track-emoji shake" : "track-emoji"} aria-hidden="true">
                      {INSTRUMENT_EMOJI[item.id]}
                    </span>
                  )}
                  <span className="track-name">{row.instrument ? label : "Select instrument"}</span>
                  <Caret up={open} />
                </button>
                <button
                  type="button"
                  className="track-trash"
                  aria-label={row.instrument ? `Remove ${label}` : "Remove row"}
                  disabled={day.locked}
                  onClick={() => removeRow(row)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {open && writer === "pick" && instrumentGrid(row.instrument)}
              {open && writer === "roll" && (
                <div className="row-roll">
                  <div className="inst-row">
                    <span className="track-name">{label}</span>
                    {playControl}
                  </div>
                  {rollCard()}
                </div>
              )}
              {!(open && writer === "roll") && events.length > 0 && item && (
                <div className="lane-time">
                  {events.map((event, index) => (
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
        <button
          type="button"
          className={confirmClear === "song" ? "clear-song is-confirm" : "clear-song"}
          aria-label={confirmClear === "song" ? "Confirm clear your song" : "Clear your song"}
          onClick={() => askClear("song")}
          disabled={day.locked || (rows.length === 0 && draft.length === 0)}
        >
          {confirmClear === "song" ? "Confirm" : "Clear"}
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

      <div className="submit-note">
        <p>To hear see how your song matches up submit your composition</p>
        <p>{day.attempts.length}/5 submissions</p>
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
            <p>Everyone hears the same 20 seconds of a real song. You write your own version on the rolls. You get five tries. Your best percentage is kept.</p>
            <h3>Write on the roll</h3>
            <p>Tap the roll to place a note. You hear it. Drag an edge to change the length. Drag a note left or right to move it in time, and up or down to change the pitch. On drums, that move switches the drum sound.</p>
            <p>Instrument playground is where you try a part. Save to song adds it as a row. The plus adds an empty row, and its caret chooses that row's instrument. Play, next to the instrument name, hears only the part you are editing. Listen plays the saved tracks together.</p>
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
                drafts.current = {};
                playDraft.current = [];
                playChosen.current = false;
                movePlace("playground");
                activeRowRef.current = null;
                setActiveRow(null);
                draftRef.current = [];
                setDraft([]);
                setWriter("closed");
                rememberRows([]);
                dispatch({ type: "load-example" });
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
