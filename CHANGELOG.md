# Changelog

All notable changes to Slug OS, newest first. Written for players, not programmers.

## Unreleased (branch claude/history-capture)

### Added
- **CAPTURE**: Slug OS always listens. Tap CAPTURE and the chords you just
  played land in the chord sequencer (timing snapped to the grid and BPM), and
  notes you played on MELODY, BASS or SOLOIST land in that player's new
  **part**. Keeps the newest part if you played a lot. UNDO takes it back.
  New Parts window on the SEQ page shows each part, with CLEAR.
- **Chord History**: Slug OS remembers every chord you play, with its bends and
  exact voicing. ◂ / ▸ next to the chord name step back and forward and play
  the chord again; the little slime trail shows your last five chords, tap one
  to play it. Saved between visits. Keys `[` and `]`.

## Unreleased (branch claude/slug-os-v2)

### Added
- **XY FX pad** (new XY FX tab): drag to play two effects at once, one per axis,
  chosen from FILTER, ISOLATOR, BEAT REPEAT, PHASER, FLANGER, DELAY, TAPE STOP,
  STUTTER and BIT CRUSH. Snaps back smoothly on release, with HOLD. Four combo
  slots (tap to load, hold to save). Works on the whole mix, including reverb
  and echo tails.
- **Sampler pitch and stretch**: a STRETCH knob (0.5×–2×) and two new choices
  per pad. PITCH: RESAMPLE (classic, speed and pitch together) or KEEP TIME
  (pitch-shift that keeps timing). WARP: REPITCH (tape), BEATS (drums), SMOOTH
  (melodic). WARP→BPM fits a loop to the band's tempo using its source BPM
  (read from the file name or guessed from its length). Stretched sounds are
  worked out once and remembered, so pads stay instant.
- **Metronome**: tap ♩ in the top bar (or press `;`). Clicks every beat,
  louder on beat 1, follows TEMPO, works with the band stopped, and skips
  the effects so it stays clean.
- **Project docs**: CLAUDE.md (the full brief plus working notes) and this changelog.

## v2 — the Slug Band (first build of the new plan)

### Added
- Retro pixel look: old-OS windows, bevelled buttons, snail players that
  bounce when they play, shell knobs, a slug crawling along a slime trail.
- The Slug Band: HARMONY, MELODY, BASS, SOLOIST, DRUMMER, each FOLLOW, FREE
  or MUTE, each able to load any engine.
- Seven synth engines with two knobs each: KEYS, ANALOG, PAD, PLUCK, SHINE
  (with 8-BIT presets), TRIP, SIREN.
- Next Chord (Nujabes, Tyler, Motown), chord bends on the black keys, a
  16-step chord sequencer with AUTO, swing and humanise.
- Bass Latch with six follow modes.
- Slug Drums: built-in kit folder, synthesized backup kit, private folder
  import, loops synced to tempo, boom bap pattern generator.
- Slug Sampler: audio, video and mic sources, start/end on the waveform,
  16 pads, chop bank (tap, equal, transients), one-shot/gate/loop, attack,
  release, tone, pitch, reverse, gain.
- Saves your settings, pads and imports on your device.
