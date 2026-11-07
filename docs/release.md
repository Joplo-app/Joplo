# npm 发布流程

六个包统一版本、按依赖顺序发布：

| 包 | 内容 |
| --- | --- |
| `@joplo-app/kit` | 创作 API、组件标记与 JSX 运行时 |
| `@joplo-app/core` | 编译、校验与播放器 |
| `@joplo-app/web` | 预构建看板、发布站、字体与 OFL 许可证 |
| `@joplo-app/server` | 本地看板、构建、截图与导出 |
| `@joplo-app/cli` | 命令实现 |
| `joplo` | Node 版本检查与命令转发入口 |

源码入口用于工作区开发；打包时 publishConfig 指向 dist，内部 workspace 依赖转成相同精确版本。项目许可证为 [Apache-2.0](../LICENSE)，字体使用 [SIL OFL 1.1](../packages/web/src/fonts/OFL.txt)。

## 标准步骤（自动发布）

在 main 上准备要发布的代码，改版本、更新 CHANGELOG，推送 main 即可，发布由 GitHub Actions 完成：

```sh
pnpm install --frozen-lockfile
pnpm release:version 0.1.3          # 改六个包的版本，并重新生成 skills/
pnpm install --lockfile-only
pnpm typecheck && pnpm test         # 本地先过一遍，CI 会再跑
# 在 CHANGELOG.md 顶部写 ## 0.1.3 一节（会成为 GitHub Release 的说明）
git add packages/*/package.json pnpm-lock.yaml skills CHANGELOG.md
git commit -m "release: 0.1.3"
git push origin main                # 触发 .github/workflows/release.yml
```

[release.yml](../.github/workflows/release.yml) 在 main 上 `packages/joplo/package.json` 变化且还没有 `v<版本>` tag 时运行：typecheck → test → `release:smoke` → `release:publish`（正式版 `--tag latest`，带 `-` 的预发布版 `--tag beta`，最后自动 verify）→ verify 通过后才打 `v<版本>` tag 并推送，再用 CHANGELOG 里对应一节创建 GitHub Release。已有 tag 的版本直接跳过，所以普通提交不会重复发布。

- 中途失败（网络、registry 延迟、smoke 不过）：修好后在 Actions 页面 Re-run，或 `gh workflow run release.yml --ref main`；已发布的包会跳过，只补发缺的，不必为重试改版本号。
- tag 仍然只在 verify 通过之后才出现，保持“tag 指向的版本一定装得上”。
- 每次推送分支还会跑 [ci.yml](../.github/workflows/ci.yml)（typecheck + test）。

### 一次性配置：npm Trusted Publishing

CI 不存 npm token，用 GitHub OIDC 向 npm 证明身份（[npm 文档](https://docs.npmjs.com/trusted-publishers)），无需 OTP，发布的包自动带 provenance。需要 npm CLI ≥ 11.5.1（workflow 会先升级 npm）。由有发布权限的维护者在自己的终端登录后，给六个包各配一次：

```sh
npm login
for p in @joplo-app/kit @joplo-app/core @joplo-app/web @joplo-app/server @joplo-app/cli joplo; do
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
git tag v0.1.3                      # 只在上一步以 0 退出（verify 通过）之后
git push origin v0.1.3
```

顺序不能乱：

1. `pnpm release:version <v>`：改六个包的版本，并重新生成 `skills/*/SKILL.md`（带新版本标记）。
2. 跑完检查后，把 `packages/*/package.json`、`pnpm-lock.yaml`、`skills/` 一起提交，推送 main。注意：推送 main 会触发自动发布；要手动发布时，先在 Actions 里禁用 Release workflow，或者等它失败后再手动处理。
3. `pnpm release:publish --tag <标签>`：先一次性构建并打包全部包（与 `release:pack` 相同，含全部 tarball 检查），再按依赖顺序发布打好的 tarball（可续跑，见下），最后自动运行 `release:verify`，整体退出码就是 verify 的结果。
4. 第 3 步失败（中途某个包没发出去，或 verify 不通过）：按提示处理后重跑同一条命令，已发布的包会跳过。也可以单独运行 `pnpm release:verify` 复查。
5. 第 3 步以 0 退出后，才在发布提交上打 `v<v>` tag 并推送：`git tag v<v> && git push origin v<v>`（脚本最后一行会打印这条命令）。用户用 `npx skills add https://github.com/Joplo-app/Joplo/tree/v<v>` 固定官方技能版本，装到的内容与该版本 `npx joplo skill install` 写出的一致。注意 `npx skills add Joplo-app/Joplo@v<v>` 不能用：skills CLI 把 `@` 后面当成技能名，报 No matching skills found（2026-11-06 实测）。tag 要等 verify 通过再推，避免指向一个装不上的版本。

`release:version` 会同时重新生成仓库根目录的官方 Agent 技能 `skills/*/SKILL.md`（带版本标记，D64），要和版本号一起提交；`scripts/test/skills.test.ts` 会在不一致时失败（单独重新生成：`pnpm skills:build`）。

版本必须符合 x.y.z 或 x.y.z-tag。`--tag latest` 用于正式版；脚本默认 tag 为 beta，需要预览版时显式选择对应标签（自动发布按版本号自动选择）。

## 构建、打包与冒烟

- `pnpm release:pack`：按依赖顺序构建，清空并重建 release/，逐包打 tarball，检查版本、内部依赖、导出入口、源码泄漏与字体许可证；`@joplo-app/web` tarball 超过 6,000,000 字节（6 MB）立即失败，并列出解包后最大的 5 个目录。
- `pnpm release:smoke`：包含 pack，再在仓库外的临时目录只用 tarball 安装并运行 init、check、skill、build、dev、selection；验证版本锁定、热更新、源码定位和无工作区路径泄漏，并检查没有导出组件时 render 以退出码 4 结束、提示 `npx joplo setup export`，且不改项目的 package.json、lockfile 与 node_modules（D66）。init 示例 build 后，dist 字体总量不得超过 1,500,000 字节（1.5 MB），总文件数不得超过 150；任一超标即失败。
- `pnpm release:smoke --keep`：保留临时目录，便于排查。冒烟安装第三方依赖需要网络或本地缓存，测试服务使用随机端口与独立 JOPLO_HOME。
- 每个包的 prepublishOnly 仍会构建该包（只在有人直接对包目录运行 `pnpm publish` 时生效）；`release:publish` 发布的是打好的 tarball，`npm publish <tarball>` 不运行生命周期脚本，不会再逐包构建。发布前仍应完成整套 smoke，不能只凭单包构建成功判断可分发。

2026-11-06 字体瘦身实测：web tarball 约 2.60 MB（原 27.22 MB），解包约 4.19 MB（原 29.06 MB）；init 示例发布站字体 1,068,596 字节、120 个文件。预算保留少量内容增长空间；新增语言或字体时仍须通过上述检查。

实现以 [release.mjs](../scripts/release.mjs) 为准；根 [package.json](../package.json) 定义上述脚本。

## 可续跑发布

0.2.4 漏发了 core、0.2.6 漏发了 web：以前每个包 publish 前各自运行 prepublishOnly 构建，web 构建最慢，排在中间的包常在用户输入 OTP 之后失败。现在 `pnpm release:publish --tag latest` 分三步：

1. 一次性构建并打包全部包到 `release/`（构建或任何 tarball 检查失败时一个包都不发）。
2. 按依赖顺序（kit → core → web → server → cli → joplo）逐个处理：先直接查询 registry（绕过本地缓存），已有这个版本就跳过；否则 `npm publish release/<包>.tgz --access public --tag <标签>`。任何一个包失败（包括查询 registry 失败）立刻停止，不再发后面的包，列出本次已发布、registry 上原本就有、还没发布的包，以非 0 退出。
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

1. 对六个包逐个运行 `npm view <名字>@<版本> version --prefer-online`；registry 有几十秒延迟，每个包最多试 7 次、间隔 10 秒。
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
