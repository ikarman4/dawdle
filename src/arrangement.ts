import { hashString } from "./hash";
import { instrumentInfo, type DrumName, type InstrumentId, type NoteEvent } from "./types";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENT = [0, 2, 4, 7, 9];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PITCHED: InstrumentId[] = ["piano", "synth", "guitar", "bass", "ukulele", "violin", "glock", "xylo"];

type Degree = number | "r";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function degreePitch(root: number, scale: number[], degree: number): number {
  const size = scale.length;
  const octave = Math.floor(degree / size);
  const index = ((degree % size) + size) % size;
  return root + scale[index] + octave * 12;
}

function push(notes: NoteEvent[], note: NoteEvent) {
  if (note.time < 0 || note.time >= 19.98) return;
  const duration = Math.min(note.duration, 20 - note.time);
  if (duration < 0.04) return;
  notes.push({
    ...note,
    time: round(note.time),
    duration: round(duration),
    velocity: round(Math.max(0.15, Math.min(1, note.velocity))),
  });
}

function addLine(
  notes: NoteEvent[],
  instrument: InstrumentId,
  bpm: number,
  root: number,
  scale: number[],
  degrees: Degree[],
  stepBeats: number,
  velocity = 0.78,
) {
  const beat = 60 / bpm;
  const maxBeat = 20 / beat - 0.05;
  let cursor = 0;
  let index = 0;
  while (cursor < maxBeat && index < 48) {
    const degree = degrees[index % degrees.length];
    if (degree !== "r") {
      push(notes, {
        instrument,
        time: cursor * beat,
        duration: stepBeats * beat * 0.82,
        velocity,
        pitch: degreePitch(root, scale, degree),
      });
    }
    cursor += stepBeats;
    index += 1;
  }
}

function addDrums(
  notes: NoteEvent[],
  instrument: "kit" | "machine",
  drum: DrumName,
  bpm: number,
  beats: number[],
  bars: number,
  velocity: number,
) {
  const beat = 60 / bpm;
  for (let bar = 0; bar < bars; bar++) {
    for (const step of beats) {
      push(notes, {
        instrument,
        drum,
        time: (bar * 4 + step) * beat,
        duration: 0.12,
        velocity,
      });
    }
  }
}

function barsIn(bpm: number): number {
  return Math.max(1, Math.floor((20 * bpm) / 60 / 4 + 1e-9));
}

function sanitize(notes: NoteEvent[]): NoteEvent[] {
  const groups = new Map<string, NoteEvent[]>();
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  for (const note of sorted) {
    const key = note.drum ? `${note.instrument}:${note.drum}` : `${note.instrument}:${note.pitch}`;
    const list = groups.get(key) ?? [];
    const previous = list[list.length - 1];
    if (previous && note.time - previous.time < 0.19) continue;
    list.push(note);
    groups.set(key, list);
  }
  return [...groups.values()].flat().sort((a, b) => a.time - b.time || a.instrument.localeCompare(b.instrument));
}

export function keyName(id: string): string {
  const hash = hashString(`${id}:key`);
  return `${NAMES[hash % 12]} ${hash % 2 === 0 ? "minor" : "major"}`;
}

/** A stable hidden arrangement for scoring. It is not a transcription of the recording. */
export function buildArrangement(id: string, bpm: number): NoteEvent[] {
  const hash = hashString(`${id}:arr`);
  const scales = [MAJOR, MINOR, PENT, DORIAN];
  const scale = scales[hash % scales.length];
  const root = 36 + (hash % 12);
  const drum: "kit" | "machine" = hash % 2 === 0 ? "kit" : "machine";
  const chosen: InstrumentId[] = [];
  let salt = 0;
  while (chosen.length < 3) {
    const next = PITCHED[(hash + salt) % PITCHED.length];
    if (!chosen.includes(next)) chosen.push(next);
    salt += 1;
  }
  const notes: NoteEvent[] = [];
  const bars = barsIn(bpm);
  if (drum === "kit") {
    addDrums(notes, "kit", "kick", bpm, [0, 2], bars, 0.9);
    addDrums(notes, "kit", "snare", bpm, [1, 3], bars, 0.72);
    addDrums(notes, "kit", "closedHat", bpm, [0, 1, 2, 3], bars, 0.4);
  } else {
    addDrums(notes, "machine", "kick", bpm, [0, 2.5], bars, 0.9);
    addDrums(notes, "machine", "snare", bpm, [1, 3], bars, 0.7);
    addDrums(notes, "machine", "hat", bpm, [0.5, 1.5, 2.5, 3.5], bars, 0.36);
  }
  const patterns: Degree[][] = [
    [0, 0, 3, 0, 4, 3, 0, 2],
    [0, 2, 4, 2, 0, "r", 3, 4],
    [0, "r", 2, "r", 4, 3, 2, 0],
  ];
  chosen.forEach((instrument, index) => {
    const low = instrumentInfo(instrument).baseMidi + (root % 12);
    addLine(notes, instrument, bpm, low, scale, patterns[index % patterns.length], index === 0 ? 2 : 1, 0.74 - index * 0.04);
  });
  return sanitize(notes);
}
