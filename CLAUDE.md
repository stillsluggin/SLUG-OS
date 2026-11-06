# CLAUDE.md — Slug OS

This file is the project brief plus working notes for anyone (human or AI)
working on Slug OS. Read it fully before changing anything.

---

## Part 1 — The brief (from the owner, verbatim in substance)

### The plan
- **Phase 1 (now):** Slug OS is a standalone browser app. It runs in a phone or
  desktop browser with no controllers, no MIDI device and no install. This is
  the owner's personal creative tool: load it with features. They'll decide
  what to cut later if they ever release it.
- **Phase 2 (later):** port a slimmed-down version to the M-VAVE FM-1 as custom
  firmware built on Felucca (github.com/hugelton/Felucca, GPL-3.0). Do not fork
  Sloop or any other firmware. The interface, sounds and features must be the
  owner's own.

### What Slug OS is
A "70s session band in your pocket" plus a lazy-chop sampler: an idea starter
for making original music and samples that sound like 70s funk, jazz and soul
records. The feel is nostalgic, emotional, calm, peaceful and soulful
(Nujabes, Tyler, the Creator, Motown, Dr. Dre). It must feel expressive and
playable, like an Omnichord or HiChord, not a generic chord generator. The
owner records its audio output into hardware samplers.

### Design rules
- Minimalist, simple, approachable and utilitarian, even with lots of
  features. Joyful to use.
- "One press to make music": every feature works the moment it is switched
  on. No menu diving.
- Each synth engine shows only TWO knobs on its main screen.

### Look and feel
- Retro and nostalgic: Nintendo-style playfulness meets old Japanese
  technology and 90s–2000s computer software (Amiga, Commodore, classic
  Macintosh).
- Pixel art, chunky bevelled buttons, bitmap-style fonts, limited warm colour
  palettes, old-OS windows.
- Nature meets old tech: slugs, snails, shells, leaves, moss and dewdrops
  everywhere. Snail mascots, shell-shaped knobs, slime trails as progress
  bars, snails that react to the music.
- All art must be original. No copyrighted characters, logos or assets from
  Nintendo or anyone else.

### Tech setup (browser)
- Plain HTML, CSS and JavaScript with the Web Audio API. Keep dependencies to
  a minimum.
- Touch-first and mobile-first; it must work well on an iPhone. Also playable
  with mouse, the computer keyboard and optional Web MIDI.
- Audio on phones: start audio on the first tap with a clear "Tap to start"
  screen. Resume the audio context if suspended. Show a hint that the iPhone
  silent switch can mute web audio. Test on iOS Safari.
- Host it free with GitHub Pages so the owner can open it from a link on
  their phone.

### Sounds: public vs private
- This repo is public.
- BUNDLED: the owner's FREE Slugz Delight sample platter kit is the built-in
  drum kit. They will upload its files to `assets/drums`. It ships with the
  app so Slug OS works out of the box.
- PRIVATE: the full Slugz Delight master crate, the owner's loops and any
  samples they import must NEVER be committed to the repo. Load them from the
  device and store them locally in the browser (IndexedDB) so they persist
  between sessions. Private audio folders are in `.gitignore`.
- A small "Get more Slugz kits" link in the drum section that the owner can
  point to their store.

### Portable architecture (for the FM-1 later)
- Keep the music brain (chord engine, Next Chord logic, band players, Bass
  Latch, sequencer, synth settings) separate from the browser UI and Web
  Audio, in clean modules.
- Lay out the core controls so they could map to the FM-1: 27 keys (white and
  black), 7 knobs, a few buttons and a small colour screen.
- Note FM-1 limits (about 12 voices, about 1 MB flash, about 512 KB RAM, no
  FPU) in `docs/porting.md`, and flag features too heavy to port (the sampler
  will likely be browser-only). The browser version does not have to obey
  these limits.

### Features
1. **The Slug Band** — a collection of players, each with its own
   personality, all playing together:
   - HARMONY player: plays the chords.
   - MELODY player: plays melodic lines over the chords.
   - BASS player: plays the bass line (see Bass Latch).
   - SOLOIST: plays lead solos, improvised over the progression, in key.
   - DRUMMER: plays the drums (see Slug Drums).
   Each player can be muted, set to FOLLOW (plays automatically) or FREE (the
   owner plays it), and can load any Slug engine.
2. **Slug synth engines** — seven engines that differ in HOW they make sound,
   not just in settings. Each shows two knobs:
   1. KEYS (FM tine electric piano / Rhodes): smooth, wavy, soulful, with
      modulation. Knobs: WAVE (tremolo, phaser and chorus swirl), TONE
      (mellow to bark).
   2. ANALOG (Moog-style subtractive, shared by bass and lead): Dr. Dre G-funk
      gliding bass, squelchy 70s funk bass, deep sub, whiny Moog lead with
      portamento. Knobs: GLIDE, SQUELCH.
   3. PAD (Juno-style): lush, wide chords with classic chorus shimmer. Knobs:
      WIDTH, GLOW.
   4. PLUCK (plucked-string model): Motown thumpy bass guitar and guitar.
      Knobs: THUMP, MUFFLE.
   5. SHINE (crisp digital workstation-style leads with the character of
      classic VST leads; original sounds only, no copied presets). Knobs:
      SPARKLE, AIR.
   6. TRIP (FM synth for trippy, weird sounds). Knobs: WEIRD, DRIFT.
   7. SIREN (risers, sweeps and transition effects). Knobs: RISE, SPEED.
   Build order: KEYS, ANALOG, PAD, PLUCK, SHINE, TRIP, SIREN. A few presets
   per engine, including a simple 8-BIT chip preset for video-game leads.
3. **Next Chord, Your Way** (signature feature): when the owner plays a
   chord, highlight the single best next chord, plus 3–4 alternatives tagged
   NOSTALGIC, EMOTIONAL, CALM or SURPRISE.
   - Nujabes style: minor 9ths, major 7ths, ii–V movement, looping progressions.
   - Tyler, the Creator style: maj7#11 chords, chromatic slides, borrowed chords.
   - Motown style: I–vi–IV–V, gospel passing chords.
   - Stay in key by default; SURPRISE may borrow from outside the key.
   - Keep this logic in its own well-commented module so it can be tuned.
4. **Expressive chord control** — joystick-style directions (mapped to the
   black keys) bend the current chord live: 7th, 9th, sus, inversion,
   borrowed chord. Instant and musical, with smooth voice leading. Include a
   16-step chord sequencer, strum, arp and lead modes, swing and humanise.
5. **Bass Latch** — one press switches the bass player on or off, like an
   Omnichord. When on, it follows the chords instantly. Turning follow off
   unlocks it so the owner can play their own bass. Follow modes: ROOT
   (default), SLASH (lowest note of the voicing), ROOT-FIFTH, OCTAVE, WALKING
   (passing notes into the next chord), PEDAL (holds the key's home note).
6. **Slug Drums**
   - Built-in kit: the free Slugz Delight sample platter (from `assets/drums`).
   - Private import: an easy import for the full Slugz Delight master crate.
     Pick a folder or many files at once, and Slug OS organises them into kits
     by folder and by sound type (kick, snare, hat, perc...), stored privately
     on the device.
   - A loops section for the owner's own loops, synced to the BPM.
   - Automatically generates boom bap patterns that fit the BPM or BPM range,
     and the patterns are editable.
7. **Slug Sampler** — a lazy-chop sampler like Koala Sampler, with a touch of
   Ableton, kept minimal.
   - Load sources: audio files, and VIDEO files (e.g. screen recordings),
     extracting the audio automatically. Also allow recording from the
     microphone. Do not build YouTube downloading.
   - Set start and end points on a waveform.
   - 16 pads to start (structure it so a second page, 32 pads, is easy to add).
   - CHOP BANK: one pad holds a full sample; open it and lazy chop it into its
     own set of chops, non-destructively (the original audio is never
     changed; chops are just markers). Chop by tapping in time or by
     auto-slicing into equal parts or at transients.
   - ONE-SHOT pads with attack, release, tone, reverse, pitch and stretch.
     Keep the gain and one-shot/gate/loop modes.
   - Several PITCH algorithms: classic resample like old samplers (pitch and
     speed change together), and pitch-shift that keeps the timing.
   - Several STRETCH/WARP algorithms: repitch, beats-style for drums,
     smooth-style for melodic material, with warp-to-BPM.
8. **SHELL SHOCK (XY Effects Pad)** — a big, minimal touch grid, like a DJ
   effects unit (a playful nod to the classic Kaoss Pad), in the retro snail
   style, with a shell / slime-trail cursor that follows the finger.
   - X axis = one effect, Y axis = another effect, layered together. One drag
     plays both.
   - Effect loader, no fixed presets: tap X or Y to open a scrolling list of
     every built-in effect; one tap to open, one tap to choose. Any effect on
     either axis, in any combination.
   - Effects (one "amount" per axis): filter, isolator (3-band kill EQ),
     looper/beat repeat, phaser, flanger, delay, tape stop, stutter, bit
     crusher, lo-fi (sample-rate + bit reduction + a little noise), vinyl
     wobble, tape saturation, reverb wash, chorus, ring mod, pitch dive,
     gate/trance chop, reverse-repeat.
   - TAPE STOP is expressive: position on its axis sets how fast the tape
     slows, from a slow wind-down to an instant stop; dragging back brings it
     smoothly back up to speed.
   - Easy to add new effects later.
   - Auto-named combos: every X/Y pairing gets a fun generated name in the
     Slugz/nature/retro-tech spirit; SAVE keeps it (renamable); saved combos
     are one-tap buttons; unlimited.
   - Effects snap back smoothly on release, with a HOLD option.
9. **Metronome** — a simple click set by BPM, easy to switch on and off.

### Next wishes (owner's list, Nov 2026, in batches)
1. Global controls & UI: key change transposes the whole project ✅; BPM
   button opens a small +/−/type pop-up ✅; styles renamed (BREATHE, FOCUS,
   STOMP) with more styles and more variation ✅.
2. Sequencing: one sequencer for the whole band (switch members inside it;
   opening SEQ from the BAND page opens the focused member); a simple,
   smooth FL-style piano roll; the Sampler sequenced like a band member;
   nudge, swing, percent quantize and grid quantize (1/8, 1/16, 1/32 ...);
   per-drum-track swing (kick, snare, hats each their own).
3. Sound: ADSR envelope for every band member; a Mixer page with lightweight
   effects and a simple EQ (3-band or parametric); drum effects optional; a
   DRUM BUS plugin (transients, saturation, air, soft clipper); LO-FI (with a
   control that cycles through eras of degradation) and a Distressor-style
   compressor.
4. Fixes: preset change cuts the old sound ✅; notes overdub while recording
   over chords ✅.
5. Sampler RESAMPLE: record what you play on pads (e.g. four hand-played hat
   hits, keeping the human groove) into a new sample on one pad, then
   sequence it.

### Later (leave room)
Saving full songs and progressions, an age/vinyl knob, recording and
resampling the whole app's output inside the app, the second sampler page.

### Working rules
- Explain each change in plain language. The owner is a music producer, not a
  programmer.
- Work in small steps, one feature at a time. After each step, give the owner
  the link to try it on their phone.
- Never leave it broken. If something fails, say what and why.
- Keep CLAUDE.md (the full brief plus notes), CHANGELOG.md and a simple
  README describing the controls.

---

## Part 2 — Working notes

### Where things are
| Folder | What lives there |
| --- | --- |
| `src/core/` | The music brain. Pure JavaScript: no DOM, no Web Audio. This is what ports to the FM-1. |
| `src/audio/` | Web Audio: engines (`engines/`), voice handling and the clock (`output.js`), master bus (`context.js`), drums, sampler playback, XY effects, sample DSP (stretch / pitch). |
| `src/storage/` | IndexedDB (private sounds, settings), file/video/mic import, the built-in kit loader. |
| `src/ui/` | Screens (`page*.js`), widgets, pixel sprites (`sprites.js`, all original art drawn from text bitmaps), and `app.js`, which wires everything. |
| `assets/drums/` | The FREE Slugz Delight kit only. Nothing private, ever. |
| `docs/porting.md` | FM-1 / Felucca notes: limits, what ports, module map. |
| `tests/` | `core.test.mjs` (node), `smoke.mjs` (Playwright in Chromium), fixtures generator. |

### How the parts talk
- `src/core/session.js` owns all musical state. It never makes sound itself;
  it calls an `out` object (`src/audio/output.js` in the browser, Felucca
  voice calls on the FM-1). Keep it that way.
- The step clock (16th notes, lookahead scheduler) lives in `output.js` and
  calls `session.step(n, time)`.
- The UI subscribes to the session (`session.subscribe`) and redraws.

### Conventions
- No build step, no npm dependencies. ES modules loaded directly. Fonts from
  Google Fonts (Silkscreen for labels, VT323 for chord names: Silkscreen has no
  lowercase, and chord names like "Dm9" or numerals like "iv" need it).
- Every new knob is 0..1 inside the code.
- Pixel art: add a text bitmap in `sprites.js`; never import outside art.
- Private audio stays in IndexedDB. Never write code that uploads it.
- Phone first: check iPhone 13 (390×844) and iPhone SE sizes; the BAND page
  should fit iPhone 13 without scrolling.

### Testing before every push
```
python3 -m http.server 8642 --bind 127.0.0.1 &
node --test tests/core.test.mjs
node tests/make-fixtures.mjs && node tests/smoke.mjs http://127.0.0.1:8642/
```
The smoke test boots the app, plays every engine on every player, runs the
band, imports a test kit, loads and chops a sample, checks saving, and fails
on any page error. It runs in Chromium only; iOS Safari must be checked on a
real phone.

### Decisions so far
- Chords hold after you let go (like a latch); REST (top black key) stops them.
- PLAY with nothing going starts the band on the home chord.
- Felucca really has 8 shared voices (`NVOICE 8`), not about 12; see porting doc.
- Stretch/pitch processing in the sampler is done offline in JavaScript
  (rendered once per setting, then cached), because Web Audio has no built-in
  time-stretch. Long samples take a moment to render.
- SHELL SHOCK (the XY pad) sits on the master bus, so it affects the band,
  drums, sampler and loops together. The metronome click bypasses it.
- Adding a SHELL SHOCK effect = one entry in `src/core/xy.js` (`SHELL_EFFECTS`:
  label, hint, name words) + one maker in `src/audio/xyfx.js` (`MAKERS`). A
  test checks every listed effect has a maker. LO-FI, PITCH DIVE and REVERSE
  REPEAT run in an AudioWorklet (`src/audio/fxWorklet.js`) with simpler
  fallbacks if the browser lacks it.
- Combo names only use generic words (no brand or product names).

### Recording, capture and history (notes)
- `core/trail.js` = Chord History; `core/capture.js` = capture + part helpers.
  The session logs chords and strum-plate notes in beats at all times
  (segments restart when the band starts/stops). Parts live in
  `state.parts` (melody, bass, soloist), positions in beats inside
  `partLoopBeats()` (the chord sequencer's loop, else 16 beats).
- One UNDO stack holds snapshots of the sequencer + parts for CAPTURE, CLEAR
  and each recorded pass (one pass = one loop with REC on).
- A player with a part plays the part instead of improvising.
- REPLACE only starts wiping once you play; switching mode starts a new "take".

### Styles, key and fixes (notes)
- Style ids stay `nujabes`, `tyler`, `motown` (saved projects) with new labels
  BREATHE / FOCUS / STOMP; new ids `cruise`, `bloom`, `drift`. A style = a
  Next Chord table (`nextChord.js`), a colour rule (`colorChord`) and a groove
  (`STYLE_FEEL` in `players.js`: comps/strums/bass + `form`).
- `core/transpose.js` maps chords and notes between keys; `session.setKey`
  applies it to everything key-related.
- HARMONY has a part too (notes on top of the chords); drum hits recorded
  live go into the drum pattern; UNDO snapshots include the drum pattern.

### Status
Built: features 1–9 (see CHANGELOG.md). Not built yet: the "Later" list
(full song saving, age/vinyl knob, in-app recording/resampling, sampler page B).
Known rough edges: phone landscape and iPhone SE need some scrolling; folder
picking may not work on iPhone (multi-select files does); very long samples
take a moment to stretch the first time.
