import { buildArrangement, keyName } from "./arrangement";
import { CATALOG, type CatalogEntry } from "./catalog";
import { bpmForId } from "./hash";
import { authoredNotes, hasAuthoredKey } from "./keys";
import type { NoteEvent, Song } from "./types";

const notesFor = new Map<string, NoteEvent[]>();

function notesOf(id: string, bpm: number): NoteEvent[] {
  const cached = notesFor.get(id);
  if (cached) return cached;
  const notes = authoredNotes(id) ?? buildArrangement(id, bpm);
  notesFor.set(id, notes);
  return notes;
}

function toSong(entry: CatalogEntry): Song {
  const bpm = bpmForId(entry.id);
  const song = {
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    year: entry.year,
    duration: 0,
    bpm,
    key: keyName(entry.id),
    notes: [] as NoteEvent[],
    authored: false,
  };
  Object.defineProperty(song, "notes", {
    enumerable: true,
    get() {
      return notesOf(entry.id, bpm);
    },
  });
  Object.defineProperty(song, "authored", {
    enumerable: true,
    get() {
      return hasAuthoredKey(entry.id);
    },
  });
  return song;
}

export const SONGS: Song[] = CATALOG.map(toSong);
