import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare } from "./share";
import type { NoteEvent } from "./types";

describe("share links", () => {
  it("round-trips a compressed arrangement", () => {
    const events: NoteEvent[] = [
      { instrument: "piano", time: 1.25, duration: 0.4, velocity: 0.8, pitch: 64 },
      { instrument: "kit", time: 0, duration: 0.12, velocity: 0.9, drum: "kick" },
      { instrument: "machine", time: 2.5, duration: 0.1, velocity: 0.5, drum: "hat" },
    ];
    const encoded = encodeShare({
      username: "River",
      score: 76,
      date: "2026-11-20",
      bpm: 96,
      title: "Porch Lamp",
      events,
      follows: ["Ada", "Ken"],
    });
    expect(encoded.length).toBeLessThan(400);
    expect(encoded.includes("/")).toBe(false);
    const card = decodeShare(encoded);
    expect(card).not.toBeNull();
    expect(card?.username).toBe("River");
    expect(card?.score).toBe(76);
    expect(card?.date).toBe("2026-11-20");
    expect(card?.follows).toEqual(["Ada", "Ken"]);
    expect(card?.events).toHaveLength(3);
    expect(card?.events[0].pitch).toBe(64);
    expect(card?.events[0].time).toBeCloseTo(1.25, 2);
    expect(card?.events[1].drum).toBe("kick");
    expect(card?.events[2].instrument).toBe("machine");
  });
});
