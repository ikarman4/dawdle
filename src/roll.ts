import type { DrumName, InstrumentId, NoteEvent } from "./types";

/** Clicks on the grid keep the note. Pointer travel on a pitch key is play-along, not a place. */
export function keepPlacedNote(fromKey: boolean): boolean {
  return !fromKey;
}

export function eventFromPointer(input: {
  instrument: InstrumentId;
  midi?: number;
  drum?: DrumName;
  time: number;
  step: number;
  beat: number;
}): NoteEvent | null {
  const time = Math.round(Math.min(19.95, Math.max(0, input.time)) * 1000) / 1000;
  const span = input.drum ? input.step : Math.max(input.step, input.beat);
  const duration = Math.round(Math.min(span, 20 - time) * 1000) / 1000;
  if (duration < input.step * 0.5) return null;
  if (input.drum) return { instrument: input.instrument, drum: input.drum, time, duration, velocity: 0.86 };
  if (typeof input.midi !== "number") return null;
  return { instrument: input.instrument, pitch: input.midi, time, duration, velocity: 0.8 };
}
