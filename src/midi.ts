import type { DrumName, InstrumentId, NoteEvent } from "./types";

interface Timed {
  tick: number;
  kind: "on" | "off" | "tempo" | "program";
  channel: number;
  pitch: number;
  velocity: number;
  us: number;
  program: number;
}

function readVlq(bytes: Uint8Array, offset: number): { value: number; next: number } | null {
  let value = 0;
  let index = offset;
  for (let step = 0; step < 4; step += 1) {
    if (index >= bytes.length) return null;
    const byte = bytes[index];
    index += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: index };
  }
  return null;
}

function instrumentForProgram(program: number): InstrumentId {
  if (program === 9 || program === 10 || program === 11) return "glock";
  if (program === 12 || program === 13 || program === 14) return "xylo";
  if (program >= 0 && program <= 7) return "piano";
  if (program === 24) return "ukulele";
  if (program >= 25 && program <= 31) return "guitar";
  if (program >= 32 && program <= 39) return "bass";
  if (program >= 40 && program <= 47) return "violin";
  if (program >= 8 && program <= 15) return "glock";
  return "synth";
}

function drumForPitch(pitch: number): DrumName {
  if (pitch === 35 || pitch === 36) return "kick";
  if (pitch === 38 || pitch === 40) return "snare";
  if (pitch === 39) return "clap";
  if (pitch === 42 || pitch === 44) return "closedHat";
  if (pitch === 46 || pitch === 49 || pitch === 51 || pitch === 52 || pitch === 55 || pitch === 57 || pitch === 59) return "openHat";
  if (pitch === 41 || pitch === 43 || pitch === 45 || pitch === 47 || pitch === 48 || pitch === 50) return "tom";
  return "hat";
}

function ticksToSeconds(tempos: { tick: number; us: number }[], tick: number, division: number): number {
  let last = 0;
  let seconds = 0;
  let us = 500000;
  for (const tempo of tempos) {
    if (tempo.tick >= tick) break;
    seconds += ((tempo.tick - last) * us) / division / 1_000_000;
    last = tempo.tick;
    us = tempo.us;
  }
  seconds += ((tick - last) * us) / division / 1_000_000;
  return seconds;
}

function parseTrack(bytes: Uint8Array, offset: number): { events: Timed[]; next: number } | null {
  if (offset + 8 > bytes.length) return null;
  if (bytes[offset] !== 0x4d || bytes[offset + 1] !== 0x54 || bytes[offset + 2] !== 0x72 || bytes[offset + 3] !== 0x6b) return null;
  const length = (bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7];
  const start = offset + 8;
  const end = start + length;
  if (length < 0 || end > bytes.length) return null;
  const events: Timed[] = [];
  let tick = 0;
  let index = start;
  let status = 0;
  while (index < end) {
    const delta = readVlq(bytes, index);
    if (!delta) return null;
    index = delta.next;
    tick += delta.value;
    if (index >= end) return null;
    let byte = bytes[index];
    if (byte === 0xff) {
      if (index + 2 >= end) return null;
      const type = bytes[index + 1];
      const size = readVlq(bytes, index + 2);
      if (!size || size.next + size.value > end) return null;
      if (type === 0x51 && size.value === 3) {
        const us = (bytes[size.next] << 16) | (bytes[size.next + 1] << 8) | bytes[size.next + 2];
        events.push({ tick, kind: "tempo", channel: 0, pitch: 0, velocity: 0, us, program: 0 });
      }
      index = size.next + size.value;
      continue;
    }
    if (byte === 0xf0 || byte === 0xf7) {
      const size = readVlq(bytes, index + 1);
      if (!size || size.next + size.value > end) return null;
      index = size.next + size.value;
      continue;
    }
    if (byte < 0x80) {
      if (status < 0x80) return null;
      byte = status;
    } else {
      status = byte;
      index += 1;
    }
    const kind = byte & 0xf0;
    const channel = byte & 0x0f;
    if (kind === 0xc0 || kind === 0xd0) {
      if (index >= end) return null;
      if (kind === 0xc0) events.push({ tick, kind: "program", channel, pitch: 0, velocity: 0, us: 0, program: bytes[index] });
      index += 1;
      continue;
    }
    if (index + 1 >= end) return null;
    const data1 = bytes[index];
    const data2 = bytes[index + 1];
    index += 2;
    if (kind === 0x90 && data2 > 0) events.push({ tick, kind: "on", channel, pitch: data1, velocity: data2, us: 0, program: 0 });
    else if (kind === 0x80 || (kind === 0x90 && data2 === 0)) events.push({ tick, kind: "off", channel, pitch: data1, velocity: 0, us: 0, program: 0 });
  }
  return { events, next: end };
}

/** Map a MIDI file onto DAWdle notes in the first 20 seconds. This does not fetch audio. */
export function midiToNotes(data: Uint8Array): NoteEvent[] {
  if (data.length < 14) return [];
  if (data[0] !== 0x4d || data[1] !== 0x54 || data[2] !== 0x68 || data[3] !== 0x64) return [];
  const header = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7];
  if (header < 6) return [];
  const format = (data[8] << 8) | data[9];
  const tracks = (data[10] << 8) | data[11];
  const division = (data[12] << 8) | data[13];
  if (format > 1 || tracks < 1 || division <= 0 || division & 0x8000) return [];
  const collected: Timed[] = [];
  let offset = 8 + header;
  for (let track = 0; track < tracks && offset < data.length; track += 1) {
    const parsed = parseTrack(data, offset);
    if (!parsed) break;
    collected.push(...parsed.events);
    offset = parsed.next;
  }
  collected.sort((a, b) => a.tick - b.tick || (a.kind === "program" ? -1 : 1));
  const tempos = collected.filter((event) => event.kind === "tempo").map((event) => ({ tick: event.tick, us: event.us || 500000 }));
  const programs = new Array<number>(16).fill(0);
  const held = new Map<string, { time: number; velocity: number }>();
  const notes: NoteEvent[] = [];
  for (const event of collected) {
    if (event.kind === "program") {
      programs[event.channel] = event.program;
      continue;
    }
    if (event.kind !== "on" && event.kind !== "off") continue;
    const key = `${event.channel}:${event.pitch}`;
    const seconds = ticksToSeconds(tempos, event.tick, division);
    if (event.kind === "on") {
      if (seconds < 20) held.set(key, { time: seconds, velocity: event.velocity / 127 });
      continue;
    }
    const start = held.get(key);
    held.delete(key);
    if (!start || seconds <= start.time) continue;
    const time = Math.round(start.time * 1000) / 1000;
    const duration = Math.round(Math.min(20 - time, seconds - start.time) * 1000) / 1000;
    if (time >= 20 || duration < 0.04) continue;
    if (event.channel === 9) {
      notes.push({ instrument: "kit", time, duration: Math.min(duration, 0.4), velocity: Math.max(0.15, start.velocity), drum: drumForPitch(event.pitch) });
      continue;
    }
    notes.push({
      instrument: instrumentForProgram(programs[event.channel] ?? 0),
      time,
      duration,
      velocity: Math.max(0.15, Math.min(1, start.velocity)),
      pitch: event.pitch,
    });
  }
  notes.sort((a, b) => a.time - b.time);
  return notes;
}
