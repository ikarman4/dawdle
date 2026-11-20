import type { DrumName, InstrumentId, NoteEvent, Song } from "./types";

/**
 * Original 20-second arrangements written for DAWdle.
 * No copyrighted songs, riffs, names, or samples.
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENT = [0, 2, 4, 7, 9];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

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
  durRatio = 0.86,
) {
  const beat = 60 / bpm;
  const maxBeat = (20 / beat) - 0.05;
  let cursor = 0;
  let index = 0;
  while (cursor < maxBeat && index < 64) {
    const degree = degrees[index % degrees.length];
    if (degree !== "r") {
      push(notes, {
        instrument,
        time: cursor * beat,
        duration: stepBeats * beat * durRatio,
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
  duration = 0.12,
) {
  const beat = 60 / bpm;
  for (let bar = 0; bar < bars; bar++) {
    for (const step of beats) {
      push(notes, {
        instrument,
        drum,
        time: (bar * 4 + step) * beat,
        duration,
        velocity,
      });
    }
  }
}

function barsIn(bpm: number): number {
  return Math.floor((20 * bpm) / 60 / 4 + 1e-9);
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
  return [...groups.values()]
    .flat()
    .sort((a, b) => a.time - b.time || a.instrument.localeCompare(b.instrument));
}

function song(partial: Omit<Song, "artist" | "notes"> & { notes: NoteEvent[] }): Song {
  return {
    ...partial,
    artist: "DAWdle",
    notes: sanitize(partial.notes),
  };
}

function buildPorchLamp(): Song {
  const bpm = 96;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "kit", "kick", bpm, [0, 2], bars, 0.9);
  addDrums(notes, "kit", "snare", bpm, [1, 3], bars, 0.72);
  addDrums(notes, "kit", "closedHat", bpm, [0, 1, 2, 3], bars, 0.42);
  addDrums(notes, "kit", "openHat", bpm, [3.5], Math.ceil(bars / 2), 0.4, 0.28);
  addDrums(notes, "kit", "tom", bpm, [2.5], 2, 0.66);
  addDrums(notes, "kit", "clap", bpm, [3], 2, 0.55);
  addLine(notes, "bass", bpm, 31, PENT, [0, 0, 3, 0, 4, 3, 0, 2], 2, 0.84, 0.8);
  addLine(notes, "piano", bpm, 67, PENT, [0, 2, 4, 2, 0, "r", 3, 2, 4, 0], 2, 0.76, 0.9);
  addLine(notes, "glock", bpm, 91, PENT, ["r", 4, "r", 2, "r", 3, "r", 0], 2, 0.62, 0.45);
  return song({ id: "porch-lamp", title: "Porch Lamp", year: 2024, bpm, key: "G major", notes });
}

function buildCopperWire(): Song {
  const bpm = 120;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "machine", "kick", bpm, [0, 2.5], bars, 0.92);
  addDrums(notes, "machine", "snare", bpm, [1, 3], bars, 0.7);
  addDrums(notes, "machine", "hat", bpm, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], Math.min(bars, 6), 0.34);
  addDrums(notes, "machine", "clap", bpm, [3], bars, 0.48);
  addLine(notes, "bass", bpm, 38, MINOR, [0, 0, 4, 3, 0, 2], 2, 0.86, 0.7);
  addLine(notes, "synth", bpm, 62, MINOR, [0, 3, 4, 7, 4, 3, 2, 0], 1, 0.7, 0.75);
  addLine(notes, "guitar", bpm, 50, MINOR, [0, "r", 2, "r", 3, "r", 4, "r"], 1, 0.68, 0.55);
  return song({ id: "copper-wire", title: "Copper Wire", year: 2025, bpm, key: "D minor", notes });
}

function buildPaperBoat(): Song {
  const bpm = 84;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "kit", "kick", bpm, [0], bars, 0.82);
  addDrums(notes, "kit", "snare", bpm, [2], bars, 0.6);
  addDrums(notes, "kit", "closedHat", bpm, [1, 3], bars, 0.36);
  addLine(notes, "ukulele", bpm, 72, MAJOR, [0, 2, 4, 2, 5, 4, 2, 0], 2, 0.74, 0.7);
  addLine(notes, "violin", bpm, 60, MAJOR, [0, 4, 7, 4], 4, 0.66, 0.92);
  addLine(notes, "piano", bpm, 60, MAJOR, [0, "r", 2, 4, "r", 5, 4, 2], 2, 0.7, 0.85);
  addLine(notes, "xylo", bpm, 84, PENT, ["r", 2, "r", 4, "r", 0], 2, 0.64, 0.4);
  return song({ id: "paper-boat", title: "Paper Boat", year: 2024, bpm, key: "C major", notes });
}

function buildNightMarket(): Song {
  const bpm = 108;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "machine", "kick", bpm, [0, 0.75, 2], bars, 0.88);
  addDrums(notes, "machine", "snare", bpm, [1, 3], bars, 0.7);
  addDrums(notes, "machine", "hat", bpm, [0.5, 1.5, 2.5, 3.5], bars, 0.36);
  addDrums(notes, "machine", "clap", bpm, [3], Math.ceil(bars / 2), 0.5);
  addLine(notes, "bass", bpm, 45, MINOR, [0, 0, 3, 4, 0, 7, 3, 0], 2, 0.84, 0.72);
  addLine(notes, "synth", bpm, 69, MINOR, [0, 2, 3, 7, 3, 2, 0, -1], 1, 0.68, 0.7);
  addLine(notes, "guitar", bpm, 57, MINOR, [0, 3, 7, 3], 2, 0.66, 0.6);
  addLine(notes, "glock", bpm, 93, PENT, ["r", 4, 2, "r", 3, 0], 2, 0.6, 0.42);
  return song({ id: "night-market", title: "Night Market", year: 2025, bpm, key: "A minor", notes });
}

function buildSlowFreight(): Song {
  const bpm = 72;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "kit", "kick", bpm, [0], bars, 0.86);
  addDrums(notes, "kit", "snare", bpm, [2], bars, 0.58);
  addDrums(notes, "kit", "tom", bpm, [3], bars, 0.5);
  addLine(notes, "bass", bpm, 40, MINOR, [0, 0, 3, 4], 4, 0.8, 0.9);
  addLine(notes, "piano", bpm, 64, MINOR, [0, 2, "r", 3, 4, "r", 2, 0], 2, 0.7, 0.95);
  addLine(notes, "violin", bpm, 64, MINOR, [0, 3, 7, 3], 4, 0.64, 0.95);
  return song({ id: "slow-freight", title: "Slow Freight", year: 2023, bpm, key: "E minor", notes });
}

function buildKiteString(): Song {
  const bpm = 132;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "machine", "kick", bpm, [0, 2], bars, 0.9);
  addDrums(notes, "machine", "clap", bpm, [1, 3], bars, 0.62);
  addDrums(notes, "machine", "hat", bpm, [0, 2], bars, 0.34);
  addDrums(notes, "machine", "snare", bpm, [3.5], Math.ceil(bars / 2), 0.48);
  addLine(notes, "bass", bpm, 41, MAJOR, [0, 0, 4, 3], 2, 0.84, 0.6);
  addLine(notes, "ukulele", bpm, 77, PENT, [0, 2, 4, 2, 3, 4, 2, 0], 2, 0.7, 0.5);
  addLine(notes, "synth", bpm, 65, MAJOR, [0, "r", 4, "r", 2, "r", 5, "r"], 1, 0.62, 0.55);
  addLine(notes, "xylo", bpm, 89, PENT, [4, 2, 0, 2], 2, 0.64, 0.35);
  return song({ id: "kite-string", title: "Kite String", year: 2026, bpm, key: "F major", notes });
}

function buildAmberRoom(): Song {
  const bpm = 90;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "kit", "kick", bpm, [0, 2], bars, 0.84);
  addDrums(notes, "kit", "snare", bpm, [1, 3], bars, 0.66);
  addDrums(notes, "kit", "closedHat", bpm, [0.5, 1.5, 2.5, 3.5], bars, 0.34);
  addDrums(notes, "kit", "clap", bpm, [3], 3, 0.5);
  addLine(notes, "bass", bpm, 34, MAJOR, [0, 4, 3, 0], 2, 0.82, 0.8);
  addLine(notes, "piano", bpm, 58, MAJOR, [0, 2, 4, 7, 4, 2], 2, 0.74, 0.9);
  addLine(notes, "guitar", bpm, 46, MAJOR, [0, 2, 4, 2], 2, 0.66, 0.6);
  addLine(notes, "violin", bpm, 70, MAJOR, [0, 4, 5, 4], 4, 0.62, 0.92);
  return song({ id: "amber-room", title: "Amber Room", year: 2024, bpm, key: "Bb major", notes });
}

function buildTinRoof(): Song {
  const bpm = 126;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "machine", "kick", bpm, [0, 1.5, 2], bars, 0.9);
  addDrums(notes, "machine", "snare", bpm, [1, 3], bars, 0.68);
  addDrums(notes, "machine", "hat", bpm, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 3, 0.3);
  addDrums(notes, "machine", "clap", bpm, [2], bars, 0.42);
  addLine(notes, "bass", bpm, 40, MAJOR, [0, 0, 4, 5, 3, 0], 2, 0.84, 0.62);
  addLine(notes, "guitar", bpm, 52, PENT, [0, 2, 4, 7, 4, 2, 0, -1], 1, 0.7, 0.48);
  addLine(notes, "synth", bpm, 64, MAJOR, [4, 2, 0, 4], 2, 0.64, 0.6);
  addLine(notes, "glock", bpm, 88, PENT, ["r", 2, 4, "r"], 2, 0.58, 0.35);
  return song({ id: "tin-roof", title: "Tin Roof", year: 2025, bpm, key: "E major", notes });
}

function buildLibrarySteps(): Song {
  const bpm = 78;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "kit", "kick", bpm, [0], bars, 0.78);
  addDrums(notes, "kit", "snare", bpm, [2], bars, 0.55);
  addDrums(notes, "kit", "closedHat", bpm, [1, 3], bars, 0.3);
  addLine(notes, "piano", bpm, 62, MAJOR, [0, 2, 4, "r", 5, 4, 2, 0], 2, 0.72, 0.95);
  addLine(notes, "violin", bpm, 74, MAJOR, [0, 4, 2, 5], 4, 0.6, 0.95);
  addLine(notes, "xylo", bpm, 86, PENT, [0, "r", 2, "r", 4, "r", 2, "r"], 2, 0.62, 0.4);
  return song({ id: "library-steps", title: "Library Steps", year: 2023, bpm, key: "D major", notes });
}

function buildHarborBell(): Song {
  const bpm = 76;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "kit", "kick", bpm, [0], bars, 0.8);
  addDrums(notes, "kit", "tom", bpm, [2], bars, 0.58);
  addDrums(notes, "kit", "closedHat", bpm, [3], bars, 0.32);
  addLine(notes, "bass", bpm, 45, MAJOR, [0, 4, 0, 3], 4, 0.78, 0.9);
  addLine(notes, "piano", bpm, 69, MAJOR, [0, "r", 2, 4, "r", 5], 2, 0.68, 0.9);
  addLine(notes, "violin", bpm, 69, MAJOR, [4, 2, 0, 4], 4, 0.6, 0.95);
  addLine(notes, "glock", bpm, 93, PENT, [0, 2, 4, 7, 4, 2, 0, 4], 2, 0.7, 0.38);
  return song({ id: "harbor-bell", title: "Harbor Bell", year: 2024, bpm, key: "A major", notes });
}

function buildSideStreet(): Song {
  const bpm = 114;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "kit", "kick", bpm, [0, 2], bars, 0.88);
  addDrums(notes, "kit", "snare", bpm, [1, 3], bars, 0.7);
  addDrums(notes, "kit", "closedHat", bpm, [0, 1, 2, 3], bars, 0.36);
  addDrums(notes, "kit", "openHat", bpm, [3.5], 3, 0.4, 0.26);
  addLine(notes, "bass", bpm, 31, MINOR, [0, 0, 3, 4, 5, 3], 2, 0.84, 0.7);
  addLine(notes, "guitar", bpm, 55, MINOR, [0, 2, 3, 2, 0, 4, 3, 2], 1, 0.7, 0.55);
  addLine(notes, "synth", bpm, 67, MINOR, [0, "r", 3, 7, "r", 3], 2, 0.64, 0.7);
  addLine(notes, "ukulele", bpm, 79, PENT, [0, 2, 4, 2], 2, 0.66, 0.5);
  return song({ id: "side-street", title: "Side Street", year: 2025, bpm, key: "G minor", notes });
}

function buildWorkshop(): Song {
  const bpm = 102;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "machine", "kick", bpm, [0, 2], bars, 0.9);
  addDrums(notes, "machine", "snare", bpm, [1, 3], bars, 0.66);
  addDrums(notes, "machine", "hat", bpm, [0.5, 1.5, 2.5, 3.5], bars, 0.34);
  addDrums(notes, "machine", "clap", bpm, [3], bars, 0.46);
  addLine(notes, "bass", bpm, 36, MINOR, [0, 0, 4, 3], 2, 0.84, 0.75);
  addLine(notes, "synth", bpm, 60, MINOR, [0, 3, 4, 7, 4, 3], 2, 0.66, 0.7);
  addLine(notes, "piano", bpm, 60, MINOR, [0, 2, "r", 3, "r", 4], 2, 0.6, 0.8);
  addLine(notes, "guitar", bpm, 48, MINOR, [0, 3, 5, 3], 2, 0.64, 0.55);
  addLine(notes, "xylo", bpm, 84, PENT, [2, 4, 2, 0], 2, 0.62, 0.36);
  return song({ id: "workshop", title: "Workshop", year: 2026, bpm, key: "C minor", notes });
}

function buildLanternWalk(): Song {
  const bpm = 88;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "kit", "kick", bpm, [0, 2.5], bars, 0.84);
  addDrums(notes, "kit", "snare", bpm, [2], bars, 0.62);
  addDrums(notes, "kit", "closedHat", bpm, [1, 3], bars, 0.34);
  addLine(notes, "bass", bpm, 41, MAJOR, [0, 4, 5, 3], 2, 0.8, 0.8);
  addLine(notes, "piano", bpm, 65, MAJOR, [0, 2, 4, 5, 4, 2], 2, 0.72, 0.9);
  addLine(notes, "ukulele", bpm, 77, PENT, [0, 2, 4, 0, 3, 2], 2, 0.68, 0.55);
  addLine(notes, "violin", bpm, 65, MAJOR, [0, 4, 7, 4], 4, 0.6, 0.95);
  addLine(notes, "glock", bpm, 89, PENT, ["r", 4, "r", 2, "r", 0], 2, 0.58, 0.4);
  return song({ id: "lantern-walk", title: "Lantern Walk", year: 2024, bpm, key: "F major", notes });
}

function buildRadioKitchen(): Song {
  const bpm = 128;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "machine", "kick", bpm, [0, 0.5, 2], bars, 0.88);
  addDrums(notes, "machine", "snare", bpm, [1], bars, 0.64);
  addDrums(notes, "machine", "clap", bpm, [3], bars, 0.6);
  addDrums(notes, "machine", "hat", bpm, [0, 1, 2, 3], Math.min(6, bars), 0.32);
  addLine(notes, "bass", bpm, 47, MINOR, [0, 0, 3, 4, 0, 2], 2, 0.86, 0.6);
  addLine(notes, "synth", bpm, 71, MINOR, [0, 3, 4, 7, 3, 0], 2, 0.66, 0.55)
  addLine(notes, "piano", bpm, 71, MINOR, [0, "r", 2, "r"], 2, 0.58, 0.7);
  addLine(notes, "guitar", bpm, 59, MINOR, [0, 2, 3, 4], 2, 0.64, 0.5);
  addLine(notes, "xylo", bpm, 95, PENT, [4, 2, 0, 2], 2, 0.6, 0.32);
  return song({ id: "radio-kitchen", title: "Radio Kitchen", year: 2025, bpm, key: "B minor", notes });
}

function buildSundayTools(): Song {
  const bpm = 80;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "kit", "kick", bpm, [0], bars, 0.82);
  addDrums(notes, "kit", "snare", bpm, [2], bars, 0.6);
  addDrums(notes, "kit", "closedHat", bpm, [1, 3], bars, 0.32);
  addDrums(notes, "kit", "tom", bpm, [3.5], 2, 0.55);
  addLine(notes, "bass", bpm, 39, MAJOR, [0, 4, 0, 3], 2, 0.8, 0.85);
  addLine(notes, "piano", bpm, 63, MAJOR, [0, 2, 4, 2, 5, 4], 2, 0.7, 0.9);
  addLine(notes, "violin", bpm, 63, MAJOR, [0, 4, 7, 5], 4, 0.58, 0.95);
  addLine(notes, "ukulele", bpm, 75, PENT, [0, 2, 3, 2], 2, 0.66, 0.55);
  addLine(notes, "glock", bpm, 87, PENT, ["r", 2, 4, "r"], 2, 0.56, 0.38);
  addLine(notes, "xylo", bpm, 87, PENT, [4, "r", 2, "r", 0, "r"], 2, 0.6, 0.34);
  return song({ id: "sunday-tools", title: "Sunday Tools", year: 2023, bpm, key: "Eb major", notes });
}

function buildCedarLoft(): Song {
  const bpm = 104;
  const bars = barsIn(bpm);
  const notes: NoteEvent[] = [];
  addDrums(notes, "kit", "kick", bpm, [0, 2], bars, 0.86);
  addDrums(notes, "kit", "snare", bpm, [1, 3], bars, 0.64);
  addDrums(notes, "kit", "closedHat", bpm, [0.5, 1.5, 2.5, 3.5], Math.min(4, bars), 0.3);
  addLine(notes, "bass", bpm, 45, DORIAN, [0, 0, 3, 4], 2, 0.82, 0.75);
  addLine(notes, "piano", bpm, 69, DORIAN, [0, 2, 3, 4, 3, 2], 2, 0.68, 0.85);
  addLine(notes, "synth", bpm, 69, DORIAN, [4, "r", 2, "r", 0, "r"], 2, 0.58, 0.6);
  addLine(notes, "guitar", bpm, 57, DORIAN, [0, 2, 4, 2], 2, 0.64, 0.5);
  addLine(notes, "violin", bpm, 69, DORIAN, [0, 3, 4, 3], 4, 0.58, 0.9);
  addLine(notes, "glock", bpm, 93, PENT, ["r", 2, "r", 4], 2, 0.55, 0.35);
  addLine(notes, "xylo", bpm, 81, PENT, [0, "r", 4, "r"], 2, 0.58, 0.32);
  return song({ id: "cedar-loft", title: "Cedar Loft", year: 2026, bpm, key: "A dorian", notes });
}

export const SONGS: Song[] = [
  buildPorchLamp(),
  buildCopperWire(),
  buildPaperBoat(),
  buildNightMarket(),
  buildSlowFreight(),
  buildKiteString(),
  buildAmberRoom(),
  buildTinRoof(),
  buildLibrarySteps(),
  buildHarborBell(),
  buildSideStreet(),
  buildWorkshop(),
  buildLanternWalk(),
  buildRadioKitchen(),
  buildSundayTools(),
  buildCedarLoft(),
];
