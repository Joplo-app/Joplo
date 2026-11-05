<p align="center"><img src="https://raw.githubusercontent.com/Joplo-app/Joplo/main/assets/brand/joplo-logo.svg" alt="Joplo" width="300"></p>

[English](https://github.com/Joplo-app/Joplo/blob/main/README.md) | [简体中文](https://github.com/Joplo-app/Joplo/blob/main/README.zh-CN.md)

# Joplo

**Design the behavior before you build the feature.** Turn ideas into low-fidelity, interactive demos with your coding agent. Explore edge cases, compare options, and keep the rules behind each decision.

Requires Node.js 22 or later.

```sh
npx joplo@latest init my-demo
cd my-demo
npm install
npx joplo dev --open
```

- Author pages, options, cases, rules, and flows in TSX with `@joplo-app/kit`.
- Review multiple projects in one local Board. Option/Alt-click an element to inspect its rules and exact source location.
- Use Layers, Director, and Shots to guide the demo. Model architecture with `Diagram` and `trace()`; use `Terminal`, `Phone`, and custom Themes for the right presentation.
- Export images or record scenarios locally. Build a static Published site with Layers, Director, and fullscreen playback.

Read only the authoring guidance your agent needs:

```sh
npx joplo skill
npx joplo skill demo
npx joplo skill install --agents-md
npx joplo check
npx joplo selection
npx joplo build
```

Documentation and examples: [Joplo-app/Joplo](https://github.com/Joplo-app/Joplo). License: [Apache-2.0](https://github.com/Joplo-app/Joplo/blob/main/LICENSE).
