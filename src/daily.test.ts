import { describe, expect, it } from "vitest";
import { clipOffset, hashString, songForDate, songIndexForDate, utcDateString, windowPeaks } from "./daily";
import { SONGS } from "./songs";
import { INSTRUMENTS } from "./types";

describe("daily song", () => {
  it("is stable for a UTC date and can change on another date", () => {
    expect(songIndexForDate("2026-11-20")).toBe(songIndexForDate("2026-11-20"));
    expect(songForDate("2026-11-20").id).toBe(SONGS[songIndexForDate("2026-11-20")].id);
    const first = songIndexForDate("2026-01-01");
    let different = false;
    for (let day = 1; day <= 370; day++) {
      const date = utcDateString(new Date(Date.UTC(2026, 0, day)));
      if (songIndexForDate(date) !== first) different = true;
    }
    expect(different).toBe(true);
    expect(hashString("2026-11-20")).toBe(hashString("2026-11-20"));
  });

  it("ships a catalog of real songs and a stable 20 second window", () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(2000);
    const ids = new Set<string>();
    for (const song of SONGS) {
      expect(song.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(ids.has(song.id)).toBe(false);
      ids.add(song.id);
      expect(song.title.length).toBeGreaterThan(0);
      expect(song.artist.length).toBeGreaterThan(0);
      expect(song.artist).not.toBe("DAWdle");
      expect(song.year).toBeGreaterThanOrEqual(1973);
      expect(song.year).toBeLessThanOrEqual(2022);
      expect(song.bpm).toBeGreaterThanOrEqual(84);
      expect(song.bpm).toBeLessThanOrEqual(132);
    }
    const offset = clipOffset("2026-11-20", 200);
    expect(clipOffset("2026-11-20", 200)).toBe(offset);
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThanOrEqual(180);
    expect(clipOffset("2026-11-20", 12)).toBe(0);
    let moved = false;
    for (let day = 1; day <= 28; day++) {
      if (clipOffset(`2026-12-${String(day).padStart(2, "0")}`, 240) !== offset) moved = true;
    }
    expect(moved).toBe(true);
    expect(windowPeaks("abc", "2026-11-20")).toEqual(windowPeaks("abc", "2026-11-20"));
  });

  it("gives every instrument a hidden arrangement somewhere in the catalog", () => {
    const used = new Set<string>();
    for (const song of SONGS.slice(0, 240)) {
      expect(song.notes.length).toBeGreaterThanOrEqual(16);
      expect(song.notes.length).toBeLessThanOrEqual(180);
      const instruments = new Set(song.notes.map((note) => note.instrument));
      expect(instruments.size).toBeGreaterThanOrEqual(4);
      let last = -1;
      for (const note of song.notes) {
        expect(note.time).toBeGreaterThanOrEqual(0);
        expect(note.time).toBeLessThan(20);
        expect(note.time + note.duration).toBeLessThanOrEqual(20.02);
        expect(note.time).toBeGreaterThanOrEqual(last);
        last = note.time;
        used.add(note.instrument);
      }
    }
    expect(used.size).toBe(INSTRUMENTS.length);
  });
});
