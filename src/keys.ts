import { INSTRUMENTS, type DrumName, type InstrumentId, type NoteEvent } from "./types";

const DRUMS = new Set<DrumName>(["kick", "snare", "closedHat", "openHat", "tom", "clap", "hat"]);

export const KEY_COMMIT_NOTE =
  "GitHub Pages cannot write the repo from the browser. Download this file and commit it to src/keys. Ian commits the saved file.";

export interface ScoringKey {
  videoId: string;
  notes: NoteEvent[];
}

function isInstrument(value: unknown): value is InstrumentId {
  return typeof value === "string" && INSTRUMENTS.some((item) => item.id === value);
}

export function noteFromKey(value: unknown): NoteEvent | null {
  if (!value || typeof value !== "object") return null;
  const note = value as Record<string, unknown>;
  if (!isInstrument(note.instrument)) return null;
  if (typeof note.time !== "number" || typeof note.duration !== "number") return null;
  const time = Math.max(0, Math.min(19.99, note.time));
  if (time >= 19.98) return null;
  const duration = Math.min(20 - time, note.duration);
  if (duration < 0.04) return null;
  const velocity = typeof note.velocity === "number" ? Math.max(0.05, Math.min(1, note.velocity)) : 0.8;
  const event: NoteEvent = { instrument: note.instrument, time, duration, velocity };
  if (typeof note.pitch === "number" && Number.isFinite(note.pitch)) event.pitch = Math.round(note.pitch);
  if (typeof note.drum === "string" && DRUMS.has(note.drum as DrumName)) event.drum = note.drum as DrumName;
  if (event.pitch == null && event.drum == null) return null;
  return event;
}

export function keyFromFile(value: unknown, fileId: string): ScoringKey | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const videoId = typeof raw.videoId === "string" && raw.videoId ? raw.videoId : fileId;
  if (!videoId || !Array.isArray(raw.notes)) return null;
  const notes = raw.notes.map(noteFromKey).filter((note): note is NoteEvent => note != null);
  if (!notes.length) return null;
  notes.sort((a, b) => a.time - b.time);
  return { videoId, notes };
}

const files = import.meta.glob("./keys/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

const byId = new Map<string, NoteEvent[]>();
for (const [path, value] of Object.entries(files)) {
  const fileId = path.split("/").pop()?.replace(/\.json$/i, "") ?? "";
  const key = keyFromFile(value, fileId);
  if (key) byId.set(key.videoId, key.notes);
}

export function authoredNotes(videoId: string): NoteEvent[] | null {
  return byId.get(videoId) ?? null;
}

export function hasAuthoredKey(videoId: string): boolean {
  return byId.has(videoId);
}

export function sketchCopy(authored: boolean): { title: string; detail: string; play: string; stop: string } {
  if (authored) {
    return {
      title: "Our sketch of this snippet",
      detail: "Our sketch of the snippet, not the original stems.",
      play: "Play our sketch",
      stop: "Stop our sketch",
    };
  }
  return {
    title: "Placeholder sketch",
    detail: "A generated placeholder, not the original stems. No authored key is saved for this song yet.",
    play: "Play the placeholder sketch",
    stop: "Stop the placeholder sketch",
  };
}
