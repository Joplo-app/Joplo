<p align="center"><img src="https://raw.githubusercontent.com/Joplo-app/Joplo/main/assets/brand/joplo-logo.svg" alt="Joplo" width="300"></p>

[English](https://github.com/Joplo-app/Joplo/blob/main/README.md) | [简体中文](https://github.com/Joplo-app/Joplo/blob/main/README.zh-CN.md)

# Joplo

**Show how it works.**

Playable, interactive shows your agent writes in code. Link them, embed them, change one line and they update.

[![Joplo show: Joplo’s own design process](https://joplo.app/s/dn1MWCcnDW/badge.svg)](https://joplo.app/s/dn1MWCcnDW/)

- **Before you build it — Design the behavior before you build the feature.** Compare feature options, walk through cases, and keep the rules — see [team invitations](https://github.com/Joplo-app/Joplo/tree/main/examples/invite).
- **How it runs.** Explain an architecture, a call chain, or a code change — see [Agent architecture](https://github.com/Joplo-app/Joplo/tree/main/examples/agent-arch).
- **What happened.** Tell a story, explain the news, or trace a product’s history — see [one button across forty years](https://github.com/Joplo-app/Joplo/tree/main/examples/button-40-years).

Requires Node.js 22 or later.

```sh
# Compare feature options (default template)
npx joplo@latest init my-demo
# Or start one standalone show
npx joplo@latest init my-demo --template work
cd my-demo
npm install
npx joplo dev --open
```

Use the default `starter` (also `--template starter`) to compare feature options. Use `--template work` for one playable show with two continuous chapters: edit the heading in `works/explainer.tsx` and save, or pause and type in the input; Play or Reset restores the script. Templates download from the default branch of [Joplo-app/joplo-templates](https://github.com/Joplo-app/joplo-templates), without version tags; they are maintained manually, independently of CLI releases, for the latest published CLI. Names matching `[a-z0-9][a-z0-9-]*` select same-named directories, so new templates need no CLI release; bare names take priority over local directories, so use `--template ./work` for a local folder. Init fills placeholders with its own exact version, installs engine skills and preserves any bundled plugin guides; after installing dependencies run `npx joplo skill install`. Missing template names link to the repository; offline inputs use `--template ./local-source`. You can also add `works/<key>.tsx` manually to any project, exporting `work({ title, summary, stage, scenarios })` with `chapter()` for continuous chapters. Read `npx joplo skill authoring` for the minimal example.

- Author shows in TSX with `@joplo-app/kit`; feature review adds options, cases, rules, and a pick.
- Review multiple projects in one local Board. Option/Alt-click an element to inspect its rules and exact source location.
- Use Layers, Director, and Shots to guide playback. Model architecture with grouped `Diagram`, `Sequence`, `StateMachine`, and `trace()`; use `Terminal`, `Phone`, and custom Themes for the right presentation.
- Link a show, add its playable badge to a README, or embed its player in docs and blogs. Build a static Published site with Layers, Director, and fullscreen playback; image export and local scenario recording are also available.
- Keep source as text: diff, translate, or ask your agent to change one line.

Read only the authoring guidance your agent needs:

```sh
npx joplo skill
npx joplo skill demo
npx joplo skill install --agents-md
npx joplo check
npx joplo selection
npx joplo build
```

Documentation and examples: [Joplo-app/Joplo](https://github.com/Joplo-app/Joplo). License: [PolyForm Shield 1.0.0](https://github.com/Joplo-app/Joplo/blob/main/LICENSE). Free for any use, including commercial, except building products that compete with Joplo or Joplo Cloud; see [COMMERCIAL.md](https://github.com/Joplo-app/Joplo/blob/main/COMMERCIAL.md).

Use `work({ title, summary, … })` for every show. Standalone shows live in `works/<key>.tsx`; alternatives under a feature live in `features/<f>/works/<key>.tsx`. Feature review is a layer over works. See the [current work model](https://github.com/Joplo-app/Joplo/blob/main/docs/work-model.md).
