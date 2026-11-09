# Joplo plugins: plugins

The engine supplies authoring, compilation, state, scheduling and host services. It loads only config.plugins; no component or media library is implicitly installed or enabled. A template is one explicit choice of packages, not an engine default.

## Discover and use
1. Read package.json and config.plugins. npx joplo skill lists engine topics plus enabled plugin entries/topics; .claude/skills/joplo-plugins/SKILL.md indexes installed files.
2. Install a trusted author package, import its default manifest/factory and explicitly add it to config.plugins. Use the package's exact version when version-coupled to this CLI.
3. Run npx joplo skill <plugin-id> or <plugin-id>/<topic>, then import components and effects directly from that package. For ids colliding with engine topics use plugin:<id>/<topic>. Do not invent component names or copy another plugin's conventions.
4. Run npx joplo skill install after adding/removing plugins. It synchronizes per-plugin files and removes unchanged generated files for removed plugins; edited files are protected (inspect --diff before --force). Outside a project it installs only engine skills.
5. A new template carries its own generated plugin guides for reading before dependency installation. After install, rerun skill install to verify the live config; unresolved imports never mean a plugin was enabled successfully.
6. joplo components inspects only the enabled manifests; a named query gives that component's declarations and example. For full recipes/behavior read its plugin skill.

## Errors and trust
- UNKNOWN_PLUGIN: the element's author package is not enabled. Use its package provenance in the diagnostic to install/import it and add it to config.plugins. UNKNOWN_COMPONENT: no enabled manifest declares that element or intrinsic tag; read the installed catalogs.
- PLUGIN_DUPLICATE: remove a duplicate declaration. PLUGIN_RUNTIME_MISSING: reinstall the package and verify its runtime export. A plugin unavailable placeholder gives its actual loading/API error; do not edit generated IR to hide it.
- Plugins are trusted local author code and browser drawing code. Public builds bundle only enabled/projected runtimes and snapshots. Inspect artifacts; declaring a package private is not a permission to publish it.
- Shared React and host renderer services must be the host instances. Test a clean production install; a workspace/prebuilt host cannot prove that a runtime has declared its dependencies.

## Write a plugin
- Export definePlugin({ id, packageName, title, version, components, skill, skillTopics?, runtime, compile?, properties?, themes?, actions?, data?, schemas?, local? }) from @joplo-app/kit/plugin. Ship compiled JS and declarations; runtime and optional local entries are URLs resolved relative to the package.
- components maps names to doc/example, interaction and declarative traits. Export pluginComponent(manifest, name) markers from this package. Intrinsic tag ownership is explicit and unique. No kit component forwarding or bare-name adapters.
- Runtime CSS imports and emitted local assets are bundled with the plugin: CSS is installed as a per-plugin style sheet, and local URLs become typed data URLs, including CSS images/fonts and imports above the normal inline threshold. Exercise source dev, npm prebuilt dev and offline file:// with real asset loading checks; a successful JS import alone does not prove styles or textures were delivered. Generated asset references that cannot be resolved fail explicitly.
- Verify both source development and the installed production package in a real browser. A prebuilt host must share its own React instance with dynamic plugin modules; serving a raw CommonJS dependency URL is not sufficient. Production dev and offline publish use the same bundling/shared-module contract.
- skill is the entry guide: when to use, how to enable/import, the smallest correct example, success checks, pitfalls and recovery. skillTopics maps topic keys to { description, body }; installed references and CLI topics come from this exact version. Do not put private project data or credentials in guides.
- Node hooks normalize/derive/frame/effect/validate trusted author data. Outputs must be finite JSON within supported depth/size, immutable across calls, identity-safe, and serializable. Functions/prototypes/cycles are rejected. Hooks and source instructions are never shipped as runtime IR.
- Effect compilers return declarative writes, references, optional directorTarget, media commands and derived data. Preserve source ordering. Native behavior, choices, gates, text paths and action matching are manifest declarations, not host branches for a component name.
- actions declares field types/ranges/tolerances, targets, caption and duration. Runtime recognizers use ctx.act; frame.gesture and frame.clock present the same action. Do not accumulate private timeline time or advance state from a drawing callback.

## Runtime and projection
- Export defineRuntime({ id, components, observe? }) with the current API version. mount returns update/destroy; renderChildren preserves host rendering. Every targetable element needs an anchor carrying all supplied attrs, and canvas hits report through ctx.click/ctx.act. Report raycast hover with ctx.hover?.(id), and null on leave or drag start; the host resolves the declared dwell, cancels it on reset/resume, and never pauses playback for hover. Do not run a private hover timer or guess the author duration.
- For a canvas drag, report a named hit or stage CSS-pixel point through ctx.act. The host resolves points against declared drop-zone anchors, including ordinary DOM targets outside the canvas. Keep anchors current after camera/scale changes; do not report canvas-local pixels as stage pixels.
- frame contains resolved state, drawing snapshot, animate, clock/gesture, local playground and reset epoch. animate=false renders final layout; use ctx.hold while required assets load. Stop handled gesture propagation where ownership requires it.
- Use @joplo-app/kit/renderer and renderer-style services instead of internal source imports. Share React through the published bridge; clean up observers/listeners and animation on destroy.
- properties declares literal types, constraints and namespaced DOM attributes. Attributes propagate to every anchor. An observe instance is local to a stage/runtime and updates after layout; switching/unmount destroys it. Exceptions disable that instance, not the engine.
- themes is named CSS; the engine namespaces it by plugin id. Keep visual semantics in the plugin. Same deterministic snapshot must draw identically in board, file://, render and video.
- data declares text and scope projections for node/step slots. Missing projection stops scoped publication; never leave cut content merely hidden in DOM. Translation changes only declared display paths, not ids, colors or structural values.

## Local resources and media
- Node props can use localResource(plugin, compiler, input) from kit/plugin. The compiler extracts author-only input into ResourceRequest and leaves an opaque reference in IR; the renderer resolves it from the scoped asset table. No description or credentials belong in public IR.
- Optional Node local entry exposes text-to-resource compilers. The host caches by compiler version/code and exact input, coalesces requests and records warnings for local failures. Requests/source text are not public IR.
- A compiler may declare persistent:true and estimate(input):{credits}; its compile context receives projectDir, home and allowSpend. Persistent output must be checked before credentials/network, and remains authoritative across compiler code updates. Only the explicit resources command grants allowSpend after displaying each estimate; ordinary host calls pass false. Do not infer permission from a configured key.
- Release ctx.hold on success, error, superseded requests and unmount, after drawing the ready frame. Recheck scope before inlining assets; unused resources must not ship.
- Step effects can emit play/stop commands for named tracks. Replay uses fixed step anchors and one engine clock; jumping/replaying resets to the same snapshot. Pause, speed, fade and narration ducking are host behavior, synthesis belongs to the plugin.
- Scope before inlining media. Build embeds validated resources and plugin runtimes; file:// must work without network. Video mixing capability is separate from playback support—state its actual limit.

## Verify the package
Run typecheck and relevant schema, compiler, projection and real-browser tests. Use a second unrelated plugin to test generic hooks. Pack and install into an isolated project, enable it explicitly, check/build/render and test playback without network. Keep skill, manifest, runtime and package exports at the same version.

Related topics: authoring, demo, check, publish
<!-- joplo-skill 0.3.0 sha256:75502726c9e02121edc7dbc6d837a16621f8c9ae0d6908bd88f89cfba8b0cd84 -->
