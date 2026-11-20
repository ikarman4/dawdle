import type { Attempt, DayState, DrumName, InstrumentId, NoteEvent } from "./types";
import { previousUtcDate } from "./daily";

export function dockTotal(count: number): number {
  return Math.max(0, Math.floor(count)) * 5;
}

export function officialPercentage(bestRaw: number, docks: number): number {
  return Math.max(0, Math.round(bestRaw - docks));
}

export function bestAttempt(attempts: Attempt[]): Attempt | null {
  let best: Attempt | null = null;
  for (const attempt of attempts) {
    if (!best || attempt.raw >= best.raw) best = attempt;
  }
  return best;
}

export function officialScore(day: Pick<DayState, "mode" | "attempts" | "hintCount" | "revealedAll">): number {
  const best = bestAttempt(day.attempts);
  if (!best) return 0;
  if (day.mode === "hard") return best.raw;
  if (day.revealedAll) return 0;
  return officialPercentage(best.raw, dockTotal(day.hintCount));
}

export function submitAttempt(day: DayState, raw: number, events: NoteEvent[]): DayState {
  if (day.locked || day.attempts.length >= 5) return day;
  const attempts = [...day.attempts, { raw, events }];
  return {
    ...day,
    attempts,
    locked: attempts.length >= 5,
    modeLocked: true,
  };
}

export function songInstruments(notes: NoteEvent[]): InstrumentId[] {
  const seen: InstrumentId[] = [];
  for (const note of notes) {
    if (!seen.includes(note.instrument)) seen.push(note.instrument);
  }
  return seen;
}

export function noteRegions(notes: NoteEvent[], instrument: InstrumentId): NoteEvent[][] {
  const groups: NoteEvent[][] = [];
  for (const note of notes.filter((item) => item.instrument === instrument).sort((a, b) => a.time - b.time)) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(note.time - last[0].time) <= 0.03) last.push(note);
    else groups.push([note]);
  }
  return groups;
}

export function stepsToFill(notes: NoteEvent[], instrument: InstrumentId): number {
  return 1 + noteRegions(notes, instrument).length;
}

export function hintsComplete(notes: NoteEvent[], steps: Partial<Record<InstrumentId, number>>): boolean {
  const ids = songInstruments(notes);
  return ids.length > 0 && ids.every((id) => (steps[id] ?? 0) >= stepsToFill(notes, id));
}

export function revealInstruments(day: DayState): DayState {
  if (day.mode !== "easy" || day.locked || day.instrumentsRevealed || day.revealedAll) return day;
  return { ...day, instrumentsRevealed: true, hintCount: day.hintCount + 1, modeLocked: true };
}

export function advanceHint(day: DayState, notes: NoteEvent[], instrument: InstrumentId): DayState {
  if (day.mode !== "easy" || day.locked || !day.instrumentsRevealed || day.revealedAll) return day;
  if (!songInstruments(notes).includes(instrument)) return day;
  const current = day.hintSteps[instrument] ?? 0;
  if (current >= stepsToFill(notes, instrument)) return day;
  const hintSteps = { ...day.hintSteps, [instrument]: current + 1 };
  return {
    ...day,
    hintSteps,
    hintCount: day.hintCount + 1,
    revealedAll: hintsComplete(notes, hintSteps),
    modeLocked: true,
  };
}

export interface GhostMark {
  time: number;
  duration: number;
  pitch?: number;
  drum?: DrumName;
  kind: "beat" | "note";
}

export function ghostsFor(notes: NoteEvent[], instrument: InstrumentId, step: number): GhostMark[] {
  if (step <= 0) return [];
  const regions = noteRegions(notes, instrument);
  const ghosts: GhostMark[] = regions.map((region) => {
    const time = region[0].time;
    const duration = Math.max(0.12, ...region.map((note) => note.time + note.duration - time));
    return { time, duration, kind: "beat" as const };
  });
  for (const region of regions.slice(0, Math.max(0, step - 1))) {
    for (const note of region) {
      ghosts.push({ time: note.time, duration: note.duration, pitch: note.pitch, drum: note.drum, kind: "note" });
    }
  }
  return ghosts;
}

export function currentStreak(lockedDates: string[], today: string, todayLocked: boolean): number {
  const have = new Set(lockedDates);
  let cursor = todayLocked ? today : previousUtcDate(today);
  let streak = 0;
  while (have.has(cursor)) {
    streak += 1;
    cursor = previousUtcDate(cursor);
  }
  return streak;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

