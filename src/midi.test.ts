import { describe, expect, it } from "vitest";
import { midiToNotes } from "./midi";

function vlq(value: number): number[] {
  if (value < 128) return [value];
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

function chunk(type: string, body: number[]): number[] {
  const length = body.length;
  return [
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3),
    (length >> 24) & 255,
    (length >> 16) & 255,
    (length >> 8) & 255,
    length & 255,
    ...body,
  ];
}

describe("midi import", () => {
  it("maps a quarter-note piano and a kick into the 20 second window", () => {
    const track = [
      ...vlq(0),
      0xff,
      0x51,
      0x03,
      0x07,
      0xa1,
      0x20,
      ...vlq(0),
      0x90,
      60,
      100,
      ...vlq(480),
      0x80,
      60,
      0,
      ...vlq(0),
      0x99,
      36,
      110,
      ...vlq(120),
      0x89,
      36,
      0,
      ...vlq(0),
      0xff,
      0x2f,
      0x00,
    ];
    const file = new Uint8Array([...chunk("MThd", [0, 0, 0, 1, 1, 224]), ...chunk("MTrk", track)]);
    const notes = midiToNotes(file);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ instrument: "piano", time: 0, pitch: 60 });
    expect(notes[0].duration).toBeCloseTo(0.5, 2);
    expect(notes[1]).toMatchObject({ instrument: "kit", drum: "kick" });
    expect(notes[1].time).toBeCloseTo(0.5, 2);
  });

  it("returns nothing for a file that is not MIDI", () => {
    expect(midiToNotes(new Uint8Array([1, 2, 3, 4]))).toEqual([]);
  });
});
