export const skill = `# Joplo media: media

For moments a product UI cannot show by itself: a short screen recording, a product shot in motion, a polished success animation. Clips play on the engine clock (pause, speed, jumps, screenshots and video export stay consistent).
Install at the same version as Joplo. Example: examples/media-upload.

The npm package is @joplo-app/plugin-av; its plugin namespace and skill topic remain media. For projects using the earlier source-checkout package @joplo-app/plugin-media, replace the dependency and imports with the matching plugin-av version. Keep media:Video/media:Lottie and existing playback data unchanged; never enable both manifests with the same media id.

## Enable
import media, { Video, Lottie, playClip } from '@joplo-app/plugin-av'; config({ plugins: [ui, media, …] }).

## Independent local one-shot sounds
Use withSoundEffects instead of the default media manifest (never enable both):
\`\`\`tsx
import { asset } from '@joplo-app/kit';
import { withSoundEffects, sfx } from '@joplo-app/plugin-av';
config({ plugins: [ui, withSoundEffects({ send: asset('./assets/send.wav') })] });
// In a scripted system step (not a free-reaction handler):
sfx.play('send', { volume: .5, offsetMs: 0, startDelayMs: 300, duck: false });
\`\`\`
The host has independent 4 MiB encoded and 32 MiB decoded Float32 caches shared by overlapping tracks; the 50 MiB local artifact ceiling is not playback admission. Prepared local resources report MEDIA_ENCODE_BUDGET separately, and runtime failures identify encoded/decoded bytes. This plugin currently accepts PCM WAV, so very large cues must be shortened; use another compatible local compiler for compressed FLAC rather than feeding FLAC into this WAV-only parser. First release supports local PCM WAV only (8/16/24/32-bit, 1–8 channels). Convert other formats offline; unknown/truncated duration is an error, never guessed. offsetMs is a source trim, not an event delay, and must be shorter than the asset. volume is 0–1. Optional startDelayMs (0–60000 engine ms) waits after the step commits without advancing the source offset or consuming the sound’s natural length. Pause freezes that wait; speed changes its wall-clock duration. Omit it for the existing immediate behavior. duck defaults true (narration multiplies gain by .25); duck:false exempts this cue only, so keep its authored volume restrained. No streaming or nested audio timeline is created. Each call creates a deterministic independent one-shot event; repeated calls and Alda BGM overlap. Effects use the host clock, pause/speed/seek/chapter continuation and narration ducking, and are included in offline build/share and video audio capture. No Alda compiler, network or paid generation is needed.

Inspect scenario step media snapshots: track keys include stable step/event identity, resource is the generated asset ID, offsetMs is source position, endAfterMs is sounding time remaining to natural end, excluding waiting. startDelayMs preserves the original plan, delayRemainingMs is the snapshot’s remaining wait, and startEventId distinguishes explicit delayed events; inherited chapter snapshots retain that identity. A static seek restores remaining wait and source position, not the original full wait. For a timeline observation at engineMs, nominal eligibility time for this observation is engineMs + delayRemainingMs, using startDelayMs only if remaining is absent. An inherited cue first seen by a chapter/deep-link export may appear as play; retain startEventId to distinguish continued observations from new explicit plays. Do not add the original delay again. If remaining is zero on a continued identity, it is already eligible: do not emit another start or infer its original onset from that snapshot. Without the earlier play observation, the original start is unknown. This predicts scheduling, not the first audible sample: a source trim, fade-in or silence inside the WAV changes audible onset, and metadata cannot establish it. The natural end removes the event without fading its volume; pause does not consume time. The same source shares the host resource cache; ending one event releases only its lease. For reproducible offline mixes retain the selected scenario timeline and packaged media assets. Resource inputs stay on the author machine; only used audio bytes ship. Use joplo check first; SFX_INVALID means fix name, PCM file or numeric options. Listen to overlapping cues with Voice enabled and record a local clip to verify the final mix.

## Write
- <Video id="rec" src={asset('./upload.mp4')} w={640} h={360} fit="cover" /> — MP4 or WebM in the project. Video is always muted in this version (narration and music stay the soundtrack).
- <Lottie id="ok" src={asset('./success.json')} w={160} h={160} /> — a Lottie (Bodymovin) JSON export.
- playClip('rec') plays from where the clip last stopped to its end; playClip('rec', { from: 2, to: 5 }) plays seconds 2–5. The step stays until the clip ends (holdMs), so autoplay never cuts it off. Before the first play, a clip shows its start frame (start={seconds} to choose another).
- MP4 and Lottie lengths are read at compile time. WebM length is unknown: always write { to }.

Static screenshots and paused frames copy decoded video pixels into a canvas after the requested seek, before releasing the hold. Film strips and --frames-out additionally use explicit host sampling mode: every engine sample seeks each Video to its engine-clock target, waits for decoding and commits canvas pixels before capture. Multiple videos all have to finish; pause/resume, jumps and continuing chapters keep using that same engine clock. No browser automation detection is involved.

Verify moving footage with render --frames-out output/frames --fps 30, then inspect consecutive JPEGs at the expected source positions (currentTime alone is not evidence of decoded pixels). Use --film for motion diagnostics. Frame extraction retains the host's existing 50 ms observation tolerance; it does not promise sub-frame source interpolation or byte-identical encodes. A source video presents the decoded source frame containing the target time. A failed decoder or a frameReady task still pending after 10 wall-clock seconds fails the export with sample time/component context; fix the resource/codec or task cleanup and retry. Waiting never advances the engine to manufacture readiness. Real-time --video recording and normal browser playback retain native video playback and may show compositor/scheduling differences; they do not use this per-sample handshake.

resetKey is scene ID plus player epoch: pause/resume does not change it; jump/reset/replay mode changes can. Continuing chapters can retain the epoch, but a changed scene still changes the key. It is not a per-step timestamp or a guarantee that the current video frame has been composited.

## Assets
- Keep clips short (≤ 15 s) and small: 720p H.264 MP4, no audio track needed. Published sites keep every asset as its own file (assets/<hash>.<ext>), uploaded once per content.
- Prefer licensed libraries (LottieFiles free animations under their license, your own recordings). Record the source and license in assets/SOURCES.md.
- GIFs play on the browser's own clock and cannot be paused or seeked: show them with the ui Image, or convert them to MP4 and use Video when timing matters.

## Pitfalls
- MEDIA_SRC_INVALID: src must be asset() of an MP4/WebM (Video) or a Lottie JSON (Lottie), not a URL.
- MEDIA_DURATION_UNKNOWN: WebM without { to }.
- Static frames (screenshots, jumps) show the frame where the clip ends in that step; only playback moves.
- A clip has no sound and does not duck narration; put spoken words in narrate().
`;
