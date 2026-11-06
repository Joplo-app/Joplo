<p align="center"><img src="assets/brand/joplo-logo.svg" alt="Joplo" width="320"></p>

[English](README.md) | [简体中文](README.zh-CN.md)

# Joplo

**Design the behavior before you build the feature.** Joplo helps you and your coding agent turn ideas into low-fidelity, interactive demos: explore edge cases, compare options, and keep the rules behind each decision.

Author pages and flows in TSX, review them in the local **Board**, then build a static **Published site** from the options you choose. Files are the source of truth; Git keeps the history. Option-click an element to give your agent its exact file and line.

![Joplo Board](docs/screenshots/board-play-initial.png)

## Quick start

Requires Node.js 22 or later and npm.

```sh
npx joplo@latest init my-demo
cd my-demo
npm install
npx joplo dev --open
```

Keep the Board process running. Edit the generated TSX files and watch the demo update. Running `npx joplo dev` from another project adds it to the same Board process. The default port is 4790; `--port <port>` selects a port when starting a new Board.

## What you can show

- **Board:** a home page with recent projects and their features, served by one local process.
- **Interactive demos:** breadcrumbs, a sidebar grouped by case, playback controls, a step strip, and a dedicated subtitle area.
- **Layers, Director, and Shots:** give each perspective its own page. The Director follows the flow, switches Layers, and moves the camera to each Shot. Viewers can take over, replay one Layer, zoom, pan, or go fullscreen.
- **Architecture demos:** `Diagram` defines nodes and edges; `trace()` animates call paths and derives their states. Reveal sections progressively with `when`.
- **Inspection:** hold Option/Alt and click to open the rules and source drawer. Your agent can retrieve the selection and edit just that location.
- **Terminal and Phone:** model command-line interactions with `Terminal`; mobile pages use a `Phone` frame. Each page targets one device.
- **Themes:** choose from nine built-ins or add `themes/<name>.css`. Board settings can apply a Theme to one project or all projects.
- **Exports:** export the current step as an image or record a whole scenario locally. The Published site supports image export, Layers, Director, and fullscreen playback.

## Work with an agent

### Install the agent skills

Two ways to give a coding agent (Claude Code, Codex, …) the Joplo skills `joplo` (build demos) and `joplo-feedback` (apply review results). Both install the same files from one template:

```sh
npx skills add Joplo-app/Joplo           # official skills from this repo; any repo, even before Joplo is installed
npx skills add Joplo-app/Joplo@v0.2.4    # pin to a release tag
npx joplo skill install                  # inside a Joplo project: skills matching the project's installed version
```

- Use `npx skills add` when you want agents to discover Joplo in any repository, for example to start a new prototype. The [skills CLI](https://github.com/vercel-labs/skills) installs to `.claude/skills/` for Claude Code and `.agents/skills/` for Codex.
- Use `npx joplo skill install` inside a project that already has `joplo.config.ts`. It writes `.claude/skills/joplo*/SKILL.md`, updates untouched files when Joplo is upgraded, never overwrites files you edited (`--diff` to compare, `--force` to replace), and with `--agents-md` also writes a managed block into `AGENTS.md`.
- The skills are thin on purpose: a mental model, the start order, and common pitfalls. The detailed API always comes from `npx joplo skill <topic>`, which matches the installed version.

### Read guidance on demand

Read only the guidance the current task needs:

```sh
npx joplo skill
npx joplo skill authoring
npx joplo skill cases
npx joplo skill demo
npx joplo skill install --agents-md
```

The seven topics are `authoring`, `demo`, `components`, `cases`, `check`, `selection`, and `publish`. Each is under 150 lines. `npx joplo skill` starts with the mental model and the start order; user-edited skill files are protected. `guide` is an alias for `skill authoring`.

Use a second terminal while the Board is running:

```sh
npx joplo check
npx joplo selection
```

`check` reports one issue per line with a file, line, column, severity, and code. Errors exit with 1; usage errors exit with 2. Warnings and information exit with 0. After Option/Alt-clicking in the Board, `selection` returns the label and three lines of source on either side of the selected line.

## Project layout

```text
joplo.config.ts
layouts/app.tsx
routes/page.tsx
routes/members/page.tsx
features/invite/feature.ts
features/invite/options/a.tsx
shared/
themes/brand.css
.joplo/selection.json
dist/
```

Routes follow folders. Layouts provide the shell and named Slots; Options add content to those Slots or define new routes. A Feature holds its goal, cases, rules, and `pick`. Scenarios describe behavior with `flow()`. Use `@joplo-app/kit` for the authoring API and `@joplo-app/kit/ui` for components named and configured like Mantine.

Reuse modules inside the project with `shared/`. Keep runtime state in `.joplo/` and build output in `dist/` out of Git. See the authoring topic for exact APIs and [Themes](docs/themes.md) for CSS variables.

## Build and publish

Set each Feature's `pick` to its chosen Option filename, then:

```sh
npx joplo check
npx joplo build
npx wrangler deploy --assets dist
```

Build publishes only the selected Options. The Published site shares the Board's player layout and keeps the demo, subtitles, Layers, and Themes. Rules, assumptions, coverage gaps, and source locations stay on the authoring side. Image export works in the browser; video export is local only.

Use your own Wrangler account and configure the site name and compatibility date for deployment. The output also works with other static hosts. See [CLI reference](docs/cli.md) for output directories, overwrite options, and screenshots.

## Examples

| Example | What to explore |
| --- | --- |
| [examples/invite](examples/invite) | Compare an invitation dialog with a batch invitation flow |
| [examples/agent-arch](examples/agent-arch) | Layers, Director, `Diagram`, and `trace()` for an agent architecture |
| [examples/joplo-board](examples/joplo-board) | Multi-project Board and player interaction designs |
| [examples/joplo-dist](examples/joplo-dist) | npm installation and agent guidance flows |

## Develop in this repository

```sh
pnpm install
pnpm joplo dev examples/invite --open
pnpm typecheck
pnpm test
```

The workspace uses `joplo` as the command entry point, with `@joplo-app/kit`, `@joplo-app/core`, `@joplo-app/cli`, `@joplo-app/server`, and `@joplo-app/web` behind it. The CLI loads the server only for `dev`, `build`, and `render`. For local screenshots and exports in an npm-installed authoring project, add the optional browser dependencies in that project:

```sh
npm install -D playwright
npx playwright install chromium
```

See [dependencies and licenses](docs/dependencies.md) and the [npm release workflow](docs/release.md).

## Documentation

- [CLI reference](docs/cli.md)
- [Board and Published site](docs/web.md)
- [Themes](docs/themes.md)
- [Authoring model](docs/adr/0002-hugo-like-authoring.md)
- [Demo model and architecture](docs/adr/0003-demo-model.md)
- [Product decisions](DECISIONS.md)

Run `npx joplo skill` for task-focused authoring guidance that matches your installed version.

## Scope and execution boundary

Joplo models behavior; it does not run a real product backend. Routes must be static. A mobile experience needs its own page or demo. AI assumptions cannot be marked as confirmed without a real user decision, and interaction belongs in `flow()` rather than `onClick`.

Author modules execute on your machine during loading, checks, and builds. Only run projects you trust. The Board and Published site consume compiled IR. MCP, collaboration, and comment sync are outside this local release.

## License

[Apache-2.0](LICENSE). Bundled fonts use [SIL OFL 1.1](packages/web/src/fonts/OFL.txt).
