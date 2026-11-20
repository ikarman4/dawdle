import { describe, expect, it } from "vitest";
import { eventFromPointer, keepPlacedNote } from "./roll";
import type { NoteEvent } from "./types";

describe("clicking the roll", () => {
  it("adds an event at the clicked pitch and time", () => {
    const events: NoteEvent[] = [];
    const note = eventFromPointer({ instrument: "piano", midi: 64, time: 3.5, step: 0.125, beat: 0.5 });
    expect(note).not.toBeNull();
    events.push(note!);
    expect(events).toHaveLength(1);
    expect(events[0].pitch).toBe(64);
    expect(events[0].time).toBe(3.5);
    expect(events[0].instrument).toBe("piano");
  });

  it("adds a drum hit on the row that was clicked", () => {
    const events: NoteEvent[] = [];
    const note = eventFromPointer({ instrument: "kit", drum: "snare", time: 1.25, step: 0.125, beat: 0.5 });
    expect(note).not.toBeNull();
    events.push(note!);
    expect(events[0].drum).toBe("snare");
    expect(events[0].time).toBe(1.25);
  });

  it("keeps a grid click even if the pointer moves after down", () => {
    expect(keepPlacedNote(false)).toBe(true);
    expect(keepPlacedNote(true)).toBe(false);
  });
});
