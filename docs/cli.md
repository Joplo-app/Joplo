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

支持 upsertFeature/Case/Option/Rule/Scene/Scenario/Issue、setCoverage、updateNode、insertNode、removeNode、remove、addComment、replyComment、setCommentStatus。upsert 的 value 是完整对象；同 ID 替换，缺省字段按共享 schema 补齐。已有对象的 featureId/optionId 不可改变，即使同批先 remove 再 upsert 也不允许。`updateNode.props` 浅合并，null 删除该键；它不能改节点 ID/type。删除根节点被拒绝，需用 upsertScene 替换画面。删除仍被引用的对象会失败；可在同批更新所有引用。评论目标丢失仅告警，保留原锚点。

人工边界：不能确认规则、创建或修改 decisions、关闭评论或改项目 ID/schemaVersion/revision。已有 confirmed 规则只有 confirmation 以外所有字段不变时可保持 confirmed；修改后省略 confirmation 或提供 pending，结果为 pending。显式要求把已改变的规则设为 confirmed 会被拒绝。addComment 的作者只能是 agent；upsertIssue 只能设置 open 或保持已有状态，不能替人接受或解决问题。restore 同样遵守此边界，不能删除现有评论，也不能双向改变 resolved 状态；若恢复会重新确认规则、修改决策或越过上述边界，返回 PERMISSION_DENIED。

## 存储与恢复

`project.joplo.json` 是唯一权威源。非 dry-run 写入使用 `proper-lockfile` 在 `.joplo/lock` 创建排他租约（2 秒心跳、10 秒过期，最多等待约 15 秒），在租约内完成幂等查询、修订检查、校验和持久化。租约获取、释放与真正发布还受 `fs-native-extensions` 的内核文件锁保护，使用持久的 `.joplo/commit.guard` 文件；不能删除此文件或用 mtime 方式抢走内核锁。进程退出时内核自动释放文件锁。

每次 rename 前检查租约 inode、`.joplo/lease.token` 中的随机所有权令牌、有效期与 onCompromised 状态。令牌在内核锁下更新，避免 inode 重用或 mtime 修改导致误认持有者。发布时在内核锁下同步重查权威项目，再原子替换 project。旧持有者失锁后返回 REVISION_CONFLICT；其清理路径只删除自己的暂存目录，绝不删除或覆盖公共快照/回执，也不释放新持有者的租约。释放异常不覆盖主错误或成功结果。

快照为 `.joplo/revisions/rev_N.json`。回执位于 `.joplo/receipts/<SHA-256(幂等键)>.json`，键不直接作为路径。规范化包含 schema 默认值、对象键顺序和数字化修订号；数组顺序保留。相同键与内容始终返回原回执，包括项目已前进的情况；不同内容返回 IDEMPOTENCY_MISMATCH。init 使用含 NUL 的内部命名空间，用户键不允许 NUL，因此 `init` 仍可用作普通用户幂等键。

每个事务在自己的 `.joplo/tmp-<pid>-<uuid>/` 中写入并 flush 项目、快照、回执和 journal，journal 记录 pid、目标 revision 与内容哈希。权威项目替换后，以不覆盖已有目标的 hard link 发布快照/回执；既有文件的哈希冲突会在项目替换前拒绝。当前修订缺少快照时，一并补写基线。所有正常失败发生在权威项目替换前，原项目字节不变；不会发布或清理任何公共半成品。

恢复只处理已确认死亡进程的暂存目录，活着的持有者即使租约过期也不会被当成崩溃进程清理。依据 revision 与项目/快照哈希判断事务是否提交：已提交事务补齐不可变文件；未提交事务只清理它自己的暂存文件。公共快照/回执永不回滚删除。history/历史读取不会展示未提交事务；项目替换后进程被杀的短窗口内，可从匹配权威项目哈希的 journal 只读取得已提交快照/回执。

权威项目替换是提交点。提交后若发布快照时发生 I/O 故障，保持成功回执及 journal，读取仍可取得已提交数据；新的写入返回 LOCK_BUSY，直到原进程退出后由下一次写入补齐。租约释放或清理故障不将已提交结果改成失败。该路径有故障注入和 SIGKILL 测试；不宣称能抵御所有硬件/文件系统损坏。内核锁与 hard link 面向本地文件系统。

restore 保留已有历史，将目标内容写为新修订；revision 和 updatedAt 记录这次恢复。dry-run 对有实际变化的批次返回预计新修订（当前 +1），不创建锁、快照或回执。命中已有回执时保持原 revision/requestId，并返回 `data.dryRun=true`、`data.replayedReceipt=true`，不改写回执。空 props、同值 upsert 或整批净变化为零时返回 `data.unchanged=true`、当前 revision、空 changedIds，不增加修订，也不占用幂等键。内部符号链接和目录穿越被拒绝。

结构 schema 不合法返回 INVALID_SCHEMA，不支持 schemaVersion 返回 UNSUPPORTED_SCHEMA_VERSION。引用错误返回 INVALID_REFERENCE；包括 action.target 必须存在于按 initial/navigate/back 推导的当前画面。这选择静态引用检查而非阻断所有 replay 错误，让未完成的行为草案仍可保存，但不能删除被步骤引用的节点。结构 warning/info 不阻断。

普通修订冲突返回 REVISION_CONFLICT，含 `error.details.currentRevision`；等锁超时的 details.reason 为 LOCK_BUSY，失锁为 LOCK_LOST，均可重试。不存在的项目目录/patch 文件返回 NOT_FOUND；restore/get 的无效 revision 参数返回 USAGE，退出 2。未知内部异常映射为现有契约的 UNSUPPORTED_ACTION，details.reason=INTERNAL_ERROR，不伪装成数据 schema 错误。verification 只有 unchecked / structure_ok / replay_ok，不表示业务确认或软件正确。

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

## 独立评审修复与回归证据

| 评审项 | 修复与证据                                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1     | 独立 journal、租约身份检查和内核发布锁；真实子进程冻结 12.5 秒，断言 B 先提交，A 失锁冲突且 B 的项目/快照字节与回执不变；死亡旧 journal 不阻断后续提交。 |
| R2     | 静态解析步骤当前画面，目标缺失为 reference/error；removeNode、替换 root 均有阻断回归，同批清理引用的评论测试已修正。                                     |
| R3     | upsert 对照批次初始归属；禁止跨方案/功能移动和 remove 后重建绕过；已确认规则的所有内容字段变动回 pending，相同规则保持 confirmed。                       |
| R4–R5  | 释放错误保留主结果；真实失锁错误不被 ERELEASED 覆盖；等锁超时返回 LOCK_BUSY。                                                                            |
| R6     | init 使用不可由用户输入的内部命名空间，用户键 init 可以正常提交。                                                                                        |
| R7     | issue 状态、评论作者、恢复评论/决策边界测试。                                                                                                            |
| R8     | CLI 不存在路径、无效 restore/get revision、未知内部异常分类测试。                                                                                        |
| R9     | 空 props、无 props 节点、同值内容返回 unchanged，修订不增加。                                                                                            |
| R10    | journal.revision 参与提交判定；dry-run 回执重放带独立标记且零写入。                                                                                      |

还验证持锁超过过期阈值且心跳正常时不会被抢锁，以及项目提交后发布故障的成功回执、只读历史与死亡持有者恢复。

本轮最终验收（2026-11-05）：`pnpm test` 11 个测试文件、109 项通过、0 失败；`pnpm typecheck` 通过、0 错误；`git diff --check` 通过。每项缺陷先运行对应失败测试再修复。新增的回归覆盖 12.5 秒冻结抢锁、正常心跳、等待超时、释放异常、提交中断、只读历史、后续恢复以及 CLI/MCP 的 dry-run 回执重放和无变化结果一致性。
