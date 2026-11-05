# Joplo

Joplo 是面向编码 Agent 的功能设计与演示工具。你和 Agent 在本地用 TSX 描述页面、功能方案、情况、规则和演示步骤，在看板中查看不同路径上的功能堆叠，选定方案后构建静态演示站。源码是权威源，Git 管理版本；看板选中的元素会返回文件和行号，让 Agent 只修改你指着的那一处。

## 安装

当前是源码工作区版本，需要 Node.js 22+ 和 pnpm（仓库指定版本见 `package.json`）：

```sh
pnpm install
pnpm joplo guide
```

`@joplo/cli`、`@joplo/kit` 尚未作为独立可安装产品发布。下文在仓库根目录执行；`pnpm joplo` 调用工作区 CLI。仓库外项目必须能从自己的目录解析到本仓库的 `@joplo/kit`，包括 `@joplo/kit/ui` 和 JSX runtime。例如在外部项目的 `package.json` 中添加本地依赖后安装：

```json
{
  "private": true,
  "type": "module",
  "dependencies": {
    "@joplo/kit": "link:/绝对路径/Joplo/packages/kit"
  }
}
```

`init` 生成 ESM 项目及创作文件，不自动安装依赖；仓库外使用时先完成上述链接。CLI 仍从仓库运行，如 `pnpm joplo check /绝对路径/my-demo`。不要改用 React 的 JSX runtime，否则会丢失 Joplo 数据和源位置。

## 快速开始

```sh
pnpm joplo init examples/my-demo --name "我的演示"
pnpm joplo dev examples/my-demo
# 打开看板；编辑 routes/、layouts/ 或 features/ 下的 TSX/TS
pnpm joplo check examples/my-demo
# 在看板中点选要修改的元素，再读取定位和前后各三行源码
pnpm joplo selection examples/my-demo
# 在 feature.ts 中设置 pick 后发布
pnpm joplo build examples/my-demo
cd examples/my-demo
wrangler deploy dist
```

`dev` 默认使用 4790，端口占用时明确报错，可用 `--port <port>` 指定端口。`dev/build/render` 依赖 `@joplo/server` 的 IR v2 服务实现；缺少实现时会给出清晰错误并退出 1。Cloudflare 部署由用户自己的 Wrangler 环境和账号执行。

已有的完整邀请示例：`pnpm joplo check examples/invite`，再用 `pnpm joplo dev examples/invite` 查看。

## 项目目录

```text
joplo.config.ts                    config：名称、默认布局、首页、主题
layouts/app.tsx                    layout：外壳、Outlet、共享 Slot
routes/page.tsx                    page：路径 /
routes/members/page.tsx            page：路径 /members
features/invite/feature.ts         feature：目标、cases、共享规则、questions、pick
features/invite/options/a.tsx      option：on 堆叠、routes 新路径、state、flow 场景
features/invite/sample.ts          自由组织的复用数据或模块
.joplo/selection.json              本地当前选中（不进 Git）
dist/                             构建产物（不进 Git）
```

`on` 将方案元素堆叠到已有路径的命名插槽；`routes` 为方案新增静态页面。每个功能通过 `pick: 'a'` 选择一个方案，build 只发布选中的方案。无 `pick` 的功能不发布。

完整创作速查运行 **`pnpm joplo guide`**（独立 CLI 为 `joplo guide`，少于 150 行）。命令详情见 [docs/cli.md](docs/cli.md)，设计决策见 [ADR-0002](docs/adr/0002-hugo-like-authoring.md)。

## 检查与测试

```sh
pnpm joplo check examples/invite --option invite.a-modal
pnpm joplo check examples/invite --format json
pnpm test
pnpm typecheck
# 仅运行 CLI、IR v2 校验器与 8 项编译契约测试
pnpm exec vitest run packages/cli/test packages/core/test
```

check 的默认输出每个问题一行：`文件:行:列  级别  代码  说明`，最后一行汇总。error 退出 1，用法错误退出 2，warning/info 不阻止退出 0。邀请示例有故意保留的情况缺口和 AI 假设，原样检查没有 error。

## 已知限制

- 只支持静态路径，不支持 `[id]` 等动态段；原型无真实业务后端或数据。
- AI 假设不能标成已确认；行为只写在 flow 中，不写 `onClick` 或其他函数属性。
- 作者源文件会在本机加载、检查和构建时执行。导入他人项目等同于运行他人的代码仓库；看板和发布站仅消费编译后的 IR。
- 发布站只读，只含功能名、目标、场景演示、步骤字幕及整体布局；规则来源、AI 假设、缺口、待决问题留在创作侧。
- MCP、团队协作、评论同步和云端能力留到产品 V2；旧 apply/get/history/restore/mcp 命令已退役。首版直接编辑文件，用 Git 留存版本。
- 当前仍在源码工作区迁移阶段，CLI 与 kit 的独立分发、外部项目自动安装依赖尚未提供。
