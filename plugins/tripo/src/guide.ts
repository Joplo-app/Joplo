export const skill = `## When to use
First look for suitable CC0 models and public-domain reference images; use Tripo to fill gaps in your own style. Do not hand-write complex geometry or SVG to imitate a model. Do not copy protected character designs or trademarks.

## Start
Install @joplo-app/plugin-tripo and enable its default plugin in config.plugins alongside your rendering plugin. Import { model } from '@joplo-app/plugin-tripo'; set a model component's src to model('A single red apple, short brown stem, matte skin, original low-poly style, no ground'). Or model({ prompt: 'Description', image: asset('./reference.png') }) for image-to-model. References upload through /v3/files only after confirmation; use PNG/JPEG (asset() limits images to 2 MB; the upload API allows up to 20 MB), with one clearly separated subject.

Run npx joplo resources --dry-run to inspect each estimate. Then npx joplo resources asks before each generation in a terminal; unattended runs require --allow-spend. Check/build/render never generate, even with a key. Missing output stays a readable placeholder with a diagnostic. Never add credentials to model() or project config.

## Geometry and cost
Describe one subject, shape, material and style. Web models usually need 10k–50k faces; default smart_low_poly:true uses 10k and accepts 500–20k. To use 50k, disable smart_low_poly. Model is pinned to v3.1-20260211. Text generation estimates 10 credits untextured / 20 textured; image generation 20 / 30; smart_low_poly adds 10; detailed texture adds 10. pbr requires texture. Inspect the downloaded GLB triangle count and bytes instead of assuming face_limit proves the exported size; any paid decimation is a separate approved operation. Every generation displays the estimate; actual credits_consumed comes from Tripo. Failed/cancelled tasks refund frozen credits according to Tripo; verify the account rather than assuming a local timeout is a refund.

## Persistence and recovery
Commit assets/models/<description-and-parameters-hash>.glb AND its .json metadata. Builds on other machines read that output without a key or network. Changing description, parameters, reference bytes or model version creates a different path. Plugin code updates do not regenerate existing models. Do not store temporary model URLs.

Save a key in the board → Voice → Manage keys → Tripo, or use TRIPO_API_KEY. Saved keys stay in ~/.joplo/tripo.json (0600), never IR or published files. JOPLO_HOME may override the local directory.

A network failure after task_id is saved: rerun resources to poll the same task. A creating/unknown journal: inspect Tripo task history, recover task_id into the matching JSON and set status to queued; never delete the journal and blindly create again. For invalid keys, update the local key. For insufficient credits (2010), stop and tell the user; do not purchase. For moderation (2008), revise the content. For damaged GLB, restore from Git or resume the saved successful task after removing only the damaged GLB. Large models warn at 5 MB and fail at 50 MB; reduce geometry/texture before sharing. Verify the model in the board, screenshot and file:// build before delivery.
`;
