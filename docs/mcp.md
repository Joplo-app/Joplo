# Joplo MCP（M0/M1）

使用官方 `@modelcontextprotocol/sdk` **1.32.2**，stdio 传输。安装版本的 `LATEST_PROTOCOL_VERSION` 为 **2025-11-25**；还支持协商 2025-06-18、2025-03-26、2024-11-05、2024-10-07。本分支使用同版本 SDK Client 通过真实子进程验证 initialize、tools/list 与 tools/call。未声称已在 Claude Code GUI 中实测。SDK 的 stdio 与工具结果用法参考[官方 v1 文档](https://ts.sdk.modelcontextprotocol.io/server)。

```sh
pnpm install
pnpm joplo mcp --project /absolute/path/to/project --transport stdio
```

服务启动时 realpath 绑定该目录并解析项目，不扫描其他路径。工具不接受另一个 projectDir，也不接受任意输出路径。stdout 只写 SDK 协议消息；启动错误写 stderr 并非零退出。

## Claude Code 项目配置

按照[官方 MCP 配置文档](https://code.claude.com/docs/en/mcp)，在客户端项目根目录创建 `.mcp.json`，替换以下绝对路径。绝对 tsx loader 路径使服务不依赖客户端工作目录；Node 需在 PATH 上。

```json
{
  "mcpServers": {
    "joplo": {
      "type": "stdio",
      "command": "node",
      "args": [
        "--import",
        "/absolute/path/to/Joplo/node_modules/tsx/dist/loader.mjs",
        "/absolute/path/to/Joplo/packages/cli/src/bin.ts",
        "mcp",
        "--project",
        "/absolute/path/to/project",
        "--transport",
        "stdio"
      ]
    }
  }
}
```

## 工具

所有工具通过 `tools/list` 声明 JSON inputSchema/outputSchema。输出为 `structuredContent: DomainResult | DomainFailure`，content 附一句可读摘要；领域失败同时设置 `isError: true`。每个工具的成功 data 有独立 schema，失败共享 result.ts 的错误分类。

| 工具             | 输入                                                                                            | 成功 data                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `joplo_get`      | `scope`，可选 `id`、`revision`、`status`                                                        | `content`、`pendingQuestions: {issues, aiAssumptions}`；顶层带 revision                             |
| `joplo_apply`    | `patch: {expectRevision,idempotencyKey,summary,operations[]}`，可选 `dryRun`                    | `dryRun`，可选 `unchanged` / `replayedReceipt`；顶层带 revision、changedIds 和 diagnostics          |
| `joplo_validate` | `mode: structure/replay/all`（默认 all），可选 `optionId`                                       | diagnostics、summary（error/warning/info 计数）、verification（按方案）                             |
| `joplo_render`   | 必填 `scenarioId`，可选 `optionId`、`stepId`、`theme: sketch/clean`、`viewport: {width,height}` | sceneId、position、elements（id/type/label/visible/disabled/box）、warnings；content 另含 PNG image |

get 的 scope 与 CLI 一致，schema 范围同时提供 Project、Patch、每个操作的 JSON Schema 和组件目录。每种操作的可运行示例与 Agent 创作协议由 CLI `guide` 提供。

apply 示例：

```json
{
  "name": "joplo_apply",
  "arguments": {
    "patch": {
      "expectRevision": "rev_1",
      "idempotencyKey": "mcp-invite-label-001",
      "summary": "修改邀请按钮",
      "operations": [
        {
          "op": "updateNode",
          "sceneId": "scene_a_members",
          "nodeId": "btn_invite",
          "patch": { "props": { "label": "+ 邀请成员" } }
        }
      ]
    },
    "dryRun": true
  }
}
```

所有写入调用同一个 core 内核，与 CLI 共享锁、幂等、引用检查和人工边界。不能确认规则、修改 decisions、关闭评论或修改项目元数据；评论作者只能是 agent，不能替人将 issue 标成 accepted/resolved；冲突要先重新读取，不自动覆盖。校验通过只表示结构/模拟回放状态。

render 调用 `@joplo/server.renderStep`，将临时 PNG 编为 image content，返回元素索引后清理文件；不会返回失效的临时文件路径。当前分支 server 仍是桩，返回 RENDER_FAILED；成功图像接线已用 mock 验证，真实渲染由 T-web 接入。不注册 compare/export。

集成测试使用 SDK Client + StdioClientTransport，捕获原始 stdout，逐行断言 JSON-RPC 2.0，且没有 stderr/transport 错误。两个独立临时项目分别从 CLI 和 MCP 应用同一 patch，断言 changedIds、修订变化和场景内容相同；并比较 REVISION_CONFLICT、IDEMPOTENCY_MISMATCH、INVALID_SCHEMA、PERMISSION_DENIED。

无变化返回当前修订和 data.unchanged=true。dry-run 命中已提交回执时带 data.dryRun=true、data.replayedReceipt=true。锁忙/失锁分别以 REVISION_CONFLICT 加 details.reason=LOCK_BUSY/LOCK_LOST 返回；调用方应重新读取或稍后重试。存储恢复与内核锁细节见 [CLI 文档](cli.md#存储与恢复)。
