<p align="center"><img src="assets/brand/joplo-logo.svg" alt="Joplo" width="320"></p>

<p align="center">
  <a href="https://www.npmjs.com/package/joplo"><img src="https://img.shields.io/npm/v/joplo?color=FFD23F&labelColor=1E1E1E" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-PolyForm_Shield_1.0.0-1E1E1E" alt="License: PolyForm Shield 1.0.0"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%E2%89%A522-1E1E1E" alt="Node.js 22 or later"></a>
</p>

<p align="center">
  <a href="https://joplo.app/s/dn1MWCcnDW/"><img src="https://joplo.app/s/dn1MWCcnDW/badge.svg" alt="Joplo demo: Joplo's own design process"></a><br>
  <sub>☝️ A live Joplo badge. Click it to play Joplo's own design process, published by trusted CI.</sub>
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a></p>

# Joplo

**Design the behavior before you build the feature.** Joplo helps you and your coding agent turn ideas into low-fidelity, interactive demos: explore edge cases, compare options, and keep the rules behind each decision.

Author pages and flows in TSX, review them in the local **Board**, then build a static **Published site** from the options you choose — or share it with one command and drop a playable badge or embedded player into a README, docs page, or blog post. Files are the source of truth; Git keeps the history. Option-click an element to give your agent its exact file and line.

A project is a portfolio of works → slices → steps. `work()` is the only work entry point: standalone pieces live in `works/<key>.tsx`; alternative works under a feature live in `features/<f>/works/<key>.tsx`, also with `title` / `summary`. Feature review adds cases, coverage and a pick; the UI calls its alternative works options. For explainers use `chapter()` slices; publish one entry with `--work <key>`. See the [work model](docs/work-model.md).

![Joplo Board](docs/screenshots/board-play-initial.png)

Optional background music: install `@joplo-app/plugin-alda` at your Joplo version, enable `alda(scores)` in `config.plugins`, then read `npx joplo skill alda` in the project. Scores stay as text; build/share includes offline SoundFont-rendered MP3 96 kbps stereo audio and music credits; marker-based starts use numeric offsets. See [media and local plugin resources](docs/plugins.md#11-阶段-1-b媒体轨道与本机资源已实现).

## Quick start

Requires Node.js 22 or later and npm.

```sh
npx joplo@latest init my-demo
cd my-demo
npm install
npx joplo dev --open
```

The default template lives in `templates/starter` in this repository and is downloaded from the CLI’s exact `v<version>` tag. It explicitly installs and enables ui, diagram, content, and alda; the engine loads no plugins implicitly. For offline use, pass `--template ./templates/starter`; custom repositories use `--template github:owner/repo/path#ref`. Private repositories use `GITHUB_TOKEN` or `gh auth token`. Download or validation failures leave no partial project.

Keep the Board process running. Edit the generated TSX files and watch the demo update. Running `npx joplo dev` from another project adds it to the same Board process. The default port is 4790; `--port <port>` selects a port when starting a new Board.

## What you can show

- **Board:** a home page with recent projects and their features, served by one local process.
- **Interactive demos:** scripted playback plus disposable exploration. Click the playing stage once to pause; type, switch controls or try declared free reactions, then Play to restore the script. Drag, hover, scroll and plugin gestures can be steps. A destination flow can opt into `actionEntry: 'after'` so a confirmed cross-scenario gesture lands on its result; guided practice defaults to the action's starting frame. See `npx joplo skill demo` and `authoring`.
- **Layers, Director, and Shots:** give each perspective its own page. The Director follows the flow, switches Layers, and moves the camera to each Shot. Viewers can take over, replay one Layer, zoom, pan, or go fullscreen.
- **Architecture demos:** `Diagram` groups nodes by business domain, `Sequence` walks a call chain in time order, `StateMachine` shows a lifecycle. Layout is automatic and stable across steps; `trace()` animates call paths and derives their states.
- **Inspection:** hold Option/Alt and click to open the rules and source drawer. Your agent can retrieve the selection and edit just that location.
- **Terminal and Phone:** model command-line interactions with `Terminal`; mobile pages use a `Phone` frame. Each page targets one device.
- **Themes:** choose from nine built-ins or add `themes/<name>.css`. Board settings can apply a Theme to one project or all projects.
- **Exports:** export the current step as an image or record a whole scenario locally. The Published site supports image export, Layers, Director, and fullscreen playback.
- **Narration:** steps can be read aloud during autoplay. Voice sources are the browser voice, Joplo Cloud narration (sign in with `npx joplo login`, no API key; billed in characters, the default once you are signed in), and official OpenAI or ElevenLabs with your own key. Generate audio in the Board or with `npx joplo voice` (`--dry-run` estimates the characters first); `npx joplo whoami` shows what is left, and the Board home shows storage and narration usage. Generated audio ships with build and share; updating a share with the default source keeps both valid new local clips and reusable published clips, even with different voices. See [Narration](docs/web.md#朗读d74).
- **Share and embed:** `npx joplo share --private --no-review` uploads the Published site and prints a README badge; the same link also serves a preview image and a lightweight embedded player for docs and blogs. See [Share and embed](#share-and-embed).

## Work with an agent

### Install the agent skills

Two ways to give a coding agent (Claude Code, Codex, …) the Joplo skills `joplo` (build demos and hand them off for review) and `joplo-feedback` (receive local/Share feedback, acknowledge it promptly, and apply requested review results). Both install the same files from one template:

```sh
npx skills add Joplo-app/Joplo           # official skills from this repo; any repo, even before Joplo is installed
npx skills add https://github.com/Joplo-app/Joplo/tree/v0.2.13   # pin to a release tag (Joplo-app/Joplo@v… does not work: the skills CLI reads @… as a skill name)
npx joplo skill install                  # inside a Joplo project: skills matching the project's installed version
```

- Use `npx skills add` when you want agents to discover Joplo in any repository, for example to start a new prototype. The [skills CLI](https://github.com/vercel-labs/skills) installs to `.claude/skills/` for Claude Code and `.agents/skills/` for Codex.
- `npx joplo init` installs engine skills, topics, four plugin skills and their index (and an `AGENTS.md` block) into new projects; pass `--no-skill` to skip. Installing skills first and then running `npx joplo init .` works: agent and Git files (`.git`, `.gitignore`, `.agents/`, `.claude/`, `AGENTS.md`, `skills-lock.json`, …) do not make the directory non-empty, skills already installed at the same version are skipped, and skills you edited are kept (`npx joplo skill install --force` replaces them). Other existing files still need `init . --keep`.
- Use `npx joplo skill install` inside a project that already has `joplo.config.ts`. It writes `.claude/skills/joplo*/SKILL.md`, updates untouched files when Joplo is upgraded, never overwrites files you edited (`--diff` to compare, `--force` to replace), and with `--agents-md` also writes a managed block into `AGENTS.md`.
- The skills are thin on purpose: a mental model, the start order, and common pitfalls. The detailed API always comes from `npx joplo skill <topic>`, which matches the installed version.

### Read guidance on demand

Read only the guidance the current task needs:

```sh
npx joplo skill
npx joplo skill authoring
npx joplo skill story
npx joplo skill content
npx joplo skill cases
npx joplo skill demo
npx joplo skill review
npx joplo skill install --agents-md
```

Engine topics are `authoring`, `story`, `demo`, `focus`, `cases`, `check`, `selection`, `review`, `diff`, `publish`, and `plugins`. Component recipes belong to enabled plugins: read `joplo skill ui/components`, `diagram`, `content`, `alda`, and their subtopics. `joplo skill install` writes engine entries, topic files, plugin entries, and an index; rerun after adding or removing plugins. Edited skills are protected. Individual pitfalls are retained, and starting feedback watch after development remains Required.

Use a second terminal while the Board is running:

```sh
npx joplo check
npx joplo outline
npx joplo selection
```

`outline` prints who each feature is for, its goal, each case with its expected result and coverage per option, and every scenario's steps and estimated duration. `check` reports one issue per line with a file, line, column, severity, and code. Errors exit with 1; usage errors exit with 2. Warnings and information exit with 0. After Option/Alt-clicking in the Board, `selection` returns the label and three lines of source on either side of the selected line.

## Local review

For local reviews, open the **Feedback & review** icon on the right of the demo to leave real feedback or confirm the option. The floating panel keeps the stage at its original size. Agents follow the whole project from a second long-running shell; `joplo dev` prints this exact command after it starts, and the feedback panel can copy it:

```sh
npx joplo feedback watch --local --follow --json
```

Submitted feedback streams as NDJSON, one event per line with `eventId`, `workId` and `sessionId`. The follower covers every option and attaches by itself to the new review round that each source edit opens; approving one option does not stop it. It exits 1 when the board stops and 130 on Ctrl+C. To wait for one option version's approval or resume from a cursor, bind an exact session instead (`feedback list --local`, then `feedback watch --local --session <id> [--after <seq>]`, which exits 0 on approval). See the [CLI documentation](docs/cli.md).

For Share, use `npx joplo feedback watch --share <id> --work <feature.option> --interval 15 --json`. Polling defaults to 15 seconds, configurable from 10 to 30. The current Cloud endpoint exposes a pending-feedback snapshot, so records resolved/applied between polls can be missed; see the [Cloud follow-up requirements](docs/cloud-feedback-watch.md).

## Project layout

```text
joplo.config.ts
layouts/app.tsx
routes/page.tsx
routes/members/page.tsx
features/invite/feature.ts
features/invite/works/a.tsx
shared/
themes/brand.css
.joplo/selection.json
dist/
```

Routes follow folders. Layouts provide the shell and named Slots; Works add content to those Slots or define new routes. A Feature holds its goal, cases, rules, and `pick`. Scenarios describe behavior with `flow()`. Use `@joplo-app/kit` for the authoring API and `@joplo-app/plugin-ui` for components named and configured like Mantine.

Reuse modules inside the project with `shared/`. Keep runtime state in `.joplo/` and build output in `dist/` out of Git. See the authoring topic for exact APIs and [Themes](docs/themes.md) for CSS variables.

## Build and publish

Set each Feature's `pick` to its chosen work filename, then:

```sh
npx joplo check
npx joplo build
npx wrangler deploy --assets dist
```

Build publishes each feature’s selected work and every ready standalone work; drafts and works without slices stay local. The Published site shares the Board's player layout and keeps the demo, subtitles, Layers, and Themes. Rules, assumptions, coverage gaps, and source locations stay on the authoring side. Image export works in the browser; video export is local only.

Use your own Wrangler account and configure the site name and compatibility date for deployment. The output also works with other static hosts. See [CLI reference](docs/cli.md) for output directories, overwrite options, and screenshots.

## Share and embed

Skip hosting entirely: `joplo share --private --no-review` checks, builds, and uploads the Published site to Joplo Cloud, then prints everything you need to put the demo in front of people.

```sh
npx joplo login          # once
npx joplo share --private --no-review
```

```text
Published https://joplo.app/s/<share-id>/
Permanent link
Add to README: [![Joplo 演示 · <title>](https://joplo.app/s/<share-id>/badge.svg)](https://joplo.app/s/<share-id>/)
More embed options: https://cloud.joplo.app/shares/<share-id>
```

Choose `--public` or `--private` and `--review` or `--no-review` every time. Public shares enter your portfolio at `show.joplo.app/@username` and search engines; private shares are visible to anyone holding the link. Agents must ask the user both questions before publishing. CI must pin both flags; missing choices fail with exit 2 before building or connecting. Interactive terminals ask instead.

`--review` also publishes a separate private, commentable link with all options (`data.review.url`); `data.url` is the main share. A scoped review with no picked scenarios publishes only the private review at `data.url` (`data.mode: "review"`), leaving the ordinary share unchanged. Scoped shares and PR previews are always private. Public share results include a portfolio work URL or a username setup link; the player shows “Author · More works” only on official Cloud shares, outside embeds. Write names, descriptions and goals as search-result content and keep unpublished information out.

Private Pro shares can require an access password: run `npx joplo share --private --no-review --password` in your terminal for hidden input and confirmation. In automation, set `JOPLO_SHARE_PASSWORD` securely yourself and include `--password`; using a literal value can put it in shell history. Agents must never invent or choose passwords, or put them in files or conversation summaries. Omit both password flags to keep protection; `--no-password` removes it, including on free accounts after a downgrade. PR previews and comparisons cannot use passwords. With `--review`, a newly set password protects both links. The board offers the same controls for private shares, with a Pro upgrade link for free accounts. Results/records contain only `passwordProtected`, never the password; viewer protection requires the matching Cloud rollout. [Password details](docs/cli.md#密码查看pro).

Every share link comes with three ways to show it:

| Where | Use | What viewers get |
| --- | --- | --- |
| README, issue, PR | `[![…](<link>badge.svg)](<link>)` — the `Add to README` line | A playable badge, like the one [at the top of this page](#joplo), that opens the full demo |
| Social cards, link previews | `<link>preview.png` | A 1200×630 image of the default scenario's first screen |
| Docs, blogs, product pages | `<iframe src="<link>?embed=1" …>` | A compact player: cover with a big play button, then step controls, scenario switcher, and fullscreen |

The embed code from `--format json` or the Cloud console is ready to paste:

```html
<iframe src="https://joplo.app/s/<share-id>/?embed=1" title="<title> · Joplo 演示"
  style="width:100%;aspect-ratio:16/10;border:0"
  allow="fullscreen *" allowfullscreen loading="lazy"></iframe>
```

- Add `&scenario=<scenario id>` to start from a specific scenario (`npx joplo outline` lists the ids) and `&autoplay=1` to skip the cover. Invalid values fall back to the cover and the default scenario.
- Keep `allow="fullscreen *"`: the share page runs in a CSP sandbox, so plain `allow="fullscreen"` blocks fullscreen in Chromium, Firefox, and WebKit. Without it the player falls back to opening the demo in a new tab.
- The embedded player makes no network requests and does not use storage. GitHub strips iframes from Markdown, so use the badge there.
- `--scenario <id>` and `--work <id>` share only part of a project. Everything else is cut at build time, not hidden.
- Links never expire, on free accounts too. Each account has storage instead (free 100 MB, Pro 5 GB, counted from the raw size of every live share), and `share` prints how much you use. Re-sharing updates the same link, so badges and embeds you already published stay current.
- In CI, set `JOPLO_API_KEY` and run `npx joplo share --private --no-review --new --pr <number> --format json` for a PR preview. Agents should copy `data.embed.markdown` / `data.embed.iframe` as is rather than building URLs themselves.

The preview image needs the optional export component (`npx joplo setup export`); without it, share still succeeds and uses a generic card. Details: [`share` in the CLI reference](docs/cli.md#share) and [embed mode](docs/web.md#嵌入模式).

## Compare feature changes

Compare two real public builds and get one review site that plays both versions:

```sh
npx joplo diff before-site after-site --out diff-site
```

Added scenarios play the new version, removed scenarios play the old one, and modified scenarios stack both players in one frame: press Space to flip between old and new in place, or switch to side by side. The sidebar lists every change by caption, and each change card shows what was inserted, deleted, or edited, with the old → new result values. Stable `.key()` identities keep steps aligned across insertions; ambiguous legacy matches stay marked as uncertain. In PR CI, `diff prepare` pins the baseline, the PR is built without credentials, and `diff publish` runs separately with them. A demo change is not proof that the real implementation changed.

Run `npx joplo skill diff` for the version-matched workflow and recovery steps. See the [CLI](docs/cli.md#diff跨版本功能变化) and the [full guide with a safe CI example](docs/feature-diff/README.md).

## Examples

| Example | What to explore |
| --- | --- |
| [examples/button-40-years](examples/button-40-years) | One send button through four decades; playable period interfaces, chapter dragging and original Alda music |
| [examples/invite](examples/invite) | Compare an invitation dialog with a batch invitation flow |
| [examples/agent-arch](examples/agent-arch) | Layers, Director, grouped `Diagram`, `Sequence`, `StateMachine`, and `trace()` for an agent architecture |
| [examples/joplo](examples/joplo) | Joplo’s own evolving design workspace: real feature alternatives, interaction prototypes and documented decisions |

[![Joplo demo: Joplo's own design process](https://joplo.app/s/dn1MWCcnDW/badge.svg)](https://joplo.app/s/dn1MWCcnDW/)

The self-design workflow publishes a separate feature comparison for same-repository PRs after CI passes, and updates this fixed link after successful main CI. See [automation and recovery](docs/self-design/CI-CONTRACT.md); npm releases remain tag-driven.

## Develop in this repository

```sh
pnpm install
pnpm joplo dev examples/invite --open
pnpm typecheck
pnpm test
```

The workspace uses `joplo` as the command entry point, with `@joplo-app/kit`, `@joplo-app/core`, `@joplo-app/cli`, `@joplo-app/server`, and `@joplo-app/web` behind it. The CLI loads the server only for `dev`, `build`, `render`, and `setup`. Writing demos, `dev`, `check`, `build`, and `share` need no browser. Screenshots (`render`), image and video export in the board, and share preview images use an optional export component (Playwright + Chromium, about 100 MB) that Joplo installs once under `~/.joplo`, never into your project:

```sh
npx joplo setup export
```

The board's Export menu can also install it with one click.

See [dependencies and licenses](docs/dependencies.md) and the [npm release workflow](docs/release.md).

## Documentation

- [CLI reference](docs/cli.md)
- [Board and Published site](docs/web.md)
- [Embed mode](docs/web.md#嵌入模式)
- [Feature diff](docs/feature-diff/README.md)
- [Themes](docs/themes.md)
- [Authoring model](docs/adr/0002-hugo-like-authoring.md)
- [Demo model and architecture](docs/adr/0003-demo-model.md)
- [Product decisions](DECISIONS.md)

Run `npx joplo skill` for task-focused authoring guidance that matches your installed version.

## Scope and execution boundary

Joplo models behavior; it does not run a real product backend. Routes must be static. A mobile experience needs its own page or demo. AI assumptions cannot be marked as confirmed without a real user decision, and interaction belongs in `flow()` rather than `onClick`.

Author modules execute on your machine during loading, checks, and builds. Only run projects you trust. The Board and Published site consume compiled IR. Local review records stay in the project directory. MCP, multi-user collaboration, and real-time cloud comment sync are outside this local release.

## Contributing

Joplo accepts issues, not pull requests. Report bugs and request features in [issues](https://github.com/Joplo-app/Joplo/issues/new/choose); see [CONTRIBUTING.md](CONTRIBUTING.md). Email security issues to [support@joplo.app](mailto:support@joplo.app).

## License

[PolyForm Shield 1.0.0](LICENSE). Anyone can use Joplo for free, including at companies and for commercial work; you may not use it to provide a product that competes with Joplo or Joplo Cloud. See [COMMERCIAL.md](COMMERCIAL.md). Versions 0.2.15 and earlier were released under Apache-2.0. Bundled fonts use [SIL OFL 1.1](packages/web/src/fonts/OFL.txt).

The template explicitly enables `@joplo-app/plugin-content`, which provides `content:Canvas`, `camera()`, FLIP properties and the `content:studio` theme. Import its authoring API directly from the package; declare it at the Joplo version in project dependencies and enable it in config.plugins. `npx joplo skill content` covers continuous visual explainers; see [llm-explainer](examples/llm-explainer) and the [plugin contracts](docs/plugins.md). Use `chapter()` for chapter continuity and `joplo render --sheet --columns 3` for storyboards.

Standard UI and HTML are provided by `@joplo-app/plugin-ui`: import markers directly from that package and explicitly enable it in config.plugins. IR uses `ui:Button` / `ui:div`. `joplo components` reads enabled plugin manifests; `joplo skill ui/components` provides the full UI guide. Import diagram components and trace from `@joplo-app/plugin-diagram`. See [plugin contracts](docs/plugins.md).

GLB 资源与生成：`asset('./model.glb')` 支持离线模型；scene3d 的 `Model` 用法见 `joplo skill scene3d/models`。可选 `@joplo-app/plugin-3d` 通过 `joplo resources --dry-run` 估算、明确确认后生成，模型与元数据进 Git，Key 仅留本机。详见 [插件资源契约](docs/plugins.md#17-p1-eglb-与显式付费的持久资源)。

### A journey through one apple

[apple-journey](examples/apple-journey) combines six generated GLB subjects, public-domain paintings, original instrumental scores and Chinese narration. Pause to orbit, hover, drop the fruit, scrub a discrete timeline or choose a fairy-tale branch. Its asset ledger records licenses, generation costs and local optimization. Optional scenarios use `flow('Slice title', { autoplay: false })`: they remain selectable but do not interrupt sequential playback.
