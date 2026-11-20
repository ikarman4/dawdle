import { describe, expect, it } from "vitest";
import { buildArrangement } from "./arrangement";
import { songForDate } from "./daily";
import { hasAuthoredKey, keyFromFile, noteFromKey, sketchCopy } from "./keys";

describe("scoring keys", () => {
  it("keeps the generated placeholder until a key file is committed", () => {
    const song = songForDate("2026-11-20");
    expect(hasAuthoredKey(song.id)).toBe(false);
    expect(song.authored).toBe(false);
    expect(song.notes).toEqual(buildArrangement(song.id, song.bpm));
  });

  it("reads a note list and rejects a file with no playable notes", () => {
    const key = keyFromFile(
      { videoId: "abcdefghijk", notes: [{ instrument: "piano", time: 1, duration: 0.5, velocity: 0.7, pitch: 64 }] },
      "abcdefghijk",
    );
    expect(key?.notes).toEqual([{ instrument: "piano", time: 1, duration: 0.5, velocity: 0.7, pitch: 64 }]);
    expect(keyFromFile({ videoId: "abcdefghijk", notes: [] }, "abcdefghijk")).toBeNull();
    expect(noteFromKey({ instrument: "nope", time: 0, duration: 1 })).toBeNull();
  });

  it("labels an authored sketch and a placeholder differently", () => {
    expect(sketchCopy(true).detail).toBe("Our sketch of the snippet, not the original stems.");
    expect(sketchCopy(false).title).toBe("Placeholder sketch");
    expect(sketchCopy(false).detail).toContain("not the original stems");
  });
});
