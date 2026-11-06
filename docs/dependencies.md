# 依赖与许可证

Joplo 六个发行包使用 Apache-2.0，包名为 `joplo`、`@joplo-app/kit`、`@joplo-app/core`、`@joplo-app/cli`、`@joplo-app/server`、`@joplo-app/web`。下表覆盖根目录及各包 package.json 的外部直接依赖、开发依赖与可选 peer；版本是当前锁文件安装结果，括号内标明非精确声明。

## 运行与构建

| 包 | 版本 | 许可证 | 用途与安装位置 |
| --- | --- | --- | --- |
| zod | 4.6.7 | MIT | core/server：IR 和接口校验 |
| tsx | 4.23.15 | MIT | CLI：加载作者 TS/TSX；仓库运行脚本 |
| commander | 15.0.0（^15.0.0） | MIT | CLI 参数与帮助 |
| vite | 8.3.5 | MIT | server 运行时：看板服务和站点构建；web 构建 |
| tailwindcss | 4.3.4 | MIT | server 运行时与 web 构建：编译界面和作者 className |
| @tailwindcss/vite | 4.3.4 | MIT | server/web：Tailwind 集成 |
| @vitejs/plugin-react | 6.2.1 | MIT | server/web 开发依赖：React 转译与界面构建 |
| playwright-core | 1.64.1（固定） | Apache-2.0 | 导出组件（D66）：`joplo setup export` 装到 `~/.joplo/runtime/playwright-1.64.1/`，不进用户项目；server 只作为开发依赖取类型 |
| Chromium headless shell、ffmpeg | 随 playwright-core 1.64.1 | Chromium：BSD-3-Clause 等；ffmpeg：LGPL-2.1 | 由 playwright-core 的安装器下载到导出组件的 `browsers/`，用于截图与录视频 |
| playwright | 1.64.1 | Apache-2.0 | server 开发依赖（文档截图脚本）；不再是 peer 依赖 |

## 界面资源

这些包在 web 中作为开发依赖构建进发行资源；用户不需要安装 Mantine，组件词汇由 kit 提供、渲染由 Joplo 实现。

| 包 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| react | 19.3.1 | MIT | 看板和发布站 |
| react-dom | 19.3.1 | MIT | DOM 渲染 |
| @dagrejs/dagre | 3.1.3 | MIT | Diagram 自动布局 |
| modern-screenshot | 4.7.0（^4.7.0） | MIT | 发布站浏览器内图片导出 |
| motion | 14.9.1 | MIT | 镜头、鼠标与步骤动画 |
| roughjs | 4.6.6 | MIT | 手绘描边 |
| lucide-react | 1.66.0 | ISC | 界面图标 |
| clsx | 2.1.1 | MIT | 条件 className 组合 |
| tailwind-merge | 3.7.0 | MIT | 合并 Tailwind 类名 |

## 开发与测试

| 包 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| typescript | 6.0.3 | Apache-2.0 | 类型检查与构建 |
| vitest | 5.1.0 | MIT | 单元与服务集成测试 |
| @types/node | 24.19.2（^24.0.0） | MIT | Node 类型 |
| @types/react | 19.3.0（^19.3.0） | MIT | React 类型 |
| @types/react-dom | 19.3.0（^19.3.0） | MIT | React DOM 类型 |

## 字体

Excalifont 使用 SIL OFL 1.1，woff2 子集来自 Excalidraw 0.18.1，版权与许可证在 [OFL.txt](../packages/web/src/fonts/OFL.txt)。霞鹜漫黑（LXGW Marker Gothic v1.011）同样使用 SIL OFL 1.1，来自 lxgw GitHub Release，许可证在 [OFL-MarkerGothic.txt](../packages/web/src/fonts/OFL-MarkerGothic.txt)。这两种字体随 npm 包离线分发，约 80 KB + 2.1 MB；许可证在 dist/fonts/，发布站只带实际保留字体的许可证。

小赖字体与本地文楷子集已移除；罕用汉字、韩文由系统字体显示。`packages/web/scripts/split-cjk-fonts.py` 从 [cjk-ranges.json](../packages/web/scripts/cjk-ranges.json) 读取原来小赖的 205 条范围，顺序与内容原样保存，重切漫黑时分片及哈希不变。

看板选中“文楷”后才通过 jsDelivr 加载官方 npm 包 [lxgw-wenkai-webfont@1.7.0/style.css](https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css)，实际字体名为 `LXGW WenKai`，许可证为 SIL OFL 1.1（由上游分发）。本包与发布站不再分发文楷字体或其许可证。离线或 CDN 失败时使用系统楷体；默认手写字体仍完全离线。

依赖声明以根 [package.json](../package.json) 及 [kit](../packages/kit/package.json)、[core](../packages/core/package.json)、[cli](../packages/cli/package.json)、[server](../packages/server/package.json)、[web](../packages/web/package.json)、[入口包](../packages/joplo/package.json) 为准。许可证已核对本地安装包的元数据；升级时重新核对 package.json、锁文件和随包 LICENSE。
