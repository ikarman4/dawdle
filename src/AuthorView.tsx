import { useMemo, useRef, useState } from "react";
import { primeAudio, resumeAudio, startPlayback, stopPlayback } from "./audio";
import { ClipPlayer, type ClipControl } from "./ClipPlayer";
import { CATALOG } from "./catalog";
import { beatSeconds, utcDateString, windowPeaks } from "./daily";
import { bpmForId } from "./hash";
import { authoredNotes, hasAuthoredKey, KEY_COMMIT_NOTE } from "./keys";
import { midiToNotes } from "./midi";
import { INSTRUMENT_EMOJI, INSTRUMENTS, instrumentInfo, type InstrumentId, type NoteEvent } from "./types";
import { NoteRoll, Waveform, rowsFor } from "./widgets";

interface AuthorTrack {
  instrument: InstrumentId;
  events: NoteEvent[];
}

function tracksFrom(notes: NoteEvent[]): AuthorTrack[] {
  const order: InstrumentId[] = [];
  const grouped = new Map<InstrumentId, NoteEvent[]>();
  for (const note of [...notes].sort((a, b) => a.time - b.time)) {
    const list = grouped.get(note.instrument);
    if (list) list.push(note);
    else {
      grouped.set(note.instrument, [note]);
      order.push(note.instrument);
    }
  }
  return order.map((instrument) => ({ instrument, events: grouped.get(instrument) ?? [] }));
}

function downloadKey(videoId: string, notes: NoteEvent[]) {
  const body = JSON.stringify({ videoId, notes }, null, 2);
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${videoId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AuthorView() {
  const date = useMemo(() => utcDateString(), []);
  const [videoId, setVideoId] = useState<string | null>(null);
  const song = CATALOG.find((entry) => entry.id === videoId) ?? null;
  const [tracks, setTracks] = useState<AuthorTrack[]>([]);
  const [open, setOpen] = useState<InstrumentId | null>(null);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState("");
  const [songPlaying, setSongPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [rollPlayhead, setRollPlayhead] = useState(0);
  const [listening, setListening] = useState(false);
  const [speed, setSpeed] = useState(1);
  const clip = useRef<ClipControl>(null);
  const songPlayingRef = useRef(false);
  const speedRef = useRef(1);
  songPlayingRef.current = songPlaying;
  speedRef.current = speed;
  const notes = tracks.flatMap((track) => track.events.map((event) => ({ ...event, instrument: track.instrument })));
  const peaks = useMemo(() => (song ? windowPeaks(song.id, date, 120) : []), [song, date]);

  function stopNotes() {
    stopPlayback();
    setListening(false);
  }

  function stopClip() {
    songPlayingRef.current = false;
    setSongPlaying(false);
    clip.current?.pause();
  }

  function choose(id: string) {
    stopNotes();
    stopClip();
    setVideoId(id);
    setTracks(tracksFrom(authoredNotes(id) ?? []));
    setOpen(null);
    setPicking(false);
    setNotice("");
    setPlayhead(0);
    setRollPlayhead(0);
  }

  function back() {
    stopNotes();
    stopClip();
    setVideoId(null);
    setTracks([]);
    setOpen(null);
    setPicking(false);
    setNotice("");
  }

  function onClipPlay() {
    if (!song) return;
    stopNotes();
    if (songPlaying) {
      stopClip();
      return;
    }
    const from = playhead >= 19.9 ? 0 : playhead;
    setPlayhead(from);
    setRollPlayhead(from);
    songPlayingRef.current = true;
    setSongPlaying(true);
    void resumeAudio();
    clip.current?.setPlaybackRate(speedRef.current);
    clip.current?.playFrom(from);
  }

  function onListen() {
    if (!notes.length) return;
    stopClip();
    if (listening) {
      stopNotes();
      return;
    }
    setListening(true);
    setRollPlayhead(0);
    primeAudio();
    void resumeAudio().then(() => {
      startPlayback({
        from: 0,
        events: notes,
        bpm: song ? bpmForId(song.id) : 100,
        metronome: false,
        rate: speedRef.current,
        onTick: (time) => setRollPlayhead(time),
        onEnd: () => setListening(false),
        onBeat: () => undefined,
      });
    });
  }

  function onSpeed(next: number) {
    speedRef.current = next;
    setSpeed(next);
    clip.current?.setPlaybackRate(next);
    if (!listening || !song) return;
    startPlayback({
      from: rollPlayhead,
      events: notes,
      bpm: bpmForId(song.id),
      metronome: false,
      rate: next,
      onTick: (time) => setRollPlayhead(time),
      onEnd: () => setListening(false),
      onBeat: () => undefined,
    });
  }

  function addInstrument(id: InstrumentId) {
    setTracks((current) => (current.some((track) => track.instrument === id) ? current : [...current, { instrument: id, events: [] }]));
    setOpen(id);
    setPicking(false);
  }

  function write(id: InstrumentId, events: NoteEvent[]) {
    setTracks((current) => current.map((track) => (track.instrument === id ? { ...track, events } : track)));
  }

  async function onMidi(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const imported = midiToNotes(bytes);
    if (!imported.length) {
      setNotice("No notes in the first 20 seconds of that MIDI file.");
      return;
    }
    stopNotes();
    setTracks(tracksFrom(imported));
    setOpen(imported[0]?.instrument ?? null);
    setNotice("Imported the first 20 seconds onto DAWdle instruments. Edit, then download the key.");
  }

  if (!song) {
    return (
      <div className="author" data-testid="author">
        <header className="header">
          <h1 className="wordmark">Author</h1>
        </header>
        <p>Pick a catalog song and save the note list that scores it. A checkmark means a scoring key is already committed. {KEY_COMMIT_NOTE}</p>
        <ul className="author-list" aria-label="Catalog">
          {CATALOG.map((entry) => {
            const saved = hasAuthoredKey(entry.id);
            return (
              <li key={entry.id}>
                <button type="button" aria-label={`${entry.title}, ${entry.artist}${saved ? ", key saved" : ""}`} onClick={() => choose(entry.id)}>
                  <span className="author-title">{entry.title}</span>
                  <span className="author-by">{entry.artist}</span>
                  <span className="author-mark" aria-hidden="true">
                    {saved ? "✓" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const saved = hasAuthoredKey(song.id);
  const bpm = bpmForId(song.id);
  const step = beatSeconds(bpm) / 4;
  return (
    <div className="author studio" data-testid="author" data-song={songPlaying ? "on" : "off"}>
      <button type="button" onClick={back}>
        All songs
      </button>
      <header className="header">
        <div>
          <h1>{song.title}</h1>
          <p>
            {song.artist} · {song.year} {saved ? "✓ key saved" : "· no key yet"}
          </p>
        </div>
      </header>
      <ClipPlayer
        ref={clip}
        videoId={song.id}
        date={date}
        volume={0.85}
        hidden={false}
        onLocal={(seconds) => {
          if (!songPlayingRef.current) return;
          setPlayhead(seconds);
          setRollPlayhead(seconds);
        }}
        onEnded={() => {
          songPlayingRef.current = false;
          setSongPlaying(false);
        }}
        onReady={() => undefined}
        onError={() => setNotice("This video cannot be embedded. You can still write the key.")}
      />
      <div className="play-row">
        <button type="button" className="play-pill" onClick={onClipPlay}>
          {songPlaying ? "Pause" : "Play"}
        </button>
        <Waveform
          notes={[]}
          peaks={peaks}
          playhead={playhead}
          onScrub={(time) => {
            setPlayhead(time);
            if (!songPlaying) return;
            setRollPlayhead(time);
            clip.current?.seek(time);
          }}
        />
        <select className="speed" aria-label="Playback speed" value={speed} onChange={(event) => onSpeed(Number(event.target.value))}>
          {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
            <option key={rate} value={rate}>
              {rate}x
            </option>
          ))}
        </select>
      </div>
      <p>Play hears the YouTube snippet. Listen hears only the notes you save as the scoring key.</p>
      <div className="song-actions">
        <button type="button" onClick={() => setPicking((value) => !value)}>
          Add instrument
        </button>
        <button type="button" onClick={onListen} disabled={!notes.length && !listening}>
          {listening ? "Stop" : "Listen"}
        </button>
      </div>
      {picking && (
        <div className="inst-grid" role="group" aria-label="Instruments">
          {INSTRUMENTS.map((item) => (
            <button type="button" key={item.id} aria-label={item.name} onClick={() => addInstrument(item.id)}>
              <span className="pick-emoji" aria-hidden="true">
                {INSTRUMENT_EMOJI[item.id]}
              </span>
            </button>
          ))}
        </div>
      )}
      {tracks.map((track) => {
        const info = instrumentInfo(track.instrument);
        const isOpen = open === track.instrument;
        return (
          <div className="track" key={track.instrument}>
            <div className="track-head">
              <button type="button" className="track-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : track.instrument)}>
                <span className="track-emoji" aria-hidden="true">
                  {INSTRUMENT_EMOJI[track.instrument]}
                </span>
                <span className="track-name">{info.name}</span>
              </button>
            </div>
            {isOpen && (
              <NoteRoll
                instrument={track.instrument}
                rows={rowsFor(track.instrument)}
                notes={track.events}
                playhead={rollPlayhead}
                disabled={false}
                step={step}
                defaultDuration={beatSeconds(bpm)}
                follow={listening || songPlaying}
                onChange={(events) => write(track.instrument, events)}
                onPreview={() => undefined}
                onKeyDown={() => undefined}
                onKeyUp={() => undefined}
              />
            )}
          </div>
        );
      })}
      <label className="name-field">
        <span>Import a MIDI file you have the rights to use</span>
        <input
          aria-label="Import MIDI"
          type="file"
          accept=".mid,.midi,audio/midi"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onMidi(file);
            event.target.value = "";
          }}
        />
      </label>
      {notice && <p>{notice}</p>}
      <button
        type="button"
        className="submit-pill"
        disabled={!notes.length}
        onClick={() => downloadKey(song.id, [...notes].sort((a, b) => a.time - b.time || a.instrument.localeCompare(b.instrument)))}
      >
        Download scoring key
      </button>
      <p>{KEY_COMMIT_NOTE}</p>
      <p>Save the download as src/keys/{song.id}.json. Do not download YouTube audio. The MIDI import only reads a file you already have.</p>
    </div>
  );
}
