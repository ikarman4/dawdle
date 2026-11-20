import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import { utcDateString } from "./daily";
import { songForDate } from "./daily";
import { exampleTracks } from "./example";
import {
  bestAttempt,
  currentStreak,
  mean,
  officialScore,
  partialReference,
  requestHint,
  submitAttempt,
} from "./progress";
import { scoreArrangement } from "./score";
import { decodeShare } from "./share";
import {
  cloneNotes,
  emptyTrack,
  freshDay,
  INSTRUMENTS,
  SECTIONS,
  type BoardCard,
  type DayState,
  type InstrumentId,
  type NoteEvent,
  type SectionId,
  type Track,
} from "./types";

const KEY = "dawdle-v1";

export interface SaveShape {
  username: string;
  follows: string[];
  followers: string[];
  tutorialOpen: boolean;
  days: Record<string, DayState>;
  imports: BoardCard[];
}

export interface GameState extends SaveShape {
  today: string;
  offerFollow: string | null;
}

type Action =
  | { type: "set-name"; name: string }
  | { type: "set-mode"; mode: "easy" | "hard" }
  | { type: "toggle-tutorial" }
  | { type: "set-tutorial"; open: boolean }
  | { type: "roll"; today: string }
  | { type: "reveal" }
  | { type: "add-events"; instrument: InstrumentId; events: NoteEvent[] }
  | { type: "save-track"; instrument: InstrumentId; events: NoteEvent[] }
  | { type: "delete-event"; instrument: InstrumentId; index: number }
  | { type: "resize-event"; instrument: InstrumentId; index: number; duration: number }
  | { type: "mute"; instrument: InstrumentId }
  | { type: "solo"; instrument: InstrumentId }
  | { type: "clear"; instrument: InstrumentId }
  | { type: "load-example" }
  | { type: "submit"; declineSection?: boolean }
  | { type: "hint" }
  | { type: "pick-instrument"; instrument: InstrumentId }
  | { type: "fill-section"; section: SectionId; submit: boolean }
  | { type: "follow"; name: string }
  | { type: "unfollow"; name: string }
  | { type: "import"; card: BoardCard }
  | { type: "dismiss-offer" };

export function cleanName(value: string): string {
  return value.replace(/[^\p{L}\p{N} _.'-]/gu, "").slice(0, 20);
}

export function nameReady(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 20;
}

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isInstrument(value: unknown): value is InstrumentId {
  return typeof value === "string" && INSTRUMENTS.some((item) => item.id === value);
}

function normalizeTrack(value: Partial<Track> | undefined, index: number): Track | null {
  if (!value || !isInstrument(value.instrument)) return null;
  const id = typeof value.id === "string" && value.id ? value.id : `track-${index}-${value.instrument}`;
  return {
    id,
    instrument: value.instrument,
    events: Array.isArray(value.events) ? value.events : [],
    mute: Boolean(value.mute),
    solo: Boolean(value.solo),
    technique: typeof value.technique === "string" ? value.technique : undefined,
  };
}

function normalizeDay(value: Partial<DayState> | undefined): DayState {
  const base = freshDay();
  if (!value || typeof value !== "object") return base;
  const tracks = Array.isArray(value.tracks) ? value.tracks.map((track, index) => normalizeTrack(track, index)).filter((track): track is Track => track != null) : [];
  return {
    ...base,
    mode: value.mode === "hard" ? "hard" : "easy",
    modeLocked: Boolean(value.modeLocked),
    attempts: Array.isArray(value.attempts) ? value.attempts : [],
    hintTier: Number(value.hintTier) || 0,
    hintedInstruments: Array.isArray(value.hintedInstruments) ? value.hintedInstruments : [],
    sectionFilled: value.sectionFilled ?? null,
    declinedSection: Boolean(value.declinedSection),
    locked: Boolean(value.locked),
    tracks,
    revealed: Boolean(value.revealed),
  };
}

function loadSave(): SaveShape {
  const empty: SaveShape = { username: "", follows: [], followers: [], tutorialOpen: true, days: {}, imports: [] };
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<SaveShape>;
    const days: Record<string, DayState> = {};
    for (const [date, day] of Object.entries(parsed.days ?? {})) days[date] = normalizeDay(day);
    return {
      username: typeof parsed.username === "string" ? parsed.username.slice(0, 20) : "",
      follows: Array.isArray(parsed.follows) ? parsed.follows.filter((name) => typeof name === "string") : [],
      followers: Array.isArray(parsed.followers) ? parsed.followers.filter((name) => typeof name === "string") : [],
      tutorialOpen: parsed.tutorialOpen !== false,
      days,
      imports: Array.isArray(parsed.imports) ? parsed.imports : [],
    };
  } catch {
    return empty;
  }
}

function withTrack(day: DayState, instrument: InstrumentId, change: (track: Track) => Track): DayState {
  const index = day.tracks.findIndex((track) => track.instrument === instrument);
  if (index < 0) return { ...day, tracks: [...day.tracks, change(emptyTrack(instrument))] };
  const tracks = day.tracks.slice();
  tracks[index] = change(tracks[index]);
  return { ...day, tracks };
}

function sorted(events: NoteEvent[]): NoteEvent[] {
  return [...events].sort((a, b) => a.time - b.time);
}

function reducer(state: GameState, action: Action): GameState {
  const today = state.today;
  const current = state.days[today] ?? freshDay();
  const commit = (day: DayState): GameState => ({ ...state, days: { ...state.days, [today]: day } });
  const song = songForDate(today);

  switch (action.type) {
    case "set-name": {
      const username = cleanName(action.name);
      const followers = [...state.followers];
      for (const card of state.imports) {
        if (!username || sameName(card.username, username)) continue;
        if (card.follows.some((name) => sameName(name, username)) && !followers.some((name) => sameName(name, card.username))) {
          followers.push(card.username);
        }
      }
      return { ...state, username, followers };
    }
    case "set-mode":
      if (current.modeLocked) return state;
      return commit({ ...current, mode: action.mode });
    case "toggle-tutorial":
      return { ...state, tutorialOpen: !state.tutorialOpen };
    case "set-tutorial":
      return { ...state, tutorialOpen: action.open };
    case "roll":
      return action.today === state.today ? state : { ...state, today: action.today };
    case "reveal":
      return current.revealed ? state : commit({ ...current, revealed: true });
    case "add-events":
      if (current.locked) return state;
      return commit(withTrack(current, action.instrument, (track) => ({ ...track, events: sorted([...track.events, ...cloneNotes(action.events)]) })));
    case "save-track": {
      if (current.locked || action.events.length === 0) return state;
      const track = emptyTrack(action.instrument);
      track.events = sorted(cloneNotes(action.events).map((event) => ({ ...event, instrument: action.instrument })));
      return commit({ ...current, tracks: [...current.tracks, track] });
    }
    case "delete-event":
      if (current.locked) return state;
      return commit(withTrack(current, action.instrument, (track) => ({ ...track, events: track.events.filter((_, index) => index !== action.index) })));
    case "resize-event":
      if (current.locked) return state;
      return commit(
        withTrack(current, action.instrument, (track) => ({
          ...track,
          events: track.events.map((event, index) =>
            index === action.index ? { ...event, duration: Math.min(20 - event.time, Math.max(0.06, action.duration)) } : event,
          ),
        })),
      );
    case "mute":
      if (current.locked) return state;
      return commit(withTrack(current, action.instrument, (track) => ({ ...track, mute: !track.mute })));
    case "solo":
      if (current.locked) return state;
      return commit(withTrack(current, action.instrument, (track) => ({ ...track, solo: !track.solo })));
    case "clear":
      if (current.locked) return state;
      return commit(withTrack(current, action.instrument, (track) => ({ ...track, events: [], technique: undefined })));
    case "load-example":
      if (current.locked) return state;
      return commit({ ...current, tracks: exampleTracks() });
    case "hint":
      return commit(requestHint(current));
    case "pick-instrument": {
      if (current.locked || current.mode !== "easy") return state;
      if (current.hintedInstruments.includes(action.instrument)) return state;
      if (!song.notes.some((note) => note.instrument === action.instrument)) return state;
      const ghosts = partialReference(song.notes, action.instrument);
      return commit(
        withTrack(
          { ...current, hintedInstruments: [...current.hintedInstruments, action.instrument] },
          action.instrument,
          (track) => ({ ...track, events: sorted([...track.events, ...ghosts]) }),
        ),
      );
    }
    case "fill-section": {
      if (current.locked || current.mode !== "easy" || current.sectionFilled) return state;
      const section = SECTIONS.find((item) => item.id === action.section);
      if (!section) return state;
      const present = new Set(song.notes.map((note) => note.instrument));
      let tracks = current.tracks.map((track) => ({ ...track, events: cloneNotes(track.events) }));
      let filled = false;
      for (const instrument of section.instruments) {
        if (!present.has(instrument)) continue;
        filled = true;
        const events = song.notes.filter((note) => note.instrument === instrument).map((note) => ({ ...note }));
        tracks = tracks.filter((track) => track.instrument !== instrument);
        tracks = [...tracks, { ...emptyTrack(instrument), events }];
      }
      if (!filled) return state;
      let day: DayState = { ...current, tracks, sectionFilled: action.section, hintTier: 5, modeLocked: true };
      if (action.submit) {
        const events = tracks.flatMap((track) => track.events);
        day = submitAttempt(day, scoreArrangement(song.notes, events), cloneNotes(events));
      }
      return commit(day);
    }
    case "submit": {
      if (current.locked || current.attempts.length >= 5) return state;
      const events = current.tracks.flatMap((track) => cloneNotes(track.events));
      const raw = scoreArrangement(song.notes, events);
      return commit(submitAttempt(current, raw, events, { declineSection: action.declineSection }));
    }
    case "follow": {
      const name = action.name.trim();
      if (!name || sameName(name, state.username) || state.follows.some((item) => sameName(item, name))) return state;
      return { ...state, follows: [...state.follows, name], offerFollow: sameName(state.offerFollow ?? "", name) ? null : state.offerFollow };
    }
    case "unfollow":
      return { ...state, follows: state.follows.filter((name) => !sameName(name, action.name)) };
    case "import": {
      if (state.username && sameName(action.card.username, state.username)) return state;
      const imports = [
        ...state.imports.filter((card) => !(sameName(card.username, action.card.username) && card.date === action.card.date)),
        action.card,
      ];
      let followers = state.followers;
      if (state.username && action.card.follows.some((name) => sameName(name, state.username)) && !followers.some((name) => sameName(name, action.card.username))) {
        followers = [...followers, action.card.username];
      }
      const already = state.follows.some((name) => sameName(name, action.card.username));
      return { ...state, imports, followers, offerFollow: already ? state.offerFollow : action.card.username };
    }
    case "dismiss-offer":
      return { ...state, offerFollow: null };
    default:
      return state;
  }
}

function initialState(): GameState {
  return { ...loadSave(), today: utcDateString(), offerFollow: null };
}

interface GameValue {
  state: GameState;
  day: DayState;
  dispatch: Dispatch<Action>;
  streak: number;
  high: number | null;
  average: number | null;
  cards: BoardCard[];
}

const GameContext = createContext<GameValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const day = state.days[state.today] ?? freshDay();

  useEffect(() => {
    const save: SaveShape = {
      username: state.username,
      follows: state.follows,
      followers: state.followers,
      tutorialOpen: state.tutorialOpen,
      days: state.days,
      imports: state.imports,
    };
    localStorage.setItem(KEY, JSON.stringify(save));
  }, [state]);

  useEffect(() => {
    const tick = () => {
      const today = utcDateString();
      if (today !== state.today) dispatch({ type: "roll", today });
    };
    const id = window.setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [state.today]);

  useEffect(() => {
    const apply = () => {
      const raw = location.hash.replace(/^#/, "");
      const payload = raw.startsWith("board/") ? raw.slice(6) : raw.startsWith("s/") ? raw.slice(2) : "";
      if (!payload) return;
      const card = decodeShare(payload);
      if (card) dispatch({ type: "import", card });
      history.replaceState(null, "", `${location.pathname}${location.search}#play`);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const value = useMemo<GameValue>(() => {
    const lockedDates = Object.entries(state.days)
      .filter(([, item]) => item.locked)
      .map(([date]) => date);
    const lockedScores = Object.values(state.days)
      .filter((item) => item.locked)
      .map((item) => officialScore(item));
    const cards: BoardCard[] = [];
    if (state.username) {
      for (const [date, item] of Object.entries(state.days)) {
        if (item.attempts.length === 0) continue;
        const best = bestAttempt(item.attempts);
        if (!best) continue;
        const song = songForDate(date);
        cards.push({
          id: `you:${date}`,
          username: state.username,
          score: officialScore(item),
          date,
          bpm: song.bpm,
          title: song.title,
          events: cloneNotes(best.events),
          follows: state.follows,
          source: "you",
          locked: item.locked,
        });
      }
    }
    for (const card of state.imports) {
      if (state.username && sameName(card.username, state.username)) continue;
      cards.push(card);
    }
    return {
      state,
      day,
      dispatch,
      streak: currentStreak(lockedDates, state.today, day.locked),
      high: lockedScores.length ? Math.max(...lockedScores) : null,
      average: mean(lockedScores),
      cards,
    };
  }, [state, day]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameValue {
  const value = useContext(GameContext);
  if (!value) throw new Error("useGame must be used inside GameProvider");
  return value;
}
