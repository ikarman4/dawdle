import type { Attempt, DayState, NoteEvent } from "./types";
import { previousUtcDate } from "./daily";

const DOCKS = [0, 4, 8, 8, 8, 15];

export function dockTotal(tier: number): number {
  const capped = Math.max(0, Math.min(5, Math.floor(tier)));
  let sum = 0;
  for (let i = 1; i <= capped; i++) sum += DOCKS[i];
  return sum;
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

export function officialScore(day: Pick<DayState, "mode" | "attempts" | "hintTier">): number {
  const best = bestAttempt(day.attempts);
  if (!best) return 0;
  if (day.mode === "hard") return best.raw;
  return officialPercentage(best.raw, dockTotal(day.hintTier));
}

export interface SubmitOptions {
  declineSection?: boolean;
}

export function submitAttempt(day: DayState, raw: number, events: NoteEvent[], options: SubmitOptions = {}): DayState {
  if (day.locked || day.attempts.length >= 5) return day;
  const attempts = [...day.attempts, { raw, events }];
  const locked = attempts.length >= 5;
  let hintTier = day.hintTier;
  let declinedSection = day.declinedSection;
  if (day.mode === "easy") {
    if (options.declineSection) {
      declinedSection = true;
      hintTier = Math.min(4, Math.max(hintTier, Math.min(attempts.length, 4)));
    } else if (day.sectionFilled) {
      hintTier = 5;
    } else {
      hintTier = Math.max(hintTier, Math.min(5, attempts.length));
    }
  }
  return {
    ...day,
    attempts,
    locked,
    hintTier,
    declinedSection,
    modeLocked: true,
  };
}

export function requestHint(day: DayState): DayState {
  if (day.mode !== "easy" || day.locked || day.hintTier >= 5 || day.sectionFilled) return day;
  return { ...day, hintTier: day.hintTier + 1, modeLocked: true };
}

export function picksNeeded(tier: number): number {
  if (tier < 2) return 0;
  return Math.min(3, tier - 1);
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

export function partialReference(notes: NoteEvent[], instrument: NoteEvent["instrument"]): NoteEvent[] {
  return notes
    .filter((note) => note.instrument === instrument)
    .filter((_, index) => index % 10 < 3)
    .map((note) => ({ ...note }));
}
