# 发布 Joplo 到 npm（D36）

六个包同一版本号、一起发布：

| 包 | 作用 | 发布内容 |
| --- | --- | --- |
| `joplo` | 命令入口：检查 Node ≥ 22，优先转发给项目内的 `@tokenroll/joplo-cli` | `bin/joplo.cjs`、`lib/*.cjs` |
| `@tokenroll/joplo-kit` | 创作 SDK 与 JSX 运行时（作者项目依赖它） | `dist/*.js` + `.d.ts` |
| `@tokenroll/joplo-core` | 编译、校验、播放器 | `dist/*.js` + `.d.ts` |
| `@tokenroll/joplo-server` | dev / build / render（Vite、Tailwind 是运行时依赖；Playwright 是可选 peer） | `dist/*.js` + `.d.ts` |
| `@tokenroll/joplo-cli` | 命令实现（命令名 `joplo-cli`） | `dist/*.js` + `.d.ts` |
| `@tokenroll/joplo-web` | 预构建的看板与发布站、手绘字体及其 OFL 许可证 | `dist/`（约 13 MB） |

仓库里各包的 `exports` 指向 `src/*.ts`（`pnpm joplo` 直接运行源码）；打包时 pnpm 用 `publishConfig` 覆盖为 `dist`，并把 `workspace:*` 替换成精确版本。

## 发布前需要用户决定

- **许可证**：Apache-2.0（2026-11-05 用户决定）。根目录 `LICENSE`，每个包目录里各有一份副本，随 tarball 发布。字体（Excalifont、Xiaolai）是 SIL OFL 1.1，许可证随 `@tokenroll/joplo-web` 发布在 `dist/fonts/OFL.txt`。
- **发布时机**：A3 工作假设是先完成 Mantine 词汇切换（D35），再以 `beta` 标签发布 0.1.0。执行 `release:publish` 前向用户确认。

## 步骤

```sh
pnpm install
pnpm release:version 0.1.0      # 统一修改六个包的版本（必须是 x.y.z 或 x.y.z-tag）
pnpm typecheck && pnpm test
pnpm release:smoke              # 构建 + 打包到 release/，在仓库外只用 tarball 跑通全流程
npm whoami                      # 应为有 joplo 组织发布权限的账号（D36：disdjj）
pnpm release:publish            # = pnpm -r publish --access public --tag beta
```

- `release:pack`：`pnpm -r build`（按依赖顺序：kit → core → web → server → cli）后逐包 `pnpm pack` 到 `release/`（已在 .gitignore），并检查每个 tarball：版本一致、内部依赖锁定为同一精确版本、没有 `workspace:`、exports/bin 指向的文件存在、不带源码与测试、`@tokenroll/joplo-web` 带字体许可证，最后列出文件数与体积。
- `release:smoke`：先执行 `release:pack`，然后在系统临时目录（仓库外）：
  1. 只用 tarball 安装 `joplo`（相当于 `npx joplo@<版本>`），确认 `.bin/joplo` 指向入口包；模拟 Node 20 时只打印要求并退出 1；
  2. `joplo init my-demo`：最后一行是 npm 的下一步命令，package.json 锁定精确版本；再次 init 非空目录被拒绝；
  3. 把两个依赖换成 tarball（registry 上还没有这些版本）后 `npm install`，确认六个包都是真实安装（不是链接）且没有装 Playwright；
  4. `check`（0 error、无版本提示）→ `skill`、`skill authoring`、`skill install` → `build`（内联 IR、作者 className 编译进 CSS、带字体）→ `render`（缺 Playwright：退出 1 并给出安装命令）；
  5. `dev --port <随机>`：`GET /` 返回 200 的看板 HTML（含令牌与 HMR 句柄），看板脚本、作者 className 的 CSS、IR 都可读；PUT 选中按钮，`at` 为 `features/example/options/a.tsx:行:列`；修改作者文件后 IR 重新编译、新 className 进入 CSS；然后关闭；
  6. `selection` 输出 `文件:行:列` 与源码片段；
  7. 扫描解包后的 tarball、项目 node_modules 里的 Joplo 包、发布站产物、SKILL.md 与 dev 的响应和日志：不得出现仓库绝对路径或 `workspace:` 协议。
  
  `--keep` 保留临时目录以便排查（`node scripts/release.mjs smoke --keep`）。第三方依赖（vite、tailwindcss、tsx 等）仍从 npm registry 安装，需要网络或本地缓存。
- `release:publish` 会在每个包发布前运行 `prepublishOnly`（重新构建该包），所以即使跳过 `release:pack` 也不会发布旧产物；但请总是先跑 `release:smoke`。

脚本从不调用 `npm publish`，也不修改 npm 登录状态。

## 运行时如何找到资源

- `@tokenroll/joplo-server` 在 dist 形态下通过 `@tokenroll/joplo-web/package.json` 定位 `dist/manifest.json`，看板用 `dist/app/index.html` 作 Vite root，`/assets/*` 原样返回；构建时把看板源码里的 `import.meta.hot` 改写为 `globalThis.__JOPLO_HOT__`，dev 在页面里先用 `/@vite/client` 的 `createHotContext` 创建它，IR 推送（`joplo:ir`）因此照常工作。
- 作者 className：`dist/project.css`（由 `src/index.css` 生成，`source(none)`）在运行时追加 `@source <项目目录>` 后由 Tailwind 编译；dev 里随项目文件热更新，build 里编译成 `assets/project-*.css` 并在 site.html 中引用。
- 作者的 `@tokenroll/joplo-kit` 按项目依赖解析（与 check 用的 tsx 一致）；项目没装时退回 CLI 自带的 kit。
- 在仓库里可用 `JOPLO_WEB=dist pnpm joplo dev …` 强制使用预构建资源（需先 `pnpm --filter @tokenroll/joplo-web build`）。

## 以后：GitHub Actions + provenance

暂不加 CI。需要时新增 `.github/workflows/release.yml`，在打 `v*` 标签时发布，并生成来源证明（provenance）：

```yaml
on:
  push:
    tags: ['v*']
permissions:
  contents: read
  id-token: write          # provenance 需要 OIDC 令牌
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, registry-url: 'https://registry.npmjs.org' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck && pnpm test && pnpm release:smoke
      - run: pnpm -r publish --access public --tag beta --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: 'true'
```

要点：

- provenance 要求在受支持的 CI（GitHub Actions 托管 runner）上发布，并有 `id-token: write`；本地发布无法生成。
- 也可以改用 npm 的 Trusted Publishing（在 npmjs.com 为每个包登记这个仓库与 workflow），不再需要 `NPM_TOKEN`。
- 在 package.json 中补上 `repository` 字段（provenance 会校验它与构建来源一致）。仓库地址确定后再加。
- 从 beta 转为正式：`npm dist-tag add joplo@<版本> latest`（六个包都要做）。
