# Joplo CLI（IR v2）

仓库根目录运行 `pnpm joplo <命令>`；下文用安装后的命令名 `joplo` 表示。源文件是权威源，直接编辑 TS/TSX，用 Git 保存版本。

## 命令

```sh
joplo init <dir> [--name <name>]
joplo guide
joplo check [dir] [--format text|json] [--option <feature.option>]
joplo selection [dir] [--format text|json]
joplo dev [dir] [--port <port>] [--open]
joplo build [dir] [--out-dir <dir>] [--overwrite]
joplo render [dir] --scenario-id <qid> --out <file> \
  [--step-id <qid>] [--theme sketch|clean] \
  [--width <pixels> --height <pixels>] [--scale <number>] [--overwrite]
```

可省略的 dir 默认为当前目录。主输出和帮助写 stdout，服务日志和截图告警写 stderr。参数错误退出 2；检查有 error、文件读取失败或服务实现缺失退出 1；成功或仅有 warning/info 退出 0。

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

## init 与 guide

init 只接受不存在或空目录，非空目录拒绝且不覆盖。生成 config、布局、首页、一个功能/方案/场景、ESM package.json、tsconfig 和 .gitignore；tsconfig 使用 react-jsxdev、@joplo/kit、allowImportingTsExtensions。仓库内生成后可立即 check。仓库外须先为项目安装/链接本地 `@joplo/kit`，当前限制及方法见根 README。

guide 输出不到 150 行的目录约定、kit API、完整组件名、行为与 AI 确认边界以及推荐工作流。组件清单取自 core catalog，避免另维护一份过期列表。

## dev / build / render

这三个入口在实际调用时才动态 import `@joplo/server`，分别使用 `startDev` / `buildSite` / `renderStep`，参数签名以 `packages/server/src/contract.ts` 为准。模块加载失败或对应函数缺失时，说明包名、函数名和原因，退出 1；check/selection/init/guide 不受其影响。

- dev 默认端口 4790；占用时由服务端明确报错，不静默换端口。log 回调写 stderr；stdout 返回 URL。
- build 默认输出项目 dist；显式 out-dir 相对 CLI 当前目录解析。非空输出目录需主动传 overwrite；由服务端执行覆盖检查。输出诊断与构建位置。
- render 缺省截图初始状态；step-id 表示该步骤执行之后的状态。width/height 必须同时提供且为正整数；scale 为有限正数。路径相对当前目录解析。默认不覆盖文件；stdout 返回图片路径，告警写 stderr。

apply、get、history、restore、mcp、validate、serve 旧入口已移除。用 check 代替 validate，用 dev 代替 serve。MCP SDK 依赖已从 CLI 移除；MCP 属于产品 V2。

## 验证

```sh
pnpm exec vitest run packages/cli/test packages/core/test
pnpm exec tsc -p packages/cli/tsconfig.json --noEmit
```

对邀请示例的错误注入仅发生在临时副本；selection、init、参数解析、服务端导出缺失均有测试。服务接线测试使用注入的函数，不启动旧服务，不占用 4790/4791。
