# @joplo-app/plugin-3d

Optional Joplo 3D scenes (three.js), self-contained GLB loading and local Tripo model generation. Not installed by the starter. Plugin id: `scene3d`.

```tsx
import scene3d, { Scene3D, model } from '@joplo-app/plugin-3d';
import { config, asset } from '@joplo-app/kit';
export default config({ name: 'Spatial demo', plugins: [scene3d] });
// Inside a page; declare scripted interactions or mark the model unmodeled:
<Scene3D id="scene"><Scene3D.Model id="subject" src={asset('./assets/models/subject.glb')} unmodeled /></Scene3D>
// Optional author-only request: src={model('An original low-poly apple, no ground')}
```

Run `npx joplo skill install`, then `joplo skill scene3d`, `scene3d/models` and `scene3d/generation`. Existing GLB files work offline without a key. `/runtime` loads browser drawing only; `/local` contains the optional Node compiler and does not send requests on import.

Before generation run `joplo resources --dry-run`. Confirm each estimate; unattended generation requires `--allow-spend`. Check/build/render never generate. Commit `assets/models/<hash>.glb` and matching JSON; filenames depend only on normalized model request, never package/plugin identity, so package moves and compiler upgrades reuse existing output. If missing, restore from Git before approving another task.

Save the optional key in Voice → Manage keys, or set `TRIPO_API_KEY`. The host stores it at `~/.joplo/plugins/scene3d/keys/tripo.json` (0600; `JOPLO_HOME` supported), prioritizes the environment, and injects it as `ctx.keys.tripo` only into this plugin's local compiler. Never put keys in source, request parameters or asset provenance.

A recorded task resumes polling; unknown creation outcomes require manual recovery of the task id, never journal deletion and blind retries. Inspect actual triangles/bytes: face_limit does not guarantee them. Reduce oversized textures locally before paying for regeneration; keep ordinary embedded textures or meshopt geometry. See the generation skill for all recovery and cost rules.
