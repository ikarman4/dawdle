import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "./daily";
import { type GhostMark } from "./progress";
import { eventFromPointer, keepPlacedNote } from "./roll";
import { peaksFor } from "./score";
import { DRUM_LABELS, drumsFor, instrumentInfo, noteName, type DrumName, type InstrumentId, type NoteEvent } from "./types";

export function Waveform({
  notes,
  peaks: provided,
  playhead,
  onScrub,
}: {
  notes: NoteEvent[];
  peaks?: number[];
  playhead: number;
  onScrub: (time: number, phase: "down" | "move" | "up") => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaks = useMemo(() => provided ?? peaksFor(notes, 180), [notes, provided]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      const mid = rect.height / 2;
      peaks.forEach((peak, index) => {
        const width = rect.width / peaks.length;
        const height = Math.max(2, peak * (rect.height - 10));
        context.fillStyle = index % 2 === 0 ? "#6d4aff" : "#b7a6ff";
        context.fillRect((index / peaks.length) * rect.width, mid - height / 2, Math.max(1, width - 1), height);
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks]);

  function timeFrom(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.min(20, Math.max(0, ((event.clientX - rect.left) / rect.width) * 20));
  }

  return (
    <div
      className="wave"
      data-testid="waveform"
      data-seconds={playhead.toFixed(3)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onScrub(timeFrom(event), "down");
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onScrub(timeFrom(event), "move");
      }}
      onPointerUp={(event) => onScrub(timeFrom(event), "up")}
    >
      <canvas ref={canvasRef} />
      <div className="playhead" data-testid="playhead" style={{ left: `${(playhead / 20) * 100}%` }} />
    </div>
  );
}

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_STEPS = [1, 3, 6, 8, 10];

function whiteMidis(base: number): number[] {
  const midis: number[] = [];
  for (let octave = 0; octave < 2; octave++) for (const step of WHITE_STEPS) midis.push(base + octave * 12 + step);
  midis.push(base + 24);
  return midis;
}

function blackKeys(base: number): { midi: number; after: number }[] {
  const keys: { midi: number; after: number }[] = [];
  for (let octave = 0; octave < 2; octave++) {
    for (const step of BLACK_STEPS) {
      const after = WHITE_STEPS.filter((value) => value < step).length - 1 + octave * 7;
      keys.push({ midi: base + octave * 12 + step, after });
    }
  }
  return keys;
}

export function Keyboard({
  base,
  latched,
  held,
  barred,
  onDown,
  onUp,
}: {
  base: number;
  latched: number | null;
  held: number[];
  barred: boolean;
  onDown: (midi: number) => void;
  onUp: (midi: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const whites = whiteMidis(base);
  const blacks = blackKeys(base);
  return (
    <div className={barred ? "kb bars" : "kb"}>
      <button type="button" className="nudge" aria-label="Scroll keyboard left" onClick={() => scroller.current?.scrollBy({ left: -72 * 7 })}>
        Lower
      </button>
      <div className="kb-scroll" ref={scroller}>
        <div className="kb-inner">
          <div className="whites">
            {whites.map((midi) => (
              <button
                type="button"
                key={midi}
                className={latched === midi || held.includes(midi) ? "key white on" : "key white"}
                aria-label={noteName(midi)}
                aria-pressed={latched === midi}
                onPointerDown={(event) => {
                  event.preventDefault();
                  onDown(midi);
                }}
                onPointerUp={() => onUp(midi)}
                onPointerCancel={() => onUp(midi)}
              >
                {noteName(midi)}
              </button>
            ))}
          </div>
          <div className="blacks">
            {blacks.map((key) => (
              <button
                type="button"
                key={key.midi}
                className={latched === key.midi || held.includes(key.midi) ? "key black on" : "key black"}
                style={{ left: `calc(${((key.after + 1) / whites.length) * 100}% - 22px)` }}
                aria-label={noteName(key.midi)}
                aria-pressed={latched === key.midi}
                onPointerDown={(event) => {
                  event.preventDefault();
                  onDown(key.midi);
                }}
                onPointerUp={() => onUp(key.midi)}
                onPointerCancel={() => onUp(key.midi)}
              />
            ))}
          </div>
        </div>
      </div>
      <button type="button" className="nudge" aria-label="Scroll keyboard right" onClick={() => scroller.current?.scrollBy({ left: 72 * 7 })}>
        Higher
      </button>
    </div>
  );
}

export function Pads({ drums, latched, onHit }: { drums: DrumName[]; latched: DrumName | null; onHit: (drum: DrumName) => void }) {
  return (
    <div className="pads">
      {drums.map((drum) => (
        <button
          type="button"
          key={drum}
          className={latched === drum ? "pad on" : "pad"}
          aria-label={DRUM_LABELS[drum]}
          aria-pressed={latched === drum}
          onPointerDown={(event) => {
            event.preventDefault();
            onHit(drum);
          }}
        >
          {DRUM_LABELS[drum]}
        </button>
      ))}
    </div>
  );
}

export function DrumGrid({
  instrument,
  bpm,
  onLoop,
}: {
  instrument: InstrumentId;
  bpm: number;
  onLoop: (events: NoteEvent[]) => void;
}) {
  const drums = drumsFor(instrument);
  const [steps, setSteps] = useState<Record<string, boolean[]>>(() =>
    Object.fromEntries(drums.map((drum) => [drum, Array.from({ length: 16 }, () => false)])),
  );

  function toggle(drum: DrumName, index: number) {
    setSteps((current) => ({
      ...current,
      [drum]: current[drum].map((on, step) => (step === index ? !on : on)),
    }));
  }

  function loop() {
    const beat = 60 / bpm;
    const step = beat / 4;
    const bars = Math.max(1, Math.floor(20 / (beat * 4) + 1e-9));
    const events: NoteEvent[] = [];
    for (let bar = 0; bar < bars; bar++) {
      for (const drum of drums) {
        steps[drum].forEach((on, index) => {
          if (!on) return;
          const time = Math.round((bar * 4 * beat + index * step) * 1000) / 1000;
          if (time < 19.95) {
            events.push({
              instrument,
              drum,
              time,
              duration: 0.1,
              velocity: index % 4 === 0 ? 0.9 : 0.7,
            });
          }
        });
      }
    }
    onLoop(events);
  }

  return (
    <div className="grid-wrap">
      <div className="grid-scroll">
        {drums.map((drum) => (
          <div className="grid-row" key={drum}>
            <span>{DRUM_LABELS[drum]}</span>
            {steps[drum].map((on, index) => (
              <button
                type="button"
                key={index}
                className={on ? "step on" : "step"}
                aria-label={`${DRUM_LABELS[drum]} step ${index + 1}`}
                aria-pressed={on}
                onClick={() => toggle(drum, index)}
              />
            ))}
          </div>
        ))}
      </div>
      <button type="button" className="loop" onClick={loop}>
        Repeat for all 20 seconds
      </button>
    </div>
  );
}

export function Timeline({
  events,
  playhead,
  disabled,
  onDrop,
  onDelete,
  onResize,
}: {
  events: NoteEvent[];
  playhead: number;
  disabled: boolean;
  onDrop: (time: number) => void;
  onDelete: (index: number) => void;
  onResize: (index: number, duration: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  function timeFrom(event: React.PointerEvent<HTMLDivElement>) {
    const inner = scroller.current?.querySelector(".timeline-inner");
    if (!inner) return 0;
    const rect = inner.getBoundingClientRect();
    return Math.min(19.95, Math.max(0, ((event.clientX - rect.left) / rect.width) * 20));
  }

  function startResize(event: React.PointerEvent, index: number, duration: number) {
    event.stopPropagation();
    event.preventDefault();
    const inner = scroller.current?.querySelector(".timeline-inner");
    if (!inner || disabled) return;
    const origin = event.clientX;
    const width = inner.getBoundingClientRect().width;
    const move = (ev: PointerEvent) => onResize(index, duration + ((ev.clientX - origin) / width) * 20);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      className="timeline"
      data-testid="timeline"
      ref={scroller}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-note]") || disabled) return;
        onDrop(timeFrom(event));
      }}
    >
      <div className="timeline-inner">
        {events.map((note, index) => (
          <button
            type="button"
            key={`${note.time}-${index}`}
            data-note="true"
            className="note"
            style={{ left: `${(note.time / 20) * 100}%`, width: `${Math.max(1.5, (note.duration / 20) * 100)}%` }}
            aria-label={`Delete note at ${formatClock(note.time)}`}
            onClick={() => {
              if (!disabled) onDelete(index);
            }}
          >
            <span
              className="handle"
              aria-hidden="true"
              onPointerDown={(event) => startResize(event, index, note.duration)}
              onClick={(event) => event.stopPropagation()}
            />
          </button>
        ))}
        <div className="playhead" style={{ left: `${(playhead / 20) * 100}%` }} />
      </div>
    </div>
  );
}

export function PianoRoll({
  base,
  notes,
  playhead,
  recording,
  onPlace,
  onDown,
  onUp,
}: {
  base: number;
  notes: NoteEvent[];
  playhead: number;
  recording: boolean;
  onPlace: (midi: number, time: number) => void;
  onDown: (midi: number) => void;
  onUp: (midi: number) => void;
}) {
  const rows: number[] = [];
  for (let midi = base + 12; midi >= base; midi -= 1) rows.push(midi);
  return (
    <div className="roll" data-testid="instrument">
      {rows.map((midi) => (
        <button
          type="button"
          key={midi}
          className="roll-row"
          aria-label={noteName(midi)}
          onPointerDown={() => {
            if (recording) onDown(midi);
          }}
          onPointerUp={() => {
            if (recording) onUp(midi);
          }}
          onClick={(event) => {
            if (recording) return;
            const rect = event.currentTarget.getBoundingClientRect();
            onPlace(midi, ((event.clientX - rect.left) / rect.width) * 20);
          }}
        >
          {notes
            .filter((note) => note.pitch === midi)
            .map((note, index) => (
              <span
                key={`${note.time}-${index}`}
                className="roll-note"
                style={{ left: `${(note.time / 20) * 100}%`, width: `${Math.max(1.2, (note.duration / 20) * 100)}%` }}
              />
            ))}
        </button>
      ))}
      <div className="playhead" style={{ left: `${(playhead / 20) * 100}%` }} />
    </div>
  );
}

export function DrumLanes({
  drums,
  notes,
  playhead,
  onPlace,
  onHit,
}: {
  drums: DrumName[];
  notes: NoteEvent[];
  playhead: number;
  onPlace: (drum: DrumName, time: number) => void;
  onHit: (drum: DrumName) => void;
}) {
  const steps = 16;
  return (
    <div className="drum-roll" data-testid="instrument">
      {drums.map((drum) => (
        <div className="drum-line" key={drum}>
          <button type="button" className="drum-name" onClick={() => onHit(drum)}>
            {DRUM_LABELS[drum]}
          </button>
          <div className="drum-steps">
            {Array.from({ length: steps }, (_, index) => {
              const time = (index / steps) * 20;
              const on = notes.some((note) => note.drum === drum && note.time >= time && note.time < time + 20 / steps);
              return (
                <button
                  type="button"
                  key={index}
                  className={on ? "cell on" : "cell"}
                  aria-label={`${DRUM_LABELS[drum]} ${index + 1}`}
                  aria-pressed={on}
                  onClick={() => onPlace(drum, time + 0.2)}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="playhead" style={{ left: `${(playhead / 20) * 100}%` }} />
    </div>
  );
}

const SHORT_DRUM: Record<DrumName, string> = {
  kick: "Kick",
  snare: "Snare",
  closedHat: "Hat C",
  openHat: "Hat O",
  tom: "Tom",
  clap: "Clap",
  hat: "Hat",
};

export interface RollRow {
  key: string;
  label: string;
  short: string;
  midi?: number;
  drum?: DrumName;
  black?: boolean;
}

export function rowsFor(id: InstrumentId): RollRow[] {
  const info = instrumentInfo(id);
  if (info.kind === "drum") {
    return drumsFor(id).map((drum) => ({
      key: drum,
      label: DRUM_LABELS[drum],
      short: SHORT_DRUM[drum],
      drum,
    }));
  }
  const rows: RollRow[] = [];
  for (let midi = info.baseMidi + 24; midi >= info.baseMidi; midi -= 1) {
    const black = [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
    const name = noteName(midi);
    rows.push({ key: String(midi), label: name, short: name, midi, black });
  }
  return rows;
}

const ROLL_PX = 72;
const ROLL_KEY = 56;

function snapTime(time: number, step: number): number {
  const clamped = Math.min(19.95, Math.max(0, time));
  if (step <= 0) return Math.round(clamped * 1000) / 1000;
  const snapped = Math.round(clamped / step) * step;
  return Math.round(Math.min(19.95, Math.max(0, snapped)) * 1000) / 1000;
}

export function NoteRoll({
  instrument,
  rows,
  notes,
  ghosts = [],
  playhead,
  disabled,
  step,
  defaultDuration,
  follow,
  onChange,
  onPreview,
  onKeyDown,
  onKeyUp,
}: {
  instrument: InstrumentId;
  rows: RollRow[];
  notes: NoteEvent[];
  ghosts?: GhostMark[];
  playhead: number;
  disabled: boolean;
  step: number;
  defaultDuration: number;
  follow: boolean;
  onChange: (notes: NoteEvent[]) => void;
  onPreview: (note: NoteEvent) => void;
  onKeyDown: (row: RollRow) => void;
  onKeyUp: (row: RollRow) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef(notes);
  const gesture = useRef<{ x: number; y: number; dragged: boolean; fromKey: boolean; provisional: NoteEvent | null } | null>(null);
  const placed = useRef(false);
  const sounding = useRef<RollRow | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const rowH = rows.some((row) => row.drum) ? 36 : 18;

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    if (!follow) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const view = scroller.clientWidth;
    const sheet = Math.max(0, view - ROLL_KEY);
    const target = playhead * ROLL_PX - sheet / 2;
    const max = Math.max(0, scroller.scrollWidth - view);
    scroller.scrollLeft = Math.min(max, Math.max(0, target));
  }, [follow, playhead]);

  function rowIndex(note: NoteEvent): number {
    const index = rows.findIndex((row) => (row.drum ? row.drum === note.drum : row.midi === note.pitch));
    return index < 0 ? 0 : index;
  }

  function write(next: NoteEvent[]) {
    notesRef.current = next;
    onChange(next);
  }

  function place(row: RollRow, clientX: number): NoteEvent | null {
    const sheet = sheetRef.current;
    if (!sheet || disabled) return null;
    const time = snapTime((clientX - sheet.getBoundingClientRect().left) / ROLL_PX, step);
    const note = eventFromPointer({ instrument, midi: row.midi, drum: row.drum, time, step, beat: defaultDuration });
    if (!note) return null;
    write([...notesRef.current, note].sort((a, b) => a.time - b.time));
    setSelected(null);
    onPreview(note);
    return note;
  }

  function dropProvisional() {
    const note = gesture.current?.provisional;
    if (!note) return;
    gesture.current!.provisional = null;
    write(notesRef.current.filter((item) => item !== note));
  }

  function rowFromClientY(clientY: number): RollRow | null {
    const grid = gridRef.current;
    if (!grid) return null;
    const index = Math.floor((clientY - grid.getBoundingClientRect().top) / rowH);
    if (index < 0 || index >= rows.length) return null;
    return rows[index];
  }

  function sound(row: RollRow | null) {
    if (!row) {
      silence();
      return;
    }
    if (sounding.current?.key === row.key) return;
    if (sounding.current) onKeyUp(sounding.current);
    sounding.current = row;
    onKeyDown(row);
  }

  function silence() {
    if (!sounding.current) return;
    onKeyUp(sounding.current);
    sounding.current = null;
  }

  function placeRow(row: RollRow, clientX: number) {
    if (placed.current || disabled) return;
    placed.current = true;
    place(row, clientX);
  }

  function onGridPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-note], .daw-edge")) return;
    const fromKey = Boolean(target.closest(".daw-key"));
    const onRow = Boolean(target.closest(".daw-row"));
    if (!fromKey && !onRow) return;
    event.preventDefault();
    placed.current = false;
    const row = rowFromClientY(event.clientY);
    gesture.current = { x: event.clientX, y: event.clientY, dragged: false, fromKey, provisional: null };
    if (fromKey) {
      event.currentTarget.setPointerCapture(event.pointerId);
      if (row) sound(row);
      return;
    }
    if (!row) return;
    const note = place(row, event.clientX);
    if (!note) return;
    placed.current = true;
  }

  function onGridPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || keepPlacedNote(current.fromKey)) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.hypot(dx, dy) < 22) return;
    if (!current.dragged) {
      current.dragged = true;
      dropProvisional();
    }
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    if (Math.abs(dx) > Math.abs(dy) + 8) {
      silence();
      return;
    }
    sound(rowFromClientY(event.clientY));
  }

  function onGridPointerUp() {
    silence();
  }

  function onSheetClick(event: React.MouseEvent<HTMLDivElement>) {
    if (disabled) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-note], .daw-edge, .daw-key")) return;
    if (gesture.current?.dragged) {
      gesture.current = null;
      return;
    }
    gesture.current = null;
    const row = rowFromClientY(event.clientY);
    if (row) placeRow(row, event.clientX);
  }

  function onNoteDown(event: React.PointerEvent<HTMLDivElement>, index: number) {
    if (disabled) return;
    if ((event.target as HTMLElement).closest(".daw-edge")) return;
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const originY = event.clientY;
    const origin = notesRef.current[index];
    const originRow = rowIndex(origin);
    let moved = false;
    let lastRow = originRow;
    let lastTime = origin.time;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      if (Math.hypot(dx, dy) > 5) moved = true;
      const delta = Math.round(dy / rowH);
      const nextRow = Math.min(rows.length - 1, Math.max(0, originRow + delta));
      const raw = Math.abs(dx) < 4 ? origin.time : origin.time + dx / ROLL_PX;
      const limit = Math.max(0, 20 - origin.duration);
      const time = Math.round(Math.min(limit, snapTime(raw, step)) * 1000) / 1000;
      if (nextRow === lastRow && time === lastTime) return;
      const rowChanged = nextRow !== lastRow;
      lastRow = nextRow;
      lastTime = time;
      const row = rows[nextRow];
      const current = notesRef.current[index];
      const updated: NoteEvent = row.drum
        ? { ...current, drum: row.drum, pitch: undefined, time, duration: origin.duration }
        : { ...current, pitch: row.midi, drum: undefined, time, duration: origin.duration };
      const copy = notesRef.current.slice();
      copy[index] = updated;
      write(copy);
      if (rowChanged) onPreview(updated);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) return;
      if (selected === index) {
        write(notesRef.current.filter((_, noteIndex) => noteIndex !== index));
        setSelected(null);
        return;
      }
      setSelected(index);
      onPreview(notesRef.current[index]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onEdgeDown(event: React.PointerEvent<HTMLSpanElement>, index: number) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const origin = notesRef.current[index];
    const move = (ev: PointerEvent) => {
      const raw = origin.duration + (ev.clientX - originX) / ROLL_PX;
      const steps = Math.max(1, Math.round(raw / step));
      const duration = Math.round(Math.min(20 - origin.time, steps * step) * 1000) / 1000;
      const copy = notesRef.current.slice();
      copy[index] = { ...copy[index], time: origin.time, duration };
      write(copy);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const lines = Math.floor(20 / Math.max(step, 0.05));

  return (
    <div className="daw-scroll" data-testid="instrument" ref={scrollRef} role="region" aria-label="Roll for 20 seconds" tabIndex={0}>
      <div
        className="daw-grid"
        ref={gridRef}
        style={{ width: ROLL_KEY + 20 * ROLL_PX, ["--row-h" as string]: `${rowH}px` }}
        onPointerDown={onGridPointerDown}
        onPointerMove={onGridPointerMove}
        onPointerUp={onGridPointerUp}
        onPointerCancel={onGridPointerUp}
      >
        <div className="daw-keys">
          {rows.map((row) => (
            <button type="button" key={row.key} className={row.black ? "daw-key black" : "daw-key"} aria-label={row.label}>
              {row.short}
            </button>
          ))}
        </div>
        <div className="daw-sheet" ref={sheetRef} onClick={onSheetClick}>
          {rows.map((row) => (
            <button type="button" key={row.key} className={row.black ? "daw-row black" : "daw-row"} data-midi={row.midi ?? ""} data-drum={row.drum ?? ""} tabIndex={-1} />
          ))}
          {ghosts
            .filter((ghost) => ghost.kind === "beat")
            .map((ghost, index) => (
              <div key={`beat-${index}`} className="daw-beat" data-testid="hint-beat" style={{ left: ghost.time * ROLL_PX, width: 12 }} />
            ))}
          {Array.from({ length: lines + 1 }, (_, index) => (
            <div
              key={index}
              className={index % 16 === 0 ? "daw-line bar" : index % 4 === 0 ? "daw-line beat" : "daw-line"}
              style={{ left: index * step * ROLL_PX }}
            />
          ))}
          {ghosts
            .filter((ghost) => ghost.kind === "note")
            .map((ghost, index) => {
              const at = ghost.drum ? rows.findIndex((row) => row.drum === ghost.drum) : rows.findIndex((row) => row.midi === ghost.pitch);
              if (at < 0) return null;
              return (
                <div
                  key={`ghost-${index}`}
                  className="daw-ghost"
                  data-testid="hint-note"
                  style={{ top: at * rowH + 2, height: rowH - 4, left: ghost.time * ROLL_PX, width: Math.max(10, ghost.duration * ROLL_PX) }}
                />
              );
            })}
          {notes.map((note, index) => {
            const row = rowIndex(note);
            return (
              <div
                key={index}
                className={selected === index ? "daw-note selected" : "daw-note"}
                data-note="true"
                data-testid="roll-note"
                data-pitch={note.pitch ?? ""}
                data-drum={note.drum ?? ""}
                data-time={note.time}
                data-duration={note.duration}
                role="button"
                aria-label={`${rows[row]?.label ?? "Note"} at ${formatClock(note.time)}`}
                style={{
                  top: row * rowH + 2,
                  height: rowH - 4,
                  left: note.time * ROLL_PX,
                  width: Math.max(14, note.duration * ROLL_PX),
                }}
                onPointerDown={(event) => onNoteDown(event, index)}
              >
                <span className="daw-edge" onPointerDown={(event) => onEdgeDown(event, index)} />
              </div>
            );
          })}
          <div className="playhead" data-testid="roll-playhead" data-seconds={playhead.toFixed(3)} style={{ left: playhead * ROLL_PX }} />
        </div>
      </div>
    </div>
  );
}
