---
name: joplo-plugin-alda
description: "Use the Alda background music plugin in Joplo; read its entry, component recipes and recovery rules for this project."
---

# Joplo plugin alda: Alda background music 0.2.18

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

Put play on the first step, stop alongside done. Each scenario starts silent and owns its own track. A later play replaces the track and restarts at zero. volume is 0–1; fadeMs is 0–30000. Music is independent of content language. Use hold(seconds) when exact musical pacing matters: step anchors advance by the previous step's hold, default 3000ms. On each step/jump the track aligns to that anchor; variable narration or interaction waits do not redefine the score timeline.

The board compiles on first playback demand. Build/share compiles only referenced resources after scope filtering. Source text, local entry and paths stay on the author machine; only MIDI bytes and browser synthesis ship. Unchanged compiler/input reuses .joplo/resources; compiler version/code changes invalidate the cache. Do not commit the cache or MIDI.

Verify with joplo check, then build and click Play with sound enabled. Sound requires a viewer gesture; thumbnails/screenshots stay silent. Pause, resume, jump and speed use the engine clock; narration ducks music to 25%. The offline synthesizer approximates instruments without downloading soundfonts. Piano uses a struck attack, decaying amplitude and darkening harmonics; organ sustains, while strings/brass use slower attacks. Envelope and brightness are sampled at the note's score-time age, so pausing/seeking into a held note does not strike it again. It supports standard MIDI format 0/1 with PPQN tempo, note, program and sustain events, not SMPTE or format 2.

If silent, check the sound switch and local warnings at the play step's source file:line. Missing Alda, score syntax, timeout (30s) or output over 8MiB produces a warning and leaves the rest of the demo playable. Fix the score/tool and retry playback or build. Alda errors include the score line; the diagnostic anchor is the author play step. Named score typos also warn. Published sites cannot regenerate missing music: rebuild on the author machine.

Start around score (vol 70) and track volume .3–.5, then listen in the actual player. Score velocity, synthesis gain, track volume and narration ducking multiply: reducing all of them at once can make music effectively inaudible even when AudioContext is running. Check the final output after the track gain, both during and between narration; an upstream oscillator alone does not prove audible output. The synthesizer keeps per-note gain audible and uses a mix compressor for chord headroom. Use a sparse phrase, loop it, and fade out with the ending. Leave room for narration rather than increasing music volume. Video export does not mix the media track in this version; use interactive build/share for sound.

General engine contracts: npx joplo skill plugins


## Installed references

Engine contracts: [plugins](../joplo/topics/plugins.md).
<!-- joplo-skill 0.2.18 sha256:c36e126de23d3316a56baad3caa374de1acc51db392d07ba18b4f3239e53e270 -->
