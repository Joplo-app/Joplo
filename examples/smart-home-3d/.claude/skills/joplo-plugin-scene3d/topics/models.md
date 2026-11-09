# Real GLB models

Use Scene3D.Model (also exported as Model) for one self-contained binary GLB. First find suitable CC0 models or public-domain images; use a generation plugin for gaps in an original style. Do not hand-write complicated geometry or SVG to replace real assets.

Enable scene3d in config.plugins, import { asset } from '@joplo-app/kit', then write:

```tsx
<Scene3D id="scene" focus={$.ui.focus}>
  <Scene3D.Model id="fruit" src={asset('./assets/models/fruit.glb')}
    size={[1, 1, 1]} at={[0, 0, 0]} label="Fruit" outline={false} />
</Scene3D>
```

asset paths are relative to the calling source file. The same package exports model() for a declarative generated src. Read npx joplo skill scene3d/generation for cost confirmation and recovery. Commit model files and their metadata; a missing model must never silently trigger paid generation during check/build/render.

size is a bounding fit preserving the original aspect ratio; at is bottom-center with Y up; rotate is degrees around Y. Keep the original textures by omitting color; color explicitly tints the material with a theme role or CSS color. outline defaults true; turn it off for smooth textured assets to avoid distracting triangle edges. lit, visibility, disabled state, label and showLabel work with state. Material tint and outlines follow theme changes. Changing only color reuses the loaded model and textures, without a loading placeholder; removing color restores the original material color. showLabel={false} hides the visible nameplate even for an interactive model, while its labeled anchor remains available for input and accessibility.

Each model is interactive: use a click step, free reaction, disabledReason or unmodeled. It must be a direct child of Scene3D. focus, shot, spotlight and callout target its id. Drag/arrow keys orbit the scene; scripted rotation uses scene3d:rotate targeting the Scene3D id. A paused raycast hover honors the author-declared .hover/free.hover dwell; moving away cancels it. Hover during playback never pauses or fires. Provide a click button for touch/keyboard audiences. A model drag reports the existing drag action, and may land on a named ordinary DOM target outside the 3D canvas; bind its at to state to show a deterministic position change. Free experience resets on play/jump/reset.

The loader supports embedded textures and meshopt geometry compression without external decoder URLs. It holds screenshot/export readiness until its first model frame is drawn; changing src or unmounting releases obsolete holds and disposes geometry/textures. Corrupt, missing, external-buffer GLB and unsupported formats show MODEL_LOAD_FAILED and a readable box; restore/re-export the GLB, then reload. Draco/KTX2 compressed assets are not enabled—re-export with embedded ordinary textures and meshopt or uncompressed geometry.

## A model over archival artwork
- Scene3D clears to transparent. Put the licensed Image and a legibility gradient behind it as siblings; never put a 2D background or labels inside Scene3D. Its children must be declared scene objects/models.
- Keep one model centered at the same screen position across an era change, and swap the visible model while changing the background and score. This is a model replacement, not geometric morphing. Use one visible subject and sparse surrounding text.
- For a film close-up, use the enclosing content Canvas camera. Scene3D focus gives a contextual view of an object and is not a fixed zoom multiplier; with only one object it can be wider than the whole-scene framing. Inspect both frames instead of guessing from the focus id.
- For a whole-object flight or drop, animate a stable wrapper with the content plugin's motion property. Changing a model's structural at/size/src rebuilds it; do not expect vertex morphs or physical gravity. Keep a static frame target so screenshots and direct jumps still match.
- Check mouse rotation, keyboard arrows, a declared object drag, hover, and a click independently. A declared model drag takes priority over orbit; drag empty canvas to rotate that scene. Reset/play discard local orbit, but snapshots always read scripted angles.

Keep web geometry around 10k–50k faces and GLB below 5 MB. Inspect actual GLB accessor/index counts and bytes; a generation parameter alone is not proof of the exported budget. Models above 5 MB warn, above 50 MB fail. Check the initial frame and a focused frame, then open the build with npx joplo preview and no other network. A GLB download succeeding alone does not prove texture, anchoring or camera fit.
<!-- joplo-skill 0.4.1 sha256:fdbeac554d71a7626908a7390dd4a3e1708a95581d118d611efb9a571f59bec6 -->
