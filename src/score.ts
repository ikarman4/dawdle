import type { InstrumentId, NoteEvent } from "./types";

const WINDOW_MS = 180;

function pitchCredit(reference: NoteEvent, user: NoteEvent): number {
  if (reference.drum || user.drum) {
    return reference.drum && reference.drum === user.drum ? 1 : 0;
  }
  if (typeof reference.pitch !== "number" || typeof user.pitch !== "number") return 0;
  if (reference.pitch === user.pitch) return 1;
  const distance = Math.abs(reference.pitch - user.pitch);
  if (distance !== 0 && distance % 12 === 0) return 0.5;
  return 0;
}

/** F1-style percentage. Empty input is 0. A perfect match is 100. */
export function scoreArrangement(reference: NoteEvent[], user: NoteEvent[]): number {
  if (user.length === 0 || reference.length === 0) return 0;

  type Candidate = { ri: number; ui: number; credit: number; dist: number };
  const candidates: Candidate[] = [];
  for (let ri = 0; ri < reference.length; ri++) {
    const ref = reference[ri];
    for (let ui = 0; ui < user.length; ui++) {
      const played = user[ui];
      if (ref.instrument !== played.instrument) continue;
      const dist = Math.abs(ref.time - played.time) * 1000;
      if (dist > WINDOW_MS + 0.001) continue;
      const credit = pitchCredit(ref, played);
      if (credit > 0) candidates.push({ ri, ui, credit, dist });
    }
  }

  candidates.sort((a, b) => b.credit - a.credit || a.dist - b.dist || a.ri - b.ri || a.ui - b.ui);
  const usedRef = new Set<number>();
  const usedUser = new Set<number>();
  let creditSum = 0;
  for (const candidate of candidates) {
    if (usedRef.has(candidate.ri) || usedUser.has(candidate.ui)) continue;
    usedRef.add(candidate.ri);
    usedUser.add(candidate.ui);
    creditSum += candidate.credit;
  }

  const precision = creditSum / user.length;
  const recall = creditSum / reference.length;
  if (precision + recall === 0) return 0;
  const f1 = (2 * precision * recall) / (precision + recall);
  return Math.round(f1 * 100);
}

export function calmLine(percentage: number, reference: NoteEvent[], user: NoteEvent[]): string {
  if (percentage >= 80) return "That's a close sketch";
  if (percentage >= 40) return "A few pieces of the picture";
  const drums = reference.filter((note) => note.instrument === "kit" || note.instrument === "machine");
  const playedDrums = user.filter((note) => note.instrument === "kit" || note.instrument === "machine");
  if (drums.length > 0 && scoreArrangement(drums, playedDrums) >= 45) return "The drums are landing";
  if (percentage >= 18) return "A few pieces of the picture";
  return "A quiet sketch. Nothing is wasted.";
}

const WEIGHT: Partial<Record<InstrumentId, number>> = {
  kit: 1.25,
  machine: 1.15,
  bass: 1,
};

/** Deterministic peak envelope of the notes, so the waveform matches the arrangement. */
export function peaksFor(notes: NoteEvent[], buckets = 160): number[] {
  const peaks = new Array<number>(buckets).fill(0);
  for (const note of notes) {
    const start = Math.max(0, Math.floor((note.time / 20) * buckets));
    const end = Math.min(buckets, Math.max(start + 1, Math.ceil(((note.time + note.duration) / 20) * buckets)));
    const weight = WEIGHT[note.instrument] ?? 0.78;
    for (let i = start; i < end; i++) {
      const bucketStart = (i / buckets) * 20;
      const bucketEnd = ((i + 1) / buckets) * 20;
      const overlap = Math.max(0, Math.min(bucketEnd, note.time + note.duration) - Math.max(bucketStart, note.time));
      if (overlap <= 0) continue;
      const local = Math.max(0, Math.min(1, (bucketStart - note.time) / Math.max(0.05, note.duration)));
      const env = Math.exp(-local * 1.3);
      peaks[i] += note.velocity * weight * env * (0.45 + overlap);
    }
  }
  const max = Math.max(0.001, ...peaks);
  return peaks.map((peak) => peak / max);
}
