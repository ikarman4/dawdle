import type { BoardCard, DrumName, InstrumentId, NoteEvent } from "./types";

const INSTRUMENT_IDS: InstrumentId[] = [
  "piano",
  "synth",
  "guitar",
  "bass",
  "ukulele",
  "violin",
  "kit",
  "machine",
  "glock",
  "xylo",
];

const DRUM_IDS: DrumName[] = ["kick", "snare", "closedHat", "openHat", "tom", "clap", "hat"];

function pushU16(bytes: number[], value: number) {
  const n = Math.max(0, Math.min(65535, Math.round(value)));
  bytes.push((n >> 8) & 255, n & 255);
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function encodeUtf8(value: string, max: number): number[] {
  const bytes = [...new TextEncoder().encode(value)].slice(0, max);
  return [bytes.length, ...bytes];
}

function decodeUtf8(bytes: Uint8Array, offset: number): { value: string; next: number } | null {
  if (offset >= bytes.length) return null;
  const length = bytes[offset];
  const start = offset + 1;
  const end = start + length;
  if (end > bytes.length) return null;
  const value = new TextDecoder().decode(bytes.slice(start, end));
  return { value, next: end };
}

export function encodeShare(card: Pick<BoardCard, "username" | "score" | "date" | "bpm" | "title" | "events" | "follows">): string {
  const bytes: number[] = [1];
  bytes.push(Math.max(0, Math.min(100, Math.round(card.score))));
  const [year, month, day] = card.date.split("-").map(Number);
  pushU16(bytes, year || 2026);
  bytes.push(month || 1, day || 1, Math.max(1, Math.min(255, Math.round(card.bpm))));
  bytes.push(...encodeUtf8(card.title || "Sketch", 48));
  bytes.push(...encodeUtf8(card.username || "Player", 24));
  const follows = card.follows.slice(0, 24);
  bytes.push(follows.length);
  for (const name of follows) bytes.push(...encodeUtf8(name, 24));
  const events = card.events.slice(0, 400);
  pushU16(bytes, events.length);
  for (const event of events) {
    const instrument = INSTRUMENT_IDS.indexOf(event.instrument);
    const drum = event.drum ? DRUM_IDS.indexOf(event.drum) + 1 : 0;
    bytes.push(Math.max(0, instrument) & 15);
    bytes.push(drum & 15);
    pushU16(bytes, Math.round(Math.max(0, Math.min(20, event.time)) * 100));
    pushU16(bytes, Math.round(Math.max(0.05, event.duration) * 100));
    bytes.push(Math.max(0, Math.min(127, Math.round(event.velocity * 100))));
    bytes.push(Math.max(0, Math.min(127, event.pitch ?? 0)));
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeShare(payload: string): BoardCard | null {
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((payload.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes[0] !== 1 || bytes.length < 12) return null;
    const score = bytes[1];
    const year = readU16(bytes, 2);
    const month = bytes[4];
    const day = bytes[5];
    const bpm = bytes[6];
    let cursor = 7;
    const title = decodeUtf8(bytes, cursor);
    if (!title) return null;
    cursor = title.next;
    const username = decodeUtf8(bytes, cursor);
    if (!username) return null;
    cursor = username.next;
    if (cursor >= bytes.length) return null;
    const followCount = bytes[cursor];
    cursor += 1;
    const follows: string[] = [];
    for (let i = 0; i < followCount; i++) {
      const name = decodeUtf8(bytes, cursor);
      if (!name) return null;
      follows.push(name.value);
      cursor = name.next;
    }
    if (cursor + 2 > bytes.length) return null;
    const eventCount = readU16(bytes, cursor);
    cursor += 2;
    const events: NoteEvent[] = [];
    for (let i = 0; i < eventCount; i++) {
      if (cursor + 8 > bytes.length) return null;
      const instrument = INSTRUMENT_IDS[bytes[cursor] & 15];
      const drumIndex = bytes[cursor + 1] & 15;
      const time = readU16(bytes, cursor + 2) / 100;
      const duration = readU16(bytes, cursor + 4) / 100;
      const velocity = bytes[cursor + 6] / 100;
      const pitch = bytes[cursor + 7];
      cursor += 8;
      if (!instrument) return null;
      const event: NoteEvent = { instrument, time, duration, velocity };
      if (drumIndex > 0) event.drum = DRUM_IDS[drumIndex - 1];
      else if (pitch > 0) event.pitch = pitch;
      events.push(event);
    }
    const date = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    return {
      id: `share:${username.value.toLowerCase()}:${date}:${score}`,
      username: username.value,
      score,
      date,
      bpm,
      title: title.value,
      events,
      follows,
      source: "share",
      locked: true,
    };
  } catch {
    return null;
  }
}

export function shareHash(card: BoardCard): string {
  return `board/${encodeShare(card)}`;
}
