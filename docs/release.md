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

## 标准步骤

在 main 上准备要发布的代码。用 `pnpm release:version <v>` 统一版本，例：

```sh
pnpm install --frozen-lockfile
pnpm release:version 0.1.3
pnpm install --lockfile-only
pnpm typecheck
pnpm test
pnpm release:smoke
git add packages/*/package.json pnpm-lock.yaml
git commit -m "release: 0.1.3"
git push origin main
pnpm release:publish --tag latest
```

版本必须符合 x.y.z 或 x.y.z-tag。提交并推送 main 后，再由有 npm 发布权限的维护者在自己的终端执行发布。`--tag latest` 用于正式版；脚本默认 tag 为 beta，需要预览版时显式选择对应标签。

## 构建、打包与冒烟

- `pnpm release:pack`：按依赖顺序构建，清空并重建 release/，逐包打 tarball，检查版本、内部依赖、导出入口、源码泄漏与字体许可证。
- `pnpm release:smoke`：包含 pack，再在仓库外的临时目录只用 tarball 安装并运行 init、check、skill、build、dev、selection；验证版本锁定、热更新、源码定位和无工作区路径泄漏，并检查缺少可选 Playwright 时 render 的提示。
- `pnpm release:smoke --keep`：保留临时目录，便于排查。冒烟安装第三方依赖需要网络或本地缓存，测试服务使用随机端口与独立 JOPLO_HOME。
- 每个包的 prepublishOnly 会构建该包；发布前仍应完成整套 smoke，不能只凭单包构建成功判断可分发。

实现以 [release.mjs](../scripts/release.mjs) 为准；根 [package.json](../package.json) 定义上述脚本。

## 可续跑发布

`pnpm release:publish --tag latest` 每次先直接查询 registry，绕过本地缓存；按依赖顺序只发布尚不存在的包版本。中途失败后，处理登录、网络或 2FA 问题，再重跑同一条命令即可；已存在的版本会跳过，不必重发，也不必仅为重试增加版本号。

跳过已有版本不会修改其 dist-tag；发布到其他标签的既有版本若需转为 latest，应单独维护标签。

首次发布新包时，npm 的暂存发布机制可能生成 `0.0.0-stage` 占位版本。这是正常现象，目标仍是各包 package.json 中的统一版本；不要把占位版本当成正式版本。

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

这是添加弃用提示，不是删除版本。需要 2FA 时，由维护者在自己的终端执行发布或弃用命令并完成认证。
