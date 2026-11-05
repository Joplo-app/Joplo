# 依赖与许可证

| 包 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| zod | 4.6.7 | MIT | schema |
| tsx | 4.23.15 | MIT | 运行 TS |
| typescript | 6.0.3 | Apache-2.0 | 类型检查 |
| vitest | 5.1.0 | MIT | 测试 |
| react / react-dom | 19.3.1 | MIT | @joplo/web：界面 |
| vite | 8.3.5 | MIT | @joplo/web：构建（server 在产物缺失/过期时自动调用） |
| @vitejs/plugin-react | 6.2.1 | MIT | @joplo/web：构建 |
| tailwindcss / @tailwindcss/vite | 4.3.4 | MIT | @joplo/web：样式 |
| shadcn（CLI，未作为依赖安装） | 4.23.0 | MIT | 用 `pnpm dlx shadcn@4.23.0 add …` 生成 `packages/web/src/components/ui/*` |
| radix-ui | 1.8.1 | MIT | shadcn 组件的底层原语（Checkbox、Switch、Progress、Avatar 等） |
| class-variance-authority | 0.7.1 | Apache-2.0 | shadcn 组件变体 |
| clsx | 2.1.1 | MIT | 类名拼接 |
| tailwind-merge | 3.7.0 | MIT | 类名合并 |
| lucide-react | 1.66.0 | ISC | 图标（固定在已过 pnpm minimumReleaseAge 的版本） |
| motion | 14.9.1 | MIT | 演示动画（指针移动、弹窗、Toast） |
| roughjs | 4.6.6 | MIT | 手绘描边（种子由 node.id 哈希） |
| Excalifont（字体，woff2 子集） | 1.000（取自 @excalidraw/excalidraw 0.18.1） | OFL-1.1 | 手绘主题拉丁字体，打包在 `packages/web/src/fonts/`，许可见同目录 OFL.txt |
| Xiaolai SC 小赖字体（字体，woff2 子集） | 3.11（取自 @excalidraw/excalidraw 0.18.1） | OFL-1.1 | 手绘主题中文字体，同上 |
| playwright | 1.64.1 | Apache-2.0 | @joplo/server：renderStep 截图（chromium 修订 1248） |
| @playwright/test | 1.64.1 | Apache-2.0 | @joplo/web：浏览器测试 |
| @types/react / @types/react-dom | 19.3.0 | MIT | 类型 |
| commander | 15.0.0 | MIT | T-core：CLI 命令与参数解析 |
| @modelcontextprotocol/sdk | 1.32.2 | MIT | T-core：官方 MCP stdio server/client；协议 2025-11-25 |
| proper-lockfile | 4.1.2 | MIT | T-core：跨进程排他锁、心跳与陈旧锁恢复 |
| @types/proper-lockfile | 4.1.4 | MIT | T-core：锁库 TypeScript 类型（开发依赖） |
| fs-native-extensions | 1.5.3 | Apache-2.0 | T-core 评审修复：内核文件锁保护租约命名空间与同步提交/恢复，含平台预构建二进制 |

### T-board（v2 看板）追加

| 包 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| vite | 8.3.5 | MIT | @joplo/server 运行时依赖：startDev 单进程开发服务（看板 + ssrLoadModule 编译 + HMR）、buildSite 的 vite build（与 @joplo/web 同一版本） |
| @vitejs/plugin-react | 6.2.1 | MIT | @joplo/server 运行时依赖：看板与发布站的 React 转译 |
| tailwindcss / @tailwindcss/vite | 4.3.4 | MIT | @joplo/server 运行时依赖：以项目目录为 @source 编译 className |
| @joplo/kit | workspace | — | @joplo/server：项目里的 `@joplo/kit` 别名到本仓库 kit 源码 |
