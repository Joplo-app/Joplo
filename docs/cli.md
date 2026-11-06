# Joplo CLI（0.1.2）

安装后的项目使用 `npx joplo`；仓库内使用 `pnpm joplo` 运行源码。需要 Node.js ≥ 22。任意命令都支持 `-h, --help`。

## 命令与参数

```sh
npx joplo init <dir> [--name <name>] [--keep] [--no-skill]
npx joplo dev [dir] [--port <port>] [--open]
npx joplo check [dir] [--format text|json] [--option <qid>]
npx joplo selection [dir] [--format text|json]
npx joplo skill [topic]
npx joplo skill install [dir] [--force] [--diff] [--agents-md]
npx joplo guide
npx joplo build [dir] [--out-dir <dir>] [--overwrite]
npx joplo login [--no-browser] [--format text|json] [--server <url>]
npx joplo logout [--server <url>]
npx joplo whoami [--format text|json] [--server <url>]
npx joplo share [dir] [--format text|json] [--new] [--title <title>] [--review] \
  [--pr <number> [--repo <owner/name>] [--sha <commit>]] [--server <url>]
npx joplo feedback [dir] [--share <id>] [--format text|json] [--server <url>]
npx joplo feedback [dir] --applied <决定 id,…> [--ref <源码版本>] [--share <id>] [--format text|json]
npx joplo render [dir] --scenario-id <qid> --out <file> \
  [--step-id <qid>] [--theme <theme>] \
  [--width <pixels> --height <pixels>] [--scale <scale>] [--overwrite]
```

可省略的 dir 默认为当前目录。`render` 的 scenario-id、out 必填。主输出和帮助写 stdout，服务日志、截图告警和项目依赖版本提示写 stderr；用法错误退出 2，领域或执行失败退出 1，云端需要登录（AUTH_REQUIRED / AUTH_EXPIRED）退出 3，成功退出 0。

## init

生成可运行的最小项目：config、布局、首页、一个功能/方案/场景，以及 package.json、tsconfig.json、.gitignore。

- `--name <name>`：项目名，默认目录名。
- `--keep`：目录非空时只补缺失文件，已有文件不改动；不传时拒绝非空目录，并列出前几个文件名。
- 只含 Agent / 版本控制文件（`.git`、`.gitignore`、`.gitattributes`、`.agents`、`.claude`、`.codex`、`.cursor`、`AGENTS.md`、`CLAUDE.md`、`skills-lock.json`、`.DS_Store`）的目录视为空目录（D65）：不要求 `--keep`，按 `--keep` 的方式写入，已有文件一字不改；保留的 `.gitignore` 缺少 `node_modules/`、`.joplo/`、`dist/`、`exports/` 时在输出里提示。
- package.json 将 `joplo` 与 `@joplo-app/kit` 锁到当前 CLI 的相同精确版本，并提供 dev/check/build 脚本。
- tsconfig 使用 `react-jsxdev`、`jsxImportSource: '@joplo-app/kit'`、`allowImportingTsExtensions`。
- 默认同时安装 Agent 技能（D64），等同于对新项目运行 `npx joplo skill install --agents-md`：写入 `.claude/skills/joplo/SKILL.md`、`.claude/skills/joplo-feedback/SKILL.md` 和 AGENTS.md 的 Joplo 托管段，输出一行 “✓ Agent skills: …; skip with --no-skill”。`--keep` 时沿用 skill install 的保护：用户改过的技能不覆盖（两个都不写，提示先 `--diff` 再 `--force`），AGENTS.md 只增改托管段；标记损坏时不写技能并说明原因。这些情况都不影响 init 成功。已经装好的同版本、未修改的技能（例如 `npx skills add` 装的官方技能，含指向 `.agents/skills` 的软链接）跳过不写，输出 “already installed (Joplo <版本>, unchanged)”；用户改过的技能不带 `--keep` 时同样保留，提示 `--force`。
- `--no-skill`：不安装技能，也不写 AGENTS.md。
- 最后一行提示安装依赖并启动看板；命令写法按 npm/pnpm/yarn/bun 环境选择。

```sh
npx joplo@latest init my-demo
cd my-demo
npm install
npx joplo dev --open
```

## dev：一个进程，多个项目

首次运行启动本地看板，默认绑定 `127.0.0.1:4790`，打印项目链接。`--open` 打开浏览器；`--port` 接受 1–65535 的整数，启动新看板时指定端口。端口被其他应用占用时明确报错，不静默换端口。

同一个 `JOPLO_HOME` 下已有存活看板时，再次运行只注册当前项目、打印链接并退出，不再启动第二个进程；这时优先加入已有看板。加入时 stderr 写出那个看板的 Joplo 版本和启动目录（`[joplo] Joined the running board: Joplo 0.2.7, started in /path/to/demo (pid 123)`）；它的版本和当前项目的 Joplo 不一致时（0.2.6 及更早的看板不报版本，也算不一致）多一行 `!` 警告：看板可能表现不同，要用当前版本就在它的终端按 Ctrl+C（或 `kill <pid>`）停掉，再在这里运行 `joplo dev`（D65）。`JOPLO_HOME` 默认 `~/.joplo`：projects.json 记最近项目，server.json 记运行实例，settings.json 记主题选择。

首页可切换项目与功能；源文件变化只重新编译对应项目，保存后热更新。编译出错时显示诊断，并保留上一次成功的画面；修复后恢复。界面和交互见[看板文档](web.md)。

## check

使用项目 tsconfig，经 tsx `tsImport` → core `loadAuthoring` → `compile(..., 'dev')` → `validate(..., { mode: 'all' })`；回放由 player 的 `replay()` 执行。源文件会在本机加载。

- `--format text|json`：默认 text。
- `--option <qid>`：仅校验指定方案的结构和回放，例如 `invite.a-modal`；整个项目仍须编译。

```text
features/invite/options/a-modal.tsx:24:16  warning  CASE_NOT_COVERED  Case is not yet Covered: invite.happy 正常发出邀请并被接受
0 error, 1 warning, 0 info
```

每个问题一行 `文件:行:列  级别  代码  说明`，最后汇总；同位置、代码、说明和级别的重复项只输出一次。结构校验错误定位到最近的作者元素（不再是 `joplo.config.ts:1:1`）；同一个根因（例如共享的 JSX）在多个画面 / 层级展开时合并成一条，说明末尾附 “(affects N views)”，只计 1 个 error，JSON 的诊断项新增 `affects: [画面 id]`（其余字段不变）。`when` 收到普通布尔、数字或字符串时报 `INVALID_CONDITION`，说明要用条件表达式并给出示例。error 退出 1，用法错误退出 2，只有 warning/info 时退出 0。按定位只读改需要的那一处；代码含义和修法见 `npx joplo skill check`。

JSON 为 DomainResult 风格：成功含 `ok/projectId/revision/requestId/summary/changedIds/diagnostics/artifacts/data`；检查失败含 `ok: false/error/diagnostics/data`。data 是 name、diagnostics、summary、verification；载入前或用法错误可能没有 data。`revision: 0` 仅兼容结果信封，文件版本交给 Git。

## selection

读取项目 `.joplo/selection.json`，不重新编译。先在看板中按住 ⌥（Option/Alt）单击元素，再运行：

```sh
npx joplo selection
npx joplo selection --format json
```

text 输出 at、标签和目标行前后各三行带行号源码。文件不存在或内容为 null 时输出“Nothing selected”，退出 0；无源位置、文件已删除或行已不存在时解释状态。无效 JSON/at 或项目外路径退出 1。

JSON 的 data.selection 保留 core Selection，data.lines 是 `{ number, text }[]`，note 说明定位不可用的原因。看板写选中 → 服务端对照 IR 计算 at → 本地文件 → CLI 读源码 → Agent 局部修改；详见[选中定位链路](web.md#选中与源码定位)。

## skill 与 guide

`npx joplo skill` 先用几行讲清心智模型（预设场景的播放器，不是自由输入的应用原型）和起步顺序，再列出当前 CLI 版本、主题说明和实际行数；每个主题少于 150 行。`npx joplo skill <主题>` 输出 Markdown，结尾指向相关主题。未知主题会建议编辑距离最近的名称并退出 2。

| 主题 | 内容 |
| --- | --- |
| authoring | 心智模型、起步顺序、目录、页面、布局、方案、flow、绑定、`when` 只接受条件表达式、带错误重试的表单示例、规则 |
| demo | 独立层级、导演、镜头、Diagram/trace、短字幕、全高布局会压缩什么、深链接参数、截图时机与主题 |
| components | 当前组件目录和属性提示、支持的 HTML 标签、换行写法 |
| cases | 八个维度及按产品类型筛选的情况预设；先做正常流程 + 一条错误恢复 |
| check | 诊断代码与局部修复、合并诊断、`UNBOUND_INTERACTIVE` 的三种处理 |
| selection | 用户选中后只改指向的位置 |
| publish | pick、build、云端登录与分享、评审版与 feedback 回流、静态站部署与演示能力 |

`guide` 与 `skill authoring` 完全相同。读取主题不加载服务端，也不执行作者项目，输出无颜色文本。

### skill install

写入两个技能 `.claude/skills/joplo/SKILL.md` 与 `.claude/skills/joplo-feedback/SKILL.md`，内容与仓库根目录的官方技能 `skills/` 逐字相同（同一份模板生成，D64）：心智模型、起步顺序、最常见的坑（每条指向详细主题），以及评审回流步骤；具体 API 仍由 `npx joplo skill <主题>` 按需输出。AGENTS.md 已存在时更新 Joplo 托管段（同样包含心智模型、起步顺序和常见坑）；不存在时仅在显式传 `--agents-md` 后创建。

- `--diff`：只打印 unified diff，不创建或改写文件，优先于 force。
- `--force`：允许覆盖被用户修改过的技能文件。
- `--agents-md`：即使 AGENTS.md 不存在也创建指针段。

SKILL.md 末尾保存 `<!-- joplo-skill <版本> sha256:… -->`，哈希覆盖标记前全部原始字节。重装时：未改动的生成内容（包括旧版本写的短指针、用 `npx skills add` 装的官方技能）自动更新，输出 “Wrote … updated from <旧版本> to <新版本>”；字节相同输出“Already up to date”且不重写；任何一个技能被用户改过或缺少有效标记时，两个技能和 AGENTS.md 都不写，提示先 `--diff` 看差异、再 `--force` 覆盖，退出 1。目录没有 joplo.config.ts 时警告但仍安装。`joplo init` 默认对新项目做同样的安装（见下）。

AGENTS.md 仅替换 `<!-- joplo:start -->` 与 `<!-- joplo:end -->` 之间的段落，段外字节不变；标记损坏或重复时拒绝写入。指针文件可提交 Git，安装器下次读取哈希/标记决定是否更新，Agent 读取指针后再调用 CLI。

## build

按每个功能的 pick 编译发布视图，只输出选定方案；无 pick 的功能不发布并提示 NOT_PICKED。先 check，再 build：

```sh
npx joplo check
npx joplo build
```

- `--out-dir <dir>`：默认项目 dist；显式相对路径按命令当前目录解析。
- `--overwrite`：确认原产物可清空后允许重建非空目录；不允许清空项目自身、上级目录或 `.joplo/`。

产物是可离线打开的静态站，含场景、字幕、层级、镜头、调用链与主题，去掉规则、情况、问题、备注及源位置。界面与本地演示页共用布局。部署见 publish 主题；发布站边界见[看板文档](web.md#发布站)。

## render

把场景截图为 PNG；缺省为初始状态，step-id 表示该步骤执行之后的状态。

| 参数 | 含义 |
| --- | --- |
| `--scenario-id <qid>` | 场景限定 ID，必填 |
| `--out <file>` | 截图文件，必填；相对当前目录解析 |
| `--step-id <qid>` | 指定步骤后的状态 |
| `--theme <theme>` | 内置主题名或项目 themes/name.css 的名称，默认项目 config 的主题 |
| `--width <pixels>` / `--height <pixels>` | 截图输出宽高，必须同时给出正整数；按比例容纳页面，不改变页面自己的 viewport 或响应式断点 |
| `--scale <scale>` | 有限正数，像素倍率 |
| `--overwrite` | 允许覆盖已有截图；仍不得覆盖项目源码或 `.joplo/` |

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
- 退出码：0 成功；2 用法错误；4 导出组件未安装（render、`setup export --status`）。

服务契约见 [contract.ts](../packages/server/src/contract.ts)。所有主题和选项以当前 `--help` 为准；需要创作细节时优先读取对应 skill 主题。


## 云端地址与凭证

CLI 和 skill 输出遵循 D57，统一使用英文；本文保留中文说明。云端命令的产品决策见 D58。

只有 `login`、`logout`、`whoami`、`share`、`feedback` 连接云端；本地命令继续完整、免费。评审版、反馈回流、API Key 与 PR 预览的决定见 D63，接口以云端契约（评审、API Key 与 PR 预览）为准。
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
- 权限范围：`shares:publish`（whoami、share）、`shares:read`、`feedback:read`（feedback）、`feedback:write`（feedback --applied）。

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

使用 `JOPLO_API_KEY` 时 `data` 另有 `apiKey: {name, prefix, scopes, expiresAt}`：取自 `/api/v1/me` 响应的 `credential`（只认 `kind: "api_key"`；设备会话的 `{kind: "device"}` 不显示），服务端没给或格式不对的字段为 null（不让 whoami 失败）；`prefix` 缺省时用本地 Key 的前 8 位。文本输出多一行 `API key "<名字>" jpk_xxxx… · scopes: … · expires … (JOPLO_API_KEY)`。用登录凭证时没有 `apiKey` 字段，输出与原来相同。

## share

```sh
npx joplo share
npx joplo share examples/invite --title '邀请流程' --format json
npx joplo share --new
```

- 未登录：交互终端显示“Sharing requires a free Joplo account”，直接进入浏览器登录，完成后继续发布；非交互环境（包含 --format json、有效 CI 环境变量、JOPLO_NONINTERACTIVE=1）立即返回 AUTH_REQUIRED（退出 3），提示用户运行 `npx joplo login`。
- 先 check，再复用 build 构建到临时目录；结束时清理临时产物，不改项目 dist。检查或构建有 error 时不上传。
- 只接受 HTML、CSS、JS/MJS、JSON、PNG/JPEG/GIF/WebP/SVG、WOFF/WOFF2/TTF；路径必须安全。其他类型会在上传前列出并拒绝。
- 默认标题是项目名；`--title` 接受 1–200 个字符。套餐和限额实时读取服务器。
- `maxUploadBytes` 限制本次缺失对象的新上传量（免费 20 MiB、Pro 100 MiB）；`maxTotalBytes` 限制清单总量（256 MiB），`maxFiles` 限制文件数（2000）。实际数值以 me 为准。
- CLI 本地只预检清单总量和文件数；新上传量由服务端按已有 blob 去重后判断，不能拿清单总量与新上传限额比较。共用字体和运行时资源可由运维预置。
- Pro 且 `.joplo/cloud.json` 记录属于当前服务器时，自动更新同一个链接；`--new` 新建。免费账号每次新建。
- `.joplo/cloud.json` 的格式为 `{server, shareId?, url?, review?: {shareId, url}}`：主链接和评审版是**两个分享**，互不覆盖（契约 8.1）。普通 share 只用、只写主 `shareId`/`url`；`--review` 只用、只写 `review`（Pro 重新发布评审版时用 `review.shareId` 作 replaceShareId，评审链接和评论保留，版本 +1），评审版永远不会替换 README 里的主链接。写入时保留另一项；记录属于其他 server 时整体替换。没有 `review` 的旧记录照常使用。
- 只上传服务端 `missing` 中的对象，412 表示对象已存在；网络错误和 5xx 最多重试 3 次，按 1、2、4 秒退避。4xx 不重试（412 作为成功）。收到 503 SERVICE_UNAVAILABLE 时按 Retry-After 等待（最多 30 秒），计入三次重试。create 仅在该错误明确带 Retry-After、服务端保证未提交时重试；create 的其他网络错误或 5xx 不重放。finalize 重试沿用同一个 uploadId。PUT 最多四路并发；一个对象失败会取消其他在途 PUT 和重试等待；链接 403 时提示过期并要求重新 share。PUT 时限为 30 秒 + 文件字节数 / (100 × 1024 字节/秒)，允许慢速大文件传输。
- finalize 成功后尽力写 `.joplo/cloud.json`，写入失败时尽力删除旧记录（删除失败也只警告），提示“Could not save the share record. The next publication will not update this link”，仍输出链接和到期时刻、退出 0。免费链接 1 小时有效，升级入口为当前 `<server>/settings/billing`。
- 预览图：构建后用本地截图能力（与 `joplo render` 相同，依赖可选的导出组件，见 `setup export`；项目里已有的 Playwright 也可以）渲染默认场景（第一个功能的选定方案的第一个场景，和嵌入模式默认场景相同）的初始画面，得到 1200×630 PNG，作为普通文件 `_joplo/preview.png`（`image/png`）放进上传清单，计入清单总量和新上传字节。没有导出组件、浏览器启动失败、项目没有场景或截图尺寸不对时跳过，stderr 只提示一行 “Skipped the preview image (…)”（没有导出组件时括号里给出 `npx joplo setup export`），share 照常成功、从不下载；分享页此时用通用预览图。
- 文本输出在链接和有效期之后打印 `Add to README: <Markdown 徽章>` 与 `More embed options: <server>/shares/<shareId>`（CLI 只用英文，D57）。
- **评审清单**：每次 share 都在 `POST /api/v1/shares` 请求体里附上 `review`（契约字段 `{v: 1, mode, features, scenarios, elements}`），由 check 编译的 dev IR 经 core 的 `reviewManifest` 生成。它**不是分享文件**：不进上传清单、不进 R2，分享页拿不到；SaaS 只把它存进数据库给评审页用。`mode: "publish"` 只含选定方案（与发布站同一范围，没有选定方案的功能不出现），`--review` 时为 `"review"`，含所有功能的所有方案。id 全部沿用 IR，步骤 `index` 从 0 开始，`elements` 是画面里所有作者元素 id（与 `Rule.elementIds` 同一套）及 `nodeLabel` 标签。
- **清单上限**：字符串按码点截断（末尾 “…”）——名字 200、目标/思路/规则/问题/explain 2000、取舍 500、字幕 500、元素标签 200；数组超出部分丢弃——每个功能 20 个方案、300 条规则、100 个问题，每个方案 20 条取舍，每条规则 50 个元素，最多 100 个功能、500 个场景、每个场景 200 步、每步 50 条规则、2000 个元素；id 永不截断。截断后序列化仍超过 512 KiB（524288 字节）时：`--review` 报 EXPORT_FAILED（`details: {maxBytes, actualBytes}`），在构建和上传之前失败，不静默丢内容；普通 share 不因清单失败，stderr 提示一行 “Skipped the review manifest (…)”，请求体省略 `review`（契约里它是可选字段），评审页此时看不到规则和问题。
- **发布顺序容错**：创建请求带着 `review` 被服务端以 HTTP 400 拒绝时（例如还不认识这个字段的旧版 SaaS；400 表示请求被拒、没有创建任何记录），普通 share 去掉 `review` 原样重试一次，stderr 提示一行 “The cloud rejected the review manifest (HTTP 400). Retrying once without it …”；`--review` 不重试，照常报 BAD_REQUEST（评审版没有清单没有意义）。413、422、429 等其他状态不触发这个重试。
- **`--review`（评审版，D63）**：构建时 `buildSite({ review: true })`，发布站包含所有功能的所有方案（未选定的功能也在），评审页通过 `joplo:goto` 指定任一场景即切换方案；规则、问题、情况、AI 假设、备注、取舍、源位置与普通发布一样不进任何上传文件。CLI 会核对产物里内联 IR 的 `mode` 是 `review`，旧版 `@joplo-app/server` 忽略该选项时报 UNSUPPORTED_ACTION，不上传。成功的 `data` 多一个 `mode: "review"`，文本写 “Published the review version …”。不带 `--review` 时构建参数、上传文件、输出与原来完全一致。
- **`--pr <number>`（PR 预览）**：请求体加 `pr: {provider: "github", repo, number, headSha, runUrl}`。在 GitHub Actions（`GITHUB_ACTIONS=true`）里：repo 取 `--repo` 或 `GITHUB_REPOSITORY`；headSha 取 `--sha`，否则读 `GITHUB_EVENT_PATH` 事件 JSON 的 `pull_request.head.sha`（PR 事件的 `GITHUB_SHA` 是合并提交），没有时用 `GITHUB_SHA`；runUrl 为 `GITHUB_SERVER_URL/GITHUB_REPOSITORY/actions/runs/GITHUB_RUN_ID`（重试的运行加 `/attempts/N`），只在 github.com 上生成，否则为 null。不在 Actions 里必须 `--repo owner/name`，headSha 取 `--sha` 或 `git rev-parse HEAD`。缺少或格式不对时在登录、检查、构建和任何请求之前报 USAGE（退出 2）。`--repo`、`--sha` 只能和 `--pr` 一起用。
- PR 预览是独立链接：不发送 replaceShareId，也不写 `.joplo/cloud.json`（不覆盖本项目的主链接和评审版记录，之后的普通 share、--review 与 feedback 仍用原来的记录）。CI 推荐 `npx joplo share --new --pr <number> --format json`；fork 来的 PR 拿不到 secrets，工作流应跳过发布，不推荐 `pull_request_target`。
- finalize 响应里的 `pr: {comment, reason?, installUrl?}` 原样（白名单字段）放进 `data.pr`；`comment: "skipped"` 时文本输出一行 “PR comment skipped: <原因>. Install the Joplo GitHub App to comment on pull requests: <installUrl 或 <server>/settings/github>”，`failed` 时说明评论失败但已发布。服务端没返回时 `data.pr` 为 null。

JSON 成功的 `data` 为 `{shareId, url, expiresAt, version, embed}`（`--review` 时另有 `mode: "review"`，`--pr` 时另有 `pr`），`expiresAt: null` 表示永久。进度写 stderr，stdout 只有一个结果信封；Agent 应读取 `data.url` 和 `data.expiresAt`。

`data.embed` 与云端控制台、分享页 Worker 用同一套格式（`<分享页>` 为 `data.url`，规范成以 `/` 结尾）：

| 字段 | 格式 |
| --- | --- |
| `iframe` | `<iframe src="<分享页>?embed=1" title="<标题> · Joplo 演示" style="width:100%;aspect-ratio:16/10;border:0" allow="fullscreen *" allowfullscreen loading="lazy"></iframe>`，属性值转义 `& < > " '` |
| `markdown` | `[![Joplo 演示 · <标题>](<徽章>)](<分享页>)`，替代文字把连续空白（含换行）合成一个空格，并转义 `\ [ ]` |
| `badge` | `<分享页>badge.svg` |
| `preview` | `<分享页>preview.png`（1200×630；有 `_joplo/preview.png` 时由分享页使用它） |

Agent 可以把 `data.embed.markdown` 直接写进 README；免费链接要同时告诉用户 `data.expiresAt`，过期后徽章会显示“已过期”。iframe 地址可以手动加 `&scenario=<场景 id>` 选起始场景、`&autoplay=1` 跳过封面直接播放，见 [发布站的嵌入模式](web.md#嵌入模式)。

| 错误码 | 恢复方式 |
| --- | --- |
| AUTH_REQUIRED（退出 3） | 请用户运行 npx joplo login，再重试 |
| AUTH_EXPIRED（401，退出 3） | 重新运行 npx joplo login |
| PLAN_REQUIRED | 服务端明确要求 Pro；升级入口为当前 server/settings/billing，或用 --new 创建新分享 |
| ACCOUNT_UNAVAILABLE | 账号目前不能发布，请登录网页查看账号状态；不引导付费 |
| FORBIDDEN | 当前操作被禁止，请检查账号权限 |
| RATE_LIMITED | 登录请求过于频繁，稍后再试 |
| UPLOAD_EXPIRED | 预签名上传链接已过期，重新运行 joplo share |
| CONFLICT | 另一个发布正在进行或上传准备失败，稍后重新运行 joplo share；不自动重试 |
| QUOTA_EXCEEDED | 按 details 区分每小时发布次数或每小时预留字节上限，显示服务端重试时间；类型未知时使用通用额度说明 |
| TOO_LARGE | `details.kind=upload` 表示新增上传超限，`total` 表示清单总量超限，`files` 表示文件数超限；查看上限、实际值及最大五个文件 |
| CLIENT_OUTDATED | 当前目录向上的项目里装了 joplo 时（启动器优先用项目版本，`npx joplo@latest` 也会被顶替），提示在项目里把两个依赖升到同一版本：`npm i -D joplo@latest @joplo-app/kit@latest`（按包管理器换成 pnpm/yarn/bun 的写法），再 `npx joplo share`；不在项目里时才建议 `npx joplo@latest share` |
| NETWORK | 检查网络后重试；命令内部重试 finalize 时复用 uploadId |

其他云端错误及本地校验失败退出 1，用法错误退出 2。错误正文不回显远端响应或访问令牌。HTTP 状态决定错误类别，4xx 不能被响应体改成可重试的 NETWORK。终端数据片段移除控制字符和 ANSI 转义序列；网址规范化，验证码严格校验。

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
| --new / replaceShareId | 参数及同服务器 cloud.json.shareId + 实时 Pro 套餐 → 创建请求 → 云端 → 新建或更新链接；免费账号从不发送 replaceShareId |
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
