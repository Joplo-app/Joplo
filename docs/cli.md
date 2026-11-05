# Joplo CLI（M0/M1）

要求 Node ≥ 22；在仓库根目录运行 `pnpm install`。入口为 `pnpm joplo`，workspace bin 为 `joplo`。不需要构建产物。

## 开始创作

```sh
pnpm joplo guide
pnpm joplo guide --format text
pnpm joplo init ./demo --name 团队邀请
pnpm joplo get ./demo --scope project
pnpm joplo get ./demo --scope schema
```

所有机器输出都是 stdout 上的一行 `DomainResult` / `DomainFailure` JSON。`guide --format text` 的工作说明仍封装在 `data` 字符串中，可用 `| jq -r .data` 阅读。帮助与日志在 stderr。退出码：0 成功、1 领域错误、2 用法错误。校验命令成功返回报告时退出 0；自动化应检查 `data.summary.error` 判断是否存在校验错误。

## 命令与参数

| 命令             | 参数                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `init <dir>`     | `--name <name>`；已有项目时拒绝覆盖                                                                                                  |
| `guide`          | `--format json\|text`（默认 json）                                                                                                   |
| `get <dir>`      | `--scope <scope>`，可选 `--id`、`--revision rev_N\|N`、`--status open\|in_progress\|awaiting_user\|resolved`                         |
| `apply <dir>`    | `--patch <file\|->`，可选 `--expect-revision`、`--idempotency-key`、`--dry-run`                                                      |
| `validate <dir>` | `--mode structure\|replay\|all`（默认 all），可选 `--option-id`                                                                      |
| `history <dir>`  | 列出已提交修订；当前版本缺快照时仍列出当前版本                                                                                       |
| `restore <dir>`  | `--revision`、`--expect-revision`、`--idempotency-key` 都必填                                                                        |
| `serve <dir>`    | `--port <1–65535>`、`--open`；调用 `@joplo/server.startServer`                                                                       |
| `render <dir>`   | `--scenario-id`、`--out` 必填；可选 `--option-id`、`--step-id`、`--theme sketch\|clean`、同时给出的 `--width` / `--height`（1–8192） |
| `mcp`            | `--project <dir> --transport stdio`，见 [MCP](mcp.md)                                                                                |

`get` 范围为 project、feature、option、case、scenario、scene、comments、selection、schema。对象范围需要 ID。`project` 返回摘要；`option` 返回方案及其画面、场景、规则和共享情况。内容在 `data.content`；所有读取带顶层 `revision` 和 `data.pendingQuestions: { issues, aiAssumptions }`。comments 可按状态过滤。selection 只读 `.joplo/selection.json`，支持 `{sceneId,nodeId}` 或 `{kind:"element",id:"scene#node"}`，解析节点、规则和步骤；步骤选择支持 `{kind:"step",id:"stepId"}`。尚未选择时返回 null。节点 ID 可在不同画面复用，目标索引会跟踪 navigate/back，避免串到另一画面。

## 变更批次

```json
{
  "expectRevision": "rev_1",
  "idempotencyKey": "rename-invite-001",
  "summary": "只修改邀请按钮文案",
  "operations": [
    {
      "op": "updateNode",
      "sceneId": "scene_a_members",
      "nodeId": "btn_invite",
      "patch": { "props": { "label": "+ 邀请成员" } }
    }
  ]
}
```

`--expect-revision` 和 `--idempotency-key` 覆盖文件中的对应字段。`--patch -` 从 stdin 读取。两种修订格式 `rev_12`、`12` 等价。空批次、null、缺字段、额外字段均拒绝。每种操作的完整、可运行示例由 `guide` 给出；项目、Patch 和所有操作的 JSON Schema 由 `get --scope schema` 返回。

支持 upsertFeature/Case/Option/Rule/Scene/Scenario/Issue、setCoverage、updateNode、insertNode、removeNode、remove、addComment、replyComment、setCommentStatus。upsert 的 value 是完整对象；同 ID 替换，缺省字段按共享 schema 补齐。`updateNode.props` 浅合并，null 删除该键；它不能改节点 ID/type。删除根节点被拒绝，需用 upsertScene 替换画面。删除仍被引用的对象会失败；可在同批更新所有引用。评论目标丢失仅告警，保留原锚点。

人工边界：不能确认规则、创建或修改 decisions、关闭评论或改项目 ID/schemaVersion/revision。已有 confirmed 规则只有 text/caseIds 不变时可保持 confirmed；修改后省略 confirmation 或提供 pending，结果为 pending。显式要求把已改变的规则设为 confirmed 会被拒绝。restore 同样遵守此边界；若恢复会重新确认规则、修改决策或关闭评论，返回 PERMISSION_DENIED，不绕过人工确认。

## 存储与恢复

`project.joplo.json` 是唯一权威源。非 dry-run 写入使用 `proper-lockfile` 在 `.joplo/lock` 创建排他锁目录（2 秒心跳、10 秒过期，最多等待约 15 秒），在同一锁内完成幂等查询、修订检查、校验和持久化。当前修订没有快照时，首次成功写入会补基线。

快照为 `.joplo/revisions/rev_N.json`。回执位于 `.joplo/receipts/<SHA-256(幂等键)>.json`，键不直接作为路径。规范化包含 schema 默认值、对象键顺序和数字化修订号；数组顺序保留。相同键与内容始终返回原回执，包括项目已前进的情况；不同内容返回 IDEMPOTENCY_MISMATCH。恢复也使用相同幂等机制。

提交先写入并 flush 临时文件，再写 `.joplo/transaction.json` 恢复日志，最后原子替换项目。受控失败会清理新快照、回执和临时文件，项目原字节保持不变。进程被终止后，下一次非 dry-run 写入在锁内恢复日志：项目替换前的半成品被清理，替换后的原回执被保留。history/历史读取不会暴露尚未提交的修订。这里验证的是进程中断与文件操作失败；没有宣称多文件提交能抵御所有硬件或文件系统损坏。

restore 保留全部已有历史，把目标内容写为新修订；revision 和 updatedAt 记录这次恢复。dry-run 返回预计的新修订（当前 +1），不创建锁、快照或回执，项目及目录内容保持不变。内部符号链接和目录穿越被拒绝。

结构 schema 不合法返回 INVALID_SCHEMA，不支持 schemaVersion 返回 UNSUPPORTED_SCHEMA_VERSION，引用错误返回 INVALID_REFERENCE，修订冲突返回 REVISION_CONFLICT，含 `error.details.currentRevision`。结构 warning/info 随结果返回且不阻断。verification 只有 unchecked / structure_ok / replay_ok，不代表业务确认或软件正确。

## M1 示例与实跑记录

只在临时副本上操作：

```sh
copy=$(mktemp -d)
cp examples/invite/project.joplo.json "$copy/project.joplo.json"
pnpm joplo get "$copy" --scope option --id opt_a
pnpm joplo apply "$copy" --patch examples/invite/patches/01-invite-label.json --expect-revision rev_1 --idempotency-key k1 --dry-run
pnpm joplo validate "$copy" --mode all
# 正式应用两个示例，产生 rev_2、rev_3：
pnpm joplo apply "$copy" --patch examples/invite/patches/01-invite-label.json
pnpm joplo apply "$copy" --patch examples/invite/patches/02-already-member.json
pnpm joplo validate "$copy" --mode all
```

2026-11-05 在当前 worktree 的临时副本实跑前三条命令，均退出 0，真实 stdout 摘要如下（省略 requestId）：

```json
{"command":"get --scope option --id opt_a","ok":true,"projectId":"prj_invite","revision":1,"optionId":"opt_a","scenes":1,"scenarios":3,"pendingQuestions":{"issues":1,"aiAssumptions":2}}
{"command":"apply --expect-revision rev_1 --idempotency-key k1 --dry-run","ok":true,"revision":2,"changedIds":["btn_invite","scene_a_members"],"data":{"dryRun":true},"projectRevisionAfter":1,"filesAfter":["project.joplo.json"]}
{"command":"validate --mode all","ok":true,"revision":1,"summary":{"error":0,"warning":0,"info":3},"verification":{"opt_a":"replay_ok"}}
```

三条 info 是两条 PENDING_AI_ASSUMPTION 和无权限场景的 EMPTY_SCENARIO。两份示例 patch 的 get → apply → validate 测试也只运行于副本：第二份新增 `sc_a_already_member`、pending AI 假设规则，并将该情况 coverage 改为 expressed；原待决定 issue 仍为 open。没有修改示例权威源。

当前分支的 server 是协调者提供的桩，serve/render 的实际调用返回 RENDER_FAILED（“尚未实现”）；接入真实截图与服务由 T-web 负责。接线测试另外用 server mock 验证 PNG 内容、元素索引、参数传递、临时文件清理与错误映射。
