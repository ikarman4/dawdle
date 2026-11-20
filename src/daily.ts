import { SONGS } from "./songs";
import type { Song } from "./types";

/** FNV-1a 32-bit. Stable across browsers for a UTC date string. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function songIndexForDate(date: string, length = SONGS.length): number {
  if (length <= 0) return 0;
  return hashString(date) % length;
}

export function utcDateString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function previousUtcDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

export function songForDate(date: string): Song {
  return SONGS[songIndexForDate(date, SONGS.length)];
}

export function formatClock(seconds: number): string {
  const clamped = Math.min(20, Math.max(0, seconds));
  const whole = clamped >= 19.995 ? 20 : Math.floor(clamped + 1e-6);
  return `0:${whole.toString().padStart(2, "0")}`;
}

export function quantizeTime(time: number, bpm: number, enabled: boolean): number {
  const clamped = Math.min(19.95, Math.max(0, time));
  if (!enabled) return Math.round(clamped * 1000) / 1000;
  const step = 60 / bpm / 4;
  const snapped = Math.round(clamped / step) * step;
  return Math.round(Math.min(19.95, Math.max(0, snapped)) * 1000) / 1000;
}

export function beatSeconds(bpm: number): number {
  return 60 / bpm;
}
