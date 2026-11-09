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

1. Plan the form and chapter timing below; export a tiny phrase before writing a long score.
2. Run `npx joplo check`. Each referenced score prints duration, note count for each part, and every marker's time. Match those numbers to the plan. Missing marker is an error (`MUSIC_MARKER_MISSING`); no Alda gives a warning and the other checks continue. Check parses locally; it does not download a sound bank or render audio.
3. Build, inspect `MEDIA_ASSET` bytes/duration and warnings, then play with sound enabled. Verify pause, resume, jump, speed, narration ducking, a complete ending and a complete loop. Screenshots remain silent. Video export records the generic media mix.
4. Rendering/check success proves signal plumbing, not good composition. Listen in the actual player. If no listening was possible, explicitly report **未经人耳验证** and measurement numbers.

Put play on the first step and stop only at the real ending. A scenario that does not continue another starts silent. Playing the same score again keeps it going; playing a different score with fadeMs crossfades (the old one fades out under the new one, no silence). volume is 0–1; fadeMs is 0–30000. Music is independent of content language. Use hold(seconds) when exact musical pacing matters: step anchors advance by the previous step's hold, default 3000ms. During playback the track runs continuously on the engine clock; only a jump, reset or a non-continuing chapter re-aligns it to that anchor.

For a historical or multi-theme piece, keep original motifs in one score map, reuse a short melodic motif, and change its instrument at the visual transition. Use distinct named scores and instrument programs rather than copyrighted startup recordings. Chapter seams: chain chapters with flow({ from }) — a from chapter starts with the music its previous chapter ended with, and sequential playback keeps it playing across the seam. Start the next chapter's score with fadeMs 2000–2600 on the beat just before the visual change (a J-cut), not with stop + play; leave space between notes for narration. Direct navigation to an after-action entry also resolves that step's media snapshot.

`from` is a marker name without `%`, resolved by Alda during local compilation. Only a numeric offset enters IR; jump/deep link/screenshot state uses that same offset plus the engine anchor. A non-continuing scenario starts silent. Same-score play continues; a different score with fadeMs crossfades; flow({ from }) inherits music. An explicit marker selects a numeric seek. Set `loop: true` only for a phrase designed to repeat. Loop repeats the full score; from only selects its initial seek, not a loop region. `volume` is 0–1, `fadeMs` 0–30000. Put play alongside a chapter's visual change. Stop with done, allowing an ending hold for the fade; a stop at the instant playback ends cannot create extra playback time. Anchors advance by the preceding hold (default 3000ms); use explicit `hold(seconds)` to align chapters. Narration or interaction waits do not redefine later score anchors.

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

One long score with a marker per chapter gives consistent instrumentation, harmonic planning and precise seeking via `music.play('film', { from: 'chapter' })`. Do not issue another play during ordinary uninterrupted music unless a restart is intended. A flow({ from }) chapter inherits the previous ending, including its running score; ordinary same-score play continues it. Only an explicit marker play repositions that track and restarts its fade, including a marker at 0ms. The decoded PCM remains reusable.

Separate named pieces suit contrasting eras or a chapter that changes length independently, and can reduce scoped publication size. Playing a different score with fadeMs crossfades through the generic host: old and new drivers coexist, including when the old slot moves to an outgoing-resource key. The host owns volume, fade and narration ducking exactly once; do not add another player or fade inside this plugin. Both overlapping PCM buffers count toward the 32MiB budget until the old driver leaves; shorten or split scores if their sum exceeds it. Recheck markers after changing any earlier bars in a long piece.

## Rendering, cache and recovery

Pipeline: Alda 2.4.8 → temporary MIDI → SpessaSynth Core 4.4.9 with FluidR3Mono GM 2.312 → 44.1kHz stereo PCM → **MP3 96 kbps stereo at 32kHz**. The deterministic 24-tap/256-phase resampler, fixed LAME encoder (@breezystack/lamejs 1.2.7) and verification decoder (mpg123-decoder 1.0.3) run in Node; no ffmpeg or FluidSynth installation is required. FLAC (libflacjs 5.6.0) is only an author-side master in `.joplo/music-masters`; it never enters the site, and there is no lossless publication switch. First rendering downloads the pinned, SHA-256-verified ~14.5MB SF3 and license to `JOPLO_HOME/soundfonts/<hash>/` (default ~/.joplo). The bank stays local. Published `credits.txt` and `music-LICENSE.txt` preserve bank attribution and full license even when Alda inspection is unavailable; missing artifact attribution blocks publication.

To preinstall on a connected author machine, run this **from the project**:

```sh
node --input-type=module -e "import('@joplo-app/plugin-alda/local').then(m=>m.installSoundfont())"
```

For an offline author machine, copy that verified soundfonts/<hash>/ directory (including LICENSE.md) into its JOPLO_HOME/plugins/alda/cache/ (the plugin's private cache; local compilers never receive JOPLO_HOME itself); an absent/corrupt cache fails with the command above. Do not replace files with an unverified bank. If a future upstream decoder range resolves a second version, rendering fails explicitly: pin spessasynth_core’s stb-vorbis dependency to 0.0.7 with your package manager overrides and reinstall. A SoundFont or renderer/encoder upgrade invalidates the cache; the host keys on exact compiler code/version and input, which include bank hash, renderer, SF3 decoder, FLAC/master encoder, MP3 format/bitrate/resampling/context/trim/seam parameters and loop mode. Cache and temporary scores/MIDI are author-only, under .joplo/resources; do not commit them. Only audio bytes, numeric playback-region metadata and media snapshots ship, with attribution text. Build/scope includes only referenced audio.

MP3 is about 0.72 MB/min before base64. Build reports each cue's bytes/duration, all raw audio, embedded base64/data-URI bytes and the complete site. It warns above 0.75 MB/min or 2MiB/cue, and at 18MiB/site against the documented Free 20MiB single-upload budget. Short loops can warn because of fixed context/probe overhead. Base64 adds about one third: measure the built site before sharing. Lowering track volume does not reduce bytes; shorten/split music or narrow the share scope.

Loop period comes from the longest Alda part (including rests). Release/reverb folds into the next cycle, then MP3 receives periodic guards. The build decodes its own MP3 and measures actual delay by correlation, storing only numeric `cycleFrames/sourceSampleRate/contentStartFrame/contentFrames/decodedFrames/encoderDelayFrames/paddingFrames/channels` in `project.mediaInfo`. The browser converts these using the native buffer sample rate, smooths the final decoded 3ms boundary, and uses exact `loopStart/loopEnd`; a marker starts at loopStart + its numeric offset. No calibration probe/guard is played. Unexpected native decoder trimming fails explicitly. Native Chromium 44.1/48kHz is tested; Safari/iOS and Firefox remain unverified in this implementation. Musical harmony/rhythm still needs to repeat naturally.

The renderer applies one whole-piece RMS gain to -20dBFS over the musical duration, capped at -1dBFS sample peak; this is not LUFS mastering. Non-loop music retains release/reverb until 250ms below -80dB before gain calibration, at most 12s with a guard fade; playback metadata excludes codec padding, not the musical tail.

The player bounds encoded cache to 4MiB/32 entries (2 loads) and decoded PCM to 32MiB/32 entries (1 decode), using actual channels × frames × 4 bytes and leased LRU. Current and first capture-prefetched cues stay pinned; leaving releases them, inflight work deduplicates, failures can retry, and destroy clears caches/recordings. Long scores can exceed PCM budget despite tiny MP3 files (48kHz stereo float32 is about 23MB/min); shorten or split them instead of assuming compressed bytes are the memory cost. A cue above budget fails before decoding when numeric metadata is available. Capture warms only its first cue; later cues load lazily and can start late under load. Chain recording collects cues from every following chapter in playback order, including music that starts after a silent opening.

Video BGM uses the same playback engine, including `joplo render --video --chain`. Film strips (`--film`) skip audio capture and decoding so their virtual clock does not wait for a real audio device. A continuously silent capture input keeps Opus PTS intact; an end-of-recording color/pulse calibration reads actual video/audio PTS, centers the video-frame interval, then trims the calibration section. It does not use the wall clock before page creation. This end calibration does not sample-lock a whole long recording: verify independent early/late picture-and-audio events for a chain and report the measured offset; short-clip results do not prove long-chain synchronization. Browser Web Speech narration still cannot be captured. **Known issue RM5:** failed audio recording or muxing rejects the export and currently does not retain a silent-video fallback; fix the error and re-export.

If silent, check the sound switch, click Play (gesture required), and read located local-resource warnings. Missing Alda, syntax errors, download/hash failures, timeout (up to 180s for render) or size limit leave the rest playable. Fix the cause and retry build; for a failed playback slot, switch scenarios or toggle sound off/on or reload before retrying. Published sites cannot regenerate audio. A successful check without Alda is not a rendering pass. If Alda reports a failed/unreachable player or export timeout, inspect its local processes with `alda ps` and run `alda doctor`, repair that environment, then retry. A build can preserve the rest while omitting failed music: verify the expected cue count and MEDIA_ASSET records before calling audio validation successful.

## Measure when listening is unavailable

ffmpeg is an **optional measurement tool**, never a Joplo rendering dependency. Extract each data:audio/mpeg;base64 payload and its project.mediaInfo entry from a local build. Measure only the playback region (start = contentStartFrame/sourceSampleRate; duration = contentFrames/sourceSampleRate), excluding the calibration probe and guards:

```sh
ffmpeg -hide_banner -i /tmp/music.mp3 -af "atrim=start=<start-seconds>:duration=<content-seconds>,asetpts=PTS-STARTPTS,ebur128=peak=true" -f null -
```

Report integrated LUFS, true peak dBFS, duration and bytes, plus whether the measurement is before/after track volume and narration ducking. Compare music and narration over the **same speech interval**; as a starting point, aim for music roughly 12–20dB below speech, then listen. Gain .4 is about -8dB; narration ducking .25 adds about -12dB. Do not claim the final mix level from the unattenuated bank output alone. For a loop, also measure decoded frame count and sample discontinuity across the join, not just file duration. Write **未经人耳验证** whenever human listening did not occur.

General engine contracts: npx joplo skill plugins


## Installed references

Engine contracts: [plugins](../joplo/topics/plugins.md).
<!-- joplo-skill 0.3.0 sha256:8719f2de45b6bd1ed120bda760fe3d71297e6ef19bf0fff3a2bfcdca7e8a25f2 -->
