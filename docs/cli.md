# Joplo CLI（0.1.2）

Joplo 的作品由 Agent 用代码写成，能播放，也能上手试；用来比较功能方案、解释系统运转，或讲清事情的经过，通过链接与嵌入交付。

安装后的项目使用 `npx joplo`；仓库内使用 `pnpm joplo` 运行源码。需要 Node.js ≥ 22。任意命令都支持 `-h, --help`。

## 命令与参数

```sh
npx joplo init [dir] [--template <spec>] [--name <name>] [--keep] [--no-skill]
npx joplo dev [dir] [--port <port>] [--open]
npx joplo check [dir] [--format text|json] [--work <qid>]
npx joplo outline [dir] [--format text|json] [--work <qid>]
npx joplo selection [dir] [--format text|json]
npx joplo skill [topic]
npx joplo components [name…]
npx joplo skill install [dir] [--force] [--diff] [--agents-md]
npx joplo build [dir] [--out-dir <dir>] [--overwrite] [--scenario <id>]… [--work <id>]…
npx joplo login [--no-browser] [--format text|json] [--server <url>]
npx joplo logout [--server <url>]
npx joplo whoami [--format text|json] [--server <url>]
npx joplo voice [dir] [--work <id>] [--scenario <id>] [--dry-run] [--locale <lang>]… [--format text|json] [--server <url>]
npx joplo share [dir] (--public | --private) (--review | --no-review) [--format text|json] [--new] [--title <title>] [--json] [--password [<值>] | --no-password] \
  [--scenario <id>]… [--work <id>]… \
  [--pr <number> [--repo <owner/name>] [--sha <commit>]] [--server <url>]
npx joplo feedback [dir] [--share <id>] [--format text|json] [--server <url>]
npx joplo feedback [dir] --applied <决定 id,…> [--ref <源码版本>] [--share <id>] [--format text|json]
npx joplo feedback list [dir] --local [--json] [--all] [--work <功能.方案>]
npx joplo feedback watch [dir] --local [--session <id> | --follow] [--after <序号>] [--json]
npx joplo feedback watch --share <id> --work <功能.方案> [--version <版本>] [--interval 15] [--json] [--server <url>]
npx joplo render [dir] --scenario-id <qid> --out <file> \
  [--step-id <qid>] [--theme <theme>] \
  [--width <pixels> --height <pixels>] [--scale <scale>] [--overwrite]
npx joplo render [dir] --scenario-id <qid> --out <file> --sheet [--columns <n>] [--theme <theme>] [--overwrite]
npx joplo render [dir] --scenario-id <qid> --out <file.png> --film [--chain] [--every <ms>] [--columns <n>] [--frames <dir>] [--format text|json] [--overwrite]
npx joplo render [dir] --scenario-id <qid> --frames-out <dir> [--fps 30] [--chain] [--viewport 720x1280] [--no-frame] [--crop <selector|x,y,w,h>]
npx joplo render [dir] --scenario-id <qid> --out <file.webm|file.mp4> --video [--chain] [--width <px> --height <px>] [--voice real|estimate|off] [--hide <items> | --clean] [--srt <file.srt>] [--overwrite]
```

可省略的 dir 默认为当前目录。`render` 的 scenario-id、out 必填。主输出和帮助写 stdout，服务日志、截图告警和项目依赖版本提示写 stderr；用法错误或缺少分享选择（CHOICE_REQUIRED）退出 2，领域或执行失败退出 1，云端需要登录（AUTH_REQUIRED / AUTH_EXPIRED）退出 3，账号空间不够（share）退出 6，Joplo Cloud 朗读额度不够（voice，`TTS_QUOTA_EXCEEDED`）退出 7，成功退出 0。

## init

从独立公开[模板仓库](https://github.com/Joplo-app/joplo-templates)默认分支生成可运行项目。缺省为 `github:Joplo-app/joplo-templates/starter`，直接下载仅含模板的 tarball，不需要 Git；源码运行与发布 CLI 使用同一来源，不随 CLI 版本打模板 tag。

- `--template starter` 等同默认，比较功能方案；`--template work` 创建一件可直接播放、暂停并修改输入的独立作品（`works/explainer.tsx`，两个默认接续的章节，无 `features/` 或占位 `routes/`），只启用 ui，不需要凭证或生成资源。
- 不含路径分隔符、不以 `.` 开头、不是 `github:` 前缀的值按模板名解析，须匹配 `^[a-z0-9][a-z0-9-]*$`；任何合法名都下载模板仓库里的同名目录，新模板无需发 CLI。内置名优先于同名本地目录，本地目录须写 `./work`。目录不存在时报“模板仓库里没有这个模板”，并给出仓库网址；空名、大写、下划线、其他特殊字符在下载前拒绝。
- 模板与主仓库隔离，由维护者直接手动更新模板仓库，不参与发版；默认分支须能被最新发布 CLI 使用，不保证旧版 CLI 可用。0.6.0 及更早的已发布 CLI 仍读主仓库原 tag，其中的文件不受当前删除影响。
- `--template ./local-template` 使用本地目录，适合离线开发。
- `--template github:owner/repo/templates/team#ref` 支持仓库、可选子目录和分支/tag/提交；省略 ref 时使用 HEAD，即仓库默认分支。私有仓库优先读取 `GITHUB_TOKEN`，其次读取 `gh auth token`。令牌只发给 GitHub API，不写入文件、输出或 codeload 请求头。
- 模板必须含有效 `package.json` 和 `joplo.config.ts`（或 tsx）。先完整读取、验证再创建目标；空目录、缺文件、下载失败、找不到 ref/子目录、压缩包损坏、链接或 `..` 路径都给出中文恢复提示，可改用本地模板，不留下半截目录。
- 下载使用 30 秒空闲超时：持续收到数据时不限制总时长，大小上限、路径穿越防护和只允许 codeload 重定向的限制仍生效。
- 模板占位符 `__JOPLO_VERSION__`、`__PACKAGE_NAME__`、`__PROJECT_NAME__` 分别替换成 CLI 精确版本、目录生成的 npm 包名、项目显示名；源码里的项目名占位符必须是完整引号字符串。

- `--name <name>`：项目名，默认目录名。
- `--keep`：目录非空时只补缺失文件，已有文件不改动；不传时拒绝非空目录，并列出前几个文件名。
- 只含 Agent / 版本控制文件（`.git`、`.gitignore`、`.gitattributes`、`.agents`、`.claude`、`.codex`、`.cursor`、`AGENTS.md`、`CLAUDE.md`、`skills-lock.json`、`.DS_Store`）的目录视为空目录（D65）：不要求 `--keep`，按 `--keep` 的方式写入，已有文件一字不改；保留的 `.gitignore` 缺少 `node_modules/`、`.joplo/`、`dist/`、`exports/` 时在输出里提示。
- starter 的 package.json 将 `joplo`、`@joplo-app/kit`、`@joplo-app/plugin-ui` / `diagram` / `content` / `alda` 锁到当前 CLI 精确版本，config.plugins 显式列出四个插件；引擎不隐式加载任何插件。
- tsconfig 使用 `react-jsxdev`、`jsxImportSource: '@joplo-app/kit'`、`allowImportingTsExtensions`。
- 默认同时安装 Agent 技能（D64），等同于对新项目运行 `npx joplo skill install --agents-md`：写入 `.claude/skills/joplo/SKILL.md`、`.claude/skills/joplo-feedback/SKILL.md` 、引擎 `topics/*.md`、启用插件各自的入口/主题与索引，以及 AGENTS.md 的 Joplo 托管段，输出一行 “✓ Agent skills: …; skip with --no-skill”。`--keep` 时沿用 skill install 的保护：用户改过的技能不覆盖（整批技能都不写，提示先 `--diff` 再 `--force`），AGENTS.md 只增改托管段；标记损坏时不写技能并说明原因。这些情况都不影响 init 成功。已经装好的同版本、未修改的技能（例如 `npx skills add` 装的官方技能，含指向 `.agents/skills` 的软链接）跳过不写，输出 “already installed (Joplo <版本>, unchanged)”；用户改过的技能不带 `--keep` 时同样保留，提示 `--force`。
- `--no-skill`：不安装技能，也不写 AGENTS.md。
- 最后一行提示安装依赖并启动看板；命令写法按 npm/pnpm/yarn/bun 环境选择。

```sh
# 比较功能方案
npx joplo@latest init my-demo
# 或从独立作品开始
npx joplo@latest init my-demo --template work
cd my-demo
npm install
npx joplo dev --open
```

## dev：一个进程，多个项目

生成帧、视频或协作元数据写在项目内时，可在 `joplo.config.ts` 配置 `watch: { ignore: ['exports/frames', '.coord'] }`。排除项是项目相对的文件/目录路径（目录包含子项），不是 glob；重启该看板后生效，仅影响本项目。`.joplo`、`dist`、`node_modules`、`.git` 仍默认忽略。不要排除实际引用的素材目录；普通图片变更仍会更新作品。

首次运行启动本地看板，默认绑定 `127.0.0.1:4790`，打印项目链接。`--open` 打开浏览器；`--port` 接受 1–65535 的整数，启动新看板时指定端口。端口被其他应用占用时明确报错，不静默换端口。

同一个 `JOPLO_HOME` 下已有存活看板时，再次运行只注册当前项目、打印链接并退出，不再启动第二个进程；这时优先加入已有看板。加入时 stderr 写出那个看板的 Joplo 版本和启动目录（`[joplo] Joined the running board: Joplo 0.2.7, started in /path/to/demo (pid 123)`）；它的版本和当前项目的 Joplo 不一致时（0.2.6 及更早的看板不报版本，也算不一致）多一行 `!` 警告：看板可能表现不同，要用当前版本就在它的终端按 Ctrl+C（或 `kill <pid>`）停掉，再在这里运行 `joplo dev`（D65）。`JOPLO_HOME` 默认 `~/.joplo`：projects.json 记最近项目，server.json 记运行实例，settings.json 记主题选择。

首页可切换项目与功能；源文件变化只重新编译对应项目，保存后热更新。编译出错时显示诊断，并保留上一次成功的画面；修复后恢复。界面和交互见[看板文档](web.md)。

## 作品、切片与范围
项目是作品集：作品 → 切片 → 步骤。比较方案、列情况、做设计决定用 `feature()` + `work()`；讲解片、资讯和产品片用 `works/<key>.tsx` 的 `work()` + `chapter()`，两者可以共存。章节默认接续上一章，编号由界面和 outline 自动生成；`flow()` 用于独立场景。所有作品都有封面并进入首页；`work()` 是唯一作品入口，功能下写在 `features/<f>/works/<key>.tsx`，同样用 `title` / `summary`。

`check` / `outline` / `feedback list|watch` 的 `--work` 接受独立作品键或限定方案 id；`build` / `share` 的 `--work` 接受条目键（独立作品或功能），只发一件，功能普通版取选定方案、评审版取全部方案。没有旧参数别名。独立作品无需 pick；`draft: true` 不进普通版或评审版，输出 `WORK_DRAFT_SKIPPED`，显式选择草稿时报错。只有草稿时先完成一件作品再发布。

outline 按条目分组：独立作品显示标题、切片数、总时长，每行显示键、标题、步数和时长；章节有自动编号，草稿带 `(draft)`。JSON 的作品容器与归属字段统一为 `works` / `workId`，接续能力用 `sequencing`。独立作品切片 id 是两段（`explainer.arrival`），功能下面是三段（`invite.a-modal.happy`）；渲染与深链复制 `outline --format json` 中的 id，不拆 id 推断结构。check 文本与 JSON 的诊断指向 `works/<key>.tsx:行:列`。构建/分享摘要列作品键与标题，并列明跳过的草稿。字段位置按 `WORK_FEATURE_ONLY` / `WORK_STANDALONE_ONLY` 校验，旧备选目录报 `OPTIONS_DIR_RENAMED`，具体字段表见[作品模型](work-model.md#字段按位置校验)。最小示例与恢复方法见 `npx joplo skill authoring`、`check` 和 `content`。

## check

使用项目 tsconfig，经 tsx `tsImport` → core `loadAuthoring` → `compile(..., 'dev')` → `validate(..., { mode: 'all' })`；回放由 player 的 `replay()` 执行。源文件会在本机加载。

- `--format text|json`：默认 text。
- `--work <id>`：接受独立作品键或限定方案 id，仅校验这件作品的结构和回放，例如 `invite.a-modal`；整个项目仍须编译。

```text
features/invite/works/a-modal.tsx:24:16  warning  CASE_NOT_COVERED  Case is not yet Covered: invite.happy 正常发出邀请并被接受
0 error, 1 warning, 0 info
```

每个问题一行 `文件:行:列  级别  代码  说明`，最后汇总；同位置、代码、说明和级别的重复项只输出一次。结构校验错误定位到最近的作者元素（不再是 `joplo.config.ts:1:1`）；同一个根因（例如共享的 JSX）在多个画面 / 层级展开时合并成一条，说明末尾附 “(affects N views)”，只计 1 个 error，JSON 的诊断项新增 `affects: [画面 id]`（其余字段不变）。`when` 收到普通布尔、数字或字符串时报 `INVALID_CONDITION`，说明要用条件表达式并给出示例。error 退出 1，用法错误或缺少分享选择（CHOICE_REQUIRED）退出 2，只有 warning/info 时退出 0。按定位只读改需要的那一处；代码含义和修法见 `npx joplo skill check`。

JSON 为 DomainResult 风格：成功含 `ok/projectId/revision/requestId/summary/changedIds/diagnostics/artifacts/data`；检查失败含 `ok: false/error/diagnostics/data`。data 是 name、diagnostics、summary、verification；载入前或用法错误可能没有 data。`revision: 0` 仅兼容结果信封，文件版本交给 Git。

叙事与覆盖的提示（D67）：`DESCRIPTION_TOO_LONG`（warning，flow 的 description 即场景封面说明超过 30 个“字”）、`CARD_TEXT_TOO_LONG`（info，过渡卡副标题 > 48、某条要点 > 24 或多于 4 条）、`SCENARIO_TOO_LONG`（info，单个场景按 1× 估算超过 90 秒）、`HAPPY_PATH_ONLY`（info，功能只声明了 main 情况且所有场景都成功）；`CASE_NOT_COVERED` 的说明末尾带上 `(high priority; expected: …)`。“字”的算法与字幕相同（中文 1、其他 0.5、空白不算）；估算时长与自动播放同一份规则。在仓库 examples/ 上这些新提示为 0 条。

## outline

不打开看板也能检查一个演示“讲给谁、讲什么、讲多久”（D67）。与 check 一样编译 dev IR 并校验，然后输出：

```text
团队邀请功能 · 1 feature(s), 2 work(s), 6 scenario(s), ≈ 1 min 6 s at 1×

## invite · 团队成员邀请   picked: a-modal
Goal: 空间管理员邀请同事加入空间并指定权限，让新成员当天就能开始协作
Roles: 空间管理员, 普通成员, 受邀者
Cases (A B: ✓ shown ✗ missing ? undecided – not applicable ⊘ excluded):
  revoked           lifecycle   high   ✓ ✗  邀请被撤销后再次打开链接 → 说明邀请已失效，并告诉对方去找空间管理员
  already_member    conflict    medium ? ✗  被邀请人已经是成员 → (expected result not written)
A · a-modal · A · 单人邮件邀请弹窗 (picked): 4 scenario(s) ≈ 51 s · missing 2 · undecided 1
    revoke   撤销邀请后对方再打开链接  5 steps ≈ 15 s     success · cases: revoked
check: 0 error, 9 warning, 5 info (warning OUTCOME_MISMATCH ×1, warning CASE_NOT_COVERED ×8, …). Run npx joplo check for file:line.
```

- 情况一行：键、维度、优先级、每个方案的覆盖、标题 → 期望结果（case.expected，没写时提示）。这是 PM 视角的验收矩阵：标题是 Given，期望结果是 Then。
- 场景一行：键、名字、步数与估算时长（1×，与自动播放同一份 stepPlan，包含操作演示，以及停留与朗读估算中的较长者）、结局、是否以过渡卡开场 / 收尾、覆盖的情况。
- `--work <id>` 只看一件独立作品（键）或功能下面的方案（`功能.方案`）；不存在时 USAGE（退出 2）。有 error 时退出 1：能编译出 IR 时照常输出大纲，编译不出时只写错误数。
- `--format json`：`data.outline = { name, mode, entries: [{ id, featureId, title, summary, roles, pick, sequencing, draft, cases, works: [{ id, key, title, picked, ms, missing, undecided, scenarios }] }] }`。独立条目的 featureId 为 null；作品在 works 下，切片项用 id/key/name/description/steps/ms/cards/opening/ending/outcome/caseIds。作品简介在条目的 summary，OutlineWork 自身提供 title；workId 用于 IR 归属与反馈记录。`data.summary` 是 check 汇总；失败为 `ok: false` 信封，无法编译时 `data.outline` 为 null。完整 IR v3 字段见[作品模型](work-model.md#3-ir-v3)。

## components

`npx joplo components` 列出当前 config.plugins 声明的组件。`npx joplo components Menu DataTable` 输出组件及子组件的属性、行为分组和示例；名称不区分大小写，短名歧义时使用 `ui:Menu`。未知名称退出 2。所有说明来自启用插件的清单；UI 的完整主题为 `npx joplo skill ui/components`。无项目或未启用插件时目录为空。

## selection

读取项目 `.joplo/selection.json`，不重新编译。先在看板中按住 ⌥（Option/Alt）单击元素，再运行：

```sh
npx joplo selection
npx joplo selection --format json
```

text 输出 at、标签和目标行前后各三行带行号源码。文件不存在或内容为 null 时输出“Nothing selected”，退出 0；无源位置、文件已删除或行已不存在时解释状态。无效 JSON/at 或项目外路径退出 1。

JSON 的 data.selection 保留 core Selection，data.lines 是 `{ number, text }[]`，note 说明定位不可用的原因。看板写选中 → 服务端对照 IR 计算 at → 本地文件 → CLI 读源码 → Agent 局部修改；详见[选中定位链路](web.md#选中与源码定位)。

## review：本地评审与流式监听

```sh
npx joplo feedback watch [dir] --local --follow --json
npx joplo feedback watch [dir] --local --session <id> --json
npx joplo feedback watch [dir] --local --session <id> --after 3 --json
```

保持 `joplo dev` 运行。`dev` 启动后在 stderr 打印第一条命令（stdout 仍只有看板地址），反馈面板里也能复制它。

`--follow` 跟住整个项目：所有方案的进行中会话，以及之后新开的会话（改源码后的新一轮、新方案）。事件格式与单会话相同，靠 `sessionId`、`workId`、`eventId` 区分；某个方案 `approved` 不结束监听。所有会话的看板进程都停止后输出提示并退出 1，Ctrl+C 退出 130。启动时没有存活的进行中会话退出（NOT_FOUND）；不能与 `--session`、`--after` 同用。启动时重放进行中会话的已有事件，消费者按 `eventId` 去重。正在跟的每个会话都写监听租约，看板显示 Agent 在线。

需要等待某一个方案版本确认、或按游标补收时，使用精确会话：每个方案版本有独立会话。`list` 默认列出存活实例的未结束会话；`--all` 查看历史，`--work <功能.方案>` 筛选。`watch` 可省略 `--session`，但必须只有一个匹配的活跃会话；有多个时退出 2，列出候选，绝不自动选择“最新”实例。显式会话也始终限定在给定项目目录里，目录按真实路径解析，worktree 分别处理。

`--json` 的 stdout 是 NDJSON，一行一个事件。状态与错误只写 stderr；不带 `--json` 时输出人可读文本。事件共有字段为 `sessionId`、`instanceId`、`projectDir`、`featureId`、`workId`、`revision`、`seq`、`requestId`、`createdAt`：

- `feedback`：已提交的完整反馈（`body`），以及服务端验证的 `context`：`route`、`sceneId`、`scenarioId`、`position`（已经执行的步数，初始为 0）、`stepId`、`source`、`pageTitle`、`scenarioName`。不会发送未提交的键盘输入。
- `approved`：当前方案版本的确认；输出后监听退出 0，本地看板继续运行。确认只记录评审结论，不写 TSX 的 `pick`、不运行代码、不表示意见已经实现，也不发布网站。
- `closed`：源码变化、编译失败、方案删除或服务正常关闭，附带 `reason`；退出 1，表示尚未得到确认。源码编译成功后是新会话，需重新 `list` 并绑定。

记录先以临时文件写入、fsync、原子替换后才返回成功，保存在项目 `.joplo/reviews/<session>.json`（权限 0600，默认不进 Git）；每个实例使用随机身份和独立会话文件，端口重用不会改变监听目标。监听直接观察本地事件文件，没有网络重连期间丢事件的问题。短期监听租约仅用于界面显示在线状态，不决定评审结果。

默认重放全部已保存事件，`--after <seq>` 只输出之后的事件；消费者按 `sessionId + seq` 去重。两个监听器互不消费对方的事件。用户确认后即使服务已停止，也能用显式会话补读并退出 0。未确认时服务异常退出会报错；Ctrl+C / SIGTERM 停止监听并退出 130，不结束评审。游标非法或超出现有序号退出 2，损坏记录／跨项目记录拒绝读取。每条反馈最多 10,000 字符，每会话最多 999 条反馈，记录总量上限 16 MiB，为终结事件预留空间。

本地监听不需要登录云端。入口为 `joplo feedback list/watch --local`。`feedback [dir]` 原有的云端单次读取及 `--applied` 行为保持不变。

## feedback watch：本地与 Share 的统一入口

```sh
# 本地实时读取文件事件：跟住整个项目，或绑定一个会话
npx joplo feedback watch ./my-demo --local --follow --json
npx joplo feedback watch ./my-demo --local --session <id> --json

# Share 普通 GET 轮询，不需要 SSE 或 WebSocket
npx joplo feedback watch --share Abc1234567 --work invite.a-modal --interval 15 --json
```

Share 立即读取一次，随后默认每 15 秒轮询；`--interval` 接受 10–30 之间的整数秒，请求完成后再计时，不重叠发送。网络错误按原间隔退避到最多 30 秒；鉴权、权限、找不到分享、配额和响应格式错误会结束命令。Ctrl+C / SIGTERM 会中止在途请求与等待，退出 130。

Cloud 必须指定 `--share` 和 `--work`，避免另一个方案的确认结束监听。`--version` 可显式指定版本，否则锁定首次响应中的分享版本；分享更新时输出 `closed/source_changed` 并退出 1。只有该版本、该方案的作者 `pick` 决定映射为 `approved` 并退出 0；投票、规则确认、其他方案或旧版本决定都不会结束监听。不把 Cloud 的确认写入本地会话，也不自动标记决定 `applied`。

本地和 Cloud 输出统一的 `source`、`eventId`、`sessionId`、`featureId`、`workId`、`revision`、`createdAt` 及 `type`。`feedback` 携带 `body/context`，`approved` 表示确认，Cloud 的其他决定为 `decision`，监听目标失效为 `closed`。本地继续保留 `seq`、`requestId`、`instanceId`、`projectDir`；Cloud 携带 `server`、`shareId`、`version`，没有可伪造的 `seq`，也暂不接受 `--after`。Cloud 的页面路径与源码位置当前接口不提供，输出 null，保留已有的场景、步骤和元素信息。

**当前兼容模式的边界：**复用 `GET /api/v1/shares/{id}/feedback`，仅能观察未解决评论及未撤回、未写回的决定。单次运行按稳定 `eventId` 去重；重新启动重放当前快照，消费者可按同一 `eventId` 去重。如果记录在两次轮询之间被解决或标记已写回，可能被漏掉。当前接口只取最新 1000 条未解决评论，且没有分页游标。客户端版本过滤也不能替代 Cloud 拍板接口的 `expectedVersion` 校验。完整的补收与旧页面保护需要 [Cloud 改动清单](cloud-feedback-watch.md) 中的服务端配合。

该接口仍仅允许分享主人或其具备 `feedback:read` 的 API Key 读取；“公开 Share 链接”不等于匿名读取管理侧反馈。

## skill

`npx joplo skill` 先用几行讲清心智模型（预设场景的播放器，不是自由输入的应用原型）和起步顺序，再列出当前 CLI 版本、引擎主题、已启用插件及其主题；不限制技能长度，常见坑逐条保留。`npx joplo skill <主题>` 输出 Markdown，结尾指向相关主题。未知主题会建议编辑距离最近的名称并退出 2。

| 主题 | 内容 |
| --- | --- |
| authoring | 心智模型、起步顺序、目录、页面、布局、方案、flow、绑定、`when` 只接受条件表达式、带错误重试的表单示例、规则 |
| story | 先规划再动手（受众、1–3 件事、每个场景一行 Given → When → Then）；PM 视角怎样用 roles / goal / cases / expected / priority / rules 表达需求、怎样拆场景；开场、收尾、字幕与 explain 的写法；交付前的检查（D67） |
| demo | 自由体验与丢弃语义、drag/hover/scroll/插件动作、独立层级、导演、镜头、短字幕、布局、深链接与截图 |
| focus | 聚焦、标注、停留与遮挡的引擎规则 |
| plugins | 发现/安装/阅读插件技能、API v2 扩展契约、动作、运行时、资源、属性、主题 |
| cases | 八个维度及按产品类型筛选的情况预设；先做正常流程 + 一条错误恢复 |
| check | 诊断代码与局部修复、合并诊断、`UNBOUND_INTERACTIVE` 的三种处理 |
| selection | 用户选中后只改指向的位置 |
| review | 本地实时监听、Share 轮询、交接顺序、先回执再处理、多实例／版本隔离、恢复、事件示例和最佳实践 |
| diff | 双版本公开演示差异、稳定步骤 key、歧义匹配、prepare 与隔离 CI 发布 |
| publish | pick、build、每次可见性与评审选择、作品集与 SEO、feedback 回流、静态站部署与演示能力 |

引擎主题不讲具体组件。`npx joplo skill ui`、`ui/components`、`diagram`、`diagram/patterns`、`content`、`content/patterns`、`alda` 由项目启用插件提供；在项目目录运行，CLI 会读取 config 模块，不启动服务端或编译整套作者文件。无项目时只列引擎指南与插件使用说明。

`authoring` 说明具名 `work.free` 字典、可嵌套组合的效果数组与本机反应；`demo` 说明动作和播放仲裁。`flow('Slice title', { actionEntry: 'after' })` 让跨场景确认直接落到匹配动作之后，用于时间轴等直接操纵；缺省或 `'before'` 仍停在动作前。取消保留本地体验，确认丢弃体验且只消费匹配动作，后续步骤等待继续；普通章节选择、自动播放与 `from` 不受该策略影响。效果对象拼错会报 `EFFECT_INVALID`，不会隐式结束场景。`story` 说明先收集素材、核实字体与样本许可证并记录 `assets/SOURCES.md`；插件指南补充复古主题作用域、同物件连续转场和逐章配乐。`plugins` 主题也说明动作声明、`ctx.act` 识别器、引擎时钟演示器、通用本机资源编译器与媒体轨道。可选 `@joplo-app/plugin-alda` 需要先安装并在项目 `config.plugins` 中显式启用，然后在该项目目录运行 `npx joplo skill alda`；不要把项目路径作为读取主题的第二参数（该参数只供 install 使用）。技能说明配乐文本、步骤 play/stop、缓存、warning 恢复和离线验证。`check` 不执行本机编译器；看板首次需要声音时生成，`build/share` 在范围裁剪后生成，失败 warning 保留在看板/构建结果，其他演示内容继续可用。

### skill install

写入引擎入口 `.claude/skills/joplo/SKILL.md`、`joplo-feedback/SKILL.md` 和 `joplo/topics/*.md`，与仓库 `skills/` 逐字一致。读取项目 config.plugins 后，生成每个插件的 `joplo-plugin-<id>/SKILL.md`、`topics/*.md` 和总索引 `joplo-plugins/SKILL.md`；`.joplo-plugins.json` 记录安装器拥有的插件文件。

增删插件后重新运行 install：新增和更新当前插件技能，删除已禁用插件的未修改生成文件，不动无关技能。任何待写或待删技能被用户改过，整批操作都停止，退出 1；`--diff` 包含删除项，`--force` 才明确替换或删除。配置/依赖加载失败不视为“无插件”，保留全部已装技能并提示安装依赖后重试。init 自己安装引擎技能；依赖未安装时保留模板随附的插件技能（由模板维护者手动更新），未随附也不报错；安装依赖后运行 skill install 按 config.plugins 同步。`joplo` 负责创作演示和启动评审交接；`joplo-feedback` 负责本地／Share 的接收、及时回执、恢复以及按授权修改源码。完整使用指南和最佳实践通过 `npx joplo skill review` 按需读取，包括后台进程不会自动唤醒 Agent 的边界；不能挂起监听后结束响应却声称仍实时接收。AGENTS.md 已存在时更新 Joplo 托管段；不存在时仅在显式传 `--agents-md` 后创建。

- `--diff`：只打印 unified diff，不创建或改写文件，优先于 force。
- `--force`：允许覆盖或删除被用户修改过的托管技能文件。
- `--agents-md`：即使 AGENTS.md 不存在也创建指针段。

SKILL.md 末尾保存 `<!-- joplo-skill <版本> sha256:… -->`，哈希覆盖标记前全部原始字节。重装时：未改动的生成内容（包括旧版本写的短指针、用 `npx skills add` 装的官方技能）自动更新，输出 “Wrote … updated from <旧版本> to <新版本>”；字节相同输出“Already up to date”且不重写；任何一个技能被用户改过或缺少有效标记时，全部技能和 AGENTS.md 都不写，提示先 `--diff` 看差异、再 `--force` 覆盖，退出 1。目录没有 joplo.config.ts 时只安装引擎技能并说明插件发现方法。`joplo init` 默认对新项目做同样的安装（见下）。

AGENTS.md 仅替换 `<!-- joplo:start -->` 与 `<!-- joplo:end -->` 之间的段落，段外字节不变；标记损坏或重复时拒绝写入。指针文件可提交 Git，安装器下次读取哈希/标记决定是否更新，Agent 读取指针后再调用 CLI。

## build

按每个功能的 pick 编译发布视图，只输出选定方案；无 pick 的功能不发布并提示 NOT_PICKED。先 check，再 build：

```sh
npx joplo check
npx joplo build
```

- `--out-dir <dir>`：默认项目 dist；显式相对路径按命令当前目录解析。
- `--overwrite`：确认原产物可清空后允许重建非空目录；不允许清空项目自身、上级目录或 `.joplo/`。
- `--scenario <id>` / `--work <id>`（可重复，D75）：只构建这些场景（功能 = 选定方案的全部场景），范围与 `share --scenario` 相同，方便在本地检查分享出去的产物。输出多一行 `Scope: …`，借用了别的功能的内容时每项一行 `Borrowed from another feature: …`。规则见下方「按场景保密分享」。

产物是静态站（素材是 `assets/` 下的独立文件，须通过 HTTP 打开：`npx joplo preview`、分享或任意静态托管；不支持 file:// 双击，D98），含场景、字幕、层级、镜头、调用链与主题，去掉规则、情况、问题、备注及源位置。

朗读（D74 / D85）：选用了声音来源时（项目没选过、config 也没写时，已登录 Joplo Cloud 就按 Joplo Cloud 朗读，只读本机登录、不联网），当前声音已生成的音频拷进 `voice/`（同一步、同一声音、同一语言只带最新一段），IR 带上 `voiceIndex`；Key 和 `voice` 配置都不进产物。输出多一行 `Narration: N audio clip(s) from <供应商> (… KB) included`；还有步骤没有当前文字的音频时一并说明，这些步骤在发布站用观众浏览器朗读，不影响构建。没有选用供应商时不输出这一行。不再支持的旧 profile（AiHubMix、OpenAI 兼容、自定义 HTTP）已生成的音频照常带上。音频在看板里生成，或用 [`joplo voice`](#voice)（见[看板文档](web.md#朗读d74)）。界面与本地演示页共用布局。部署见 publish 主题；发布站边界见[看板文档](web.md#发布站)。

## preview

```sh
npx joplo preview [dir] [--port <port>]
```

在本机用只读静态服务器打开构建产物（D98）。`dir` 可以是构建输出目录，也可以是项目目录（用它的 `dist/`）。默认端口 4799，被占用时换一个空闲端口；只监听 127.0.0.1，不出目录，支持 Range（视频、音频拖动）。stdout 只有地址，Ctrl+C 停止。

构建产物的素材是 `assets/<sha256>.<ext>` 独立文件，配乐、模型这类需要读取字节的素材在 file:// 下读不到，所以发布站只保证通过 HTTP 打开。

## render

把场景截图为 PNG；缺省为初始状态，step-id 表示该步骤执行之后的状态。

| 参数 | 含义 |
| --- | --- |
| `--scenario-id <qid>` | 场景限定 ID，必填 |
| `--out <file>` | 截图文件，必填；相对当前目录解析 |
| `--step-id <qid>` | 指定步骤后的状态 |
| `--theme <theme>` | 内置主题名或项目 themes/name.css 的名称，默认项目 config 的主题 |
| `--width <pixels>` / `--height <pixels>` | 截图输出宽高，必须同时给出正整数；按比例容纳页面，不改变页面自己的 viewport 或响应式断点。配合 `--video` 时是视频分辨率（2–4096 的偶数，例如 1920×1080、1080×1920）：舞台（手机含外框）等比缩放后居中，四周是主题背景色，文字与线条按输出分辨率重新绘制，不是放大位图。舞台本身的宽高比不变（电脑 16:10），竖屏画幅放手机页面最合适。配合 `--viewport` 可直接改变逻辑布局 |
| `--scale <scale>` | 有限正数，像素倍率 |
| `--overwrite` | 允许覆盖已有截图；仍不得覆盖项目源码或 `.joplo/` |
| `--sheet` | 分镜：把场景从初始画面到最后一步逐步截图，拼成一张网格图，每格下面写步号、字幕与旁白（`narrate`，没有时为 `say`）；各步的截图告警加 `Step n:` 前缀写到 stderr。不能与 `--step-id`、`--width`、`--height` 同用。分镜只有每一步落定后的画面，看不出硬切与静止；运动用 `--film` 检查 |
| `--columns <n>` | 分镜每行几格（1–6，默认 3）；胶片条每行几格（默认 8） |
| `--film` | 胶片条（D92）：用渲染路由的录制模式真实播放场景，Playwright 假时钟按引擎时间逐帧定格（约 50 ms 一帧算相邻帧差），每 `--every` 毫秒取一格；每格标时间、步号、本格最大相邻帧差。红框 = 单帧整屏突变（硬切），灰框 = 至少 1.5 s 没有可见变化（静止）。每个场景一页（多页时文件名加 `-1`、`-2`…），旁边写 `<out>.json`（全部帧的差值、硬切、静止、每次提交前后的最大帧差）。stdout 打印文件路径、时长、换章处的最大帧差以及每个 `CUT` / `STILL`。旁白按估算时长“读”（不出声、不调用朗读服务），停留与开着朗读的发布站一致 |
| `--video` | 视频：同一录制模式按真实时间录 webm（与看板导出同一个录制器）。音轨是媒体插件的配乐混音加上已生成的旁白（见 `--voice`）；浏览器朗读（Web Speech）录不进去。开播前的载入、字体与音频准备不进视频，画面从封面淡出、第一步开始（项目自带的旧版 Playwright 没有录屏接口时退回从建页开始录）。stdout 打印视频路径、`--srt` 路径、分辨率与旁白模式；`real` 模式下列出没有音频、按估算时长停留的旁白 |
| `--voice <mode>` | 配合 `--video`：`real`（默认）= 已用 `joplo voice` / 看板生成的旁白音频（`.joplo/voice/`，当前声音）混进音轨，按真实音频时长停留，没有音频的段按估算时长（不出声）并在输出里列出；`estimate` = 全部按估算时长、不出声；`off` = 不读旁白，停留只按阅读时间。从不生成音频、不花朗读额度 |
| `--hide <items>` | 配合 `--video`：干净画面，逗号分隔：`cover`（开场封面）、`cursor`（鼠标与点击波纹）、`title`（左上角步骤标题条，含结束时的完成徽标）、`subtitles`（底部字幕条）。章节之间的过渡卡是内容，不隐藏 |
| `--clean` | 配合 `--video`：等于 `--hide cover,cursor,title,subtitles` |
| `--srt <file>` | 配合 `--video`：另存字幕为 SubRip 文件，时间对到视频时间轴（字幕条出现到消失）；隐藏字幕条时也可以用，交给视频平台用它自己的字幕样式 |
| `--chain` | 配合 `--film` / `--video`：放完接着放同一方案的下一个场景（发布站连续播放的顺序），直到最后一个；`chapter()` 接力的章节一镜到底 |
| `--every <ms>` | 胶片条每格的间隔（默认 250） |
| `--frames <dir>` | 胶片条的每一格另存为 JPEG，便于全尺寸检查可疑的一帧 |
| `--viewport <WIDTHxHEIGHT>` / `--no-frame` | 直接设置逻辑舞台尺寸，并可去掉设备外框；布局、镜头、覆盖层和命中区域共用同一坐标。输出像素仍由 width/height 决定 |
| `--crop <selector-or-rect>` | 截图、sheet、film、frames 共用选择器或相对输出画布的 CSS 像素矩形；film 像素占比基于裁后画面。video 请用 viewport 定义画幅 |
| `--frames-out <dir>` / `--fps <n>` | 公开逐帧 JPEG 导出，默认 30fps、干净画面、已有旁白真实时长；自动写 timeline.json。不需要 out，不调用云 TTS。累计 round(k×1000/fps)，允许约50ms调度容差 |
| `--timeline <file>` | 帧序列、film、video 的 schemaVersion 1 实际播放事件；包含引擎和输出时间、步骤提交/结束、章边界、旁白、镜头与通用媒体快照 |
| `--sample-ms <ms>` | film 计算间隔20–250ms，默认50；every仅控制保存格数。粗采样更快但可能漏掉短暂CUT，最终检查使用50ms |
| `--checkpoint <file>` / `--resume` | 逐章保存像素分析；恢复时重放引擎状态，复用已验证分析。源码/运行时/配置不符拒绝恢复；输出目录不要共享 |
| `--chapter-timeout <ms>` | film 每章墙钟处理超时，默认180000；失败保留最近检查点 |

| `--format json` | 胶片条结果以 JSON 输出到 stdout |

render 需要**导出组件**（Playwright + Chromium，见下方 `setup export`）。写演示、dev、check、build、share 都不需要它；本地看板的图片和视频导出、share 的预览图需要。没有时：

- 交互终端（stdin 与 stderr 都是 TTY，且没有 `CI`）：询问是否安装（默认否，写明下载大小），回答是则安装后继续截图；
- 非交互（Agent、CI、管道）：不询问、不下载，打印 `EXPORT_COMPONENT_MISSING  … Run: npx joplo setup export …` 并以**退出码 4** 结束。

已有项目里装过 `playwright`（或 `playwright-core`、`@playwright/test`）的老项目照常使用项目里的那份，不需要安装导出组件；两者都有时优先用导出组件。浏览器启动失败时提示 `npx joplo setup export --force` 重装。

## setup export

```sh
npx joplo setup export            # 安装（已装时提示已就绪，可重复运行）
npx joplo setup export --status   # 只检查，不安装；没装时退出码 4
npx joplo setup export --force    # 重新安装
npx joplo setup export --uninstall
```

安装 Joplo 自己管理的导出组件（D66）：固定版本的 `playwright-core`（与 `@joplo-app/server` 的版本锁定）加 Chromium headless shell（以及录视频用的 ffmpeg）：下载约 99 MiB 的 Chromium 加几 MB 的 playwright-core 与 ffmpeg，占用磁盘约 220 MB。位置是 `$JOPLO_HOME/runtime/playwright-<版本>/`（`JOPLO_HOME` 缺省 `~/.joplo`），浏览器也在同一目录（`PLAYWRIGHT_BROWSERS_PATH` 指向它的 `browsers/`）。**不写项目的 package.json、lockfile 或 node_modules**：npm 在运行时目录里执行（`--prefix` 也是它），使用用户自己的 npm 源配置；浏览器下载走 Playwright 的 CDN，可以用 Playwright 的 `PLAYWRIGHT_DOWNLOAD_HOST` 换镜像。

- stderr 显示下载大小和进度：终端里同一行刷新，非终端每 10% 一行；stdout 只有一行结果。
- 装完以 `ready.json` 为准：中途失败（网络、npm、Chromium 起不来）不算已安装，重新运行即可续装；同一时间只有一个进程能安装（CLI 与看板共用一把锁）。
- 升级 Joplo 后 Playwright 版本变化时需要重新安装；装好新版本会删掉旧版本的目录。
- `--format json`：`data` 是状态（`ready`、`source: managed | project | null`、`version`、`dir`、`downloadMB`、`command`）；`--status` 没装时为 `ok: false`、`error.code: EXPORT_COMPONENT_MISSING`。
- 退出码：0 成功；1 领域或执行失败；2 用法错误或缺少分享选择（CHOICE_REQUIRED）；3 需要登录；4 导出组件未安装（render、`setup export --status`）；6 账号空间不够（share，`QUOTA_EXCEEDED` 且 `details.kind` 为 storage）；7 Joplo Cloud 朗读额度不够（voice，`TTS_QUOTA_EXCEEDED`）。

服务契约见 [contract.ts](../packages/server/src/contract.ts)。所有主题和选项以当前 `--help` 为准；需要创作细节时优先读取对应 skill 主题。


## 云端地址与凭证

CLI 和 skill 输出遵循 D57，统一使用英文；本文保留中文说明。云端命令的产品决策见 D58。

只有 `login`、`logout`、`whoami`、`share`、`feedback`、`voice`（用 Joplo Cloud 朗读时）连接云端；本地命令继续完整、免费。评审版、反馈回流、API Key 与 PR 预览的决定见 D63，接口以云端契约（评审、API Key 与 PR 预览）为准。
地址优先级：`--server <url>` → 非空 `JOPLO_CLOUD_URL` → `https://cloud.joplo.app`。空字符串等同未设置；协议/主机名及默认端口规范化后匹配凭证。地址必须是 HTTP(S) 源（不带路径、查询参数或用户名密码）。
每个云端 API 请求携带 `X-Joplo-Client: joplo-cli/<版本>`；预签名文件 PUT 严格使用服务端返回的 headers，不附加账号令牌或版本头。
凭证只适用于其记录的 server；切换服务器需要重新登录，不会把另一个服务器的令牌发送过去。

`JOPLO_HOME` 与看板 settings.json 使用相同解析规则：非空环境变量按当前目录解析，默认 `~/.joplo`，新建目录权限为 0700。
`credentials.json` 权限为 0600，读取已有凭证时，只有 group/other 权限开放才尝试收紧；只读挂载等导致 chmod 失败时只警告，不影响请求；先写同目录临时文件再原子 rename；损坏或缺字段时视为未登录并提示重登。
不要把凭证文件复制到项目中、输出或提交 Git。`.joplo/cloud.json` 只保存服务器、分享 ID 和链接。

### JOPLO_API_KEY（CI 与 Agent）

在云端控制台“设置 → API Key”创建 Key（`jpk_` 开头，完整值只显示一次），存进 CI 的 secrets，以环境变量 `JOPLO_API_KEY` 提供：

- 设置后**所有**云端命令（share、whoami、feedback）都用 `Authorization: Bearer <key>`，不读写 `credentials.json`，不触发设备登录，也不打开浏览器；非交互环境照常可用。
- 值必须是 `jpk_` + 至少 32 位字母或数字，否则 USAGE（退出 2），不发请求。完整 Key 只出现在 Authorization 头里，输出中一律替换为 `[REDACTED]`，只显示前 8 位前缀。
- `login` 只打印 “JOPLO_API_KEY is set: …” 并退出 0（不联网、不写凭证）；`logout` 不动本地凭证，提示取消环境变量或到控制台吊销。
- Key 无效、过期或已吊销：AUTH_EXPIRED（退出 3），message 写前缀并指向 `<server>/settings/api-keys`（`details.fix`）。Key 缺少某个权限范围时服务端返回 403 FORBIDDEN，CLI 报 FORBIDDEN（退出 1），message 写前缀并说明是 Key 的权限范围不够（不报“账号不可用”），`details.fix` 指向 API Key 页。
- 权限范围：`shares:publish`（whoami、share）、`shares:read`、`feedback:read`（feedback）、`feedback:write`（feedback --applied）、`voice:generate`（voice、看板里的 Joplo Cloud 朗读）。

## login

```sh
npx joplo login
npx joplo login --no-browser
```

终端显示网址和验证码，请在浏览器核对并允许授权。默认打开含验证码的网址；非交互终端、SSH、`--no-browser` 或系统没有打开命令时，请手动访问网址。
CLI 按服务器指定间隔轮询（缺省 5 秒，最小 1 秒；协议间隔不受错误退避上限截断）；要求降速时每次增加 5 秒。轮询期间网络错误、5xx、429 会退避后继续，等待为 min(max(interval, min(当前退避, 30 秒)), 剩余时间)，只有错误退避封顶 30 秒；interval 包含 slow_down 累加部分。429 读取 Retry-After 或 X-Retry-After，前者优先，至 expires_in 截止；拿到 token 后若账号查询或凭证保存失败，尽力 sign-out 回收会话。拒绝授权或验证码过期会退出并提示重新登录。显式 login 在 CI、JOPLO_NONINTERACTIVE=1、--format json 或非 TTY 下也打印验证码和网址并轮询，但不自动打开浏览器。只有交互式跨服务器替换登录时才读取确认输入。Windows 使用 rundll32 打开网址，不经过命令解释器。
登录成功后保存 `{server, accessToken, user: {id, email}, createdAt}`；text 标准输出只显示账号；JSON 的 data 为 `{server, user: {id, email}, createdAt}`，不包含令牌，验证码和进度仍写 stderr。

重新登录：先保存新凭证，再向旧凭证自己的服务器尽力 sign-out 旧 token，失败只警告，绝不把旧 token 发给新服务器。新凭证写入失败时保留原文件，只撤销新签发的 token。
跨服务器替换：交互终端先询问“Replace the login for <旧服务器>. Continue?”；EOF 按“否”处理，Ctrl+C 取消登录并退出 2，不留下未完成的 question。显式 login 在非交互环境返回 USAGE（退出 2），提示“Run joplo login --server <目标服务器> in your own terminal and confirm replacement”，不要求先 logout。
非交互 share 若凭证属于其他服务器，返回 AUTH_REQUIRED（退出 3），details 为 `{fix: "npx joplo login --server <目标服务器>", credentialServer: "<旧服务器>"}`；Agent 应请用户自己登录，不要替用户运行 logout。

CI 只有值非空且不是 `0` / `false`（不区分大小写）时才生效；JOPLO_NONINTERACTIVE=1 始终生效。

## logout

用 bearer 调用 `POST /api/auth/sign-out`（请求体 `{}`）吊销当前 CLI 会话，然后删除本地凭证。令牌只在 Authorization 头里。远端失败只在 stderr 警告，本地仍退出；必要时在网页的设备管理中撤销会话。
没有凭证时可重复执行。指定其他 server 时返回 USAGE（退出 2），不会吊销或删除原服务器的凭证。logout 同时清理遗留的 credentials.json.*.tmp 文件。

## whoami

```sh
npx joplo whoami --format json
```

读取云端当前账号、套餐及限额，不以本地缓存推断套餐。JSON 沿用结果信封，`data` 为 `{user: {id, email, name}, plan, limits: {maxUploadBytes, maxTotalBytes, maxFiles, publishesPerHour}}`；服务端 publishesPerHour 返回数字（Pro 为 120）。CLI 兼容旧服务返回 null，显示“Not provided by the server”，不据此推断额度。

朗读额度（D85）：whoami 同时读 `GET /api/v1/voice`，`data.voice` 是 `{plan, period: "trial" | "month", allowanceChars, usedChars, remainingChars, resetsAt, packs: [{remainingChars, expiresAt}], totalRemainingChars}`；文本多一行 `Narration: 3,200 characters left (3,200 of 5,000 free trial)`（Pro 写 `this month, resets 2026-12-01`，有加油包时写 `+ N from top-up packs`）。服务端有 storage 时另有一行 `Storage: <已用> of <上限> used`。旧云端没有 `/api/v1/voice`（404）、连不上或格式不对时没有 `voice` 字段，whoami 照常成功。

使用 `JOPLO_API_KEY` 时 `data` 另有 `apiKey: {name, prefix, scopes, expiresAt}`：取自 `/api/v1/me` 响应的 `credential`（只认 `kind: "api_key"`；设备会话的 `{kind: "device"}` 不显示），服务端没给或格式不对的字段为 null（不让 whoami 失败）；`prefix` 缺省时用本地 Key 的前 8 位。文本输出多一行 `API key "<名字>" jpk_xxxx… · scopes: … · expires … (JOPLO_API_KEY)`。用登录凭证时没有 `apiKey` 字段，输出与原来相同。

## voice

生成缺少的朗读音频（D74 / D85），给 Agent 和脚本用；与看板的「生成缺少的音频」同一套缓存（`.joplo/voice/`）、声音来源与默认规则。

```sh
npx joplo voice --work short --dry-run # 只估算：几步没有音频、约多少字、生成后还剩多少
npx joplo voice --format json        # 生成选定方案所有场景的缺少音频（每种内容语言各一遍）
npx joplo voice --locale ja          # 只做一种内容语言（必须在 config 的 locales 里；可重复）
```

- 先 check：编译有 error 时以 `INVALID_SCHEMA` 退出 1，不生成。
- 范围：每个功能选定方案的全部场景；项目写了 `locales` 时每种内容语言各一遍（D84，音色按 `resolveVoices(…, 语言)`）。朗读文字与 build 打包算片段键的文字相同（自动字幕用编译出的字幕；看板里自动字幕按界面语言生成，非英文界面时可能和这里不同）。
- 声音来源：`joplo.config.ts` 的 `voice.profile` > 看板里选的 > 没选过时已登录用 Joplo Cloud 朗读（用 CLI 的登录或 `JOPLO_API_KEY`，Key 需要 `voice:generate`）> 都没有时 `VOICE_NO_SOURCE`。Joplo Cloud 的请求带 `locale`（内容语言；项目没写 locales 时不带）与 `project`（项目名，控制台明细用）。
- 范围：`--work <id>` 接受独立作品键或功能方案的完整 id；`--scenario <id>`（别名 `--scenario-id`）选一章并包含 `from` 前置章节，两者同时写时章节必须属于该作品。省略时仍生成全部非草稿独立作品及选定方案。非法/草稿范围在请求语音前失败。
- 明细：dry-run 文本逐步列出作品、章节、步骤、字符与待生成字数；JSON 的 `data.locales[].details` 包含 `workId/scenarioId/stepId/text/chars/missing/estimatedBillableChars`。这是基于本机缓存的字数上界估算，不是实际收费：远端 Cloud 缓存命中免费。同声音同文字只估算一次，静音步骤列零。确认后去掉 `--dry-run`，范围外缓存和声音固定选择不受影响；build/share 仍按自己的范围打包已有音频。
- 静音：步骤写 `narrate(false)`，禁止旁白、台词、字幕兜底与朗读字幕；没有显式静音时保留旧回退。`narrate('')` 仍报错。单语言项目也可写 `config({ locales: ['zh-CN'] })` 声明原文语言；没声明时片段记录为 `und`（未知），不拿界面语言冒充内容语言。
- 字数：每段 `Array.from(文字).length`，生成成功才扣，云端缓存命中不扣；已经在 `.joplo/voice/` 的段不再请求。`--dry-run` 不发请求，只估算。
- 文本输出：`Voice source: Joplo Cloud (default when signed in)`、每种语言一行（生成了几段、几段已有、几段失败及原因；`--dry-run` 时是要生成几段、覆盖几步、约多少字——文字相同的步骤共用一段）、剩余字数一行、最后一行合计。`--format json` 的 `data`：`{profile: {id, name, kind}, source: "config" | "board" | "default", dryRun, locales: [{locale, segments, missing, chars, generated, skipped, failed}], total: {segments, missing, chars, generated, failed}, quota, usageUrl, exhausted}`；`quota.totalRemainingChars` 是最后一段响应头里的剩余（不在本地估算）。有失败的段时退出 1（重跑只重试它们）。
- 错误码：
  - `TTS_QUOTA_EXCEEDED`（**退出 7**）：额度不够（云端 402）。已生成的保留，剩下的步骤在看板和发布站用浏览器朗读。`details`：`neededChars`、`remainingChars`、`usageUrl`（当前 server 的 `/usage`，买加油包）、`generated`、`remainingSteps`。
  - `VOICE_UNSUPPORTED`（退出 1）：选用的是不再支持的旧来源（AiHubMix、OpenAI 兼容、自定义 HTTP）。已生成的音频照常播放和发布；换成 Joplo Cloud 朗读、OpenAI 或 ElevenLabs 才能生成。
  - `VOICE_NO_SOURCE`（退出 1）：没登录也没选来源、OpenAI / ElevenLabs 没有 Key、config 写了本机没有的 profile；message 带登录命令。
  - `AUTH_REQUIRED` / `AUTH_EXPIRED`（退出 3）、`EMAIL_UNVERIFIED`（要先验证邮箱或用 GitHub 登录）、`FORBIDDEN`（API Key 缺 `voice:generate`）。
  - 503 `TTS_UNAVAILABLE`、429、网络错误按云端命令的重试策略重试（最多 3 次，读 Retry-After，503 不扣字数），仍失败的段记进失败原因。
  - 云端连不上、或旧云端没有朗读（`/api/v1/voice` 404）：不发请求，以 `NETWORK`（退出 1）结束；`--dry-run` 照常估算。
- 非默认内容语言下 Joplo Cloud 自动选的音色，第一次生成成功时记进 `.joplo/voice/index.json` 的 `pins`，之后（云端调了推荐、换了电脑）都按它选，旧音频不失效、不重复扣字。读取时逐层清洗语言、基础音色与目标音色（固定六种 ID），仅忽略损坏项，合法项保持原值；缺项按推荐规则选择，不会因为损坏元数据将成功合成改判失败。不要删除整个音频索引。
- 旧版自建、id 为 `cloud` 的来源保留为带 `legacyId: "cloud"` 的旧 profile；原来的看板选择和 `voice.profile: 'cloud'` 仍解析到该旧来源（`VOICE_UNSUPPORTED`，已生成音频可播放、打包）。主动在看板选择官方 cloud 会持久记录官方选择；若 config 控制来源，改为 `voice.profile: 'Joplo Cloud'` 明确使用官方服务。配置优先级不变，旧 Key 不会迁移给官方来源。

托管朗读的云端契约（Cloud C27，CLI 只按它读写）：`GET /api/v1/voice` → `{model, quota, voices: [{id, gender, labels, samples}], recommended: {<locale>: [voiceId…]}, defaultVoice}`；`POST /api/v1/voice/speech` `{text, voice, locale?, project?}` → `audio/mpeg`，响应头 `X-Joplo-Chars-Charged`、`X-Joplo-Chars-Remaining`、`X-Joplo-Cache: hit|miss`、`X-Joplo-Audio-Sha256`；错误 `{code, message, data}`（400 BAD_REQUEST、401、402 TTS_QUOTA_EXCEEDED、403 EMAIL_UNVERIFIED、429、503 TTS_UNAVAILABLE）。音色 id 固定 6 个：`narrator-warm-f`（默认）、`narrator-calm-m`、`bright-f`、`friendly-m`、`clear-f`、`deep-m`。

## share

**每次必须选择两项**：公开 `--public` / 私密 `--private`，以及同时发评审版 `--review` / 不发 `--no-review`。参数互斥时退出 2；CLI 绝不读取项目默认值、上次记录或账号偏好。Agent 发布前必须先问用户这两件事，不能替用户决定；下面示例假设已获相应授权，CI 必须在 workflow 写死两项。

缺任意项时，非 TTY、设置 CI、`--json`（等同 `--format json`）直接以退出码 **2** 返回 `CHOICE_REQUIRED`；JSON 为结果信封 `{ok:false,error:{code:"CHOICE_REQUIRED",message,details:{code:"CHOICE_REQUIRED",missing:["--public / --private","--review / --no-review"]}}`，missing 只列缺失项。此时没有登录、检查、构建或网络请求。交互终端逐项提问；默认高亮公开、不发评审版，必须按键确认，EOF / Ctrl+C 取消。

公开会进入 `show.joplo.app/@用户名` 作品集并被搜索引擎收录。项目名、简介与功能目标应写成希望出现在搜索结果里的样子，不要包含未公开的信息。私密只有拿到链接的人能看；需要访问密码时，使用下方的密码查看（Pro）。

PR 预览（`--pr`）与按场景/功能保密分享（`--scenario` / `--work`）隐含私密，不要求可见性参数；显式 `--public` 在本地退出 2。仍须选择是否同时发评审版。对比使用 `diff publish`，始终私密且不支持评审版，不要求上述两项。

`--review` 先发布主分享，再发布包含所有方案、可评论的独立私密评审链接。JSON 的主链接为 `data.url`，评审链接为 `data.review.url`（其 `mode` 为 review）；文本分行显示。范围分享先按评审模式校验，再分别取普通版的 picked 子集和评审版的全部请求范围，分别记录范围键。如果请求范围没有 picked 场景（例如未选方案 B，或尚未 pick 的功能），只发布私密评审版：`data.mode = "review"`、`data.url` 就是评审链接，没有 `data.review`；主分享与 `--update` 的普通目标均不更新。评审版不进入作品集。第二次发布失败时主分享可能已上线且已记入记录：stderr 给出主链接，重试时沿用同样选择，不加 `--new`。

公开成功时 JSON 附带云端返回的 `visibility` 与 `portfolio: {workUrl,profileUrl,needsUsername,setupPath}`；有用户名时文本输出作品详情地址，`needsUsername` 时输出“设置用户名后，这个作品会出现在你的作品集：<server><setupPath>”。字段缺失或 URL 为 null 时照常成功。`whoami` 透传可选 `username: string|null`、`portfolioUrl: string|null`；旧 Cloud 缺失时不补造值。

### 密码查看（Pro）

私密分享可用 `--password [<值>]` 设置或更换访问密码，`--no-password` 去掉密码；两者互斥。不带这两个参数时保持已有保护（新建时不设密码），**环境变量本身不会开启密码**。密码按 Unicode 码点计算，8–128 个字符，不裁剪空格。

- 交互终端省略值：`npx joplo share --private --no-review --password`，隐藏输入并确认一次。EOF / Ctrl+C 取消，不发布。
- 非交互、CI、JSON：用户自己安全地设置 `JOPLO_SHARE_PASSWORD` 后，运行同一命令。推荐环境变量；`--password <值>` 虽支持，但会进入 shell 历史，Agent 不应代填。
- Agent 不能替用户设或编密码；请用户自己在终端输入或设置环境变量。不要把密码写进历史、文件、源码或对话总结。
- 只能配私密普通/范围分享；`--public`、`--pr`、对比分享带密码参数，或长度不合法、非交互缺值，均以 **2** 退出，且不发网络请求。`--no-password` 同样只能用于私密非 PR 分享。
- 设置/更换需 Pro（含创始会员）；降级后已有密码继续保护，免费账号仍能去掉。403 `PLAN_REQUIRED` 沿用退出 **1**，提供当前 `<server><upgradePath>`（`error.details.upgradeUrl`，缺省 `/settings/billing`）。不能用 `--new` 绕过套餐限制。
- 与 `--review` 同用时主分享和评审版使用同一密码，输出明确说明；两次发布仍各自提交，评审失败时主链接可能已成功，重试需用户再次提供密码。
- 成功文本显示“已加密”，JSON 的主分享及评审分享带 `passwordProtected: boolean`；旧云端缺字段按 false。不回显密码。Cloud 在返回页面前执行验证，保护页面、资源、音频、Agent 读取和嵌入，预览卡不泄露作品内容；本地静态 build 本身没有密码保护。
- 只有本次给了 `--password` 或 `--no-password` 才发送创建请求 `password`（字符串 / null），并一律显式带 `visibility: "private"`；即使没有本地记录，也能用 `--update <公开分享链接> --private` 同时切为私密并设置或移除密码。不传 password 即保持原状，普通私密分享保持 #37 的请求体。400 正文涉及 password 时提示“Joplo Cloud 还不支持密码查看”，退出 **1**，不误走 review 兼容重试。

### 可见性兼容与字段数据流

公开请求始终发送 `visibility: "public"`。本次选择私密且明确发送 password（字符串或 null）时，新建和更新一律显式带 `visibility: "private"`，不依赖本地记录，确保更新公开链接时同时切为私密。完全没有密码操作时沿用旧兼容规则：新建分享不发送 visibility；更新仅在同服务器的本地分享记录中，目标链接明确为 `visibility: "public"` 时发送 `visibility: "private"`，用于撤下作品集中的公开作品。目标记录没有 visibility（旧链接）、为 private，或 `--update <链接>` 的目标不在本地记录中时，无密码操作的私密更新都省略此字段，保证旧 strict Cloud 仍可更新。匹配按目标 shareId 查找 main/review/scoped，不能用其他链接的 public 记录代替。记录只决定字段是否必须发送，绝不替代本次显式选择。CLI 与看板共用此规则。旧 Cloud HTTP 400 且信息涉及 visibility / 未知字段时，以 BAD_REQUEST、退出 1 提示“Joplo Cloud 还不支持公开分享，请改用 --private 或稍后再试”；不误走 review 清单降级重试，也不静默改私密。

| 字段 | 写入点 → 存储 → 读取点 → 消费者 |
| --- | --- |
| visibility / review 选择 | 看板 radio/checkbox → POST 本机 cloud/publish → server 校验并存 CloudHub.job.request → cloud-bridge 转本次 ShareOptions → CLI shareChoices → CloudClient POST shares；review 拆成第二个始终私密的请求 |
| password | 用户终端隐藏输入 / 显式参数 / JOPLO_SHARE_PASSWORD（需 --password）或看板遮挡输入 → POST 本机 cloud/publish → server → cloud-bridge → CLI → Cloud POST shares；本次为字符串或 null 时均同时显式发送 visibility: private，未操作时省略 password 并保留原可见性兼容规则；只在内存中，不进任务快照、GET / WebSocket、日志、IR 或构建文件 |
| passwordProtected | Cloud finalize → CLI JSON / 文本结果 → cloud.json 主/评审/范围记录 → bridge links / publish → 看板“已加密”；旧云端缺字段按 false，本机从不保存密码 |
| CLI 可见性 / 评审选择 | 本次参数或 TTY 回答 → 仅本次内存 → share → CloudClient；不从配置或记录回填 |
| mode（仅评审结果） | 请求范围没有 picked 子集 → CLI 只发布评审 → data.mode=review、data.url 为评审链接 → cloud-bridge → CloudHub.job.result → 看板标明链接含全部方案且始终私密；主分享与 --update 目标不更新 |
| visibility 返回值 | Cloud finalize → CLI 白名单解析 → data.visibility → cloud-bridge → CloudHub.job.result（GET / 推送）→ 看板结果；旧云端省略 |
| portfolio | Cloud finalize → CLI readPortfolio → data.portfolio → cloud-bridge → CloudHub.job.result → 看板作品详情或 <server><setupPath> 新标签链接；缺失和 null 兼容 |
| username / portfolioUrl | Cloud GET me → CloudClient.me → whoami JSON / cloud-bridge.account → server account → 看板账号模型；仅返回已存在字段 |
| 链接 visibility 记录 | CLI finalize 后 atomicJson 写 .joplo/cloud.json 的 main/review/scoped 链接 → readShareRecord 按同服务器读取 → ① bridge.links → 本机 /cloud/links → 看板更新预填（缺字段私密，读取失败禁用发布并重试）；② CLI 按本次 replaceShareId 匹配记录，仅 public→private 更新显式发 private，private/缺字段/无匹配省略。CLI 仍独立要求本次选择，不用记录补选项 |
| 云端 shares 列表 visibility | Cloud GET shares 每项 → 控制台列表消费者；开源 CLI 目前不消费该列表，看板从上述本机记录与任务结果读，缺失按私密 |
| 作者 name / url | Cloud 删除作者自带同名 meta 并仅为公开分享注入 head meta joplo-author → 分享 HTML → readAuthor → 普通播放器顶栏和结束画面；不写入 IR/本地记录，不进入嵌入/导出 |


```sh
npx joplo share --private --no-review
npx joplo share --private --no-review examples/invite --title '邀请流程' --format json
npx joplo share --private --no-review --new
npx joplo share --private --no-review --scenario invite.a-modal.success     # 只分享一个场景（D75）
npx joplo share --private --no-review --work invite                      # 只分享一个功能
```

### 按场景保密分享（D75）

`--scenario <场景 id>`（可重复）只分享这些场景；`--work <条目 id>`（可重复）= 一件独立作品或一个功能选定方案的全部切片（带 `--review` 时是全部方案的场景）；两者可以一起用。不写时分享整个项目，行为不变。看板「导出 ▾」里的「发布到 Joplo Cloud」走同一条路径（D76，见 [web.md](web.md)）。

- **保密靠构建时裁剪**，不是隐藏导航：上传的所有文件（内联 IR 的 index.html、voice/、`_joplo/preview.png`）和评审清单里都没有范围外功能、方案、场景的 id、名字、目标、角色、说明和步骤文字。深链接 `#/f/<功能>?s=<场景>` 和嵌入的 `scenario=` 只决定从哪里开始看，不算保密。
- 保留：范围内场景及其方案、功能；场景用得到的画面（起始画面、`go()` 能到的画面、方案的层级画面）和这些画面的路径。去掉：范围外的分叉、规则、情况、问题，以及**项目说明**（常常概述所有功能）；项目名保留。
- **借用**：同一路径上别的功能堆进来的元素（含 `when` 隐藏的）默认去掉；范围内步骤引用到它（操作目标、镜头、标注、焦点提示、标注气泡、trace）时，只保留那一条贡献子树，去掉暴露方案 id 的 `from`。场景跳到别的功能新增的路径时，这个页面也按借用保留，去掉 `addedBy`。stderr 每项一行 `Borrowed from another feature: <功能名> › element "<id>" on <路径> (referenced by …)`，JSON 在 `data.scope.borrowed`，照常发布，由作者判断能不能分享；不想带上就改场景。
- 写错场景 / 功能（NOT_FOUND，列出相近或可分享的场景）、范围为空时，在构建和任何云端请求之前失败。不带 `--review` 时，场景属于没选定的方案、功能没有选定方案（USAGE，退出 2）同样提前失败；带 `--review` 时允许这些范围，普通版只含 picked 子集，没有 picked 子集就仅发布私密评审版。旧版 `@joplo-app/server` 忽略范围时（产物里有范围外场景）报 UNSUPPORTED_ACTION，不上传。
- 预览图用范围内第一个场景（按演示顺序），用裁剪后的 IR 渲染。朗读音频只带范围内步骤用到的。
- 每个范围是**单独的分享**，记在 `.joplo/cloud.json` 的 `scoped: { <范围键>: { shareId, url } }`，范围键是排序后的场景 id 用逗号连接（评审版加 `review:` 前缀），不覆盖主链接和评审链接。Pro 再次分享同一范围更新原链接，`--new` 新建；场景改名后是新范围、新链接。
- 默认标题是“项目名 · 场景名”（多个场景时“项目名 · N scenarios”）。文本输出多一行 `Scope: …`；JSON 的 `data.scope = {key, scenarios, entryIds, borrowed}`。
- 已知边界：作者 CSS 与 Tailwind 扫描到的类名整份打包；`routes/` 下的基础页面所有功能共用，原样保留；元素 id 和项目名由作者自己起，可能带有含义。

- 未登录：交互终端显示“Sharing requires a free Joplo account”，直接进入浏览器登录，完成后继续发布；非交互环境（包含 --format json、有效 CI 环境变量、JOPLO_NONINTERACTIVE=1）立即返回 AUTH_REQUIRED（退出 3），提示用户运行 `npx joplo login`。
- 先 check，再复用 build 构建到临时目录；结束时清理临时产物，不改项目 dist。检查或构建有 error 时不上传。
- 只接受 HTML、CSS、JS/MJS、JSON、PNG/JPEG/GIF/WebP/SVG、WOFF/WOFF2/TTF、TXT，以及朗读音频 MP3/WAV/OGG/FLAC/M4A/AAC（D74，需要云端分享契约同时放开）；路径必须安全。其他类型会在上传前列出并拒绝。
- 朗读音频随 build 进入上传清单，按内容去重，计入清单总量与新上传量；构建后 stderr 打印与 build 相同的 `Narration: …` 一行。缺音频的步骤只提示、不阻止分享。
- 默认标题是项目名；`--title` 接受 1–200 个字符。套餐和限额实时读取服务器。
- `maxUploadBytes` 限制本次缺失对象的新上传量（免费 20 MiB、Pro 100 MiB）；`maxTotalBytes` 限制清单总量（256 MiB），`maxFiles` 限制文件数（2000）。实际数值以 me 为准。
- CLI 本地只预检清单总量和文件数；新上传量由服务端按已有 blob 去重后判断，不能拿清单总量与新上传限额比较。共用字体和运行时资源可由运维预置。
- `.joplo/cloud.json` 记录属于当前服务器时，自动更新同一个链接，免费账号和 Pro 都一样（C27）；`--new` 新建。
- 链接不再过期（免费账号也是 `expiresAt: null`）；限制的是账号空间：所有在线分享**当前版本**的原始大小之和，不按去重算（免费 100 MiB、Pro 5 GiB，以 me 的 `storage` 为准）。发布成功后文本输出多一行 `Storage: <已用> of <上限> used (this share: <大小>)`，JSON 的 `data.storage` 是 `{usedBytes, quotaBytes, shareBytes}`；旧服务器不返回时没有这一行。
- 放不下时以 `QUOTA_EXCEEDED`（`error.details.kind = "storage"`）、**退出码 6** 结束：什么都没上传，已有链接不受影响。`details` 带 `usedBytes`、`quotaBytes`、`shareBytes`、`replacedBytes`（更新同一个链接时旧版本的大小，只按差额判断）、`manageUrl`（当前 server 的 /shares）与 `upgradeUrl`（/settings/billing）。服务端返回的是 413 `STORAGE_FULL`，CLI 转成这个错误码。
- `.joplo/cloud.json` 的格式为 `{server, shareId?, url?, visibility?, passwordProtected?, review?: {shareId, url, visibility?, passwordProtected?}, scoped?: {<范围键>: {shareId, url, visibility?, passwordProtected?}}}`（`scoped` 见上方「按场景保密分享」）：主链接和评审版是**两个分享**，互不覆盖（契约 8.1）。普通 share 只用、只写主 `shareId`/`url`；`--review` 同时更新主链接与独立 `review`，评审步骤只用、只写 `review`（Pro 重新发布评审版时用 `review.shareId` 作 replaceShareId，评审链接和评论保留，版本 +1），评审版永远不会替换 README 里的主链接。写入时保留另一项；记录属于其他 server 时整体替换。没有 `review` 的旧记录照常使用。
- 只上传服务端 `missing` 中的对象，412 表示对象已存在；网络错误和 5xx 最多重试 3 次，按 1、2、4 秒退避。4xx 不重试（412 作为成功）。收到 503 SERVICE_UNAVAILABLE 时按 Retry-After 等待（最多 30 秒），计入三次重试。create 仅在该错误明确带 Retry-After、服务端保证未提交时重试；create 的其他网络错误或 5xx 不重放。finalize 重试沿用同一个 uploadId。PUT 最多四路并发；一个对象失败会取消其他在途 PUT 和重试等待；链接 403 时提示过期并要求重新 share。PUT 时限为 30 秒 + 文件字节数 / (100 × 1024 字节/秒)，允许慢速大文件传输。
- finalize 成功后尽力写 `.joplo/cloud.json`，写入失败时尽力删除旧记录（删除失败也只警告），提示“Could not save the share record. The next publication will not update this link”，仍输出链接和到期时刻、退出 0。链接永久有效，升级入口为当前 `<server>/settings/billing`。
- 预览图：构建后用本地截图能力（与 `joplo render` 相同，依赖可选的导出组件，见 `setup export`；项目里已有的 Playwright 也可以）渲染默认场景（第一个功能的选定方案的第一个场景，和嵌入模式默认场景相同）的初始画面，得到 1200×630 PNG，作为普通文件 `_joplo/preview.png`（`image/png`）放进上传清单，计入清单总量和新上传字节。没有导出组件、浏览器启动失败、项目没有场景或截图尺寸不对时跳过，stderr 只提示一行 “Skipped the preview image (…)”（没有导出组件时括号里给出 `npx joplo setup export`），share 照常成功、从不下载；分享页此时用通用预览图。
- 文本输出在链接和有效期之后打印 `Add to README: <Markdown 徽章>` 与 `More embed options: <server>/shares/<shareId>`（CLI 沿用英文（D57），D85 指定的“已加密”、兼容错误和设置用户名提示除外）。
- **评审清单**：每次 share 都在 `POST /api/v1/shares` 请求体里附上 `review`（契约字段 `{v: 2, mode, works, features, scenarios, elements}`），由 check 编译的 dev IR 经 core 的 `reviewManifest` 生成。它**不是分享文件**：不进上传清单、不进 R2，分享页拿不到；SaaS 只把它存进数据库给评审页用。`mode: "publish"` 含独立作品与功能选定的作品（没有 pick 的功能不出现），`--review` 时为 `"review"`，含独立作品与所有功能作品。顶层 `works: [{id,key,title,summary}]` 只放独立作品，按 entryIds 排序，纯功能项目为 []；功能作品在 `features[].works[]`。`scenarios[].workId` 在两处元信息并集中恰好匹配一件，独立场景 featureId 为 null。草稿、空作品与数量上限排除的元信息不会带入场景。id 全部沿用 IR，步骤 `index` 从 0 开始，`elements` 是画面里所有作者元素 id（与 `Rule.elementIds` 同一套）及 `nodeLabel` 标签。
- **清单上限**：字符串按码点截断（末尾 “…”）——名字/作品标题 200、目标/作品简介/规则/问题/explain 2000、取舍 500、字幕 500、元素标签 200；数组超出部分丢弃——每个功能 20 个方案、300 条规则、100 个问题，每个方案 20 条取舍，每条规则 50 个元素，最多 100 个功能与 100 件独立作品、500 个场景、每个场景 200 步、每步 50 条规则、2000 个元素；id 永不截断。截断后序列化仍超过 512 KiB（524288 字节）时：`--review` 报 EXPORT_FAILED（`details: {maxBytes, actualBytes}`），在构建和上传之前失败，不静默丢内容；普通 share 不因清单失败，stderr 提示一行 “Skipped the review manifest (…)”，请求体省略 `review`（契约里它是可选字段），评审页此时看不到规则和问题。
- **发布顺序容错**：创建请求带着 `review` 被服务端以 HTTP 400 拒绝时（例如还不认识这个字段的旧版 SaaS；400 表示请求被拒、没有创建任何记录），普通 share 去掉 `review` 原样重试一次，stderr 提示一行 “The cloud rejected the review manifest (HTTP 400). Retrying once without it …”；评审步骤不重试，照常报 BAD_REQUEST；主分享可能已发布（评审版没有清单没有意义）。413、422、429 等其他状态不触发这个重试。
- **`--review`（评审版，D63）**：构建时 `buildSite({ review: true })`，发布站包含所有功能的所有方案（未选定的功能也在），评审页通过 `joplo:goto` 指定任一场景即切换方案；规则、问题、情况、AI 假设、备注、取舍、源位置与普通发布一样不进任何上传文件。CLI 会核对产物里内联 IR 的 `mode` 是 `review`，旧版 `@joplo-app/server` 忽略该选项时报 UNSUPPORTED_ACTION，不上传。成功的 `data.review` 带 `mode: "review"`，文本写 “Published the review version …”。选择 `--no-review` 时只发布主分享。
- **`--pr <number>`（PR 预览）**：请求体加 `pr: {provider: "github", repo, number, headSha, runUrl}`。在 GitHub Actions（`GITHUB_ACTIONS=true`）里：repo 取 `--repo` 或 `GITHUB_REPOSITORY`；headSha 取 `--sha`，否则读 `GITHUB_EVENT_PATH` 事件 JSON 的 `pull_request.head.sha`（PR 事件的 `GITHUB_SHA` 是合并提交），没有时用 `GITHUB_SHA`；runUrl 为 `GITHUB_SERVER_URL/GITHUB_REPOSITORY/actions/runs/GITHUB_RUN_ID`（重试的运行加 `/attempts/N`），只在 github.com 上生成，否则为 null。不在 Actions 里必须 `--repo owner/name`，headSha 取 `--sha` 或 `git rev-parse HEAD`。缺少或格式不对时在登录、检查、构建和任何请求之前报 USAGE（退出 2）。`--repo`、`--sha` 只能和 `--pr` 一起用。
- PR 预览是独立链接：不发送 replaceShareId，也不写 `.joplo/cloud.json`（不覆盖本项目的主链接和评审版记录，之后的普通 share、--review 与 feedback 仍用原来的记录）。CI 推荐 `npx joplo share --private --no-review --new --pr <number> --format json`；fork 来的 PR 拿不到 secrets，工作流应跳过发布，不推荐 `pull_request_target`。
- finalize 响应里的 `pr: {comment, reason?, installUrl?}` 原样（白名单字段）放进 `data.pr`；`comment: "skipped"` 时文本输出一行 “PR comment skipped: <原因>. Install the Joplo GitHub App to comment on pull requests: <installUrl 或 <server>/settings/github>”，`failed` 时说明评论失败但已发布。服务端没返回时 `data.pr` 为 null。

JSON 成功的 `data` 为 `{shareId, url, expiresAt, version, passwordProtected, embed}`（`--review` 时另有 `review: {…, mode: "review"}`，`--pr` 时另有 `pr`，`--scenario` / `--work` 时另有 `scope`），`expiresAt: null` 表示永久。进度写 stderr，stdout 只有一个结果信封；Agent 应读取 `data.url` 和 `data.expiresAt`。

`data.embed` 与云端控制台、分享页 Worker 用同一套格式（`<分享页>` 为 `data.url`，规范成以 `/` 结尾）：

| 字段 | 格式 |
| --- | --- |
| `iframe` | `<iframe src="<分享页>?embed=1" title="<标题> · Joplo 演示" style="width:100%;aspect-ratio:16/10;border:0" allow="fullscreen *" allowfullscreen loading="lazy"></iframe>`，属性值转义 `& < > " '` |
| `markdown` | `[![Joplo 演示 · <标题>](<徽章>)](<分享页>)`，替代文字把连续空白（含换行）合成一个空格，并转义 `\ [ ]` |
| `badge` | `<分享页>badge.svg` |
| `preview` | `<分享页>preview.png`（1200×630；有 `_joplo/preview.png` 时由分享页使用它） |

Agent 可以把 `data.embed.markdown` 直接写进 README；链接不会过期，`data.expiresAt` 只在旧分享或已关闭的 PR 预览上不为空。iframe 地址可以手动加 `&scenario=<场景 id>` 选起始场景、`&autoplay=1` 跳过封面直接播放，见 [发布站的嵌入模式](web.md#嵌入模式)。

| 错误码 | 恢复方式 |
| --- | --- |
| CHOICE_REQUIRED（退出 2） | 缺少本次可见性或评审选择；先问用户，再补齐对应参数 |
| USAGE（退出 2） | 互斥参数或受限模式选公开；按错误改正，本地拒绝且没有构建上传 |
| AUTH_REQUIRED（退出 3） | 请用户运行 npx joplo login，再重试 |
| AUTH_EXPIRED（401，退出 3） | 重新运行 npx joplo login |
| PLAN_REQUIRED（403，退出 1） | 服务端明确要求 Pro；给出 error.details.upgradeUrl（当前 server + 服务端 upgradePath，缺省 /settings/billing）；密码不能用 --new 绕过 |
| QUOTA_EXCEEDED，kind storage（退出 6） | 账号空间不够，这次没有上传，已有链接不受影响；按 `details` 告诉用户差多少，去 `manageUrl` 删掉不需要的分享或去 `upgradeUrl` 升级；不要替用户删分享 |
| ACCOUNT_UNAVAILABLE | 账号目前不能发布，请登录网页查看账号状态；不引导付费 |
| FORBIDDEN | 当前操作被禁止，请检查账号权限 |
| RATE_LIMITED | 登录请求过于频繁，稍后再试 |
| UPLOAD_EXPIRED | 预签名上传链接已过期，先向用户重新确认两项选择，再运行 joplo share --public/--private --review/--no-review |
| CONFLICT | 另一个发布正在进行或上传准备失败，稍后先向用户重新确认两项选择，再运行 joplo share --public/--private --review/--no-review；不自动重试 |
| QUOTA_EXCEEDED | 按 details 区分每小时发布次数或每小时预留字节上限，显示服务端重试时间；类型未知时使用通用额度说明 |
| TOO_LARGE | `details.kind=upload` 表示新增上传超限，`total` 表示清单总量超限，`files` 表示文件数超限；查看上限、实际值及最大五个文件 |
| CLIENT_OUTDATED | 当前目录向上的项目里装了 joplo 时（启动器优先用项目版本，`npx joplo@latest` 也会被顶替），提示在项目里把两个依赖升到同一版本：`npm i -D joplo@latest @joplo-app/kit@latest`（按包管理器换成 pnpm/yarn/bun 的写法），再 `npx joplo share --private --no-review`；不在项目里时才建议 `npx joplo@latest share --private --no-review`（示例假设本次明确选择私密、不发评审版） |
| NETWORK | 检查网络后重试；命令内部重试 finalize 时复用 uploadId |

其他云端错误及本地校验失败退出 1，用法错误或缺少分享选择（CHOICE_REQUIRED）退出 2。错误正文不回显远端响应或访问令牌。HTTP 状态决定错误类别，4xx 不能被响应体改成可重试的 NETWORK。终端数据片段移除控制字符和 ANSI 转义序列；网址规范化，验证码严格校验。

Ctrl+C（SIGINT）会清理本进程登记的 joplo-share-* 目录及原子写入临时文件，并退出 130；不会删除其他运行中的分享目录。

## feedback

```sh
npx joplo feedback --format json
npx joplo feedback --share Abc1234567
npx joplo feedback --applied d1,d2 --ref "$(git rev-parse HEAD)" --format json
```

读取评审页（`cloud.joplo.app/review/<id>`）上分享主人的决定和观众的未解决评论，供作者和 Agent 按决定改源码：

- shareId：`--share <id>`，否则读项目 `.joplo/cloud.json`：有评审版记录（`review.shareId`）时用它，没有时用主 `shareId`（契约 8.1）。记录必须属于当前 server，否则 USAGE 并提示 `--server` / `--share`；没有记录或记录无效时 USAGE。
- `GET /api/v1/shares/{id}/feedback` → `data = {share: {id, version}, decisions: [{id, kind, featureId, targetId, note, decidedAt, version}], comments: [{id, version, scenario, step, stepId, element: {id, label} | null, body, author: {name}, createdAt}]}`；只含未撤回、未写回的决定与未解决的评论。`kind` 是 `pick`（targetId = 方案 id）、`confirm_rule`、`reject_rule`（note = 理由）、`answer`（targetId = 问题 id，note = 回答）。`step` 是播放位置（0 = 初始状态，k = 已执行 k 步），`stepId` 是第 k 步的 id。
- 文本输出决定在前，每条一行：“Pick option invite.b-batch for feature invite”“Reject rule <id>: <理由>”“Answer to question <id>: <回答>”“Confirm rule <id>”；再是未解决评论（场景 · 第几步（stepId） · 元素 id "标签" — 作者、版本、时间，下一行是正文）；有决定时最后提示 check 与 `--applied` 的完整命令。
- `--applied <id,…> [--ref <源码版本>]`：`POST /api/v1/shares/{id}/feedback/applied {decisionIds, ref?}` → `data = {shareId, applied}`，重复标记幂等。id 去重，1–200 个，每个只含字母、数字、`_`、`-`；`--ref` 1–200 个可打印字符，只能和 `--applied` 一起用。只有分享的主人能调用。
- 错误：未登录 AUTH_REQUIRED（退出 3）；用登录凭证但不是分享主人时 403 为 FORBIDDEN “Only the owner of the share …”；API Key 缺少 feedback:read / feedback:write 时为 FORBIDDEN 权限说明；404 为 NOT_FOUND “The share does not exist or has no review data”；响应结构不对为 INVALID_RESPONSE；其余同 share。
- Agent 按决定改源码的规则写在 `npx joplo skill publish`：pick → `feature.pick`；确认规则 → `origin: 'user'` + `status: 'confirmed'`；否决 → 按理由改写，理由没说怎么做时标 conflict 并问用户；回答问题 → 删掉 question、加一条 `origin: 'user'` 的规则；评论只作参考。改完运行 check，再 `--applied`。

范围校验错误用 `error.details.scope: 'entry'` 表示未知或未选定条目，`'scenario'` 表示切片；借用记录用 entryId / entryTitle / workId，按条目读取，不按旧功能字段分支。

### 云端数据流

| 字段 / 文件 / 参数 | 写入点 → 存储 → 读取点 → 消费者 |
| --- | --- |
| --server / JOPLO_CLOUD_URL | 用户配置 → 进程内规范化源地址 → 四个云端命令 → API 请求与凭证/分享来源比对 |
| X-Joplo-Client | CLI package.json 版本 → API 请求头 → 云端 → 客户端版本检查；不修改预签名 PUT headers |
| --format json / CI / JOPLO_NONINTERACTIVE | 参数/环境 → 真实交互判定 → share 禁止自动登录；显式 login 保留设备授权，禁止打开浏览器和跨服务器确认输入 |
| --no-browser | 命令参数 → 进程内 → login → 决定是否调用系统打开命令 |
| device_code、user_code、verification_uri(_complete)、interval、expires_in | 设备授权响应 → 进程内 → login → 轮询、终端验证码、浏览器地址与截止时间；不写磁盘 |
| credentials.json.server / accessToken | 登录响应及目标地址 → JOPLO_HOME 的 0600 原子文件 → 云端命令 → 同服务器 bearer 鉴权；登录轮换时旧 token 只向旧 server 撤销；logout 以空请求体 sign-out 吊销当前会话后删除文件 |
| credentials.json.user.id / email / createdAt | me 响应及登录时刻 → 同一凭证文件 → 凭证校验与登录成功提示 → 用户；套餐仍实时查询 |
| --title / title | 用户参数或 check 的项目名 → 创建请求 → 云端 → 分享标题 |
| path / sha256 / size / contentType | 临时 build 文件 → 内存清单及创建请求 → 云端 → 去重、配额和资源类型校验 |
| missing[].sha256 / uploadUrl / headers | 创建响应 → 内存 → PUT → 只上传缺失对象并保留签名头 |
| uploadId | 创建响应 → 内存 → finalize 及其重试 → 幂等确认发布 |
| --new / replaceShareId | 参数及同服务器 cloud.json.shareId → 创建请求 → 云端 → 新建或更新链接；免费账号与 Pro 都发送（C27），--new 与 PR 预览不发送 |
| storage（me / finalize） | 云端 `share_file` 当前版本大小之和 → `me.storage` / finalize 的 `storage` → `Account.storage`、`ShareResult.storage` → 文本 `Storage:` 行、JSON `data.storage`、看板发布浮层（cloud-bridge → `CloudAccount.storage` / `CloudJob.result.storage`） |
| voice quota（D85） | 云端按账号算 → `GET /api/v1/voice` 的 `quota` → CLI `readVoiceQuota()`（cloud-voice.ts，只认合法字段，旧云端 404 为 null）→ whoami 的 `data.voice` 与 `Narration:` 行；`cloudBridge.account()` 的 `CloudAccount.voice` → 看板首页账号卡片；`cloudBridge.voice.status()` → VoiceHub 内存（60 秒）→ `VoiceState.cloud.quota` → 声音浮层“剩 N 字”与“生成后还剩 Y 字” |
| X-Joplo-Chars-Remaining（D85） | 每次 `POST /api/v1/voice/speech` 成功的响应头 → `speech()` 的 `CloudSpeechResult.remaining` → server `synthesizeCloud` → `GenerateOptions.onCloud` → VoiceHub 改写内存里的 `quota.totalRemainingChars` 并推 `joplo:voice`（看板浮层）；`joplo voice` 写进 `data.quota`。不在本地按字数估算剩余 |
| X-Joplo-Chars-Charged / X-Joplo-Cache / X-Joplo-Audio-Sha256 | speech 响应头 → `CloudSpeechResult.charged / cache / sha256`（不合法为 null）→ `onCloud` 回执（`charged`、`cache`）；目前只用于判断与诊断，不写磁盘 |
| speech 请求的 locale / project | 看板：`POST /__joplo/p/:id/voice/generate` 的 `contentLocale`（D84，项目写了 locales 时缺省为默认语言）与项目名 → VoiceHub `speechLocaleOf` / `project.name` → `GenerateOptions.speechLocale / project` → bridge.speech 请求体 → 云端按语言合成、控制台明细按项目归类；`joplo voice` 按每种内容语言同样传 |
| TTS_QUOTA_EXCEEDED（402） | 云端 → `ttsQuotaError()`（data: neededChars / remainingChars / usagePath → `usageUrl` = 当前 server + 路径）→ bridge 抛 `{code, data}` → server `VoiceError('TTS_QUOTA_EXCEEDED')` → `VoiceCache.generate` 停下（`GenerateSummary.quota`、`stopped`，不记失败）→ VoiceHub `exhausted`（边放边生成直接 402）→ `VoiceState.cloud.exhausted` → 浮层“朗读额度不够”与「买加油包 ↗」；`joplo voice` → `TTS_QUOTA_EXCEEDED`（退出 7，details 同上 + generated / remainingSteps） |
| cloud-voices.json（音色表） | `GET /api/v1/voice` 的 voices / recommended / defaultVoice → `ProfileStore.rememberCloudCatalog()` 写 `<JOPLO_HOME>/voice/cloud-voices.json`（不含额度）→ `cloudCatalog()`（内存 > 文件 > 内置 6 个英文标签）→ cloud 的 `publicOf().voices`（浮层音色列表、样音）与 `autoVoiceFor` 的推荐音色（D84）；build 离线时也按它选音色，与看板一致 |
| index.json.chosen（D85） | 看板浮层选来源 → `PUT /__joplo/p/:id/voice` → `VoiceCache.select()` 写 `<项目>/.joplo/voice/index.json` 的 `chosen: true` → `VoiceCache.selection()`（undefined = 没选过）→ `resolveVoices(…, fallback)`：没选过时用默认来源（已登录为 cloud）→ 看板状态、`joplo build` / `share`（BuildOptions.voiceDefault）、`joplo voice` |
| index.json.pins（D85 / D84） | cloud 在非默认语言下由 `autoVoiceFor` 按推荐选出的音色 → `ResolvedVoices.autoPicks` → 这种语言第一次生成成功时 `VoiceCache.pin()` 写 `<项目>/.joplo/voice/index.json` 的 `pins`（语言 → 基础音色 → 选中的音色，已记的不改）→ `VoiceCache.pins()` → `resolveVoices(…, pins)`：看板状态、生成、`bundleVoice` / `reuseSharedVoice`、`joplo voice` 都按记下的选，推荐列表变了或换电脑也不变 |
| index.json.cloudSource / profiles.json.legacyId（旧 cloud 迁移） | `ProfileStore.read()` 将旧非 cloud 类型的同名条目标成 `legacyId: "cloud"` 并改名，后续保存 profiles 时保留 → `projectProfile()` 兼容旧 config/看板引用；`VoiceCache.select('cloud')` 写 `cloudSource: "official"` → `officialCloud()` 传入看板、CLI、build/share 的 `resolveVoices()` → 区分升级前旧选择与用户之后明确选择官方来源。config 的明确官方名称为 `Joplo Cloud` |
| index.json.clips[片段键].origin（沿用来源） | `reuseSharedVoice()` 下载音频 → `VoiceCache.adopt()` 写 `origin: "shared"`；本机合成及旧缓存缺省无此标记 → `localClipOf()` 和 `bundleVoice()` 区分本机生成与刚沿用的缓存，避免同文不同语言时把刚下载的一种声音误认成另一语言的新选择；只在本地缓存中使用，不写入发布 voiceIndex |
| 自动字幕音频校验 | 当前 IR 的 captionAuto（label/value/keys 已由 localizeProject 按内容语言翻译）+ index.json.clips 的 text/locale/fp → core 的 automaticCaption（网页字典同源文案）重新计算当前文字 → bundleVoice 在来源选择前校验文字与 clipKey → 仅有效片段复制到 voice/ 并写 voiceIndex；旧文本、未知语言、错配缓存键被排除，没有有效片段时正确计 missing |
| voiceIndex.overrides / voiceIndex.locales[语言].overrides（混合音频发布） | `bundleVoice()` 按语言、角色和文字优先本机有效片段，再补旧分享 → 将 `clipKey(角色 ID 或空串, 文字) → 实际声音指纹` 写入发布 IR（每种语言独立），clips 键仍为真实 `clipKey(指纹, 文字)` → 网页 `siteVoiceLookup()` → `voiceFingerprint(…, 角色, 文字)` → Narrator 查询与播放；下一次 `reuseSharedVoice()` 也据此采用真实指纹下载，不把旧音频伪装成另一来源。没有 overrides 的旧索引继续使用旁白/角色指纹 |
| BuildOptions.voiceDefault（D85） | CLI：`build` 读本机登录（`client.auth()`，不联网）、`share` 总是已登录 → `voiceDefault: 'cloud' \| null` → `bundleVoice` / `reuseSharedVoice` 的 `defaultProfile` → 没选过来源的项目把 Joplo Cloud 生成的音频带进 `voice/` 与 `voiceIndex`；有上一次的分享（更新同一链接、`--update`）时，默认来源逐片段优先本机有效音频，再从分享里的实际指纹补齐；新旧来源可共存，由 voiceIndex.overrides 保证正确播放 |
| PublicProfile.unsupported（D85） | `ProfileStore.list()/get()` 按 `profiles.json` 里非预设的条目（与从没存过、但项目还选着的 aihubmix）标出（不写进文件）→ `publicOf().unsupported` → 看板浮层“不再支持”、不给生成按钮，「管理密钥」里可删除；`VoiceCache.generate` 返回 `unsupported`、`generateOne` 抛 `UNSUPPORTED` → `joplo voice` 的 `VOICE_UNSUPPORTED`；指纹算法不变 → `bundleVoice` 照常带上旧音频 |
| VoiceState.cloud（D85） | VoiceHub：`bridge.voice.status()`（登录、额度）+ 每段回执 + 402 → `cloudView()` → `GET /__joplo/p/:id/voice` 与 `joplo:voice` 推送 → 看板 `useVoice`：来源行的“剩 N 字 / 登录后可用 / 暂时连不上”、登录命令、`cloudQuotaView`（生成后还剩、额度不够）、边放边生成是否继续 |
| STORAGE_FULL（413） | 云端创建或 finalize 时按差额判断 → CLI `storageError()` → `QUOTA_EXCEEDED`（kind storage，退出 6）→ JSON `error.details`；看板经 cloud-bridge 的 `CloudJob.error.storage` 画红色提示 |
| cloud.json.server / shareId / url | 目标服务器及普通 share 的 finalize 响应 → 项目 .joplo/cloud.json（原子写，保留 review） → 下次普通 share → 来源比对与 Pro 更新主链接；feedback 没有评审记录时用它；url 供用户/工具读取 |
| cloud.json.review.shareId / url | `--review` 的 finalize 响应 → 同一文件的 review（原子写，保留主链接） → 下次 `--review` 的 Pro replaceShareId（评审链接与评论保留）；feedback 默认读它 |
| shareId / url / expiresAt / version | finalize 响应 → text/JSON 结果 → 用户/Agent → 分享链接及有效期 |
| embed.iframe / markdown / badge / preview | finalize 的 url + 本次 title → `embedSnippets`（cli/src/cloud-embed.ts，只在内存） → text 输出（markdown）与 JSON `data.embed` → 用户/Agent 写进 README 或博客；分享页 Worker 提供 badge.svg / preview.png |
| review（评审清单） | check 的 dev IR → core `reviewManifest(ir, publish \| review)`（截断、512 KiB 上限） → `POST /api/v1/shares` 请求体（不进上传清单） → SaaS 在 finalize 时按 (shareId, version) 存 Postgres → 评审页的方案、规则、问题、每一步的规则 |
| --review | 参数 → `buildSite({ review: true })` → compile 的 review 模式（所有方案，去掉创作侧信息）→ 发布站内联 IR（`mode: "review"`，CLI 核对）→ R2 → 评审页 iframe 的 `?embed=1&review=1` 按场景切换方案 |
| JOPLO_API_KEY | 环境变量 → 进程内（加入输出脱敏）→ 所有云端请求的 Authorization → SaaS 按 `jpk_` 前缀鉴权与权限范围；whoami 的 `apiKey` 从 me 响应读取 |
| --pr / --repo / --sha 与 GITHUB_* | 参数与 Actions 环境变量、事件 JSON → 进程内校验 → 创建请求的 `pr` → SaaS 存在分享上 → GitHub App 评论与 PR 关闭后过期；finalize 响应 `pr` → `data.pr` / 文本提示 |
| feedback 的 decisions / comments | 评审页的决定与评论（Postgres）→ `GET …/feedback` → 文本或 JSON 结果 → Agent 按 skill publish 改源码 → `POST …/feedback/applied` 的 decisionIds / ref → SaaS 标记已写回 |
| _joplo/preview.png | share 构建后 renderStep 截图（默认场景初始画面，1200×630） → 临时 build 目录 → manifest / 创建请求 / PUT → 云端 R2 → 分享页 Worker 的 preview.png 与 Open Graph 卡片；失败时不进清单 |
| user / plan / limits | me 响应 → 进程内与 whoami 结果 → share 或用户/Agent → 套餐展示、更新资格、maxTotalBytes/maxFiles 本地预检、maxUploadBytes 上传限额展示、publishesPerHour 频率诊断 |
| AUTH_REQUIRED 的 details.fix / credentialServer | 当前 server 与旧凭证 server → 跨服务器 share 错误信封 → Agent 请用户在自己的终端确认登录；不自动 logout |
| error.details | 本地校验、manifest 和 me 限额 → 结果信封 → 用户/Agent → fix 登录命令、超限的 kind/maxBytes/actualBytes/maxFiles/actualFiles/largestFiles ；429 的 kind/limit/actual/retryAt → 额度类型、上限与重试时间 |


`TOO_LARGE` 的 CLI `error.details` 采用 `{kind: "upload" | "total" | "files", maxBytes, actualBytes, largestFiles: [{path, size}]}`；files 变体另外包含 `maxFiles/actualFiles`，其中字节字段仍表示清单总量上限与实际总字节。本地只有文件数超限时也使用 files。远端限额值与文件列表按白名单读取（兼容上限字段 `limitBytes`，统一输出 `maxBytes`），不会回显响应中其他字段。服务端没有有效诊断时只报告错误码，不推测新增上传量。


429 诊断读取 `kind: "publishes" | "reserved_bytes"`、非负整数 `limit/actual` 及有效时间 `retryAt`；其他 kind 使用通用额度说明，仍显示合法 retryAt。不从 me.publishesPerHour 猜测限流原因。设备轮询中的 429 是协议特例，可在授权期限内退避继续；这不改变分享接口 4xx 不重试的规则。


并发上传共享 AbortController；发生失败后取消其他请求和可中止的退避等待，每次重试前检查取消状态，不再发新 PUT。仍会等待所有任务结束，再清理临时目录和 SIGINT 监听器。上传 headers（含 content-length）完全来自服务端，不由 CLI 增删。

## diff：跨版本功能变化

```sh
npx joplo diff <before-site> <after-site> --out <new-directory> [--base-sha <40hex>] [--head-sha <40hex>] [--format text|json]
npx joplo diff prepare --repo owner/name --pr <number> --sha <head> --base-sha <candidate> --out comparison.json [--server <url>] [--format text|json]
npx joplo diff publish <diff-site> --prepared comparison.json --repo owner/name --pr <number> --sha <head> [--title <title>] [--server <url>] [--format text|json]
```

本地 diff 从两份真实 `joplo build` 产物生成根 viewer、before/、after/ 和 feature-diff.json；新增／删除单栏、修改双栏。原序号 ID 保持兼容，作者为前一步追加 `.key('stable-action')` 提供稳定身份；重复候选明确 uncertain。公开身份独立于旧播放 IR，普通分享不要求 Cloud 放宽 schema。

prepare 的返回基线是权威值；用它编译旧版，不能继续使用候选 merge-base。发布前校验 receipt 与 manifest、两版实际 IR、summary 和文件 hash，复用上传／finalize，永远新建 comparison Share。publish 不构建、不执行 PR 代码、不附私有 review、不替换普通分享。安全 CI、错误码、Agent 路由限制和 fixture 见 [功能差异指南](feature-diff/README.md)；按需运行 `npx joplo skill diff`。

组件目录由 config.plugins 生成：`joplo components` 列出启用插件的组件，`joplo skill ui/components` 读取 UI 专题；`joplo components ui:Button` 或唯一短名 `Button` 输出属性和例子。作者直接从插件包导入，不再使用 kit/ui 或 kit.trace；未启用插件时报安装与配置诊断。

### `joplo resources [dir] [--dry-run] [--allow-spend] [--format json]`

生成源码声明的持久本机资源（例如启用 Tripo 后的模型）。`--dry-run` 列出每项估计 credits，不联网、不生成。普通终端逐项显示费用后询问；非交互/JSON 模式不询问，也默认不花钱，只有显式 `--allow-spend` 才授权所展示的估计。已有项目产物直接复用、费用 0。拒绝生成或失败返回诊断与非零退出码，dry-run 仅估算。

```sh
npx joplo resources --dry-run
npx joplo resources                 # 逐项确认
npx joplo resources --allow-spend   # 已获得用户授权时的非交互调用
```

check/build/render 不会授予生成许可。把 `assets/models/*.glb` 和同名 JSON 提交 Git，队友和 CI 不需要 Key；丢失输出时先从 Git 恢复。超时/断网后重新运行 resources 续查已记录 task_id；unknown/creating 日志必须先从供应商任务历史恢复，不能删日志盲重试。Key 在看板 Voice → 管理密钥 → Tripo 保存（本机 0600），或使用 TRIPO_API_KEY，不写项目配置。版本对应详细用法：`joplo skill scene3d/generation`、`joplo skill scene3d/models`。

### 检查含可选支线的短片

先用 `joplo outline` 确认场景 ID，再按章 `joplo render --scenario-id <id> --sheet`。`flow('Slice title', { autoplay:false })` 标记的支线依然可独立渲染、手动选择或通过 fork 进入，但发布站连续播放会跳过它；支线结束后停下。fork 本身不会改变自动播放资格。`joplo check` 不证明本机配乐已成功编译，最终还须检查 build 的资源警告和真实输入、声音，再用 preview 离线验证 HTTP 播放。

离线导出回归：`pnpm test packages/server/test/export-contract.test.ts` 验证横竖画幅、多章与三个可分发合成PCM音频片段；`JOPLO_EXPORT_VIDEO=1` 增加WebM/MP4编码、音频频率匹配与时差断言（需本机ffmpeg/ffprobe）；`JOPLO_EXPORT_LONG=1` 增加五分钟引擎时间性能测量。产物保留在 `scratch/output/`，不调用云TTS、不需要个人账户。

`render --video --silent` 显式省略全部音轨并保留旁白节奏；`--voice off` 仅关闭旁白，不关闭背景配乐。`.mp4` 输出需要本机 ffmpeg（H.264/AAC），默认 `.webm` 无需外部编码器。
