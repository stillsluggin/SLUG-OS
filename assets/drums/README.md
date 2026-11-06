# Built-in drum kit: Slugz Delight (free sample platter)

Put the FREE Slugz Delight kit's audio files in this folder (sub-folders are
fine). They ship with the app, so Slug OS has real drums out of the box.

- Name files so Slug OS can sort them: words like `kick`, `snare`, `hat`,
  `open hat`, `rim`/`clap`, `perc`/`shaker`. Loops: put `loop` or `92bpm` in the name.
- Only the FREE kit goes here. The full master crate and anything private must
  NOT be committed (see `.gitignore`). Import those inside the app instead:
  DRUMS → + FOLDER. They are stored only in your browser.
- On GitHub Pages the files are found automatically. For faster loading (or on
  other hosts) run `node tools/make-drum-manifest.mjs` to write `kit.json`.

Until files are added, Slug OS plays its own synthesized boom bap kit.
