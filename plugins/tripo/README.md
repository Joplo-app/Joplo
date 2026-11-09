# @joplo-app/plugin-tripo

Optional Node-only Tripo 3D generation for Joplo. Install and enable the default plugin in `config.plugins`; `model()` supplies a generic resource reference to a GLB-capable renderer.

```ts
import tripo, { model } from '@joplo-app/plugin-tripo';
// config({ plugins: [...yourRenderingPlugins, tripo] })
const apple = model({
  prompt: 'A single red apple, short brown stem, matte skin, original low-poly style',
  smart_low_poly: true,
  face_limit: 10000,
});
// Set the rendering component's src={apple}.
```

Run `joplo skill tripo` for the complete versioned guide. Start with `joplo resources --dry-run`; generate only after confirming each credit estimate (unattended execution requires `--allow-spend`). Existing `assets/models/<hash>.glb` and `.json` are committed and reused offline. Check/build/render never request paid generation.

Keys stay in local Joplo settings (Voice → Manage keys → Tripo) or `TRIPO_API_KEY`. References use `model({prompt, image: asset('./reference.png')})` and upload through `/v3/files` only after permission. Interrupted tasks resume their recorded task ID; unknown creation outcomes require reconciliation instead of a duplicate POST.

Use CC0/public-domain material first, then original generated assets for gaps. See the repository's smart-home-3d example for a real persisted model and offline scene3d rendering.
