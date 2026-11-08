# 自设计项目自动发布

固定分享：[用 Joplo 设计 Joplo](https://joplo.app/s/dn1MWCcnDW/)。源项目为 `examples/joplo/`。工作流 `.github/workflows/self-design.yml` 名称为 **Self-design preview**；已有 npm tag/Release 工作流保持独立。

## 触发与发布对象

- 同仓 PR：`CI` 的 `pull_request` 运行成功后，重新核验 workflow ID、仓库、PR 打开状态及当前 head，生成独立的功能差异预览。分支 push 产生的重复 CI 不重复发布。fork、失败 CI、已关闭 PR、过时 head 均跳过。
- main：当前 head 的 push CI 成功后，更新 `JOPLO_DESIGN_SHARE_ID` 指向的同一分享。发布前、上传后每次 finalize 重试前均重新检查 main head；检查发现已被新提交替代时停止。prepare 和 publish 共享账号发布队列，但 GitHub 查询到 Cloud finalize 之间不是跨服务原子事务；若 main 在该窗口变化，后续成功 CI 会更新到新版。
- Actions 的手动入口只恢复当前 main；仍要求最新对应 CI 已成功，不绕过验证。
- `workflow_run` 文件必须先存在于默认分支才能激活。首次引入统一目录的 PR 没有可比较的旧目录，不能伪造空基线；合入后，后续 PR 才能比较统一项目。

## 四个隔离任务

1. `metadata`：使用 GitHub API 和 git 对象生成不含凭证的计划。读取真实 merge-base，并确认项目存在。
2. `prepare`（仅 PR）：可信 CLI 向 Cloud 固定比较起点，保存独立 receipt。返回的 base 才是构建依据，不能用新 merge-base 替换。
3. `build`：无 Joplo 凭证的全新 runner 执行项目作者模块。main 构建单版；PR 使用同一工具版本构建固定 base 和当前 head，再产出 diff 静态站。
4. `publish`：全新 runner 只 checkout 可信工具源码，将按 ID 下载的静态产物与原始 receipt 放在 `RUNNER_TEMP` 独立目录。重新验证 CI/head 后发布，不运行产物 JS，也不导入 PR 作者模块。

Cloud 的发布写入按账号加锁，不只按 PR/Share 加锁。`prepare` 与 `publish` 因此使用同一 concurrency group，设置 `queue: max` / `cancel-in-progress: false`；metadata 和无凭证 build 仍可并行。GitHub 队列保留至多 100 个等待任务，避免默认单个 pending 被后来的任务替换；每个任务出队后仍重新核验 CI/head。group 只隔离本仓库的任务，其他仓库或手工用同一账号发布仍可能产生 CONFLICT，须按错误恢复而非盲目重试。队列语法见 [GitHub 官方说明](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)。

新 diff CLI 尚未随 npm 发行，因此各任务统一固定到 `github.workflow_sha` 的仓库 CLI，使用绝对工具路径。不得用 PR 自带脚本、缓存或 `npx latest` 替换可信工具。

主站发布器 `scripts/ci/publish-self-design.ts` 复用 CloudClient、manifest 和 uploadPreparedFiles，只接受公开静态产物；Core 负责校验公开 IR。拒绝 dev/review IR、私有附件、不支持的路径、符号链接与上传中被修改的内容。固定分享更新要求 Pro；不能静默降级为创建新链接。

## 维护配置

| 项目 | 位置与要求 |
| --- | --- |
| `JOPLO_API_KEY` | GitHub environment `joplo-design-publisher` 的 Secret；Cloud Key 只需 `shares:publish`。仅 prepare/publish 的实际调用步骤获得该值 |
| 环境分支策略 | 只允许 `main`，不允许 tag；不得移到 PR 可读取的仓库级 Secret |
| `JOPLO_DESIGN_SHARE_ID` | 仓库 Actions variable；用 CI Key 所属账号首次创建固定分享后写入，不能由并发工作流抢建 |
| `JOPLO_CLOUD_URL` | 可选 variable，默认 `https://cloud.joplo.app` |
| GitHub App | 必须安装、关联并授权访问 `Joplo-app/Joplo`，负责 PR 评论更新及关闭后过期 |

当前专用 Key 创建于 2026-11-08，有效期 90 天。到期前在 Cloud 生成相同最小权限 Key，替换上述 environment Secret 后运行一次手动 main 发布验证；撤销旧 Key。不要把任何 Key、设备会话或一次性生成值写入源码、日志或文档。

首次建链时必须核对账号：本机设备登录和浏览器生成的 API Key 可能属于不同账号，即使两者都是 Pro 也不能跨账号覆盖分享。应使用专用发布 Key 创建固定链接，再写入 variable；不能仅凭设备会话的 whoami 推断 Key 的所有者。

## 查看结果与恢复

main 发布步骤输出固定 URL、版本与 head，并写入 Actions Summary。PR 发布输出独立 URL；Joplo App 在 PR 中维护一条评论。没有功能变化也会生成明确的无变化结果。

- `metadata` 跳过：查看 Summary 中的原因，确认 PR/CI/head/基线；过时运行无需重试。
- 基线没有统一目录：更新分支后再运行；若 Cloud 已固定到不适用的旧起点，先处理该比较的起点状态，不能本地换成空项目。
- `AUTH_REQUIRED` / `AUTH_EXPIRED`：检查 Key 是否过期、环境策略是否 main、Key 是否只有正确账号的发布权限。
- `PR_APP_MISSING`：检查 App 安装及 Cloud 关联；`PR_CLOSED` 停止发布。
- `PR_STALE_HEAD` / `PR_STALE_GENERATION`：以最新 head 重新 prepare、build、publish，不能只重发旧静态包。
- 上传失败：修复原因后重跑完整工作流。main 可用手动入口；PR 重新运行对应成功 CI，触发新的可信流水线。
- `pr.comment=failed` 表示分享已发布但评论失败；检查 Cloud 重试状态，不能声称整个 PR 集成已成功。

本地验证覆盖事件筛选、真实 HTTP 上传、固定链接、旧 head、finalize 重试、私有数据与文件边界。激活后还需验证真实 main 更新、PR 评论及关闭过期；运行证据见 [VERIFICATION.md](VERIFICATION.md)。
