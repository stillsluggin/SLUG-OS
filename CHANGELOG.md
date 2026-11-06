# Changelog

All notable changes to Slug OS, newest first. Written for players, not programmers.

## Unreleased (branch claude/live-knobs-simple-shock)

### Changed
- **Knobs tweak the sound live**: turning an engine knob now changes notes
  that are already ringing (KEYS, ANALOG, PAD, PLUCK, SHINE, TRIP), not just
  the next ones.
- **Shell Shock is simpler again**: the screen is the pad, HOLD, ✎ EDIT and a
  grid of presets. Loaders, name/SAVE, AFFECTS and hidden knobs live in EDIT.
- **STUTTER is a real stutter**: a DJ-style loop repeater (1/8 rolling down
  to 1/64, optional triplet feel and fade) instead of a volume gate. BEAT
  REPEAT uses the same looper with longer slices.
- **ISOLATOR** now picks the band it kills: LOWS, MIDS, HIGHS or SWEEP.

### Added
- **17 factory presets** for Shell Shock (DJ FILTER, KILL LOWS/MIDS/HIGHS,
  STUTTER ROLL, BEAT REPEAT, DUB ECHO, TAPE STOP, LO-FI DUST and more).
- Hidden knob settings are now remembered per axis, so the same effect on X
  and Y can be set differently (e.g. kill lows on X, kill highs on Y).

## Earlier (branch claude/fx-export-knobs)

### Changed
- **Knobs redesigned**: a raised cap with a ridged edge and a turning pointer,
  so they read as knobs at a glance; the slime-dot ring still shows the value.

### Added
- **Shell Shock TWEAK drawer**: 2–4 hidden knobs per effect, remembered per
  effect and saved in combos.
- **LFO FILTER** effect: tempo-synced low-pass sweep (rate, resonance, shape,
  centre), locked to the beat.
- **LO-FI eras**: SAMPLER, CASSETTE, RADIO, CONSOLE.
- **AFFECTS**: aim Shell Shock at everything, the band, the drums or the
  sampler + loops.
- **EXPORT, multitrack options**: drums on one track or split per drum; stems
  RAW or WITH FX (each stem's own reverb/echo share, Shell Shock, warmth),
  for loops and live performances.

## Earlier (branch claude/hiphop-export)

### Added
- **Five hip hop, jazz, funk and soul styles**: BOOM BAP, DUSTY, STRUT,
  GOLDEN, KNOCK (eleven in all). Styles are named for grooves, not artists.
- **Beats that follow the style**: NEW BEAT writes boom bap, funk, soul, jazz,
  knock (half-time, hat rolls) or sparse drums to match; a generated beat
  changes with the style, an edited one stays.
- **CHOP** playing mode for HARMONY: chopped record-style stabs.
- **MORPH**: two more named knobs per engine (◐ on the BAND page).
- **EXPORT** (tap the snail logo): LOOP (exact bars) or LIVE recording, stereo
  mix or multitrack stems (zip), 48k / 44.1k / 22k / 11k, 16 or 24 bit;
  recording to a sampler pad; project files (save / open).

### Changed
- Presets "Dre Glide" and "Motown Thump" renamed "Sunset Glide" and
  "Soul Thump" (no artist names).

## Earlier (branch claude/global-fixes)

### Changed
- **Changing the key transposes the whole project** (chord playing, chord
  sequencer, Chord History, recorded parts). Major ↔ minor moves chords and
  notes to the same scale step in the new mode.
- **BPM button opens a TEMPO window** (− / +, hold to repeat, or type a number)
  instead of jumping to the drums page.
- **Styles renamed**: BREATHE (was Nujabes), FOCUS (was Tyler), STOMP (was
  Motown). Saved projects keep their style.

### Added
- **Three new styles**: CRUISE (G-funk), BLOOM (gospel neo-soul), DRIFT (calm,
  spacious), each with its own Next Chord moves and grooves.
- **More variation**: every style now changes its comping, strum and bass
  patterns over a 4-bar phrase, with a turnaround bar; arpeggio speed per style.

### Fixed
- **Changing a preset or engine** now cuts the old sound immediately and plays
  the held chord / bass note again with the new sound.
- **Overdubbing notes**: with REC on, notes played with HARMONY focused (the
  default) were not recorded. They now overdub into a HARMONY part on top of
  the chords, and drum hits with the DRUMMER focused overdub into the pattern.
  UNDO covers both.

## Unreleased (branch claude/shell-shock)

### Changed
- **The XY pad is now SHELL SHOCK**: a shell cursor with a slime trail follows
  your finger. Tap X or Y to load **any** effect from a scrolling list (no fixed
  pairs; the same effect can even go on both axes).
- **TAPE STOP is expressive**: the further along the axis, the faster the tape
  stops (from a slow 3-second wind-down to instant). Drag back and it spins
  smoothly back up to speed.
- **Combos are auto-named** (e.g. "Pixel Gritty Bloom"), with 🎲 for another
  name. SAVE as many as you like; EDIT to rename or delete.

### Added
- Nine new effects: LO-FI, VINYL WOBBLE, TAPE SATURATION, REVERB WASH, CHORUS,
  RING MOD, PITCH DIVE, TRANCE GATE, REVERSE REPEAT (18 in all).

## Unreleased (branch claude/history-capture)

### Added
- **OVERDUB / REPLACE**: with REC on and the band playing, notes you play on
  MELODY, BASS or SOLOIST record straight into their part. OVERDUB (default)
  layers each loop on top; REPLACE wipes the old part as the loop passes, but
  only once you start playing. Red ● OVERDUB / ● REPLACE badge in the top bar
  while recording (tap to switch). UNDO takes back the last recorded loop.
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
