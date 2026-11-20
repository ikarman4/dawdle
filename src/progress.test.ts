import { describe, expect, it } from "vitest";
import { freshDay } from "./types";
import {
  currentStreak,
  dockTotal,
  mean,
  officialPercentage,
  officialScore,
  requestHint,
  submitAttempt,
} from "./progress";

describe("hints and the day lock", () => {
  it("subtracts hint docks and floors at 0", () => {
    expect(dockTotal(1)).toBe(4);
    expect(dockTotal(2)).toBe(12);
    expect(dockTotal(5)).toBe(43);
    expect(officialPercentage(100, dockTotal(1))).toBe(96);
    expect(officialPercentage(90, dockTotal(2))).toBe(78);
    expect(officialPercentage(20, dockTotal(5))).toBe(0);
    expect(officialPercentage(0, 4)).toBe(0);
  });

  it("locks the day on the fifth submit and ignores a sixth", () => {
    let day = freshDay();
    const raws = [40, 55, 51, 70, 33];
    for (const raw of raws) day = submitAttempt(day, raw, []);
    expect(day.locked).toBe(true);
    expect(day.attempts).toHaveLength(5);
    expect(day.hintTier).toBe(5);
    expect(day.modeLocked).toBe(true);
    expect(officialScore(day)).toBe(Math.max(0, 70 - dockTotal(5)));
    const again = submitAttempt(day, 99, []);
    expect(again.attempts).toHaveLength(5);
    expect(again.attempts[4].raw).toBe(33);
  });

  it("keeps hard mode free of docks", () => {
    const day = submitAttempt({ ...freshDay(), mode: "hard" }, 80, []);
    expect(day.hintTier).toBe(0);
    expect(officialScore(day)).toBe(80);
    expect(requestHint(day)).toEqual(day);
  });

  it("counts a streak of locked UTC days and a mean", () => {
    expect(currentStreak(["2026-11-18", "2026-11-19", "2026-11-20"], "2026-11-20", true)).toBe(3);
    expect(currentStreak(["2026-11-18", "2026-11-19"], "2026-11-20", false)).toBe(2);
    expect(currentStreak(["2026-11-18"], "2026-11-20", false)).toBe(0);
    expect(mean([80, 90, 70])).toBe(80);
    expect(mean([])).toBeNull();
  });
});
