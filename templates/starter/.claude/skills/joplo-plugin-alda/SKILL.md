---
name: joplo-plugin-alda
description: "Use the Alda background music plugin in Joplo; read its entry, component recipes and recovery rules for this project."
---

# Joplo plugin alda: Alda background music 0.3.0

Author package: @joplo-app/plugin-alda
# Alda background music: compose, inspect, render

Use original, restrained instrumental music to support an explanation. Install @joplo-app/plugin-alda at the same version as Joplo and explicitly enable it. The author machine needs **Alda 2.4.8** on PATH; run `alda version` and `alda instruments`. Viewers need a browser, with no Alda, SoundFont, or network download.

## Start and verify

Keep named source strings in a project-owned music.ts:

```ts
// music.ts
export const scores = { film: `
piano: (tempo! 80) (vol 65) o3
%opening c1/e1/g1 | %chapter f1/a1/>c1 | < c1/e1/g1 |
` };
// joplo.config.ts
import { config } from '@joplo-app/kit';
import alda from '@joplo-app/plugin-alda';
import { scores } from './music';
export default config({ name: 'Film', plugins: [alda(scores)] });
// In an existing feature option:
import { music } from '@joplo-app/plugin-alda';
// .system('Open', music.play('film', { from: 'opening', fadeMs: 800, volume: .4 }))
// .system('Next chapter', music.play('film', { from: 'chapter', fadeMs: 500 }))
// .system('Finish', music.stop({ fadeMs: 1200 }), done('Complete'))
```

Put play on the first step and stop only at the real ending. A scenario that does not continue another starts silent. Playing the same score again keeps it going; playing a different score with fadeMs crossfades (the old one fades out under the new one, no silence). volume is 0–1; fadeMs is 0–30000. Music is independent of content language. Use hold(seconds) when exact musical pacing matters: step anchors advance by the previous step's hold, default 3000ms. During playback the track runs continuously on the engine clock; only a jump, reset or a non-continuing chapter re-aligns it to that anchor.

For a historical or multi-theme piece, keep original motifs in one score map, reuse a short melodic motif, and change its instrument at the visual transition. Use distinct named scores and instrument programs rather than copyrighted startup recordings. Chapter seams: chain chapters with flow({ from }) — a from chapter starts with the music its previous chapter ended with, and sequential playback keeps it playing across the seam. Start the next chapter's score with fadeMs 2000–2600 on the beat just before the visual change (a J-cut), not with stop + play; leave space between notes for narration. Direct navigation to an after-action entry also resolves that step's media snapshot.

## Plan the form before notes

Write a table: **section / bars / chord in each bar / chapter duration / marker**. For fixed meter and BPM:

`seconds = bars × beats per bar × 60 / BPM`

At 80 BPM, four bars of 4/4 take 12 seconds. A 24-second chapter needs eight such bars; a 10-second chapter needs a different form, tempo, or explicit silence. Do not stretch a two-bar loop over a minute and assume a fade hides the repetition. Let harmony change at meaningful narrative turns; use the printed marker times to catch a missing bar or a voice that runs ahead. Count rests too. For changing tempo/meter, calculate section by section and let Alda's inspected times be the final authority.

For each section and instrument, define one variable, beginning with an explicit octave and duration; write `|` at every bar. Put a `%section` marker in the **first part only**, then `@section` on other parts where needed. All parts must occupy the same bar count. Bar lines aid counting; they do not fix mismatched durations. End with a held consonant chord and room for its release instead of stopping on the last attack.

```alda
openKeys = o3 c1/e1/g1 | f1/a1/>c1 |
openBass = o2 c1 | f1 |
endKeys = o3 c1~1/e1~1/g1~1 |
endBass = o2 c1~1 |
piano: (tempo! 80) (vol 60) %opening openKeys %ending endKeys
midi-acoustic-bass: (vol 55) @opening openBass @ending endBass
```

Use `alda parse -f music.alda -o data` to inspect a standalone draft. Do not eyeball octave state or assume variables reset it. Test new instrument names with `alda instruments`: `guitar` means nylon-string guitar, not a universal electric-guitar sound; names such as `midi-electric-piano-1` and `midi-synth-pad-new-age` are explicit.

## Arrange around the narrator

**The narration is the lead instrument.** Under speech, use a bass pulse, a few midrange chord tones and a quiet pad; leave melodic hooks for the opening, transitions and speech-free gaps. Avoid continuous arpeggios competing with syllables. Start with score `(vol 60)`–`(vol 75)` and track volume .3–.5, then measure/listen rather than lowering every gain stage blindly. The player ducks music to 25% during narration.

Separate registers: bass around o1–o2, accompaniment o3–o4 with small voice-leading movements, pad around o4 in long notes. These are starting points, not rules for every instrument. Keep the narrator's midrange clear. Change one dimension between sections (register, rhythm, instrument, harmonic density), then let the final section settle. Do not run every instrument at the same velocity throughout.

## Restrained GM percussion

Use `midi-percussion`, which exports on the GM percussion channel. Pitch chooses the drum, not a melodic instrument program. Useful mappings (Alda o4 c = MIDI 60):

| Drum | MIDI note | Alda pitch |
| --- | --- | --- |
| Bass drum | 36 | o2 c |
| Side stick | 37 | o2 c+ |
| Acoustic snare | 38 | o2 d |
| Hand clap | 39 | o2 d+ |
| Closed hi-hat | 42 | o2 f+ |
| Pedal hi-hat | 44 | o2 g+ |
| Low tom | 45 | o2 a |
| Open hi-hat | 46 | o2 a+ |
| Crash | 49 | o3 c+ |
| Ride | 51 | o3 d+ |

Define **one bar per variable** and put a drum-grid comment above it. Every grid cell is a note or a rest, with explicit durations. Repeat the bar; add a small fill only at the end of a four/eight-bar phrase, not every bar. These single-line 4/4 patterns deliberately avoid dense overlap:

```alda
# 1 & 2 & 3 & 4 &: K . H . S . H .  (slow documentary)
docBeat = o2 c8 r8 f+8 r8 c+8 r8 f+8 r8 |
# 1 & 2 & 3 & 4 &: K H . H S H . H  (quiet forward motion)
walkBeat = o2 c8 f+8 r8 f+8 c+8 f+8 r8 f+8 |
# 1 & 2 & 3 & 4 &: K . . H . . S .  (space beneath speech)
spaceBeat = o2 c8 r8 r8 f+8 r8 r8 c+8 r8 |
midi-percussion: (tempo! 80) (vol 40) docBeat*4 walkBeat*4 spaceBeat*4
```

Here S is a gentle side stick (37); change c+ to d for a stronger snare (38). Layer kick/snare/hats only if needed: enclose voices in `[V1: ... V2: ... V0:]`, reset octave/duration/volume in each voice, and give each exactly the same bar count. Put a cymbal in a separate part/voice at `@section` instead of shifting the shared grid. A crash every bar usually overwhelms narration. The GM bank supplies real drum samples; a passing MIDI export alone does not prove your selected pitches are drums.

## Common Alda failures

- Octave drift: crossing B→C needs `>` when intended; repeated variables retain ending octave. Begin each variable with `oN`, write explicit jumps and restore the next section's register.
- Sticky duration: a run of eighth notes changes subsequent defaults. Write `c4`/`r4` explicitly when returning to quarters; check every bar's beat sum.
- Tempo scope: `(tempo 80)` changes the selected part; use `(tempo! 80)` for a global tempo. Otherwise parts and markers drift apart.
- Voice leakage: `V0:` rejoins voices but octave, duration and volume may have changed. Keep voice-containing variables bracketed and explicitly reset state after them.
- Variable names need two initial letters; avoid single-letter/pitch-like names and punctuation. Use descriptive names such as `openKeys`, not `c1`.
- Instrument aliases are not universal; verify exact names. Unknown instruments and malformed ties/chords surface in local parse/export diagnostics.
- `%marker` declares a time; `@marker` jumps to it. Declare once in the first part and inspect actual numeric times; don't duplicate marker declarations in every part.
- A terminal rest contributes to the musical cycle. For loops, count intended bars including rests; don't append an arbitrary silence to hide a bad cadence.

## One long score or separate chapter pieces

One long score with a marker per chapter gives consistent instrumentation, harmonic planning and precise seeking via `music.play('film', { from: 'chapter' })`. Do not issue another play during ordinary uninterrupted music unless a restart is intended. Current scenarios still require an explicit play; cross-scenario inheritance/crossfade is a host capability and must be checked against the installed engine version.

Separate named pieces suit contrasting eras or a chapter that changes length independently, and can reduce scoped publication size. Replacing a track is currently an immediate replacement with an optional fade-in, **not a crossfade**. If the installed host later supports crossfades, use its documented API; do not build a second player inside this plugin. Recheck markers after changing any earlier bars in a long piece.

## Rendering, cache and recovery

Pipeline: Alda 2.4.8 → temporary MIDI → SpessaSynth Core 4.4.9 with FluidR3Mono GM 2.312 → 44.1kHz stereo 16-bit **FLAC** (libflacjs 5.6.0). No ffmpeg or FluidSynth installation is required. The renderer is Apache-2.0; the bank and libflacjs wrapper are MIT, libFLAC BSD. First rendering downloads the pinned, SHA-256-verified ~14.5MB SF3 and license to `JOPLO_HOME/soundfonts/<hash>/` (JOPLO_HOME defaults to ~/.joplo). The bank is not in npm or the site. Published `credits.txt` identifies its source and license.

To preinstall on a connected author machine, run this **from the project**:

```sh
node --input-type=module -e "import('@joplo-app/plugin-alda/local').then(m=>m.installSoundfont())"
```

For an offline author machine, copy that verified soundfonts/<hash>/ directory (including LICENSE.md) into its JOPLO_HOME; an absent/corrupt cache fails with the command above. Do not replace files with an unverified bank. If a future upstream decoder range resolves a second version, rendering fails explicitly: pin spessasynth_core’s stb-vorbis dependency to 0.0.7 with your package manager overrides and reinstall. A SoundFont or renderer/encoder upgrade invalidates the cache; the host keys on exact compiler code/version and input, which include bank hash, renderer, SF3 decoder, FLAC encoder and loop mode. Cache and temporary scores/MIDI are author-only, under .joplo/resources; do not commit them. Only audio bytes and numeric media snapshots ship, with attribution text. Build/scope includes only referenced audio.

FLAC preserves exact PCM sample count without encoder delay/padding and works in current Chrome, Safari (including iOS) and Firefox. It costs more space than MP3: builds report actual bytes and duration, warning above 10MiB/track or 6MiB/min. The renderer normalizes whole-piece RMS to -20dBFS over the musical duration, with a -1dBFS sample-peak ceiling; this preserves relative dynamics inside the piece, but whole-piece loudness is controlled with track volume. This is RMS calibration, not a LUFS mastering claim. Non-looping rendering retains release/reverb until 250ms below -80dB before gain calibration, bounded at 12 seconds with a guard fade; looping rendering folds the tail into the start of the exact musical cycle and smooths a 3ms boundary. A loop must still have a musically repeatable harmony/rhythm.

If silent, check the sound switch, click Play (gesture required), and read located local-resource warnings. Missing Alda, syntax errors, download/hash failures, timeout (up to 180s for render) or size limit leave the rest playable. Fix the cause and retry build; for a failed playback slot, switch scenarios or toggle sound off/on or reload before retrying. Published sites cannot regenerate audio. A successful check without Alda is not a rendering pass.

## Measure when listening is unavailable

ffmpeg is an **optional measurement tool**, never a Joplo rendering dependency. Extract each data:audio/flac;base64 payload from a local build into a temporary .flac file, then run:

```sh
ffmpeg -hide_banner -i /tmp/music.flac -af ebur128=peak=true -f null -
```

Report integrated LUFS, true peak dBFS, duration and bytes, plus whether the measurement is before/after track volume and narration ducking. Compare music and narration over the **same speech interval**; as a starting point, aim for music roughly 12–20dB below speech, then listen. Gain .4 is about -8dB; narration ducking .25 adds about -12dB. Do not claim the final mix level from the unattenuated bank output alone. For a loop, also measure decoded frame count and sample discontinuity across the join, not just file duration. Write **未经人耳验证** whenever human listening did not occur.

General engine contracts: npx joplo skill plugins


## Installed references

Engine contracts: [plugins](../joplo/topics/plugins.md).
<!-- joplo-skill 0.3.0 sha256:6b7c1c4244d696ebf0a1b3c02a67d2cd9eccd749aca38a311cf82b1595954986 -->
