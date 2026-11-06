# Porting Slug OS to the M-VAVE FM-1 (Phase 2)

Notes for later; nothing here is built yet. The FM-1 version is a slimmed-down
Slug OS built **on** [Felucca](https://github.com/hugelton/Felucca)
(GPL-3.0-only) as the platform. We do not fork Sloop or any other firmware;
the interface, sounds and features stay Slug OS's own.

## FM-1 limits

| Resource | Plan's estimate | What Felucca's source shows (first read, Nov 2026) |
| --- | --- | --- |
| Voices | about 12 | `NVOICE 8`: one budget shared by all 4 parts |
| Flash | about 1 MB | firmware + settings/presets/projects in flash (`FELUCCA_FLASH`) |
| RAM | about 512 KB | (to measure) |
| Maths | no FPU | Felucca does fixed-point audio (`docs/signed-audio-arithmetic.md`) |
| Audio | 44.1 kHz | 128-frame I2S half buffers, rendering in the audio ISR |
| Screen | small colour screen | ST7789 240×240 (`lcd.c`, `gfx.c`) |
| Controls | 27 keys, 7 knobs, a few buttons | 27 keys; 7 **encoders** (SELECT, ALGORITHM, PRESETS, K1–K4); 14 buttons (FX SCL ENV LFO EDIT GLO HOME SAVE ARP SEQ PLAY REC OCT- OCT+) |
| Chords | | `chord.c` caps chords at `CHORD_MAX 4`; Slug's `MAX_CHORD_NOTES` is already 4 |

The browser version ignores these limits on purpose. Everything below says
what fits and what doesn't.

## What ports, what's too heavy

| Feature | Port? | Notes |
| --- | --- | --- |
| Chord engine, bends, voice leading (`core/chord.js`) | ✅ | Pure integer maths; tables in flash |
| Next Chord (`core/nextChord.js`) | ✅ | Compile the text tables into `const` structs with a Node build script, so they stay editable in JS |
| Bass Latch, all 6 follow modes (`core/bass.js`) | ✅ | Tiny |
| Chord sequencer, 16 steps (`core/chordSeq.js`) | ✅ | 16 chord structs |
| HARMONY / BASS players (`core/players.js`) | ✅ | Rhythm tables + note choice |
| MELODY / SOLOIST players | ⚠️ | Logic is light, but each needs a voice. With 8 voices: chords 4 + bass 1 + melody 1 + soloist 1 + 1 spare. Melody and soloist may have to share one voice |
| DRUMMER + boom bap generator (`core/drums.js`) | ⚠️ | Patterns are tiny. Drum *sounds* need samples or synthesized drums: a small synthesized kit fits; the full sample platter probably not (flash). Felucca already has a DRUM engine to build on |
| Swing, humanise | ✅ | |
| KEYS (2-op FM + bell) | ✅ | Classic fixed-point FM; the WAVE swirl (phaser + chorus) costs CPU, keep tremolo + one chorus |
| ANALOG (saws + 24 dB filter, glide) | ✅ | One SVF or ladder per voice; mono only for bass/lead |
| PAD (detuned saws + stereo chorus) | ⚠️ | 3–4 oscillators per voice × 4 voices is heavy; use 2 oscillators and one shared chorus |
| PLUCK (Karplus-Strong) | ✅ | A delay line per voice: cheap in CPU, needs RAM per voice (~800 bytes at 55 Hz) |
| SHINE (wavetables, unison) | ⚠️ | Tables in flash are fine; drop unison to 1–2 |
| TRIP (3-op feedback FM, drift) | ✅ | Fixed-point FM with feedback is natural on a DSP-style loop |
| SIREN (pitch sweeps + noise) | ✅ | Cheap |
| Reverb, tempo delay, tape wobble | ⚠️ | Use Felucca's `fx.c` reverb/delay rather than convolution |
| **Sampler, chop bank, video/mic import** | ❌ | Browser-only. Needs large RAM for audio, file decoding (mp4/mov) and a file system |
| **Private kit import, IndexedDB, loops** | ❌ | Browser-only. On the device, at most a few small kits stored in flash |
| Sampler pitch / stretch (WSOLA, beats) | ❌ | Offline rendering of whole samples; browser-only with the sampler |
| XY Effects Pad | ⚠️ | No touch screen on the FM-1. Could map X/Y to two encoders; filter, isolator, delay, stutter and crusher are cheap; beat repeat and tape stop need a RAM buffer (~2 s ≈ 350 KB at 44.1 kHz stereo 16-bit: too much, use mono or shorter) |
| Metronome | ✅ | Trivial |
| Web MIDI / computer keyboard | n/a | The hardware keys and TRS/USB MIDI replace them |

## Module map

The browser code keeps the music brain separate from the UI and Web Audio.
Each `src/core` file becomes one C module.

| Browser module | FM-1 home |
| --- | --- |
| `core/theory.js`, `core/chord.js` | `slug_chord.c`: chord struct `{root, third, fifth, seventh, ext_mask, bass}` |
| `core/nextChord.js` | `slug_next.c` + generated `slug_next_tables.h` |
| `core/bass.js` | `slug_bass.c` |
| `core/players.js` | `slug_band.c`: one function per player, called once per 16th from Felucca's transport (`midi_clock.c`), ending in `trk_note_on/off` |
| `core/drums.js` | `slug_drums.c` (patterns) + Felucca's DRUM engine for the sound |
| `core/chordSeq.js` | `slug_seq.c` |
| `core/engines.js` | presets for new `engine_t`s in Felucca-Engines style: `slug_keys`, `slug_analog`, `slug_pad`, `slug_pluck`, `slug_shine`, `slug_trip`, `slug_siren`. The two knobs per engine map to two encoders |
| `core/controls.js` | `slug_controls.c`: maps Felucca's panel ids onto the Slug layout |
| `core/session.js` | `slug_session.c`: the `out` interface becomes direct calls into Felucca's voice/part API |
| `core/sampler.js`, `core/chops.js`, `core/kits.js` | not ported (browser only) |
| `src/audio/*`, `src/storage/*`, `src/ui/*` | replaced by Felucca's audio path, flash storage and a Slug screen drawn with `gfx.c` at 240×240 |

## Controls on the hardware

| Slug control | FM-1 |
| --- | --- |
| Low white keys: chords I–vii | keys C–B, low octave |
| Low black keys: ↑7TH ↗9TH →SUS ↓INV ←BORROW | black keys, low octave |
| High white keys: strum plate (plays the focused player) | keys C–D, upper section |
| High black keys: NEXT, NOSTALGIC, EMOTIONAL, CALM, SURPRISE, REST | black keys, upper section |
| PLAY | PLAY |
| BASS LATCH | ARP |
| KEY | SCL |
| REC (chord sequencer) | REC |
| PLAYER (focus) | OCT- / OCT+, or SELECT push |
| Knobs TEMPO SWING HUMAN STYLE A B LEVEL | the 7 encoders |
| BAND / SEQ / DRUMS pages | HOME / SEQ / FX buttons |

## Licence notes

Firmware built on Felucca is GPL-3.0-only. Felucca-Engines is MIT and
felucca-bsp is MPL-2.0. The Slugz Delight samples are yours and keep your own
licence; don't put private samples in the firmware repo either.
