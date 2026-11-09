---
name: joplo-plugin-alda
description: "Use the Alda background music plugin in Joplo; read its entry, component recipes and recovery rules for this project."
---

# Joplo plugin alda: Alda background music 0.3.0

Author package: @joplo-app/plugin-alda
# Alda background music

Use quiet instrumental music to support a demo's pacing. Install @joplo-app/plugin-alda at the same version as Joplo; it is optional and never enabled by default. The author machine needs Alda 2.4.8 on PATH. Viewers need only a browser.

Keep named scores as inline strings in a project-owned music.ts:

```ts
// music.ts
export const scores = { theme: 'piano: (tempo 72) (vol 70) o4 c2 e2 g2 e2' };
// joplo.config.ts
import { config } from '@joplo-app/kit';
import alda from '@joplo-app/plugin-alda';
import { scores } from './music';
export default config({ name: 'Demo', plugins: [alda(scores)] });
// features/<feature>/options/<option>.tsx
import { music } from '@joplo-app/plugin-alda';
// Add to existing steps:
// .system('Begin', music.play('theme', { fadeMs: 800, loop: true, volume: .45 }))
// .system('Finish', music.stop({ fadeMs: 1000 }), done('Complete'))
```

Put play on the first step and stop only at the real ending. A scenario that does not continue another starts silent. Playing the same score again keeps it going; playing a different score with fadeMs crossfades (the old one fades out under the new one, no silence). volume is 0–1; fadeMs is 0–30000. Music is independent of content language. Use hold(seconds) when exact musical pacing matters: step anchors advance by the previous step's hold, default 3000ms. During playback the track runs continuously on the engine clock; only a jump, reset or a non-continuing chapter re-aligns it to that anchor.

For a historical or multi-theme piece, keep original motifs in one score map, reuse a short melodic motif, and change its instrument at the visual transition. Use distinct named scores and instrument programs rather than copyrighted startup recordings. Chapter seams: chain chapters with flow({ from }) — a from chapter starts with the music its previous chapter ended with, and sequential playback keeps it playing across the seam. Start the next chapter's score with fadeMs 2000–2600 on the beat just before the visual change (a J-cut), not with stop + play; leave space between notes for narration. Direct navigation to an after-action entry also resolves that step's media snapshot.

Verify instrument names with alda instruments on the author machine. Familiar aliases such as piano are not a rule for every instrument: full names include midi-synth-pad-new-age and midi-electric-piano-1. Export a new score before a long build, and inspect build warnings; a successful joplo check does not prove Alda accepted an instrument or produced audible bytes.

The board compiles on first playback demand. Build/share compiles only referenced resources after scope filtering. Source text, local entry and paths stay on the author machine; only MIDI bytes and browser synthesis ship. Unchanged compiler/input reuses .joplo/resources; compiler version/code changes invalidate the cache. Do not commit the cache or MIDI.

Verify with joplo check, then build and click Play with sound enabled. Sound requires a viewer gesture; thumbnails/screenshots stay silent. Pause, resume, jump and speed use the engine clock; narration ducks music to 25%. The offline synthesizer approximates instruments without downloading soundfonts. Piano uses a struck attack, decaying amplitude and darkening harmonics; organ sustains, while strings/brass use slower attacks. Envelope and brightness are sampled at the note's score-time age, so pausing/seeking into a held note does not strike it again. It supports standard MIDI format 0/1 with PPQN tempo, note, program and sustain events, not SMPTE or format 2.

If silent, check the sound switch and local warnings at the play step's source file:line. Missing Alda, score syntax, timeout (30s) or output over 8MiB produces a warning and leaves the rest of the demo playable. Fix the score/tool and retry build. For playback, first switch scenarios, toggle sound off/on, or reload the page, then play: a failed media slot currently survives ordinary pause/play and may not retry by itself. Alda errors include the score line; the diagnostic anchor is the author play step. Named score typos also warn. Published sites cannot regenerate missing music: rebuild on the author machine.

Start around score (vol 70) and track volume .3–.5, then listen in the actual player. Score velocity, synthesis gain, track volume and narration ducking multiply: reducing all of them at once can make music effectively inaudible even when AudioContext is running. Check the final output after the track gain, both during and between narration; an upstream oscillator alone does not prove audible output. The synthesizer keeps per-note gain audible and uses a mix compressor for chord headroom. Use a sparse phrase, loop it, and fade out with the ending. Leave room for narration rather than increasing music volume. Video export does not mix the media track in this version; use interactive build/share for sound.

General engine contracts: npx joplo skill plugins


## Installed references

Engine contracts: [plugins](../joplo/topics/plugins.md).
<!-- joplo-skill 0.3.0 sha256:6b7c1c4244d696ebf0a1b3c02a67d2cd9eccd749aca38a311cf82b1595954986 -->
