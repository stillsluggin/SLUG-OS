# Slug OS

**Play it:** https://stillsluggin.github.io/SLUG-OS/

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
finger drums, loops. **SAMPLER**: load, chop and play pads. **SHELL SHOCK**: the XY effects pad.

### Knobs

Drag up/down (or sideways) on any knob; the pointer turns and the slime dots
around it show how far. Scroll or use the arrow keys on a computer.

### SHELL SHOCK (the XY effects pad)

Drag on the big grid: left-right plays the **X** effect, up-down the **Y**
effect, both at once. A little shell follows your finger and leaves a slime
trail. Let go and the effects glide back to off; turn on **HOLD** to keep them.

- **Load any effect**: tap **X** or **Y** to open the list and tap one. Any
  effect can go on either axis, even the same one twice. The 18 effects:
  FILTER, ISOLATOR, BEAT REPEAT, PHASER, FLANGER, DELAY, TAPE STOP, STUTTER,
  BIT CRUSH, LO-FI, VINYL WOBBLE, TAPE SATURATION, REVERB WASH, CHORUS,
  RING MOD, PITCH DIVE, TRANCE GATE, REVERSE REPEAT.
- **⚙ TWEAK** opens a drawer with 2–4 hidden knobs for each loaded effect
  (e.g. FILTER RES/RANGE, DELAY TIME/FEEDBACK/TONE, LO-FI ERA/HISS). Each
  effect remembers its settings; saved combos keep them.
- **LFO FILTER**: a tempo-synced low-pass sweep that starts on the beat. Pad =
  depth; TWEAK: RATE (4 bars to 1/16), RES, SHAPE (sine/tri/square/saw), CENTER.
- **LO-FI ERA**: SAMPLER (12-bit), CASSETTE (soft top, hiss, wow), RADIO
  (narrow, crunchy), CONSOLE (8-bit).
- **AFFECTS** (in TWEAK): ALL, BAND (the four synth players), DRUMS or SAMPLER
  (with loops). Only the chosen part goes through the pad.
- **TAPE STOP** is played by position: just past the start the tape winds
  down slowly (about 3 seconds), further along it's quicker, at the far end it
  stops instantly. Drag back and it spins smoothly back up to speed.
- **Names**: every pairing gets a generated name (like "Mossy Tape Dive").
  🎲 rolls another. **SAVE** keeps it as a one-tap combo; save as many as you
  like. **EDIT** lets you rename (✎) or delete (✕) combos.

The pad affects everything (band, drums, sampler, loops); the metronome stays
clean.

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

### Key, tempo and style

- **Key** (top bar): tap it, then press a key for the new tonic (press the
  tonic again to flip major/minor). The **whole project transposes**: the chord
  playing, the chord sequencer, Chord History and your recorded parts all move
  with it. Major ↔ minor moves every chord to the same step of the new scale.
- **BPM** (top bar): opens a small TEMPO window. Tap − / + (hold to keep
  going), or tap the number and type a tempo (40–220).
- **Styles** (STYLE knob), eleven grooves:
  **BREATHE** (laid back, minor 9ths, ii–V loops), **FOCUS** (floating
  maj7#11, chromatic slides), **STOMP** (I–vi–IV–V, backbeat), **CRUISE**
  (G-funk sway, 9ths, gliding bass), **BLOOM** (gospel neo-soul), **DRIFT**
  (calm, open, long pads), **BOOM BAP** (dusty minor loops, chopped stabs),
  **DUSTY** (jazz hip hop: ii–V–I, 11ths, tritone subs, swung), **STRUT**
  (funk: 16th chops, octave bass), **GOLDEN** (sweet soul), **KNOCK** (hard
  hip hop: dark triads, half-time drums, sliding low bass). Each style changes
  its comping and bass bar to bar, and **NEW BEAT** on DRUMS writes a beat in
  the style (a generated beat follows when you change style; once you edit it,
  it stays yours).
- **CHOP** (HARMONY's PLAY mode): short chopped stabs like hits cut from a
  record, flipping the voicing from hit to hit.

### Chord History

Every chord you play (with its bends and exact voicing) leaves a trail next
to the chord name. **◂** steps back and plays the previous chord again, **▸**
steps forward, and tapping a chord in the trail plays it. Next Chord works from
whichever chord you go back to. Going back never deletes anything: a new chord
is added to the end. Keys: `[` back, `]` forward.

### CAPTURE (and parts)

Slug OS is always quietly listening. Play some chords, and notes on MELODY,
BASS or SOLOIST with the strum plate, then tap **CAPTURE** (BAND page, or
Parts on the SEQ page). It drops the chords into the chord sequencer, snapped
to a 1-bar, 2-beat or 1-beat grid, and your notes into that player's
**part**, snapped to 16ths. If you played more than 16 steps, it keeps the
newest part. **UNDO** takes it back. A player with a part plays your notes
instead of improvising; **CLEAR** on the SEQ page removes a part. Keys: `/`
capture, `Backspace` undo.

### Recording parts live: OVERDUB / REPLACE

Press **REC** (BAND page or Parts on SEQ), start the band, tap a snail
(HARMONY, MELODY, BASS or SOLOIST) and play the strum plate. With HARMONY
focused your notes layer on top of the chords. With the DRUMMER focused, your
drum hits overdub into the drum pattern. Your notes go into that
player's part, snapped to 16ths. While recording, the top bar shows a red
**● OVERDUB** or **● REPLACE** badge (tap it to switch; the BAND page REC
button shows the mode too).

- **OVERDUB** (default): new notes layer on top, loop after loop.
- **REPLACE**: from your first new note, the old part is wiped as the loop
  goes by. Nothing is erased until you play.
- **UNDO** takes back the last loop you recorded (or the one in progress).

A muted player you record into switches to FREE so you hear your part.

### The Slug Band

HARMONY (chords: COMP, SUSTAIN, STRUM, ARP), MELODY (short motifs with call
and response), BASS, SOLOIST (improvises in key) and DRUMMER. Each one is
FOLLOW (plays by itself), FREE (you play it) or MUTE; tap its chip to switch.
Tap a snail to focus it, then change its ENGINE, preset and its two knobs (A, B).

**BASS LATCH**: one press switches the bass between FOLLOW and FREE. Follow
modes: ROOT, SLASH, ROOT-FIFTH, OCTAVE, WALKING, PEDAL.

### Synth engines (two knobs each, plus MORPH)

| Engine | How it makes sound | Knobs |
| --- | --- | --- |
| KEYS | FM tines + bell, tremolo/phaser/chorus | WAVE, TONE |
| ANALOG | saws/squares into a 24 dB ladder-style filter, glide | GLIDE, SQUELCH |
| PAD | detuned saw + pulse ensemble, stereo chorus | WIDTH, GLOW |
| PLUCK | Karplus-Strong plucked string model | THUMP, MUFFLE |
| SHINE | digital wavetables, unison, 8-BIT chip presets | SPARKLE, AIR |
| TRIP | 3-operator feedback FM with drifting ratios | WEIRD, DRIFT |
| SIREN | pitch-swept oscillators + noise | RISE, SPEED |

**MORPH** (◐ next to the engine name on BAND): knobs A and B switch to two
more knobs that reshape the sound: KEYS **DUST / HALO**, ANALOG **GRIT / FAT**,
PAD **AIRY / SWELL**, PLUCK **BODY / SNAP**, SHINE **MELT / GLINT**, TRIP
**SPORE / PULSE**, SIREN **HOWL / STATIC**. Tap ◐ MORPH again for the main pair.

### Next Chord, Your Way

After every chord: the single best next chord plus NOSTALGIC, EMOTIONAL, CALM
and SURPRISE choices, in BREATHE, FOCUS, STOMP, CRUISE, BLOOM or DRIFT style (STYLE knob). Stays in
key; only SURPRISE borrows. Tune it in [`src/core/nextChord.js`](src/core/nextChord.js).

### Knobs and buttons

TEMPO, SWING, HUMAN (humanise), STYLE, A and B (focused player's engine
knobs), LEVEL. Buttons: BASS LATCH, KEY (then press a key; the tonic again
flips major/minor), REC (write chords into the sequencer), PLAYER (next focus).

## EXPORT (tap the snail logo)

- **RECORD**: **LOOP** restarts the band from bar 1 and records exactly 1, 2,
  4, 8 or 16 bars (plus a 0–4 s **TAIL** for echoes); **LIVE** records until you
  tap STOP (play, jam, ride Shell Shock).
- **FORMAT**: **STEREO MIX** (one WAV) or **MULTITRACK** (a zip: the mix plus
  one WAV per part that played: harmony, melody, bass, soloist, drums,
  sampler, loops, all the same length so they line up in your DAW). Stems are
  dry of the shared room/echo and Shell Shock; those are on the mix.
- With MULTITRACK: **DRUMS** ONE TRACK or SPLIT (kick, snare, hat, open,
  rim, perc each on their own track), and **FX** RAW (clean parts) or WITH FX
  (each stem gets its own share of the room and echo, Shell Shock if the pad
  is aimed at it, and the tape warmth). Works for LOOP and LIVE recording.
- **RATE** 48k, 44.1k, 22k or 11k (the low ones for crunch) and **BITS** 16/24.
- **→ SAMPLER PAD** puts the recording on the first empty pad (resampling).
- **PROJECT FILE**: save/open your settings, chords, parts, beats and combos
  as a `.slug.json` file. Your sounds stay on the device.

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
