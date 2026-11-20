import { describe, expect, it } from "vitest";
import { calmLine, peaksFor, scoreArrangement } from "./score";
import type { NoteEvent } from "./types";

function piano(time: number, pitch: number, duration = 0.3): NoteEvent {
  return { instrument: "piano", time, duration, velocity: 0.8, pitch };
}

describe("scoreArrangement", () => {
  it("scores a perfect match as 100 and an empty arrangement as 0", () => {
    const reference = [piano(0, 60), piano(1, 64), piano(2, 67)];
    expect(scoreArrangement(reference, reference.map((note) => ({ ...note })))).toBe(100);
    expect(scoreArrangement(reference, [])).toBe(0);
  });

  it("does not let extra wrong notes reach the 90s", () => {
    const reference = Array.from({ length: 10 }, (_, index) => piano(index * 0.5, 60));
    const extras = Array.from({ length: 40 }, (_, index) => piano(10 + (index % 8) * 0.5, 61));
    const percentage = scoreArrangement(reference, [...reference, ...extras]);
    expect(percentage).toBeLessThan(90);
    expect(percentage).toBeGreaterThan(0);
  });

  it("gives partial credit for an octave miss", () => {
    const reference = [piano(1, 60)];
    const percentage = scoreArrangement(reference, [piano(1, 72)]);
    expect(percentage).toBeGreaterThan(0);
    expect(percentage).toBeLessThan(100);
  });

  it("requires the same instrument, drum, and a 180ms window", () => {
    const reference = [piano(1, 60)];
    expect(scoreArrangement(reference, [{ ...piano(1, 60), instrument: "synth" }])).toBe(0);
    expect(scoreArrangement(reference, [piano(1.2, 60)])).toBe(0);
    expect(scoreArrangement(reference, [piano(1.17, 60)])).toBe(100);
    const kick: NoteEvent = { instrument: "kit", time: 0, duration: 0.1, velocity: 0.9, drum: "kick" };
    const snare: NoteEvent = { ...kick, drum: "snare" };
    expect(scoreArrangement([kick], [snare])).toBe(0);
    expect(scoreArrangement([kick], [kick])).toBe(100);
  });

  it("keeps the calm line kind", () => {
    const reference = [piano(0, 60)];
    expect(calmLine(90, reference, reference)).toBe("That's a close sketch");
    expect(calmLine(50, reference, reference)).toBe("A few pieces of the picture");
    expect(calmLine(4, reference, [])).toMatch(/sketch/i);
  });
});

describe("peaksFor", () => {
  it("puts energy where the notes are", () => {
    const early = peaksFor([piano(0.2, 60, 0.4)], 20);
    const late = peaksFor([piano(18, 64, 0.4)], 20);
    const earlyAt = early.indexOf(Math.max(...early));
    const lateAt = late.indexOf(Math.max(...late));
    expect(earlyAt).toBeLessThan(5);
    expect(lateAt).toBeGreaterThan(15);
  });
});
