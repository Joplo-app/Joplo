# Joplo CLI（IR v2）

仓库根目录运行 `pnpm joplo <命令>`；下文用安装后的命令名 `joplo` 表示。源文件是权威源，直接编辑 TS/TSX，用 Git 保存版本。

## 命令

```sh
joplo init <dir> [--name <name>]
joplo skill [authoring|demo|components|cases|check|selection|publish]
joplo skill install [dir] [--force] [--diff] [--agents-md]
joplo guide                         # skill authoring 的兼容别名
joplo check [dir] [--format text|json] [--option <feature.option>]
joplo selection [dir] [--format text|json]
joplo dev [dir] [--port <port>] [--open]
joplo build [dir] [--out-dir <dir>] [--overwrite]
joplo render [dir] --scenario-id <qid> --out <file> \
  [--step-id <qid>] [--theme sketch|clean] \
  [--width <pixels> --height <pixels>] [--scale <number>] [--overwrite]
```

可省略的 dir 默认为当前目录。主输出和帮助写 stdout，服务日志和截图告警写 stderr。参数错误退出 2；检查有 error、文件读取失败或服务实现缺失退出 1；成功或仅有 warning/info 退出 0。

## skill：按需读取 Agent 用法

`joplo skill` 第一行是 `Joplo <当前 CLI 版本> · Agent 用法（按需读取）`，接着列出主题名、一句说明和实际行数，最后提示读取与安装命令。版本来自 `@tokenroll/joplo-cli` 的 package.json。

| 主题 | 何时读取 |
| --- | --- |
| authoring | 写目录、页面、布局、方案、flow 和规则 |
| demo | 用独立层级、镜头、trace 和短字幕组织一屏演示 |
| components | 查当前编译器支持的组件；有目录属性提示时一并显示 |
| cases | 按八个维度和产品类型预设挑出相关问题，再声明情况与覆盖 |
| check | 读诊断代码，按文件和行号局部修复 |
| selection | 用户在看板选中元素后读取源码，只改指向的位置 |
| publish | 选定 pick、构建、用 `npx wrangler deploy --assets dist` 部署 |

`joplo skill <主题>` 输出该主题的 Markdown，末尾指向相关主题。每个主题少于 150 行，不把全部用法塞进一次读取。未知主题会提示编辑距离最近的主题名，退出 2；如 `joplo skill authring` 提示 authoring。`joplo guide` 与 `joplo skill authoring` 的输出完全相同。

demo 以 examples/agent-arch 为完整示例；check 的诊断代码覆盖由读取 compile.ts/validate.ts 源码的测试约束，避免新增代码遗漏说明。publish 主题说明本地/发布站同布局、层级与导演、全屏快捷键，以及图片两端可导出、视频仅本地的边界。

这些命令只向 stdout 写无颜色文本，不加载 `@tokenroll/joplo-server`，也不加载或执行作者项目。组件清单与行为分类直接从 core catalog 生成；详细属性提示可由目录通过可选 docs 参数提供。

### 安装短指针

```sh
joplo skill install [dir]             # dir 默认当前目录
joplo skill install [dir] --diff      # 预览 unified diff，不创建或改写文件
joplo skill install [dir] --force     # 明确覆盖用户改过的 SKILL.md
joplo skill install [dir] --agents-md # AGENTS.md 不存在时也创建
```

写入 `<dir>/.claude/skills/joplo/SKILL.md`，含 name/description frontmatter、按需读取主题的命令、改完 check 和选中后 selection 的提示，连标记不超过 20 行。其中包括 `npx joplo skill demo` 的演示入口。不拷贝主题正文；详细用法跟随项目安装的 CLI 版本。

末行 `<!-- joplo-skill <版本> sha256:<哈希> -->` 由安装器写入。哈希覆盖标记前的全部原始字节（包括 frontmatter 与换行）；重装时重新计算并比对。文件不存在时创建；原生成内容未修改时允许更新；字节完全相同则输出“已是最新”，不重写文件。

用户改过或没有有效标记时不覆盖，输出 `--diff` / `--force` 用法并退出 1。`--diff` 成功预览退出 0，即使同时传 `--force` 也不写入；差异相同则输出“已是最新”。目标中没有 joplo.config.ts 时输出警告，仍允许安装。

AGENTS.md 已存在或传入 `--agents-md` 时，安装器写入 `<!-- joplo:start -->` 与 `<!-- joplo:end -->` 间的指针段；重装只替换此段，段外原始字节保持不变，没有托管段则追加。标记缺失一半或重复时拒绝安装，避免误改用户规则。SKILL.md 的冲突检查与 AGENTS.md 标记检查都在写入前完成。

持久化只增加上述两个指针文件：安装器写入 → 本地文件/Git 存储 → 下次安装读取哈希/托管标记 → 安装器决定是否更新；Agent 读取指针，再运行 CLI 获取主题。主题正文和行数在内存生成后写 stdout，不进入项目持久化状态，source/at/selection 定位链路不变。

## check

流程：tsx `tsImport`（使用目标项目的 tsconfig）→ `loadAuthoring` → `compile(..., 'dev')` → `validate(..., { mode: 'all' })`，最后一步由同一个 player `replay()` 回放各场景。目标目录先取真实路径，避免符号链接导致 tsconfig 与源位置不匹配。

默认 text 输出每个问题一行，末尾一行汇总：

```text
features/invite/options/a-modal.tsx:78:17  info  PENDING_AI_ASSUMPTION  发送失败后保留输入
0 error, 9 warning, 5 info
```

相同源位置、代码、说明和级别只输出一次。`--option invite.a-modal` 限制结构与回放校验；编译仍读取整个项目，项目级编译错误仍会报告。

`--format json` 为 DomainResult 风格：成功包含 `ok/projectId/revision/requestId/summary/changedIds/diagnostics/artifacts/data`；检查失败包含 `ok: false/error/diagnostics/data`；载入前或用法错误包含 `ok: false/error/diagnostics`。`data` 是报告（name、diagnostics、summary、verification）。`revision: 0`、空 changedIds/artifacts 仅兼容结果信封，TSX 项目以 Git 管理版本。

校验包括未绑定的可操作元素、禁用原因、coverage 缺口与原因、规则元素缺失、待确认 AI 假设、空场景和回放错误。warning 不阻止发布命令执行，error 必须先修复。`verification` 按方案记录 unchecked / structure_ok / replay_ok；无场景的方案不会宣称 replay_ok。

## selection

读取 `<dir>/.joplo/selection.json`（core 的 `Selection` 类型，由本地看板写入），打印 `at`、标签及该行前后各三行，源码带行号。文件不存在或内容为 null 时输出“当前没有选中”，退出 0。不编译项目，适合作为 Agent 取得用户指向位置的短通道。

JSON 的 `data.selection` 保留原 Selection，`data.lines` 是 `{ number, text }[]`，`note` 表示无源位置、源文件已删除或行已不存在等状态。这些视图字段由 CLI 的 readSelection 读取 Selection 和源文件后在内存生成，经 stdout JSON 输出；text 格式读取同一视图，Agent 是消费者，不新增持久化字段。无源位置也退出 0。无效 JSON/at 或项目外路径报错退出 1。

定位链路：kit jsxDEV/callsite 写 source → compile 转为项目相对 source → 看板 DOM 的 data-jat → Selection.at → CLI 的定位与片段。校验器诊断的 at 取节点、步骤、规则、场景或方案 source。coverage 没有单独 source，使用所属 option.source；缺失源位置的手工 IR 回退到 `joplo.config.ts:1:1`。

## init

init 只接受不存在或空目录；非空目录时不写入任何文件，说明已有几个文件，并提示 `init . --keep`（只补缺失的文件，已有文件一字不改）。生成 config、布局、首页、一个功能/方案/场景、package.json、tsconfig 和 .gitignore：

- package.json：ESM，`devDependencies` 锁定 `"joplo"` 与 `"@tokenroll/joplo-kit"` 为当前 CLI 的精确版本（读自 `@tokenroll/joplo-cli` 的 package.json，所有包同一版本），并带 `dev` / `check` / `build` 脚本；
- tsconfig：react-jsxdev、jsxImportSource `@tokenroll/joplo-kit`、allowImportingTsExtensions、skipLibCheck。

输出最后一行是下一步命令，按 `npm_config_user_agent`（npx、pnpm、yarn、bunx 都会设置）选择 npm / pnpm / yarn / bun 的写法，例如 `下一步：cd my-demo && npm install && npx joplo dev`。仓库内生成后可立即 check。

check / dev / build / render 运行前比较项目里的 `@tokenroll/joplo-kit`（从项目目录向上找 node_modules）与 CLI 版本；不同则在 stderr 打印一行警告和对齐命令（如 `npm i -D joplo@0.1.0 @tokenroll/joplo-kit@0.1.0`），声明了依赖却没安装则提示先安装。只提示，不阻止命令。

命令入口：`joplo` 包（packages/joplo）先检查 Node ≥ 22，再优先转发给项目内安装的 `@tokenroll/joplo-cli`（init 除外，总用 npx 指定的版本）。`@tokenroll/joplo-cli` 自己的命令名是 `joplo-cli`，避免安装时占掉入口包的 `joplo`。

## dev / build / render

这三个入口在实际调用时才动态 import `@tokenroll/joplo-server`，分别使用 `startDev` / `buildSite` / `renderStep`，参数签名以 `packages/server/src/contract.ts` 为准。模块加载失败或对应函数缺失时，说明包名、函数名和原因，退出 1；check/selection/init/skill/guide 不受其影响。

- dev 默认端口 4790；占用时由服务端明确报错，不静默换端口。log 回调写 stderr；stdout 返回项目在看板中的链接（`http://127.0.0.1:<端口>/#/<项目>`）。
- 一台机器（同一个 `JOPLO_HOME`，缺省 `~/.joplo`）只运行一个看板进程：`<JOPLO_HOME>/server.json` 记录存活的看板时，dev 用其中的令牌把项目注册进去，打印链接和“已加入正在运行的看板”，退出码 0，不启动第二个进程。打开过的项目记在 `<JOPLO_HOME>/projects.json`。
- build 默认输出项目 dist；显式 out-dir 相对 CLI 当前目录解析。非空输出目录需主动传 overwrite；由服务端执行覆盖检查。输出诊断与构建位置。
- render 需要可选依赖 Playwright 与 Chromium：没装时在启动编译服务之前就以 RENDER_FAILED 退出 1，提示 `npm i -D playwright && npx playwright install chromium`，并说明 dev、check、build 不需要它。render 缺省截图初始状态；step-id 表示该步骤执行之后的状态。width/height 必须同时提供且为正整数；scale 为有限正数。路径相对当前目录解析。默认不覆盖文件；stdout 返回图片路径，告警写 stderr。

apply、get、history、restore、mcp、validate、serve 旧入口已移除。用 check 代替 validate，用 dev 代替 serve。MCP SDK 依赖已从 CLI 移除；MCP 属于产品 V2。

## 验证

```sh
pnpm exec vitest run packages/cli/test packages/core/test
pnpm exec tsc -p packages/cli/tsconfig.json --noEmit
```

对邀请示例的错误注入仅发生在临时副本；selection、init、参数解析、服务端导出缺失均有测试。skill 另验证主题行数、真实版本、拼写建议、安装幂等与修改保护、diff 只读、AGENTS.md 段外字节保持及不加载服务端。服务接线测试使用注入的函数，不启动旧服务，不占用 4790/4791。
