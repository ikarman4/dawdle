import { describe, expect, it } from "vitest";
import { hashString, songForDate, songIndexForDate, utcDateString } from "./daily";
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

  it("ships 16 original songs that cover every instrument", () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(16);
    const used = new Set<string>();
    const titles = new Set<string>();
    for (const song of SONGS) {
      expect(song.artist).toBe("DAWdle");
      expect(song.bpm).toBeGreaterThanOrEqual(72);
      expect(song.bpm).toBeLessThanOrEqual(132);
      expect(titles.has(song.title)).toBe(false);
      titles.add(song.title);
      expect(song.title).not.toBe("Window Sill");
      const instruments = new Set(song.notes.map((note) => note.instrument));
      expect(instruments.size).toBeGreaterThanOrEqual(4);
      expect(instruments.size).toBeLessThanOrEqual(8);
      instruments.forEach((id) => used.add(id));
      expect(song.notes.length, song.title).toBeGreaterThanOrEqual(16);
      expect(song.notes.length, `${song.title} has ${song.notes.length} notes`).toBeLessThanOrEqual(180);
      let last = -1;
      for (const note of song.notes) {
        expect(note.time).toBeGreaterThanOrEqual(0);
        expect(note.time).toBeLessThan(20);
        expect(note.duration).toBeGreaterThan(0);
        expect(note.time + note.duration).toBeLessThanOrEqual(20.02);
        expect(note.time).toBeGreaterThanOrEqual(last);
        last = note.time;
      }
      const groups = new Map<string, number>();
      for (const note of song.notes) {
        const key = note.drum ? `${note.instrument}:${note.drum}` : `${note.instrument}:${note.pitch}`;
        const previous = groups.get(key);
        if (previous != null) expect(note.time - previous).toBeGreaterThanOrEqual(0.19);
        groups.set(key, note.time);
      }
    }
    expect(used.size).toBe(INSTRUMENTS.length);
  });
});
