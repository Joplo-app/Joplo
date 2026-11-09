export const skill = `# Joplo media: media

For moments a product UI cannot show by itself: a short screen recording, a product shot in motion, a polished success animation. Clips play on the engine clock (pause, speed, jumps, screenshots and video export stay consistent).
Prototype (D96): private in the Joplo monorepo; example: examples/media-upload.

## Enable
import media, { Video, Lottie, playClip } from '@joplo-app/plugin-media'; config({ plugins: [ui, media, …] }).

## Write
- <Video id="rec" src={asset('./upload.mp4')} w={640} h={360} fit="cover" /> — MP4 or WebM in the project. Video is always muted in this version (narration and music stay the soundtrack).
- <Lottie id="ok" src={asset('./success.json')} w={160} h={160} /> — a Lottie (Bodymovin) JSON export.
- playClip('rec') plays from where the clip last stopped to its end; playClip('rec', { from: 2, to: 5 }) plays seconds 2–5. The step stays until the clip ends (holdMs), so autoplay never cuts it off. Before the first play, a clip shows its start frame (start={seconds} to choose another).
- MP4 and Lottie lengths are read at compile time. WebM length is unknown: always write { to }.

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
