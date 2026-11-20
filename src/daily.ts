import { hashString } from "./hash";
import { SONGS } from "./songs";
import type { Song } from "./types";

export { hashString } from "./hash";
export { bpmForId } from "./hash";

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

/** Same 20-second window for every player on a UTC day, taken from the video length. */
export function clipOffset(date: string, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 20) return 0;
  const span = Math.floor(duration - 20);
  if (span <= 0) return 0;
  return hashString(`${date}:window`) % (span + 1);
}

/** A stable picture of the 20-second window. It is not a measurement of the recording. */
export function windowPeaks(id: string, date: string, buckets = 96): number[] {
  let seed = hashString(`${id}:${date}:wave`);
  const peaks: number[] = [];
  let value = 0.35;
  for (let index = 0; index < buckets; index++) {
    seed = Math.imul(seed ^ (seed >>> 13), 1274126177) >>> 0;
    const noise = (seed & 255) / 255;
    value = value * 0.7 + noise * 0.3;
    peaks.push(0.18 + value * 0.82);
  }
  return peaks;
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
