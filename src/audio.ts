import * as Tone from "tone";
import type { DrumName, InstrumentId, NoteEvent } from "./types";

type Voice = {
  connect: (destination: Tone.Gain) => unknown;
  triggerAttackRelease: (a: string | number, b?: string | number, c?: string | number, d?: number) => void;
  triggerAttack?: (note: string | number, time?: number, velocity?: number) => void;
  triggerRelease?: (note?: string | number, time?: number) => void;
  releaseAll?: () => void;
};

let built = false;
let master: Tone.Gain;
let limiter: Tone.Limiter;
const gains = new Map<InstrumentId, Tone.Gain>();
const pitched = new Map<InstrumentId, Voice>();
const drums = new Map<string, Voice>();
let clickHigh: Tone.Synth;
let clickLow: Tone.Synth;
let quiet = new Set<InstrumentId>();

const BASE_GAIN: Record<InstrumentId, number> = {
  piano: 0.42,
  synth: 0.28,
  guitar: 0.4,
  bass: 0.5,
  ukulele: 0.38,
  violin: 0.32,
  kit: 0.7,
  machine: 0.68,
  glock: 0.3,
  xylo: 0.32,
};

function drumKey(instrument: InstrumentId, drum: DrumName): string {
  return `${instrument}:${drum}`;
}

function applyQuiet() {
  if (!built) return;
  for (const [id, gain] of gains) {
    const ducked = quiet.has(id) ? 0.22 : 1;
    gain.gain.value = BASE_GAIN[id] * ducked;
  }
}

function makeGain(id: InstrumentId): Tone.Gain {
  const gain = new Tone.Gain(BASE_GAIN[id]).connect(master);
  gains.set(id, gain);
  return gain;
}

function poly(id: InstrumentId, voice: typeof Tone.Synth | typeof Tone.FMSynth, options: Record<string, unknown>, max = 6): Voice {
  const gain = makeGain(id);
  const synth = new Tone.PolySynth(voice as typeof Tone.Synth, options as never);
  synth.maxPolyphony = max;
  synth.connect(gain);
  pitched.set(id, synth as unknown as Voice);
  return synth as unknown as Voice;
}

function addDrum(instrument: InstrumentId, drum: DrumName, synth: Voice, destination: Tone.Gain) {
  synth.connect(destination);
  drums.set(drumKey(instrument, drum), synth);
}

export async function resumeAudio(): Promise<boolean> {
  try {
    await Tone.start();
    ensureBuilt();
    return true;
  } catch {
    return false;
  }
}

export function setQuietInstruments(ids: InstrumentId[]) {
  quiet = new Set(ids);
  applyQuiet();
}

function ensureBuilt() {
  if (built) return;
  limiter = new Tone.Limiter(-2).toDestination();
  master = new Tone.Gain(0.8).connect(limiter);

  poly("piano", Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.004, decay: 0.35, sustain: 0.18, release: 0.9 },
  });
  poly("synth", Tone.Synth, {
    oscillator: { type: "square" },
    envelope: { attack: 0.02, decay: 0.18, sustain: 0.45, release: 0.25 },
  });
  poly("guitar", Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.22, sustain: 0.02, release: 0.12 },
  });
  poly("ukulele", Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.14, sustain: 0.01, release: 0.08 },
  });
  poly("violin", Tone.Synth, {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.12, decay: 0.1, sustain: 0.75, release: 0.25 },
  });
  poly("glock", Tone.FMSynth, {
    harmonicity: 8,
    modulationIndex: 1.8,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.18 },
    modulation: { type: "square" },
    modulationEnvelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
  }, 4);
  poly("xylo", Tone.FMSynth, {
    harmonicity: 2.2,
    modulationIndex: 6,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.06 },
    modulation: { type: "triangle" },
    modulationEnvelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
  }, 4);

  const bassGain = makeGain("bass");
  const bass = new Tone.MonoSynth({
    oscillator: { type: "square" },
    envelope: { attack: 0.01, decay: 0.18, sustain: 0.35, release: 0.18 },
    filterEnvelope: { attack: 0.01, decay: 0.12, sustain: 0.2, baseFrequency: 90, octaves: 2.2 },
  }).connect(bassGain);
  pitched.set("bass", bass as unknown as Voice);

  const kitGain = makeGain("kit");
  const machineGain = makeGain("machine");

  const asVoice = (synth: unknown) => synth as Voice;
  addDrum("kit", "kick", asVoice(new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 6,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.08 },
  })), kitGain);
  addDrum("kit", "snare", asVoice(new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.04 },
  })), kitGain);
  addDrum("kit", "closedHat", asVoice(new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.01 },
  })), kitGain);
  addDrum("kit", "openHat", asVoice(new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.28, sustain: 0.02, release: 0.08 },
  })), kitGain);
  addDrum("kit", "tom", asVoice(new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.06 },
  })), kitGain);
  addDrum("kit", "clap", asVoice(new Tone.NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.001, decay: 0.11, sustain: 0, release: 0.03 },
  })), kitGain);

  addDrum("machine", "kick", asVoice(new Tone.MembraneSynth({
    pitchDecay: 0.09,
    octaves: 4,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.55, sustain: 0.02, release: 0.2 },
  })), machineGain);
  addDrum("machine", "snare", asVoice(new Tone.NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.02 },
  })), machineGain);
  addDrum("machine", "hat", asVoice(new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 28,
    resonance: 5000,
    octaves: 1.2,
  })), machineGain);
  addDrum("machine", "clap", asVoice(new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
  })), machineGain);

  clickHigh = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
  }).connect(master);
  clickHigh.volume.value = -10;
  clickLow = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
  }).connect(master);
  clickLow.volume.value = -16;

  built = true;
  applyQuiet();
}

function noteOf(pitch: number): string {
  return Tone.Frequency(pitch, "midi").toNote();
}

function triggerDrum(instrument: InstrumentId, drum: DrumName, time: number, velocity: number) {
  const voice = drums.get(drumKey(instrument, drum));
  if (!voice) return;
  if (instrument === "machine" && drum === "hat") {
    voice.triggerAttackRelease("A5", 0.04, time, velocity);
    return;
  }
  if (instrument === "kit" && drum === "kick") {
    voice.triggerAttackRelease("C1", 0.18, time, velocity);
    return;
  }
  if (instrument === "kit" && drum === "tom") {
    voice.triggerAttackRelease("G2", 0.22, time, velocity);
    return;
  }
  if (instrument === "machine" && drum === "kick") {
    voice.triggerAttackRelease("C1", 0.5, time, velocity);
    return;
  }
  const duration = drum === "openHat" ? 0.28 : drum === "snare" ? 0.14 : 0.08;
  voice.triggerAttackRelease(duration, time, velocity);
  if (drum === "clap") voice.triggerAttackRelease(0.06, time + 0.018, velocity * 0.75);
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
  const voice = pitched.get(event.instrument);
  if (!voice) return;
  voice.triggerAttackRelease(noteOf(event.pitch), Math.max(0.05, event.duration), when, velocity);
}

export function beginPitch(instrument: InstrumentId, pitch: number, velocity = 0.8) {
  if (!built) return;
  const voice = pitched.get(instrument);
  voice?.triggerAttack?.(noteOf(pitch), Tone.now(), velocity);
}

export function endPitch(instrument: InstrumentId, pitch: number) {
  if (!built) return;
  const voice = pitched.get(instrument);
  if (voice?.triggerRelease) voice.triggerRelease(noteOf(pitch), Tone.now());
}

export function playClick(accent: boolean) {
  if (!built) return;
  const voice = accent ? clickHigh : clickLow;
  voice.triggerAttackRelease(accent ? "C6" : "G5", 0.03, Tone.now(), accent ? 0.7 : 0.4);
}

export function releaseAll() {
  if (!built) return;
  for (const voice of pitched.values()) voice.releaseAll?.();
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
