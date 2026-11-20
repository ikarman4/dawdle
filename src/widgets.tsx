import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "./daily";
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

export function InstrumentGlyph({ id }: { id: InstrumentId }) {
  const common = { viewBox: "0 0 64 48", "aria-hidden": true as const };
  if (id === "piano") {
    return (
      <svg {...common}>
        <rect x="4" y="6" width="56" height="36" rx="3" fill="#f4f1ea" stroke="#222" />
        {[10, 18, 26, 34, 42, 50].map((x) => (
          <rect key={x} x={x} y="6" width="8" height="36" fill="none" stroke="#222" />
        ))}
        {[16, 24, 40, 48].map((x) => (
          <rect key={x} x={x} y="6" width="6" height="20" fill="#222" />
        ))}
      </svg>
    );
  }
  if (id === "synth") {
    return (
      <svg {...common}>
        <rect x="4" y="8" width="56" height="32" rx="4" fill="#5b4dff" />
        <circle cx="16" cy="18" r="4" fill="#ffd15c" />
        <circle cx="28" cy="18" r="4" fill="#7dffa0" />
        {[36, 44, 52].map((x) => (
          <rect key={x} x={x} y="14" width="5" height="20" fill="#fff" />
        ))}
      </svg>
    );
  }
  if (id === "guitar") {
    return (
      <svg {...common}>
        <rect x="34" y="2" width="3" height="18" fill="#e7c79a" />
        <path d="M24 20c-10 2-12 14-4 20 6 3 18 3 24 0 8-6 6-18-4-20-4 4-12 4-16 0z" fill="#e39a45" stroke="#6a3d16" />
        <circle cx="36" cy="32" r="3" fill="#4a2a10" />
      </svg>
    );
  }
  if (id === "bass") {
    return (
      <svg {...common}>
        <rect x="40" y="2" width="3" height="24" fill="#cbb59a" />
        <path d="M22 26c-8 4-8 14 0 16 8 2 22 2 28-2 6-6 2-14-6-16-6 3-16 3-22 2z" fill="#5c331c" stroke="#2a160c" />
        <circle cx="34" cy="34" r="2.5" fill="#1a0e08" />
      </svg>
    );
  }
  if (id === "ukulele") {
    return (
      <svg {...common}>
        <rect x="30" y="10" width="3" height="12" fill="#f3d7a1" />
        <ellipse cx="31" cy="32" rx="9" ry="8" fill="#f0c14a" stroke="#8a6418" />
        <circle cx="31" cy="32" r="2" fill="#6a4a10" />
      </svg>
    );
  }
  if (id === "violin") {
    return (
      <svg {...common}>
        <rect x="30" y="2" width="3" height="18" fill="#222" />
        <path d="M24 20c-6 2-8 8-6 14 4 2 16 2 20 0 2-6 0-12-6-14-2 2-6 2-8 0z" fill="#8a4b2a" stroke="#3a2412" />
      </svg>
    );
  }
  if (id === "kit") {
    return (
      <svg {...common}>
        <ellipse cx="20" cy="30" rx="12" ry="7" fill="#e24b4b" stroke="#222" />
        <ellipse cx="42" cy="28" rx="10" ry="6" fill="#f2f2f2" stroke="#222" />
        <ellipse cx="46" cy="14" rx="8" ry="3" fill="#d7c15a" stroke="#222" />
      </svg>
    );
  }
  if (id === "machine") {
    return (
      <svg {...common}>
        <rect x="6" y="10" width="52" height="28" rx="4" fill="#2c2c2c" />
        {["#ff5a5a", "#ffd15c", "#7dffa0", "#5b8cff"].map((fill, index) => (
          <rect key={fill} x={12 + index * 12} y="18" width="8" height="12" rx="2" fill={fill} />
        ))}
      </svg>
    );
  }
  if (id === "glock") {
    return (
      <svg {...common}>
        {[0, 1, 2, 3, 4].map((index) => (
          <rect key={index} x={8 + index * 10} y={10 + (index % 2) * 4} width="7" height={26 - index * 2} rx="2" fill="#d5dbe3" stroke="#667" />
        ))}
      </svg>
    );
  }
  return (
    <svg {...common}>
      {["#e07a3d", "#e2b04a", "#7dae4e", "#4aa3c7", "#c46ad4"].map((fill, index) => (
        <rect key={fill} x={6 + index * 11} y={8 + index} width="8" height={30 - index * 3} rx="2" fill={fill} />
      ))}
    </svg>
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef(notes);
  const tap = useRef<{ x: number; y: number; key: string } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const rowH = rows.some((row) => row.drum) ? 36 : 18;

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    if (!follow) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const x = ROLL_KEY + playhead * ROLL_PX;
    const left = scroller.scrollLeft;
    const view = scroller.clientWidth;
    if (x < left + ROLL_KEY + 8 || x > left + view - 28) {
      scroller.scrollLeft = Math.max(0, x - ROLL_KEY - view * 0.3);
    }
  }, [follow, playhead]);

  function rowIndex(note: NoteEvent): number {
    const index = rows.findIndex((row) => (row.drum ? row.drum === note.drum : row.midi === note.pitch));
    return index < 0 ? 0 : index;
  }

  function write(next: NoteEvent[]) {
    notesRef.current = next;
    onChange(next);
  }

  function place(row: RollRow, clientX: number) {
    const sheet = sheetRef.current;
    if (!sheet || disabled) return;
    const time = snapTime((clientX - sheet.getBoundingClientRect().left) / ROLL_PX, step);
    const span = row.drum ? step : Math.max(step, defaultDuration);
    const duration = Math.round(Math.min(span, 20 - time) * 1000) / 1000;
    if (duration < step * 0.5) return;
    const note: NoteEvent = row.drum
      ? { instrument, drum: row.drum, time, duration, velocity: 0.86 }
      : { instrument, pitch: row.midi, time, duration, velocity: 0.8 };
    write([...notesRef.current, note].sort((a, b) => a.time - b.time));
    setSelected(null);
    onPreview(note);
  }

  function onNoteDown(event: React.PointerEvent<HTMLDivElement>, index: number) {
    if (disabled) return;
    if ((event.target as HTMLElement).closest(".daw-edge")) return;
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const originY = event.clientY;
    const originRow = rowIndex(notesRef.current[index]);
    let moved = false;
    let lastRow = originRow;
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - originX, ev.clientY - originY) > 5) moved = true;
      const delta = Math.round((ev.clientY - originY) / rowH);
      const nextRow = Math.min(rows.length - 1, Math.max(0, originRow + delta));
      if (nextRow === lastRow) return;
      lastRow = nextRow;
      const row = rows[nextRow];
      const current = notesRef.current[index];
      const updated: NoteEvent = row.drum
        ? { ...current, drum: row.drum, pitch: undefined }
        : { ...current, pitch: row.midi, drum: undefined };
      const copy = notesRef.current.slice();
      copy[index] = updated;
      write(copy);
      onPreview(updated);
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
      <div className="daw-grid" style={{ width: ROLL_KEY + 20 * ROLL_PX, ["--row-h" as string]: `${rowH}px` }}>
        <div className="daw-keys">
          {rows.map((row) => (
            <button
              type="button"
              key={row.key}
              className={row.black ? "daw-key black" : "daw-key"}
              aria-label={row.label}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                onKeyDown(row);
              }}
              onPointerUp={() => onKeyUp(row)}
              onPointerCancel={() => onKeyUp(row)}
            >
              {row.short}
            </button>
          ))}
        </div>
        <div className="daw-sheet" ref={sheetRef}>
          {rows.map((row) => (
            <div
              key={row.key}
              className={row.black ? "daw-row black" : "daw-row"}
              data-midi={row.midi ?? ""}
              data-drum={row.drum ?? ""}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("[data-note]")) return;
                tap.current = { x: event.clientX, y: event.clientY, key: row.key };
              }}
              onPointerUp={(event) => {
                const start = tap.current;
                tap.current = null;
                if (!start || start.key !== row.key || disabled) return;
                if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
                place(row, event.clientX);
              }}
            />
          ))}
          {Array.from({ length: lines + 1 }, (_, index) => (
            <div
              key={index}
              className={index % 16 === 0 ? "daw-line bar" : index % 4 === 0 ? "daw-line beat" : "daw-line"}
              style={{ left: index * step * ROLL_PX }}
            />
          ))}
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
          <div className="playhead" style={{ left: playhead * ROLL_PX }} />
        </div>
      </div>
    </div>
  );
}
