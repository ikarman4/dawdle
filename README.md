# DAWdle

DAWdle is a daily browser composition game. Every UTC day, everyone hears the same original 20-second song, then sketches it back with simple instruments. You get five tries. The day keeps your closest percentage, then locks and shows your sketch beside the real arrangement.

Hit play and scrub the waveform. Record a full pass with the metronome, or punch in single notes and drum hits. Easy mode offers hints and docks them from the official score. Hard mode shows only the percentage. After the fifth try you can compare, share a link, and see that sketch on your board.

Every song in the catalog is an original written for DAWdle. There are no copyrighted songs, samples, names, or lyrics. The code is MIT.

```bash
npm install
npm test
npm run dev
npm run build
```

The game is hosted at https://ikarman4.github.io/dawdle/ and uses hash routes (`#play`, `#board`, `#you`).
