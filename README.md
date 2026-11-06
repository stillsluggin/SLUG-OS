# Slug OS

**A 70s session band in your pocket, plus a lazy-chop sampler.** An idea
starter for original music and samples that sound like 70s funk, jazz and soul
records. Play a chord with one finger and the Slug Band plays it with you,
while Slug OS suggests where to go next. Record the output into your samplers.

Phase 1 is this browser app (phone or desktop, no install). Phase 2 is a
slimmed-down port to the M-VAVE FM-1 on Felucca: see [docs/porting.md](docs/porting.md).

## Start

Open the page and tap **TAP TO START**. iPhone: if you hear nothing, flip the
silent switch off and turn the volume up. Press **PLAY** and the band starts on
your home chord. Tap **♩** (top bar) for the metronome: a click on every beat,
following TEMPO, even when the band is stopped.

## The pages

**BAND**: what's playing, Next Chord, the five players, the knobs and buttons.
**SEQ**: the 16-step chord sequencer. **DRUMS**: kits, the boom bap pattern,
finger drums, loops. **SAMPLER**: load, chop and play pads. **XY FX**: the effects pad.

### XY FX pad

Drag on the big grid: left-right plays the **X** effect, up-down the **Y**
effect, both at once. Pick each with ◂ ▸: FILTER, ISOLATOR (kills lows, then
mids), BEAT REPEAT, PHASER, FLANGER, DELAY, TAPE STOP, STUTTER, BIT CRUSH.
Let go and they glide back to off; turn on **HOLD** to keep them where you
left them. **Combos**: tap one to load a pairing, hold one to save the current
pairing in its place. The pad affects everything (band, drums, sampler,
loops); the metronome stays clean.

### Sampler pads

- **LOAD** an audio file or a video (its sound is pulled out), or **● REC MIC**.
  Drag the orange handles on the waveform to set start and end.
- **ONE-SHOT / GATE / LOOP**, **REVERSE**, and knobs ATTACK, RELEASE, TONE,
  PITCH, STRETCH, GAIN.
- **PITCH** algorithm: **RESAMPLE** (old-sampler style: higher = faster) or
  **KEEP TIME** (pitch moves, timing stays).
- **WARP** algorithm for STRETCH: **REPITCH** (tape style), **BEATS** (for
  drums: hits move, each keeps its punch), **SMOOTH** (for melodic sounds).
- **WARP→BPM** fits the pad to the band's tempo. SOURCE is the sample's own
  tempo (read from names like "92bpm", else guessed); fix it with ½ − + ×2.
- **CHOP BANK** turns a pad into its own set of chops: TAP in time, ÷4 ÷8 ÷16,
  or HITS. The original audio is never changed.

### The keyboard (27 keys, laid out like the FM-1)

| Keys | What they do |
| --- | --- |
| Low white | chords in your key (i, ii, bIII, iv…) |
| Low black | hold to bend the chord: ↑ 7TH, ↗ 9TH, → SUS, ↓ INV, ← BOR (borrowed). Let go and it springs back |
| High white | the strum plate: plays the **focused player** (tap a snail to focus it). Notes always fit the chord. Slide across them. With the DRUMMER focused they play drums |
| High black | NEXT (best next chord), NOST, EMO, CALM, SURP, REST |

### The Slug Band

HARMONY (chords: COMP, SUSTAIN, STRUM, ARP), MELODY (short motifs with call
and response), BASS, SOLOIST (improvises in key) and DRUMMER. Each one is
FOLLOW (plays by itself), FREE (you play it) or MUTE; tap its chip to switch.
Tap a snail to focus it, then change its ENGINE, preset and its two knobs (A, B).

**BASS LATCH**: one press switches the bass between FOLLOW and FREE. Follow
modes: ROOT, SLASH, ROOT-FIFTH, OCTAVE, WALKING, PEDAL.

### Synth engines (two knobs each)

| Engine | How it makes sound | Knobs |
| --- | --- | --- |
| KEYS | FM tines + bell, tremolo/phaser/chorus | WAVE, TONE |
| ANALOG | saws/squares into a 24 dB ladder-style filter, glide | GLIDE, SQUELCH |
| PAD | detuned saw + pulse ensemble, stereo chorus | WIDTH, GLOW |
| PLUCK | Karplus-Strong plucked string model | THUMP, MUFFLE |
| SHINE | digital wavetables, unison, 8-BIT chip presets | SPARKLE, AIR |
| TRIP | 3-operator feedback FM with drifting ratios | WEIRD, DRIFT |
| SIREN | pitch-swept oscillators + noise | RISE, SPEED |

### Next Chord, Your Way

After every chord: the single best next chord plus NOSTALGIC, EMOTIONAL, CALM
and SURPRISE choices, in Nujabes, Tyler or Motown style (STYLE knob). Stays in
key; only SURPRISE borrows. Tune it in [`src/core/nextChord.js`](src/core/nextChord.js).

### Knobs and buttons

TEMPO, SWING, HUMAN (humanise), STYLE, A and B (focused player's engine
knobs), LEVEL. Buttons: BASS LATCH, KEY (then press a key; the tonic again
flips major/minor), REC (write chords into the sequencer), PLAYER (next focus).

## Your sounds: public vs private

- **Built-in kit**: the free Slugz Delight sample platter goes in
  [`assets/drums/`](assets/drums/README.md) and ships with the app. Until then a
  synthesized boom bap kit plays.
- **Private**: your master crate, loops and samples are imported in the app
  (DRUMS → + FOLDER / + FILES, SAMPLER → LOAD / REC MIC) and stored **only in
  this browser** (IndexedDB). They are never uploaded or committed, and
  `.gitignore` blocks common private folders. Imports are sorted into kits by
  folder and by sound type.
- The "Get more Slugz kits" link uses `STORE_URL` in [`src/config.js`](src/config.js).

## Computer keyboard and MIDI

`Z`–`M` chords · `S D G H J` or arrows bend (up+right = 9th) · `Q`–`O` strum ·
`2 3 5 6 7` next chords · `9` rest · `Space` play · `L` latch · `K` key ·
`P` player · `` ` `` rec · `;` metronome. On DRUMS `1`–`6` play the drums; on SAMPLER
`1234 QWER ASDF ZXCV` play the pads. Web MIDI (Chrome/Edge/Android): notes
C3–D5 = the 27 keys, CC 70–76 = knobs, MIDI start/stop = PLAY.

## Code

```
src/core/      the music brain, no DOM or Web Audio (ports to the FM-1)
src/audio/     Web Audio: engines, voices, drums, sampler, loops, clock
src/storage/   IndexedDB, imports, video/mic capture
src/ui/        pixel-art screens and widgets (all art original, drawn in sprites.js)
docs/          porting notes
tests/         core tests + browser smoke test
tools/         drum manifest generator
```

No build step and no dependencies.

```
python3 -m http.server 8000                      # open http://localhost:8000
node --test tests/core.test.mjs                  # music-brain tests
node tests/make-fixtures.mjs && node tests/smoke.mjs http://localhost:8000/   # browser test (Playwright)
```

## Host on GitHub Pages

Settings → Pages → Deploy from a branch → `main`, `/ (root)` → Save.
