import * as Tone from "tone";
import type { DrumName, InstrumentId, NoteEvent } from "./types";
import { PITCHED_NOTES } from "./sample-map";

type Sampler = Tone.Sampler;

let built = false;
let loading: Promise<void> | null = null;
let master: Tone.Gain;
let limiter: Tone.Limiter;
let mix = 0.85;
const pitched = new Map<InstrumentId, Sampler>();
const drums = new Map<string, Sampler>();
const serumVoices: Tone.DuoSynth[] = [];
const serumHeld = new Map<number, Tone.DuoSynth>();
let serumCursor = 0;
let click: Tone.Player;
let quiet = new Set<InstrumentId>();

const BASE = `${import.meta.env.BASE_URL}samples/`;

const GAIN: Record<InstrumentId, number> = {
  piano: 0.9,
  synth: 0.55,
  guitar: 0.8,
  bass: 0.95,
  ukulele: 0.85,
  violin: 0.7,
  kit: 0.95,
  machine: 0.9,
  glock: 0.55,
  xylo: 0.6,
};

const ATTACK: Partial<Record<InstrumentId, number>> = {
  violin: 0.08,
  synth: 0.02,
  piano: 0.005,
};

const RELEASE: Partial<Record<InstrumentId, number>> = {
  piano: 0.8,
  synth: 0.22,
  guitar: 0.28,
  bass: 0.24,
  ukulele: 0.18,
  violin: 0.3,
  glock: 0.4,
  xylo: 0.12,
};

const DRUM_FILE: Record<string, string> = {
  "kit:kick": "kit/kick.wav",
  "kit:snare": "kit/snare.wav",
  "kit:closedHat": "kit/closedHat.wav",
  "kit:openHat": "kit/openHat.wav",
  "kit:tom": "kit/tom.wav",
  "kit:clap": "kit/clap.wav",
  "machine:kick": "machine/kick.wav",
  "machine:snare": "machine/snare.wav",
  "machine:hat": "machine/hat.wav",
  "machine:clap": "machine/clap.wav",
};

function drumKey(instrument: InstrumentId, drum: DrumName): string {
  return `${instrument}:${drum}`;
}

function applyQuiet() {
  if (!built) return;
  for (const [id, sampler] of pitched) {
    const ducked = quiet.has(id) ? 0.22 : 1;
    sampler.volume.value = Tone.gainToDb(GAIN[id] * ducked * mix);
  }
  for (const sampler of drums.values()) sampler.volume.value = Tone.gainToDb(0.9 * mix);
  const serumDb = Tone.gainToDb(0.42 * (quiet.has("synth") ? 0.22 : 1) * mix);
  for (const voice of serumVoices) voice.volume.value = serumDb;
  if (click) click.volume.value = Tone.gainToDb(0.45 * mix);
}

export function setMixVolume(value: number) {
  mix = Math.max(0, Math.min(1, value));
  if (master) master.gain.value = mix;
  applyQuiet();
}

function ensureBuilt() {
  if (built) return;
  limiter = new Tone.Limiter(-1).toDestination();
  master = new Tone.Gain(mix).connect(limiter);
  for (let index = 0; index < 6; index += 1) {
    const voice = new Tone.DuoSynth({
      harmonicity: 1,
      vibratoAmount: 0.06,
      vibratoRate: 4.5,
      voice0: {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.008, decay: 0.16, sustain: 0.22, release: 0.18 },
        filter: { type: "lowpass", Q: 1.1, rolloff: -24 },
        filterEnvelope: { attack: 0.008, decay: 0.18, sustain: 0.12, release: 0.16, baseFrequency: 240, octaves: 3 },
      },
      voice1: {
        oscillator: { type: "square" },
        envelope: { attack: 0.012, decay: 0.12, sustain: 0.16, release: 0.16 },
        filter: { type: "lowpass", Q: 0.7, rolloff: -12 },
        filterEnvelope: { attack: 0.01, decay: 0.14, sustain: 0.08, release: 0.14, baseFrequency: 480, octaves: 2 },
      },
    }).connect(master);
    voice.voice1.oscillator.detune.value = 10;
    serumVoices.push(voice);
  }
  (Object.keys(PITCHED_NOTES) as (keyof typeof PITCHED_NOTES)[]).filter((id) => id !== "synth").forEach((id) => {
    const urls: Record<string, string> = {};
    for (const note of PITCHED_NOTES[id]) urls[note] = `${id}/${note.replaceAll("#", "s")}.wav`;
    const sampler = new Tone.Sampler({
      urls,
      baseUrl: BASE,
      attack: ATTACK[id] ?? 0.004,
      release: RELEASE[id] ?? 0.25,
    }).connect(master);
    pitched.set(id, sampler);
  });
  for (const [key, file] of Object.entries(DRUM_FILE)) {
    const sampler = new Tone.Sampler({
      urls: { C4: file },
      baseUrl: BASE,
      release: key.endsWith("openHat") ? 0.25 : 0.08,
    }).connect(master);
    drums.set(key, sampler);
  }
  click = new Tone.Player(`${BASE}click.wav`).connect(master);
  built = true;
  loading = Tone.loaded();
  applyQuiet();
}

/** Call inside a pointer or click handler, before any await, so the real context resumes. */
export function primeAudio(): void {
  try {
    ensureBuilt();
    const context = Tone.getContext();
    if (context.state !== "running") void context.resume();
  } catch {
    /* a later press can resume it */
  }
}

export async function resumeAudio(): Promise<boolean> {
  try {
    primeAudio();
    await Tone.start();
    await loading;
    return true;
  } catch {
    return false;
  }
}

export function setQuietInstruments(ids: InstrumentId[]) {
  quiet = new Set(ids);
  applyQuiet();
}

function noteOf(pitch: number): string {
  return Tone.Frequency(pitch, "midi").toNote();
}

function triggerDrum(instrument: InstrumentId, drum: DrumName, time: number, velocity: number) {
  const voice = drums.get(drumKey(instrument, drum));
  if (!voice) return;
  const duration = drum === "openHat" ? 0.45 : drum === "kick" ? 0.28 : 0.18;
  voice.triggerAttackRelease("C4", duration, time, velocity);
}

function nextSerum(): Tone.DuoSynth {
  const voice = serumVoices[serumCursor % serumVoices.length];
  serumCursor += 1;
  return voice;
}

function triggerSynth(pitch: number, duration: number, when: number, velocity: number) {
  nextSerum().triggerAttackRelease(noteOf(pitch), Math.max(0.05, duration), when, velocity);
}

export function triggerEvent(event: NoteEvent, time?: number) {
  if (!built) return;
  const when = time ?? Tone.now();
  const velocity = Math.max(0.05, Math.min(1, event.velocity));
  if (event.drum && (event.instrument === "kit" || event.instrument === "machine")) {
    triggerDrum(event.instrument, event.drum, when, velocity);
    return;
  }
  if (typeof event.pitch !== "number") return;
  if (event.instrument === "synth") {
    triggerSynth(event.pitch, event.duration, when, velocity);
    return;
  }
  pitched.get(event.instrument)?.triggerAttackRelease(noteOf(event.pitch), Math.max(0.05, event.duration), when, velocity);
}

export function beginPitch(instrument: InstrumentId, pitch: number, velocity = 0.8) {
  if (!built) return;
  if (instrument === "synth") {
    const voice = nextSerum();
    serumHeld.set(pitch, voice);
    voice.triggerAttack(noteOf(pitch), Tone.now(), velocity);
    return;
  }
  pitched.get(instrument)?.triggerAttack(noteOf(pitch), Tone.now(), velocity);
}

export function endPitch(instrument: InstrumentId, pitch: number) {
  if (!built) return;
  if (instrument === "synth") {
    serumHeld.get(pitch)?.triggerRelease(Tone.now());
    serumHeld.delete(pitch);
    return;
  }
  pitched.get(instrument)?.triggerRelease(noteOf(pitch), Tone.now());
}

export function playClick(accent: boolean) {
  if (!built || !click.loaded) return;
  click.volume.value = Tone.gainToDb((accent ? 0.7 : 0.4) * mix);
  click.start(Tone.now());
}

export function releaseAll() {
  if (!built) return;
  for (const sampler of pitched.values()) sampler.releaseAll();
  for (const sampler of drums.values()) sampler.releaseAll();
  for (const voice of serumVoices) voice.triggerRelease();
  serumHeld.clear();
}

interface Session {
  stopped: boolean;
  timers: number[];
  raf: number;
}

let session: Session | null = null;

export function stopPlayback() {
  if (!session) {
    releaseAll();
    return;
  }
  session.stopped = true;
  cancelAnimationFrame(session.raf);
  for (const timer of session.timers) window.clearTimeout(timer);
  session = null;
  releaseAll();
}

export function startPlayback(options: {
  from: number;
  events: NoteEvent[];
  bpm: number;
  metronome: boolean;
  onTick: (time: number) => void;
  onEnd: () => void;
  onBeat: (beat: number, accent: boolean) => void;
}) {
  stopPlayback();
  const current: Session = { stopped: false, timers: [], raf: 0 };
  session = current;
  const started = performance.now();
  const from = Math.max(0, Math.min(20, options.from));
  const later = (delay: number, fn: () => void) => {
    const timer = window.setTimeout(() => {
      if (current.stopped) return;
      fn();
    }, Math.max(0, delay) * 1000);
    current.timers.push(timer);
  };
  for (const event of options.events) {
    if (event.time + event.duration <= from) continue;
    later(event.time - from, () => triggerEvent(event));
  }
  if (options.metronome) {
    const beat = 60 / options.bpm;
    for (let index = 0; index * beat < 20; index++) {
      const time = index * beat;
      if (time < from - 0.02) continue;
      const accent = index % 4 === 0;
      later(time - from, () => {
        playClick(accent);
        options.onBeat(index, accent);
      });
    }
  }
  const loop = () => {
    if (current.stopped || session !== current) return;
    const time = from + (performance.now() - started) / 1000;
    if (time >= 20) {
      options.onTick(20);
      stopPlayback();
      options.onEnd();
      return;
    }
    options.onTick(time);
    current.raf = requestAnimationFrame(loop);
  };
  current.raf = requestAnimationFrame(loop);
}
