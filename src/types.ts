export type InstrumentId =
  | "piano"
  | "synth"
  | "guitar"
  | "bass"
  | "ukulele"
  | "violin"
  | "kit"
  | "machine"
  | "glock"
  | "xylo";

export type DrumName =
  | "kick"
  | "snare"
  | "closedHat"
  | "openHat"
  | "tom"
  | "clap"
  | "hat";

export type InstrumentKind = "pitched" | "drum";

export type SectionId = "rhythm" | "keys" | "strings" | "percussion";

export interface NoteEvent {
  instrument: InstrumentId;
  time: number;
  duration: number;
  velocity: number;
  pitch?: number;
  drum?: DrumName;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  year: number;
  duration: number;
  bpm: number;
  key: string;
  notes: NoteEvent[];
}

export interface Track {
  id: string;
  instrument: InstrumentId;
  events: NoteEvent[];
  mute: boolean;
  solo: boolean;
  technique?: string;
}

export interface Attempt {
  raw: number;
  events: NoteEvent[];
}

export interface DayState {
  mode: "easy" | "hard";
  modeLocked: boolean;
  attempts: Attempt[];
  hintCount: number;
  instrumentsRevealed: boolean;
  hintSteps: Partial<Record<InstrumentId, number>>;
  revealedAll: boolean;
  locked: boolean;
  tracks: Track[];
  revealed: boolean;
}

export interface BoardCard {
  id: string;
  username: string;
  score: number;
  date: string;
  bpm: number;
  title: string;
  events: NoteEvent[];
  follows: string[];
  source: "you" | "share";
  locked: boolean;
}

export interface InstrumentInfo {
  id: InstrumentId;
  name: string;
  group: "Keys" | "Strings" | "Drums" | "Percussion";
  kind: InstrumentKind;
  baseMidi: number;
}

export const INSTRUMENTS: InstrumentInfo[] = [
  { id: "piano", name: "Piano", group: "Keys", kind: "pitched", baseMidi: 60 },
  { id: "synth", name: "Synthesizer", group: "Keys", kind: "pitched", baseMidi: 60 },
  { id: "guitar", name: "Guitar", group: "Strings", kind: "pitched", baseMidi: 48 },
  { id: "bass", name: "Bass guitar", group: "Strings", kind: "pitched", baseMidi: 36 },
  { id: "ukulele", name: "Ukulele", group: "Strings", kind: "pitched", baseMidi: 67 },
  { id: "violin", name: "Violin", group: "Strings", kind: "pitched", baseMidi: 55 },
  { id: "kit", name: "Drum kit", group: "Drums", kind: "drum", baseMidi: 60 },
  { id: "machine", name: "Drum machine", group: "Drums", kind: "drum", baseMidi: 60 },
  { id: "glock", name: "Glockenspiel", group: "Percussion", kind: "pitched", baseMidi: 84 },
  { id: "xylo", name: "Xylophone", group: "Percussion", kind: "pitched", baseMidi: 72 },
];

export const KIT_DRUMS: DrumName[] = ["kick", "snare", "closedHat", "openHat", "tom", "clap"];
export const MACHINE_DRUMS: DrumName[] = ["kick", "snare", "hat", "clap"];

export const DRUM_LABELS: Record<DrumName, string> = {
  kick: "Kick",
  snare: "Snare",
  closedHat: "Closed hat",
  openHat: "Open hat",
  tom: "Tom",
  clap: "Clap",
  hat: "Hat",
};

export const SECTIONS: { id: SectionId; label: string; instruments: InstrumentId[] }[] = [
  { id: "rhythm", label: "Rhythm", instruments: ["kit", "machine"] },
  { id: "keys", label: "Keys", instruments: ["piano", "synth"] },
  { id: "strings", label: "Strings", instruments: ["guitar", "bass", "ukulele", "violin"] },
  { id: "percussion", label: "Percussion", instruments: ["glock", "xylo"] },
];

export function instrumentInfo(id: InstrumentId): InstrumentInfo {
  const found = INSTRUMENTS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown instrument ${id}`);
  return found;
}

export function drumsFor(id: InstrumentId): DrumName[] {
  if (id === "machine") return MACHINE_DRUMS;
  if (id === "kit") return KIT_DRUMS;
  return [];
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function noteName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export const INSTRUMENT_EMOJI: Record<InstrumentId, string> = {
  piano: "🎹",
  synth: "🎛️",
  guitar: "🎸",
  bass: "🎸",
  ukulele: "🪕",
  violin: "🎻",
  kit: "🥁",
  machine: "🤖",
  glock: "🔔",
  xylo: "🎶",
};

export function freshDay(): DayState {
  return {
    mode: "easy",
    modeLocked: false,
    attempts: [],
    hintCount: 0,
    instrumentsRevealed: false,
    hintSteps: {},
    revealedAll: false,
    locked: false,
    tracks: [],
    revealed: false,
  };
}

let trackSerial = 0;

export function emptyTrack(instrument: InstrumentId, technique?: string): Track {
  trackSerial += 1;
  const id = `track-${trackSerial.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, instrument, events: [], mute: false, solo: false, technique };
}

export function cloneNotes(notes: NoteEvent[]): NoteEvent[] {
  return notes.map((note) => ({ ...note }));
}
