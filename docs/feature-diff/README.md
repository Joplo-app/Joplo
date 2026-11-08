# 功能差异与本地联调

本功能比较两个版本的 **Joplo 公开演示**，不证明真实产品已经实现，不做像素回归。Cloud transport 使用 CONTRACT v1：prepare 返回固定基线与 generation，之后创建新 Share、上传内容寻址文件、finalize。业务 manifest 和 identity 元数据由 Core 定义，Cloud 不复制业务 schema。

## 可复制命令

```sh
pnpm joplo build ./before-project --out ./before-site
pnpm joplo build ./after-project --out ./after-site
pnpm joplo diff ./before-site ./after-site --out ./diff-site
```

两版源码都应由同一个固定、支持 diff 的 CLI 重建（CI 使用工具目录的绝对 CLI 入口，不解析 checkout 里的旧 CLI）。新构建带 `joplo-feature-diff-player=1` 能力标记，确保初始状态不被封面遮挡；缺少标记的旧静态播放器明确显示不兼容并要求重建。两个输入必须是真实 `publish` 构建，不接受 review/dev、缺失基线或作者项目目录。输出目录必须不存在；不会清空输入或其他目录。可通过 `--base-sha` / `--head-sha` 写入规范化 40 位提交 SHA，PR 发布必须提供且与 prepare 一致。打开 `diff-site/index.html` 查看真实播放器；本地 HTTP 服务应为字体返回 `Access-Control-Allow-Origin: *`，Joplo Cloud 已这样处理字体。

```sh
# 有凭证的可信任务：只获取 PR 元数据，不执行 PR 代码。
joplo diff prepare --repo example/demo --pr 123 \
  --base-sha "$CANDIDATE_BASE_SHA" --sha "$PR_HEAD_SHA" --out comparison.json

# 新的无发布凭证 runner：按 receipt 中的 base/head checkout 并构建。
joplo diff before-site after-site --out diff-site \
  --base-sha "$PINNED_BASE_SHA" --head-sha "$PR_HEAD_SHA"

# 再一个新的可信 runner：固定版本 CLI，仅读取下载的产物。
joplo diff publish diff-site --prepared comparison.json \
  --repo example/demo --pr 123 --sha "$PR_HEAD_SHA" --format json
```

上述 SHA 从 Git 和 `comparison.json` 取得，不要复制示例占位 SHA。首次 candidate 用 `git merge-base`，后续必须以 prepare 返回的固定 base 构建。基线不可获取时失败；不替换为空项目。每次 prepare 都递增 generation，不能在构建完成后再 prepare 然后复用旧 receipt。

[CI 示例](ci.example.yml) 使用默认分支的可信 `workflow_run` 工作流，读取 GitHub API 的真实 PR 元数据并跳过 fork、关闭或旧 head；`JOPLO_API_KEY` 放在只允许可信默认分支的 `joplo-publisher` environment 中。它分开 prepare、无凭证构建和可信发布 runner；不使用 `pull_request_target` 执行 PR 脚本，也不把仓库级发布凭证暴露给可被 PR 修改的工作流。此触发模式与权限边界依据 [GitHub workflow_run 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)。Fork PR 明确跳过。启用前在可信仓库变量设置支持本功能的固定 CLI 版本；本分支没有发布新版本，联调用本地 pack，不使用 `latest`。

## 业务文件

- `feature-diff.json`：`FeatureDiffManifest`（Core 导出 Zod schema），`formatVersion: 1`、`kind: joplo-feature-diff`、base/head 的 SHA、status/reasons、summary、按功能归属的 scenarios。
- summary 的 added/modified/removed 与上传 comparison.summary 完全一致，每组最多 100 项，每项最多 200 字符。uncertain 放在 modified 摘要，manifest 内仍明确区分。
- scenarios 的 before/after 引用实际场景 ID 或 null。steps 的 before/after 引用实际步骤 ID、1-based 播放位置、可选 key 或 null；match 为 key/content/action/none/uncertain。序号 id 永远不作跨版本身份。只有一版补充 key 时仍允许唯一内容／动作匹配，并标为 content/action；双方已有不同 key 时不配对，重复候选仍 uncertain。
- `before/`、`after/`：真实静态发布播放器与资产。根 `index.html` 是独立差异 viewer；修改双栏、新增新版全宽、删除旧版全宽。
- 初始状态、实际可能使用的画面树、层级、角色、主题变更保守标记受影响场景。未变化步骤仍参与完整状态重建；双方确认场景和步骤后才继续自动播放。内嵌播放器独立切换场景或移动步骤会停止比较播放并使旧确认失效；点击重新对齐后，两侧都须重新回报目标场景及步骤，不能使用旧缓存或单侧回执提前宣布对齐。对齐成功后需手动点击播放变化，迟到回执不会自动恢复播放。身份重复时分别显示，不猜测配对。
- `unchanged` 是成功且没有变化；`uncertain` 需要人工确认；`incompatible` 为本地诊断 viewer，不复制不能验证的版本载荷，禁止发布。没有可播放场景但项目表现改变也与无变化区分。

## 旧 Reader 兼容

作者可用 `.system('Send', ...).key('send-invitation')` 等给前一步命名。Core 内存 Step 有 key，但 `publishPayload` 不把 key 写进 `joplo-ir.project`。旧 `scenario#序号` ID 不变。

独立 `<script type="application/json" id="joplo-step-keys">` 保存：

```json
{"formatVersion":1,"scenarios":{"invite.main.send":{"invite.main.send#2":"send-invitation"}}}
```

Core 的 `StepIdentity` / `applyStepIdentity` 校验格式、每个真实场景/步骤引用、重复 key 和冲突，读取时仅在内存补回 key。旧 Reader 继续严格解析普通 Project，无需忽略未知业务字段。新增 pinned `@joplo-app/core@0.2.10` 测试依赖验证严格 schema；它只用于测试，不随运行时分发。

根 diff HTML 没有 `joplo-ir`，不能当单个 Project。**本分支交付 HTML viewer 和直接 JSON manifest。Cloud 配套分支已实际验证路由：根 HTML 为 200，根 Markdown/JSON 协商为 422 IR_UNAVAILABLE；before/after Markdown/JSON 为 200，仅提供各自单版公开资源；过期后均为 410。** 这不等于支持完整跨版本 Agent diff 模型，也不代表生产 Cloud 已部署该分支；依赖前应核对部署版本。没有新增 Cloud wire 字段或擅自要求部署旧 Reader 升级。

## 错误与恢复

客户端按 C1 的 ORPC code/HTTP 保留以下错误，输出可信本地恢复提示，不回显任意远端 message：

| code | HTTP | 恢复 |
| --- | --- | --- |
| PR_APP_MISSING | 409 | 配置／安装／关联具有仓库权限的 App，再 prepare |
| PR_CLOSED | 409 | 停止本次发布 |
| PR_STALE_HEAD | 409 | 重新 prepare，按最新 head 与固定 base 构建 |
| PR_STALE_GENERATION | 409 | 更新 prepare 已发生；重新 prepare 和构建 |
| PR_MISMATCH | 400 | 修正 repo、PR、base、head 与 receipt 的对应关系 |
| PR_UNAVAILABLE | 503 | 稍后重试，不退化为未验证分享 |
| CONFLICT | 409 | 重试并发请求；comparison Share 永远新建，不原地替换 |

需要 `shares:publish` 的 API key。AUTH_REQUIRED/AUTH_EXPIRED 退出 3，用法错误退出 2，其他失败退出 1。CLI `--format json` 的 diff 成功输出为对应结果对象，失败沿用 `{ok:false,error:{code,message},diagnostics}`；prepare 同时把无凭证 receipt 写入新文件。finalize 返回成功可能是历史链接，不保证仍是当前 PR 指针；`pr.comment=failed` 必须如实报告。

## 合成 fixture

```sh
pnpm exec tsx scripts/feature-diff-fixture.ts
```

实际编译合成 before/after 项目，生成 `scratch/feature-diff/bundle/`，同时更新 [manifest.fixture.json](manifest.fixture.json)。fixture 使用 `111…` / `222…` 占位 SHA，仅用于本地联调。包含插入步骤、effects 修改、纯初始状态变化、重复动作歧义、全新场景、删除场景和无变化场景，不含凭证、真实用户数据或机器路径。不能把它用来冒充真实 PR 变更。

manifest 可直接供 C1 做摘要／hash 联调；完整 bundle 才用于 public viewer 验收。发布测试使用本地 HTTP fixture；本 worker 不向真实外部服务发布或评论。
