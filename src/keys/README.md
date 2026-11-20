# Scoring keys

Each file here is one song's scoring key. Name it with the YouTube video id, for example `PxG9XFqHSFw.json`.

```json
{
  "videoId": "PxG9XFqHSFw",
  "notes": [
    { "instrument": "piano", "time": 0, "duration": 0.5, "velocity": 0.8, "pitch": 60 }
  ]
}
```

The game loads `src/keys/*.json` when it builds. GitHub Pages cannot write this folder from the browser.

Open `#author`, write or import the notes, and download the JSON. Commit that file into this folder. Ian commits the saved file.

Until a key is committed, the song keeps its generated placeholder. After five tries the reveal calls that a placeholder sketch, not the original stems.
