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
npx joplo render [dir] --scenario-id <qid> --out <file> \
  [--step-id <qid>] [--theme <theme>] \
  [--width <pixels> --height <pixels>] [--scale <scale>] [--overwrite]
```

可省略的 dir 默认为当前目录。`render` 的 scenario-id、out 必填。主输出和帮助写 stdout，服务日志、截图告警和项目依赖版本提示写 stderr；用法错误退出 2，领域或执行失败退出 1，成功退出 0。

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
| publish | pick、build、静态站部署与演示能力 |

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
