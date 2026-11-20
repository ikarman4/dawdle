import { beatSeconds } from "./daily";
import { sketchCopy } from "./keys";
import { songInstruments } from "./progress";
import { INSTRUMENT_EMOJI, instrumentInfo, type NoteEvent } from "./types";
import { NoteRoll, rowsFor } from "./widgets";

export function SketchReveal({
  notes,
  authored,
  bpm,
  playhead,
  playing,
  onPlay,
}: {
  notes: NoteEvent[];
  authored: boolean;
  bpm: number;
  playhead: number;
  playing: boolean;
  onPlay: () => void;
}) {
  const copy = sketchCopy(authored);
  const instruments = songInstruments(notes);
  const step = beatSeconds(bpm) / 4;
  return (
    <section className="sketch" data-testid="sketch" data-kind={authored ? "authored" : "placeholder"} aria-label={copy.title}>
      <h2>{copy.title}</h2>
      <p>{copy.detail}</p>
      <button type="button" className="play-pill" onClick={onPlay}>
        {playing ? copy.stop : copy.play}
      </button>
      {instruments.map((id) => {
        const info = instrumentInfo(id);
        const events = notes.filter((note) => note.instrument === id);
        return (
          <div className="track" key={id}>
            <div className="track-head">
              <div className="track-toggle" aria-expanded="true">
                <span className="track-emoji" aria-hidden="true">
                  {INSTRUMENT_EMOJI[id]}
                </span>
                <span className="track-name">{info.name}</span>
              </div>
            </div>
            <NoteRoll
              instrument={id}
              rows={rowsFor(id)}
              notes={events}
              playhead={playhead}
              disabled
              step={step}
              defaultDuration={beatSeconds(bpm)}
              follow={playing}
              testId="sketch-roll"
              onChange={() => undefined}
              onPreview={() => undefined}
              onKeyDown={() => undefined}
              onKeyUp={() => undefined}
            />
          </div>
        );
      })}
    </section>
  );
}
