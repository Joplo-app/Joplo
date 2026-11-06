# Joplo CLI（0.1.2）

安装后的项目使用 `npx joplo`；仓库内使用 `pnpm joplo` 运行源码。需要 Node.js ≥ 22。任意命令都支持 `-h, --help`。

## 命令与参数

```sh
npx joplo init <dir> [--name <name>] [--keep]
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
npx joplo share [dir] [--format text|json] [--new] [--title <title>] [--server <url>]
npx joplo render [dir] --scenario-id <qid> --out <file> \
  [--step-id <qid>] [--theme <theme>] \
  [--width <pixels> --height <pixels>] [--scale <scale>] [--overwrite]
```

可省略的 dir 默认为当前目录。`render` 的 scenario-id、out 必填。主输出和帮助写 stdout，服务日志、截图告警和项目依赖版本提示写 stderr；用法错误退出 2，领域或执行失败退出 1，云端需要登录（AUTH_REQUIRED / AUTH_EXPIRED）退出 3，成功退出 0。

## init

生成可运行的最小项目：config、布局、首页、一个功能/方案/场景，以及 package.json、tsconfig.json、.gitignore。

- `--name <name>`：项目名，默认目录名。
- `--keep`：目录非空时只补缺失文件，已有文件不改动；不传时拒绝非空目录。
- package.json 将 `joplo` 与 `@joplo-app/kit` 锁到当前 CLI 的相同精确版本，并提供 dev/check/build 脚本。
- tsconfig 使用 `react-jsxdev`、`jsxImportSource: '@joplo-app/kit'`、`allowImportingTsExtensions`。
- 最后一行提示安装依赖并启动看板；命令写法按 npm/pnpm/yarn/bun 环境选择。

```sh
npx joplo@latest init my-demo
cd my-demo
npm install
npx joplo dev --open
```

## dev：一个进程，多个项目

首次运行启动本地看板，默认绑定 `127.0.0.1:4790`，打印项目链接。`--open` 打开浏览器；`--port` 接受 1–65535 的整数，启动新看板时指定端口。端口被其他应用占用时明确报错，不静默换端口。

同一个 `JOPLO_HOME` 下已有存活看板时，再次运行只注册当前项目、打印链接并退出，不再启动第二个进程；这时优先加入已有看板。`JOPLO_HOME` 默认 `~/.joplo`：projects.json 记最近项目，server.json 记运行实例，settings.json 记主题选择。

首页可切换项目与功能；源文件变化只重新编译对应项目，保存后热更新。编译出错时显示诊断，并保留上一次成功的画面；修复后恢复。界面和交互见[看板文档](web.md)。

## check

使用项目 tsconfig，经 tsx `tsImport` → core `loadAuthoring` → `compile(..., 'dev')` → `validate(..., { mode: 'all' })`；回放由 player 的 `replay()` 执行。源文件会在本机加载。

- `--format text|json`：默认 text。
- `--option <qid>`：仅校验指定方案的结构和回放，例如 `invite.a-modal`；整个项目仍须编译。

```text
features/invite/options/a-modal.tsx:24:16  warning  CASE_NOT_COVERED  Case is not yet Covered: invite.happy 正常发出邀请并被接受
0 error, 1 warning, 0 info
```

每个问题一行 `文件:行:列  级别  代码  说明`，最后汇总；同位置、代码、说明和级别的重复项只输出一次。error 退出 1，用法错误退出 2，只有 warning/info 时退出 0。按定位只读改需要的那一处；代码含义和修法见 `npx joplo skill check`。

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

`npx joplo skill` 列出当前 CLI 版本、主题说明和实际行数；每个主题少于 150 行。`npx joplo skill <主题>` 输出 Markdown，结尾指向相关主题。未知主题会建议编辑距离最近的名称并退出 2。

| 主题 | 内容 |
| --- | --- |
| authoring | 目录、页面、布局、方案、flow、绑定与规则 |
| demo | 独立层级、导演、镜头、Diagram/trace、短字幕与主题 |
| components | 当前组件目录和属性提示 |
| cases | 八个维度及按产品类型筛选的情况预设 |
| check | 诊断代码与局部修复 |
| selection | 用户选中后只改指向的位置 |
| publish | pick、build、云端登录与分享、静态站部署与演示能力 |

`guide` 与 `skill authoring` 完全相同。读取主题不加载服务端，也不执行作者项目，输出无颜色文本。

### skill install

写入不超过 20 行的 `.claude/skills/joplo/SKILL.md` 短指针，详细用法仍由 CLI 按需输出。AGENTS.md 已存在时更新 Joplo 托管段；不存在时仅在显式传 `--agents-md` 后创建。

- `--diff`：只打印 unified diff，不创建或改写文件，优先于 force。
- `--force`：允许覆盖被用户修改过的 SKILL.md。
- `--agents-md`：即使 AGENTS.md 不存在也创建指针段。

SKILL.md 末尾保存版本与 sha256，覆盖标记前全部原始字节。重装时：未改动的生成内容允许更新；字节相同输出“Already up to date”且不重写；用户改过或缺少有效标记时拒绝覆盖，提示 diff/force，退出 1。目录没有 joplo.config.ts 时警告但仍安装。

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

需要可选依赖 Playwright 和 Chromium；缺失时给出安装命令并退出 1。dev/check/build 不需要它们，本地看板的图片和视频导出需要。

```sh
npm install -D playwright
npx playwright install chromium
```

服务契约见 [contract.ts](../packages/server/src/contract.ts)。所有主题和选项以当前 `--help` 为准；需要创作细节时优先读取对应 skill 主题。


## 云端地址与凭证

CLI 和 skill 输出遵循 D57，统一使用英文；本文保留中文说明。云端命令的产品决策见 D58。

只有 `login`、`logout`、`whoami`、`share` 连接云端；本地命令继续完整、免费。
地址优先级：`--server <url>` → 非空 `JOPLO_CLOUD_URL` → `https://cloud.joplo.app`。空字符串等同未设置；协议/主机名及默认端口规范化后匹配凭证。地址必须是 HTTP(S) 源（不带路径、查询参数或用户名密码）。
每个云端 API 请求携带 `X-Joplo-Client: joplo-cli/<版本>`；预签名文件 PUT 严格使用服务端返回的 headers，不附加账号令牌或版本头。
凭证只适用于其记录的 server；切换服务器需要重新登录，不会把另一个服务器的令牌发送过去。

`JOPLO_HOME` 与看板 settings.json 使用相同解析规则：非空环境变量按当前目录解析，默认 `~/.joplo`，新建目录权限为 0700。
`credentials.json` 权限为 0600，读取已有凭证时，只有 group/other 权限开放才尝试收紧；只读挂载等导致 chmod 失败时只警告，不影响请求；先写同目录临时文件再原子 rename；损坏或缺字段时视为未登录并提示重登。
不要把凭证文件复制到项目中、输出或提交 Git。`.joplo/cloud.json` 只保存服务器、分享 ID 和链接。

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
- 只上传服务端 `missing` 中的对象，412 表示对象已存在；网络错误和 5xx 最多重试 3 次，按 1、2、4 秒退避。4xx 不重试（412 作为成功）。收到 503 SERVICE_UNAVAILABLE 时按 Retry-After 等待（最多 30 秒），计入三次重试。create 仅在该错误明确带 Retry-After、服务端保证未提交时重试；create 的其他网络错误或 5xx 不重放。finalize 重试沿用同一个 uploadId。PUT 最多四路并发；一个对象失败会取消其他在途 PUT 和重试等待；链接 403 时提示过期并要求重新 share。PUT 时限为 30 秒 + 文件字节数 / (100 × 1024 字节/秒)，允许慢速大文件传输。
- finalize 成功后尽力写 `.joplo/cloud.json`，写入失败时尽力删除旧记录（删除失败也只警告），提示“Could not save the share record. The next publication will not update this link”，仍输出链接和到期时刻、退出 0。免费链接 1 小时有效，升级入口为当前 `<server>/billing`。
- 预览图：构建后用本地截图能力（与 `joplo render` 相同，依赖可选的 Playwright + Chromium）渲染默认场景（第一个功能的选定方案的第一个场景，和嵌入模式默认场景相同）的初始画面，得到 1200×630 PNG，作为普通文件 `_joplo/preview.png`（`image/png`）放进上传清单，计入清单总量和新上传字节。没有 Playwright、浏览器启动失败、项目没有场景或截图尺寸不对时跳过，stderr 只提示一行 “Skipped the preview image (…)”，share 照常成功；分享页此时用通用预览图。
- 文本输出在链接和有效期之后打印 `Add to README: <Markdown 徽章>` 与 `More embed options: <server>/shares/<shareId>`（CLI 只用英文，D57）。

JSON 成功的 `data` 为 `{shareId, url, expiresAt, version, embed}`，`expiresAt: null` 表示永久。进度写 stderr，stdout 只有一个结果信封；Agent 应读取 `data.url` 和 `data.expiresAt`。

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
| PLAN_REQUIRED | 服务端明确要求 Pro；升级入口为当前 server/billing，或用 --new 创建新分享 |
| ACCOUNT_UNAVAILABLE | 账号目前不能发布，请登录网页查看账号状态；不引导付费 |
| FORBIDDEN | 当前操作被禁止，请检查账号权限 |
| RATE_LIMITED | 登录请求过于频繁，稍后再试 |
| UPLOAD_EXPIRED | 预签名上传链接已过期，重新运行 joplo share |
| CONFLICT | 另一个发布正在进行或上传准备失败，稍后重新运行 joplo share；不自动重试 |
| QUOTA_EXCEEDED | 按 details 区分每小时发布次数或每小时预留字节上限，显示服务端重试时间；类型未知时使用通用额度说明 |
| TOO_LARGE | `details.kind=upload` 表示新增上传超限，`total` 表示清单总量超限，`files` 表示文件数超限；查看上限、实际值及最大五个文件 |
| CLIENT_OUTDATED | 使用 npx joplo@latest share |
| NETWORK | 检查网络后重试；命令内部重试 finalize 时复用 uploadId |

其他云端错误及本地校验失败退出 1，用法错误退出 2。错误正文不回显远端响应或访问令牌。HTTP 状态决定错误类别，4xx 不能被响应体改成可重试的 NETWORK。终端数据片段移除控制字符和 ANSI 转义序列；网址规范化，验证码严格校验。

Ctrl+C（SIGINT）会清理本进程登记的 joplo-share-* 目录及原子写入临时文件，并退出 130；不会删除其他运行中的分享目录。

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
| cloud.json.server / shareId / url | 目标服务器及 finalize 响应 → 项目 .joplo/cloud.json（原子写） → 下次 share → 来源比对与 Pro 更新；url 供用户/工具读取 |
| shareId / url / expiresAt / version | finalize 响应 → text/JSON 结果 → 用户/Agent → 分享链接及有效期 |
| embed.iframe / markdown / badge / preview | finalize 的 url + 本次 title → `embedSnippets`（cli/src/cloud-embed.ts，只在内存） → text 输出（markdown）与 JSON `data.embed` → 用户/Agent 写进 README 或博客；分享页 Worker 提供 badge.svg / preview.png |
| _joplo/preview.png | share 构建后 renderStep 截图（默认场景初始画面，1200×630） → 临时 build 目录 → manifest / 创建请求 / PUT → 云端 R2 → 分享页 Worker 的 preview.png 与 Open Graph 卡片；失败时不进清单 |
| user / plan / limits | me 响应 → 进程内与 whoami 结果 → share 或用户/Agent → 套餐展示、更新资格、maxTotalBytes/maxFiles 本地预检、maxUploadBytes 上传限额展示、publishesPerHour 频率诊断 |
| AUTH_REQUIRED 的 details.fix / credentialServer | 当前 server 与旧凭证 server → 跨服务器 share 错误信封 → Agent 请用户在自己的终端确认登录；不自动 logout |
| error.details | 本地校验、manifest 和 me 限额 → 结果信封 → 用户/Agent → fix 登录命令、超限的 kind/maxBytes/actualBytes/maxFiles/actualFiles/largestFiles ；429 的 kind/limit/actual/retryAt → 额度类型、上限与重试时间 |


`TOO_LARGE` 的 CLI `error.details` 采用 `{kind: "upload" | "total" | "files", maxBytes, actualBytes, largestFiles: [{path, size}]}`；files 变体另外包含 `maxFiles/actualFiles`，其中字节字段仍表示清单总量上限与实际总字节。本地只有文件数超限时也使用 files。远端限额值与文件列表按白名单读取（兼容上限字段 `limitBytes`，统一输出 `maxBytes`），不会回显响应中其他字段。服务端没有有效诊断时只报告错误码，不推测新增上传量。


429 诊断读取 `kind: "publishes" | "reserved_bytes"`、非负整数 `limit/actual` 及有效时间 `retryAt`；其他 kind 使用通用额度说明，仍显示合法 retryAt。不从 me.publishesPerHour 猜测限流原因。设备轮询中的 429 是协议特例，可在授权期限内退避继续；这不改变分享接口 4xx 不重试的规则。


并发上传共享 AbortController；发生失败后取消其他请求和可中止的退避等待，每次重试前检查取消状态，不再发新 PUT。仍会等待所有任务结束，再清理临时目录和 SIGINT 监听器。上传 headers（含 content-length）完全来自服务端，不由 CLI 增删。
