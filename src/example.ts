import type { NoteEvent, Track } from "./types";
import { emptyTrack } from "./types";

/** A teaching sketch, not today's song. Piano is performed as a full pass; kicks are punched onto beat 1. */
export const EXAMPLE_TITLE = "Window Sill";
export const EXAMPLE_BPM = 96;

const BEAT = 60 / EXAMPLE_BPM;

function pianoLine(): NoteEvent[] {
  const degrees = [0, 2, 4, 2, 0, 4, 7, 4, 2, 0, -1, 0, 4, 2, 7, 4];
  const scale = [0, 2, 4, 7, 9];
  const root = 67;
  return degrees.map((degree, index) => {
    const octave = Math.floor(degree / scale.length);
    const step = ((degree % scale.length) + scale.length) % scale.length;
    const pitch = root + scale[step] + octave * 12;
    const time = index * BEAT * 2;
    return {
      instrument: "piano" as const,
      time: Math.round(time * 1000) / 1000,
      duration: Math.round(BEAT * 1.7 * 1000) / 1000,
      velocity: index % 4 === 0 ? 0.86 : 0.72,
      pitch,
    };
  });
}

function punchedKicks(): NoteEvent[] {
  const beats = [0, 4, 8, 12, 16, 20, 24, 28];
  return beats.map((beat) => ({
    instrument: "kit" as const,
    time: Math.round(beat * BEAT * 1000) / 1000,
    duration: 0.12,
    velocity: 0.9,
    drum: "kick" as const,
  }));
}

export function exampleTracks(): Track[] {
  const piano = emptyTrack("piano", "full pass");
  piano.events = pianoLine();
  const kit = emptyTrack("kit", "punched-in kicks");
  kit.events = punchedKicks();
  return [piano, kit];
}
