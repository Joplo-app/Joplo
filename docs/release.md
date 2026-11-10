# npm 发布流程

十一个包统一版本、按依赖顺序发布：

| 包 | 内容 |
| --- | --- |
| `@joplo-app/kit` | 创作 API、组件标记与 JSX 运行时 |
| `@joplo-app/plugin-diagram` | 图表、状态机、时序图的编译与运行时、技能及声明 |
| `@joplo-app/plugin-alda` | 可选配乐插件、本机 MIDI 编译、离线合成及技能 |
| `@joplo-app/plugin-3d` | 3D 场景与 GLB、可选 Tripo 本机生成、费用确认及任务恢复技能 |
| `@joplo-app/plugin-content` | 默认讲解内容插件、设计画布、取景、FLIP、studio 主题与技能 |
| `@joplo-app/plugin-ui` | 默认 UI 与 HTML 词汇、绘制及组件指南 |
| `@joplo-app/core` | 编译、校验与播放器 |
| `@joplo-app/web` | 预构建看板、发布站、字体与 OFL 许可证 |
| `@joplo-app/server` | 本地看板、构建、截图与导出 |
| `@joplo-app/cli` | 命令实现 |
| `joplo` | Node 版本检查与命令转发入口 |

默认模板不安装 3D 插件，项目按需显式安装并启用。十一份公开 tarball（含 `@joplo-app/plugin-3d`）统一为 0.3.0；上表顺序与 `scripts/release.mjs` 的 `PACKAGES` 一致。

`release:version` 同步插件的轻量 `src/version.json`，运行时只读取版本，避免把整个开发 manifest 带进浏览器。

源码入口用于工作区开发；打包时 publishConfig 指向 dist，内部 workspace 依赖转成相同精确版本。项目许可证为 [PolyForm Shield 1.0.0](../LICENSE)（可免费商用，禁止做竞品，见 [COMMERCIAL.md](../COMMERCIAL.md)，D81；每个包都带一份与根目录相同的 LICENSE），字体使用 [SIL OFL 1.1](../packages/web/src/fonts/OFL.txt)。

## 标准步骤：推 tag 发布

平时推送 main 只跑 CI，不发布。想发版时升版本、推 main，再推一个 `v<版本>` tag，发布和 GitHub Release 都由 GitHub Actions 完成：

```sh
git switch main && git pull
pnpm install --frozen-lockfile
pnpm release:version 0.3.0         # 改十一个包的版本，并重新生成 skills/（默认升 patch，破坏性变更升 minor）
pnpm install --lockfile-only
pnpm typecheck && pnpm test         # 本地先过一遍，CI 会再跑
git add packages/*/package.json plugins/*/package.json plugins/*/src/version.json packages/core/src/guide.ts pnpm-lock.yaml skills CHANGELOG.md
git status --short                  # 应该是空的：release:version 改过的文件都要进这一个提交
git commit -m "release: 0.3.0"
git push origin main
git tag v0.3.0 && git push origin v0.3.0   # 触发 .github/workflows/release.yml
```

[release.yml](../.github/workflows/release.yml) 收到 `v*` tag 后：

1. 检查 tag 与十一个包的版本一致（不一致直接失败，提示先 `pnpm release:version`），且 tag 指向的提交在 main 上；
2. typecheck → test → `release:smoke`；
3. `release:publish`（正式版 `--tag latest`，带 `-` 的预发布版 `--tag beta`），最后自动 verify；
4. 用 `node scripts/commits.mjs notes <tag>` 生成说明并创建 GitHub Release（预发布版标为 Pre-release）：上一个 `v*` tag 以来的提交按“破坏性变更 / 新功能 / 修复 / 性能”分组，去掉前缀、带短哈希，末尾附 compare 链接。其他类型（docs、test、ci……）不进说明。CHANGELOG.md 里如果有 `## <版本>` 一节，会放在最前面作为概要；不写也行。

- 中途失败（网络、registry 延迟、smoke 不过）：修好后在这次运行上 Re-run，或 `gh workflow run release.yml --ref v0.3.0`；已发布的包会跳过，Release 已存在时只更新说明，不必为重试改版本号。
- 修复要改代码时：tag 已经指向旧提交。改完推 main 后，`git tag -f v0.3.0 && git push -f origin v0.3.0` 移到新提交（npm 上还没有这个版本时才这样做；已经发出去的版本只能升一个新版本号）。
- 本地预览说明：`node scripts/commits.mjs notes v0.3.0`（tag 要先在本地打好）。
- 每次推送分支还会跑 [ci.yml](../.github/workflows/ci.yml)（typecheck + test + release:smoke + 提交前缀检查），发布脚本在 Linux 上的问题在发版之前就能发现。

### 提交信息约定

发布说明靠提交标题的前缀分组，所以提交标题要以类型开头：`<类型>(<可选范围>): <说明>`，例如 `feat: 新增 joplo outline`、`fix(web): 修复发布站跳转`。说明用中文、写给用户看。

| 类型 | 进入发布说明 | 用途 |
| --- | --- | --- |
| `feat` | 新功能 | 用户能感知的新能力 |
| `fix` | 修复 | 用户能感知的问题修复 |
| `perf` | 性能 | 性能改进 |
| 类型后加 `!`，或正文含 `BREAKING CHANGE: …` | 破坏性变更（单列在最前） | 需要用户改项目或命令的变更；0.x 阶段这一版升 minor |
| `refactor` `docs` `test` `chore` `ci` `build` `style` `revert` `release` | 不进入 | 内部改动 |

合并提交和 git 生成的 `Revert "…"` 不要求前缀。CI 的 commits 任务会检查：PR 里的提交和 PR 标题（squash 合并时它会成为 main 上的提交标题）不合规就失败；直接推送只给警告。实现见 [commits.mjs](../scripts/commits.mjs)，测试见 scripts/test/commits.test.ts。

### 一次性配置：npm Trusted Publishing

CI 不存 npm token，用 GitHub OIDC 向 npm 证明身份（[npm 文档](https://docs.npmjs.com/trusted-publishers)），无需 OTP，发布的包自动带 provenance。需要 npm CLI ≥ 11.5.1（workflow 会先升级 npm）。由有发布权限的维护者在自己的终端登录后，给十一个包各配一次：

```sh
npm login
for p in @joplo-app/kit @joplo-app/plugin-diagram @joplo-app/plugin-alda @joplo-app/plugin-3d @joplo-app/plugin-content @joplo-app/plugin-ui @joplo-app/core @joplo-app/web @joplo-app/server @joplo-app/cli joplo; do
  npm trust github "$p" --repo Joplo-app/Joplo --file release.yml --allow-publish -y
done
npm trust list joplo                # 确认配置
```

也可以在 npmjs.com 每个包的 Settings → Trusted Publisher 里手动填：Organization `Joplo-app`、Repository `Joplo`、Workflow filename `release.yml`、Environment 留空。workflow 文件改名后要同步改这里。确认 CI 发布成功后，可以把各包的 Publishing access 改为“Require two-factor authentication and disallow tokens”，只留 Trusted Publishing 一条发布通道。

## 本地手动发布（备用）

npm 或 GitHub Actions 不可用时，由有 npm 发布权限的维护者在自己的终端执行（需要 2FA 时现场输入 OTP）：

```sh
pnpm release:smoke
pnpm release:publish --tag latest   # 先构建打包全部，再逐个发布 tarball，最后自动运行 release:verify
git tag v0.3.0                      # 只在上一步以 0 退出（verify 通过）之后
git push origin v0.3.0
```

顺序不能乱：

1. `pnpm release:version <v>`：改十一个包的版本，并重新生成 `skills/*/SKILL.md`（带新版本标记）。
2. 跑完检查后，把 `packages/*/package.json`、`plugins/*/package.json`、`plugins/*/src/version.json`、`packages/core/src/guide.ts`（里面写着插件的安装版本）、`pnpm-lock.yaml` 和 `skills/` 一起提交，推送 main。推送 main 不会触发发布。
3. `pnpm release:publish --tag <标签>`：先一次性构建并打包全部包（与 `release:pack` 相同，含全部 tarball 检查），再按依赖顺序发布打好的 tarball（可续跑，见下），最后自动运行 `release:verify`，整体退出码就是 verify 的结果。
4. 第 3 步失败（中途某个包没发出去，或 verify 不通过）：按提示处理后重跑同一条命令，已发布的包会跳过。也可以单独运行 `pnpm release:verify` 复查。
5. 第 3 步以 0 退出后，在发布提交上打 `v<v>` tag 并推送：`git tag v<v> && git push origin v<v>`。tag 会触发 release.yml：重跑检查，发布步骤因为十一个包都已存在而跳过，然后生成 GitHub Release。用户用 `npx skills add https://github.com/Joplo-app/Joplo/tree/v<v>` 固定官方技能版本，装到的内容与该版本 `npx joplo skill install` 写出的一致。注意 `npx skills add Joplo-app/Joplo@v<v>` 不能用：skills CLI 把 `@` 后面当成技能名，报 No matching skills found（2026-11-06 实测）。手动发布时 tag 要等 verify 通过再推，避免指向一个装不上的版本。

`release:version` 会同时重新生成仓库根目录的官方 Agent 技能 `skills/*/SKILL.md`（带版本标记，D64），要和版本号一起提交；`scripts/test/skills.test.ts` 会在不一致时失败（单独重新生成：`pnpm skills:build`）。

版本必须符合 x.y.z 或 x.y.z-tag。`--tag latest` 用于正式版；脚本默认 tag 为 beta，需要预览版时显式选择对应标签（自动发布按版本号自动选择）。

## 构建、打包与冒烟

- `pnpm release:pack`：按依赖顺序构建，清空并重建 release/，逐包打 tarball，检查版本、内部依赖、导出入口、源码泄漏与字体许可证；`@joplo-app/web` tarball 超过 6,000,000 字节（6 MB）立即失败，并列出解包后最大的 5 个目录。
- `pnpm release:smoke`：包含 pack，再在仓库外的临时目录只用 tarball 安装并运行 init、check、skill（含 review）、build、dev、feedback、selection；实际提交本地反馈并确认，验证反馈先输出、确认后退出 0、`--after` 补收及随包技能一致性。另验证版本锁定、热更新、源码定位和无工作区路径泄漏，并检查没有导出组件时 render 以退出码 4 结束、提示 `npx joplo setup export`，且不改项目的 package.json、lockfile 与 node_modules（D66）。init 示例 build 后，dist 字体总量不得超过 1,500,000 字节（1.5 MB），总文件数不得超过 150；任一超标即失败。
- `pnpm release:smoke --keep`：保留临时目录，便于排查。冒烟安装第三方依赖需要网络或本地缓存，测试服务使用随机端口与独立 JOPLO_HOME。
- 每个包的 prepublishOnly 仍会构建该包（只在有人直接对包目录运行 `pnpm publish` 时生效）；`release:publish` 发布的是打好的 tarball，`npm publish <tarball>` 不运行生命周期脚本，不会再逐包构建。发布前仍应完成整套 smoke，不能只凭单包构建成功判断可分发。

2026-11-06 字体瘦身实测：web tarball 约 2.60 MB（原 27.22 MB），解包约 4.19 MB（原 29.06 MB）；init 示例发布站字体 1,068,596 字节、120 个文件。预算保留少量内容增长空间；新增语言或字体时仍须通过上述检查。

实现以 [release.mjs](../scripts/release.mjs) 为准；根 [package.json](../package.json) 定义上述脚本。

## 可续跑发布

0.2.4 漏发了 core、0.2.6 漏发了 web：以前每个包 publish 前各自运行 prepublishOnly 构建，web 构建最慢，排在中间的包常在用户输入 OTP 之后失败。现在 `pnpm release:publish --tag latest` 分三步：

1. 一次性构建并打包全部包到 `release/`（构建或任何 tarball 检查失败时一个包都不发）。
2. 按依赖顺序（kit → plugin-diagram → plugin-alda → plugin-3d → plugin-content → plugin-ui → core → web → server → cli → joplo）逐个处理：先直接查询 registry（绕过本地缓存），已有这个版本就跳过；否则 `npm publish release/<包>.tgz --access public --tag <标签>`。任何一个包失败（包括查询 registry 失败）立刻停止，不再发后面的包，列出本次已发布、registry 上原本就有、还没发布的包，以非 0 退出。
3. 全部处理完后运行 `release:verify`，用它的结果作为整体退出码；通过时最后一行打印打 tag 的命令。

中途失败后，处理登录、网络或 2FA 问题，再重跑同一条命令即可；已存在的版本会跳过，不必重发，也不必仅为重试增加版本号。实现见 [release.mjs](../scripts/release.mjs) 的 `publishRelease`，测试用替身注入打包、registry、npm publish 与 verify（scripts/test/release.test.ts）。

跳过已有版本不会修改其 dist-tag；发布到其他标签的既有版本若需转为 latest，应单独维护标签。

首次发布新包时，npm 的暂存发布机制可能生成 `0.0.0-stage` 占位版本。这是正常现象，目标仍是各包 package.json 中的统一版本；不要把占位版本当成正式版本。

## 发布之后必跑：release:verify

0.2.4 发布时 `pnpm -r publish` 中途失败，`@joplo-app/core` 漏发、其余 5 个包发上去了；`joplo` 精确依赖同版本的 `@joplo-app/cli`，cli 又精确依赖 core，于是所有人的 `npx joplo` 都装不上，直到补发。所以 publish 最后会自动运行它；也可以单独运行：

```sh
pnpm release:verify            # 默认取各包 package.json 的统一版本
pnpm release:verify 0.2.5      # 或显式指定
```

它做两件事，任何一步失败都列出缺的包并以非 0 退出：

1. 对十一个包逐个运行 `npm view <名字>@<版本> version --prefer-online`；registry 有延迟，大包（web）发布后 npm 可能“processing”几分钟，所以每个包最多试 21 次、间隔 15 秒（约 5 分钟；0.2.9 CI 发布时 60 秒不够）。
2. 全部都在时，在系统临时目录、用全新的 npm 缓存实际运行一次 `npx -y joplo@<版本> --help`；失败时从 npm 输出（E404 / notarget）里找出缺的包。

失败时按提示重跑 `pnpm release:publish --tag <同一标签>`（已发布的包会跳过，只补发缺的），等几十秒后再运行 `pnpm release:verify`，直到通过。实现见 [release.mjs](../scripts/release.mjs) 的 `verifyRelease`，测试用替身注入 registry 与 npx（scripts/test/release.test.ts）。

## 查询 registry

刚发布后可能要等几十秒，依赖安装和查询结果才完全可见。先等待，再绕过缓存查询；不要因一次旧结果就改版本重发。可直接请求带时间戳的 registry 元数据：

```sh
curl --fail -H 'Cache-Control: no-cache' "https://registry.npmjs.org/joplo?t=$(date +%s)"
```

确认 versions 中有目标版本，并核对 dist-tags.latest；作用域包用编码后的名称查询。发布脚本自身也使用时间戳和 no-cache 请求。

## 弃用旧包

用 npm deprecate 给已发布的旧包加迁移提示；替换下例的包名、版本范围和对应新包说明：

```sh
npm deprecate '<old-package>@<range>' 'Use the corresponding @joplo-app package.'
```

这是添加弃用提示，不是删除版本。需要 2FA 时，由维护者在自己的终端执行弃用命令并完成认证。


### 独立模板与离线冒烟（D105）

[模板仓库](https://github.com/Joplo-app/joplo-templates)与主仓库隔离，由维护者手动更新默认分支；模板不参与发版，不同步版本、不打同版本 tag，发布 CI 不读写模板仓库。模板默认分支须能被最新发布的 CLI 使用，旧版本不保证。已发布的 0.6.0 及更早 CLI 仍下载主仓库原 tag，原 tag 的文件不受当前 checkout 删除影响。

`release:smoke` 用 `scripts/fixtures/smoke/feature` 与 `scripts/fixtures/smoke/standalone` 两个本地测试夹具，通过 `init --template <夹具路径>` 走初始化；它们只供测试，不作为产品起步来源。全程不下载模板仓库；在仓库外只安装 tarball，保留 check/build、读回产物确认功能情况和独立作品章节、引擎技能一致性、安装后插件技能同步与产物扫描。另从安装后的技能文件构造 ui + diagram + content 演示，check 通过后用真实 Chromium 打开 dev，再用本机静态服务器打开构建产物（除它之外不许有网络请求，D98）前进/回退验证发布站。测试驱动使用工作区 Playwright，不把它安装到用户项目；CI 先安装 Chromium，本地可用 `pnpm --filter @joplo-app/server exec playwright install chromium` 准备。下载默认分支、名称解析、占位替换、私有令牌、解压失败与路径穿越由 CLI 单元测试中的内存 tarball 覆盖。
