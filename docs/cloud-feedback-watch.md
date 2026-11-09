# 本地与 Share 评审：轮询兼容性及 Cloud 改动需求

状态：CLI 已实现统一监听入口，Cloud 当前按快照兼容轮询。本文是服务端改动清单，不表示这些接口已经上线。

核对依据：2026-11-07，本机 `joplo-cloud` 工作副本，HEAD `2d379826` 的评审相关源码；不是对线上部署版本的核验。本次没有修改 Cloud 仓库或线上数据。

## 已实现的客户端行为

```sh
joplo feedback watch ./demo --local --follow --json
joplo feedback watch ./demo --local --session <id> --json
joplo feedback watch --share Abc1234567 --work invite.a-modal --interval 15 --json
```

本地仍直接观察持久文件，Share 使用普通 GET 轮询。首次立即请求，成功后默认等待 15 秒；可选 10–30 整数秒。网络错误退避，鉴权／权限／配额错误明确结束；中断会取消在途请求和等待。本地的 `review list/watch` 作为兼容入口保留，原有云端 `feedback` 单次读取和 `--applied` 也不变。

双方统一输出 `source/eventId/sessionId/featureId/optionId/revision/createdAt/type`。Cloud 只过滤绑定版本与方案的评论，并将匹配的作者 `pick` 映射为 `approved`；其他规则／回答决定为 `decision`，不会结束监听。分享发布新版本时输出 `closed` 并退出非零，不跟随新版本。`eventId` 跨重启稳定，便于消费端去重；Cloud 没有本地文件的递增 `seq`，不假装支持 `--after`。

## 现有 Cloud 能直接复用什么

| 能力 | 代码依据（相对 Cloud 仓库根目录） | 结论 |
| --- | --- | --- |
| 带版本的反馈结果 | `packages/share-contract/review.ts` 的 `feedbackResultSchema`、`feedbackDecisionSchema`、`feedbackCommentSchema` | 已有分享版本、每条记录版本、稳定 id、时间、场景／步骤／元素 |
| 读取接口 | `packages/api/modules/reviews/procedures/v1.ts` 的 `feedback` | 普通 `GET /api/v1/shares/{shareId}/feedback` 可直接每 15 秒调用，无需 SSE、WebSocket 或新基础设施 |
| 权限 | `packages/api/modules/reviews/service.ts` 的 `ownedForCli`，`packages/api/modules/api-keys/permissions.ts` | 保持分享主人或其 API Key 的 `feedback:read`；不能因为分享链接公开就开放匿名读取 |
| 作者决定 | `packages/api/modules/reviews/service.ts` 的 `decide` / `retract` | 已有追加式决定和撤回记录，可复用选定方案语义；普通投票不能映射成确认 |
| API Key 使用时间 | `packages/api/modules/api-keys/service.ts` | `lastUsedAt` 已有 60 秒更新节流，不需要每次轮询新增写入 |

## 必须区分“可轮询”与“可可靠补收”

现有 `feedback()` 只返回未撤回、未写回的决定和未解决评论。数据库 `listComments()` 只取最新 1000 条未解决评论，没有 `cursor/hasMore`。因此当前 CLI 能去重当前快照，却无法保证所有变化都收到：

1. 第 1 次轮询后有人提交评论，随后被解决；第 2 次轮询已经看不到它。
2. 作者确认方案后，另一个 Agent 把决定标成 applied；监听 Agent 的下次轮询看不到这条确认，可能继续等待。
3. 返回超过上限的评论时，较老记录被截断，客户端无法知道是否还有遗漏。

这些问题不能靠缩短间隔或客户端去重修好。也不能把一条记录“从结果中消失”推断成已解决、已撤回或已确认，因为缺失还可能来自截断。

## Cloud 需要配合的改动

### P0：确认时校验用户实际看到的版本

当前 `packages/api/modules/reviews/types.ts` 的 `decideInput` 没有版本字段；`DecisionBoard.tsx` 发出 `{ shareId, kind, featureId, targetId, note }`，服务端 `decide()` 读取当时的 `share.version` 并写入决定。

具体风险：用户打开 v3，期间发布 v4，再在旧页面点确认；服务端可能把这次动作记录为 v4 的确认。CLI 即使正确按返回的 version 过滤，也无法还原用户当时看到的是 v3。

建议给决定请求增加 `expectedVersion`，前端传入当前展示的版本。服务端在与发布更新协调的事务／锁范围内检查版本，一旦不匹配返回 409，前端保留输入并要求查看新版。不能只在事务外读一次版本。`vote` 同样使用服务端当前版本，可一并检查，但投票仍不代表方案确认。

### P0：补充不受 applied 过滤影响的“当前确认状态”

返回指定版本、功能、方案的有效确认状态及决定 id；已写回只是处理状态，不能抹去确认事实。已撤回的确认不能生效，其他方案、其他版本的决定不能结束监听。新版本必须从未确认开始。

这个状态应与轮询记录处于同一一致性快照，避免刚读完事件、再读确认时混用另一版本。CLI 在读取完整批次后依据当前有效状态结束，而不是看到历史里曾经存在一个 pick 就结束。

### P1：可分页、可补收的普通 HTTP 读取

建议保留旧 `/feedback` 契约，新增 `/feedback/events`（名称待 Cloud 实现时确定）或显式的增量读取模式。最少包含：

- 请求：`version`、`optionId`、服务端生成的不透明 `cursor`、有上限的 `limit`。
- 响应：分享当前版本、事件／记录、`nextCursor`、`hasMore`，以及上述当前确认状态。
- 已解决评论、已 applied 决定仍能按游标读到。需要报告撤回／解决／重新打开时，为状态变更提供稳定的版本或事件标识；不能仅按原始 createdAt 轮询可变行。
- 游标排序和提交边界必须稳定，避免相同时间戳或较晚提交的旧时间记录被跳过。不能只使用时间戳或 OFFSET 宣称“不漏事件”。
- 多页数据使用有界页大小，读取完整快照后再判断确认；每个轮询请求仍是普通 JSON，不是长连接。需要完整变更历史时可加按分享排序的事件记录；仅做版本校验及当前确认状态，可以先复用现有表。
- 新路由必须在 `packages/api/modules/api-keys/permissions.ts` 登记 `feedback:read`，沿用 owner 检查、删除／撤销／账户不可用边界。无变化时 ETag/304 或轻量 revision 可后续减少响应体和查询成本。

可选响应示意（拟议，不是当前 API）：

```json
{
  "share": { "id": "Abc1234567", "version": 3 },
  "events": [],
  "nextCursor": "opaque-cursor",
  "hasMore": false,
  "approval": {
    "version": 3,
    "featureId": "invite",
    "optionId": "invite.a-modal",
    "status": "open",
    "decisionId": null
  }
}
```

## Cloud 侧验收用例

- 打开旧版本后发布新版，再确认：409，不能生成新版确认。
- 两次轮询之间提交并解决评论：仍可补读这条反馈。
- 两次轮询之间确认并 applied：仍能读取有效确认并结束监听。
- 确认后撤回，再轮询：不把撤回的历史确认当成当前结论。
- 多方案、多版本混合记录：仅目标方案和版本可结束监听。
- 超过 1000 条、同时间戳、多页间有并发写入：游标不漏读，重复记录可按稳定 id 去重。
- 新接口依然 owner-only；API Key 无 `feedback:read`、陌生分享、已删除分享不泄露记录。

轮询支持本身无需 Cloud 先升级。要达到和本地文件监听一样的可靠补收与端到端版本保护，需要上面的服务端改动；当前兼容模式已经在 CLI 启动提示和文档里说明边界。
