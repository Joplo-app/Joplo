# 本地与 Share 评审：增量补收与 Cloud 写契约

状态：主仓库 CLI 已实现统一监听、游标补收和评审写操作。本文记录 2026-11-13 在并行 `joplo-cloud` 工作区核对到的实际路由与 schema；这些 Cloud 修改当时仍在该工作区中，不能据此宣称生产环境已经部署。CLI 使用本地 HTTP fixture 验证，真实部署联调仍需协调者完成。

## 命令入口

```sh
joplo feedback watch ./demo --local --follow --json
joplo feedback watch ./demo --local --session <id> --json
joplo feedback watch --share Abc1234567 --work invite.a-modal --interval 15 --json
joplo feedback watch --share Abc1234567 --work invite.a-modal --cursor <最后完整处理的游标> --json
```

本地仍直接观察持久文件。Share 使用普通 GET 轮询：首次立即请求，成功后默认等待 15 秒，可选 10–30 整数秒。网络错误退避，鉴权／权限／配额错误明确结束；中断取消在途请求和等待。

双方统一输出 `source/eventId/sessionId/featureId/workId/revision/createdAt/type`。Cloud 只过滤绑定版本与方案的评论，并将匹配的当前作者 `pick` 映射为 `approved`；其他规则／回答决定为 `decision`，投票不确认。分享发布新版本时输出 `closed` 并退出 1。`eventId` 跨重启稳定；Cloud 没有本地递增 `seq`，不伪造它。

## 增量读取：复用 feedback 路由

`GET /api/v1/shares/{shareId}/feedback` 保留无查询参数时的旧快照；传入 `cursor` 或 `limit` 时进入持久事件分页模式。

请求：

- `cursor`：可选，非负十进制字符串，最多 19 位；缺省为 `0`。由服务端事件 id 生成，不按时间戳或 OFFSET 猜测。
- `limit`：可选，1–500；CLI 每页使用 200。
- scope：分享主人登录，或 API Key 的 `feedback:read`。

响应保留 `share`、`works`、`decisions`、`comments`，并增加：

```json
{
  "share": { "id": "Abc1234567", "version": 3 },
  "works": [{ "id": "invite.a-modal", "featureId": "invite" }],
  "comments": [],
  "decisions": [],
  "nextCursor": "42",
  "hasMore": false
}
```

评论除原字段外可带 `resolvedAt` 与 `change: "created" | "resolved" | "reopened"`；决定除原字段外可带 `retractedAt`、`appliedAt`、`appliedRef` 与 `change: "decided" | "retracted" | "applied"`。因此评论解决、决定写回或撤回不会抹掉需要补收的历史。

CLI 的可靠性规则：

1. 每轮从最后提交的游标读取，直到 `hasMore: false`，再输出本批事件并判断确认；不会在多页中间因先看到 pick 就提前结束。
2. 同一实体的多次变化按最新记录合并；评论解决后仍补发正文，applied 后仍能确认，retracted 的历史 pick 不确认。
3. 事件带本批最终 `cursor`，stderr 打印 `Cloud cursor: …`。显式 `--cursor` 只恢复事件流，不改变分享版本绑定。
4. 多页中途网络失败不提交游标，下一轮从原位置重读；消费者按 `eventId` 去重。
5. 旧 Cloud 没有 `nextCursor/hasMore` 时退回快照模式并警告其有损边界：解决/applied 后可能漏记录，重启只重放当前快照。

## 评论与决定写接口

所有路由都要求 Bearer 认证。API Key 使用 `feedback:write`；评论与投票另外要求有效 `reviewId`（Cloud `/review/<id>` 的链接 id）， owner 的决定/解决/撤回仍走 owner 检查。

| 操作 | route / request | response |
| --- | --- | --- |
| 提交评论 | `POST /api/v1/shares/{shareId}/feedback/comments`；`{shareId,reviewId,expectedVersion,body,anchor:{version,workId,scenario,step,stepId,layer,element}}` | `{id}` |
| 解决/重开 | `POST /api/v1/shares/{shareId}/feedback/comments/{commentId}/resolution`；`{shareId,commentId,resolved}` | `{success:true}` |
| 记录决定 | `POST /api/v1/shares/{shareId}/feedback/decisions`；`{shareId,kind,featureId,workId,targetId,note,expectedVersion}` | `{id}` |
| 撤回决定 | `POST /api/v1/shares/{shareId}/feedback/decisions/{decisionId}/retract`；`{shareId,decisionId}` | `{success:true}` |
| 投票 | `POST /api/v1/shares/{shareId}/feedback/votes`；`{shareId,reviewId,featureId,workId,expectedVersion}` | `{success:true}` |
| 标记写回 | `POST /api/v1/shares/{shareId}/feedback/applied`；`{decisionIds,ref?,expectedVersion?}` | `{applied:[…]}` |

`expectedVersion` 在服务端与发布更新协调的事务／锁范围内检查。旧页面看到 v3、期间发布 v4 后再评论/确认时返回 409，不会误记为 v4。CLI 对所有评论、投票和决定强制传它；`--applied` 可显式传。409 后先读取当前版本与反馈，不自动重放非幂等写入。

对应 CLI：

```sh
joplo feedback comment --share <id> --review-id <review-link-id> --version 3 --work invite.a-modal --scenario invite.a-modal.success --position 2 --step-id <step-id> --body '需要补充恢复说明'
joplo feedback resolve <comment-id> --share <id> [--reopen]
joplo feedback decide --share <id> --kind pick --feature invite --work invite.a-modal --target invite.a-modal --expected-version 3
joplo feedback retract <decision-id> --share <id>
joplo feedback vote --share <id> --review-id <review-link-id> --feature invite --work invite.a-modal --expected-version 3
```

## 分享管理 scope

- `GET /api/v1/shares` 与 `GET /api/v1/shares/{shareId}`：`shares:read`。
- `DELETE /api/v1/shares/{shareId}`：`shares:write`，返回 `{success:true}`。CLI 非交互删除必须显式 `--yes`。

## 验收覆盖与剩余联调

CLI fixture 已覆盖：解决后补收评论、applied 后补收确认、撤回不确认、多页排空、同实体变化合并、显式游标恢复、多页网络失败重读、旧快照降级，以及各写路由的请求体和版本字段。

Cloud 侧仍应由其工作区验证：旧页面确认 409、两次轮询间提交并解决、确认并 applied、撤回、多方案/版本、超过 1000 条与同时间戳并发写入、owner/API Key 权限，以及生产路由部署后的真实联调。CLI 的测试不能替代这些 Cloud 验收。
