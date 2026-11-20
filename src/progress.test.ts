import { describe, expect, it } from "vitest";
import { freshDay, type NoteEvent } from "./types";
import {
  advanceHint,
  currentStreak,
  dockTotal,
  ghostsFor,
  mean,
  officialPercentage,
  officialScore,
  revealInstruments,
  submitAttempt,
} from "./progress";

const pattern: NoteEvent[] = [
  { instrument: "piano", time: 0, duration: 0.4, velocity: 0.8, pitch: 60 },
  { instrument: "piano", time: 1, duration: 0.4, velocity: 0.8, pitch: 64 },
  { instrument: "kit", time: 0, duration: 0.1, velocity: 0.9, drum: "kick" },
];

describe("hints and the day lock", () => {
  it("scores an empty song 0 and a perfect match 100 before docks", () => {
    expect(officialScore(freshDay())).toBe(0);
    expect(officialScore({ ...freshDay(), attempts: [{ raw: 100, events: [] }] })).toBe(100);
  });

  it("docks 5 for each hint and floors at 0", () => {
    expect(dockTotal(1)).toBe(5);
    expect(dockTotal(2)).toBe(10);
    expect(officialPercentage(100, dockTotal(1))).toBe(95);
    expect(officialPercentage(100, dockTotal(2))).toBe(90);
    expect(officialPercentage(4, dockTotal(1))).toBe(0);
    expect(officialScore({ ...freshDay(), hintCount: 2, attempts: [{ raw: 100, events: [] }] })).toBe(90);
  });

  it("scores 0 once the hints have revealed the whole pattern", () => {
    let day = revealInstruments(freshDay());
    day = advanceHint(day, pattern, "piano");
    const beats = ghostsFor(pattern, "piano", day.hintSteps.piano ?? 0);
    expect(beats.every((mark) => mark.kind === "beat")).toBe(true);
    expect(beats.some((mark) => mark.pitch != null)).toBe(false);
    day = advanceHint(day, pattern, "piano");
    const filled = ghostsFor(pattern, "piano", day.hintSteps.piano ?? 0);
    expect(filled.filter((mark) => mark.kind === "note")).toHaveLength(1);
    expect(filled.find((mark) => mark.kind === "note")?.pitch).toBe(60);
    day = advanceHint(day, pattern, "piano");
    day = advanceHint(day, pattern, "kit");
    day = advanceHint(day, pattern, "kit");
    expect(day.revealedAll).toBe(true);
    const scored = submitAttempt(day, 100, pattern);
    expect(officialScore(scored)).toBe(0);
  });

  it("locks the day on the fifth submit and ignores a sixth", () => {
    let day = freshDay();
    const raws = [40, 55, 51, 70, 33];
    for (const raw of raws) day = submitAttempt(day, raw, []);
    expect(day.locked).toBe(true);
    expect(day.attempts).toHaveLength(5);
    expect(day.hintCount).toBe(0);
    expect(day.modeLocked).toBe(true);
    expect(officialScore(day)).toBe(70);
    const again = submitAttempt(day, 99, []);
    expect(again.attempts).toHaveLength(5);
    expect(again.attempts[4].raw).toBe(33);
  });

  it("keeps hard mode free of docks", () => {
    const day = submitAttempt({ ...freshDay(), mode: "hard" }, 80, []);
    expect(day.hintCount).toBe(0);
    expect(officialScore(day)).toBe(80);
    expect(revealInstruments(day)).toEqual(day);
  });

  it("counts a streak of locked UTC days and a mean", () => {
    expect(currentStreak(["2026-11-18", "2026-11-19", "2026-11-20"], "2026-11-20", true)).toBe(3);
    expect(currentStreak(["2026-11-18", "2026-11-19"], "2026-11-20", false)).toBe(2);
    expect(currentStreak(["2026-11-18"], "2026-11-20", false)).toBe(0);
    expect(mean([80, 90, 70])).toBe(80);
    expect(mean([])).toBeNull();
  });
});
