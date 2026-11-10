# 同一个按钮的 40 年

一件约一分半钟、能播放也能暂停上手的作品，**一个镜头讲完四十年**：观察窗口是 1984—2024，鼠标命令、桌面应用、手指触碰、自然语言意图。四套界面都是风格化创作；年代与产品锚点来自原始或官方资料，不宣称复刻其真实功能。

镜头语言：

- **穿过按钮的 match cut**：四个年代的发送按钮中心都落在同一个世界坐标（`.lens`）。每章结尾镜头推进到按钮占满画面；下一章第一步在按钮遮住画面时换年代——旧界面 `exit`、新界面 `enter`，按钮用同一个 `motion="the-same-send"` 从上一颗的大小变形过来——镜头同时以先慢后快的曲线拉开，露出新界面。年份数字滚动、时间轴游标滑动都在同一步。
- **配乐 J-cut**：下一年代的乐句在推进那一步就淡入，与旧曲交叉；全片只在结尾 `music.stop`。四章用 `flow({ from })` 接力，发布站连续播放时一镜到底，没有“下一章”倒计时。
- **镜头一直在动**：`<Canvas drift>` 让每个停留都缓慢推近；`safe` 让带目标的取景避开叠在画面上的标题与时间轴。
- **界面自己有生命**：1984 窗口放大打开、菜单逐格下拉、光标闪烁；1995 开始菜单从任务栏升起、沉回；2007 键盘升起、气泡弹出；2024 回答逐字流出。

影片没有外部模型或消息后端，AI 草稿明确标成预设内容。评审时用 `joplo render --film --chain` 看胶片条（硬切、静止都会被标出），不要只看静态分镜。

在仓库根目录运行：

```sh
pnpm install
pnpm joplo skill install examples/button-40-years
pnpm joplo check examples/button-40-years
pnpm joplo dev examples/button-40-years --port 4814
pnpm joplo build examples/button-40-years
pnpm joplo render examples/button-40-years --scenario-id forty.mac --film --chain --out scratch/film.png
```

使用本地模板 `joplo init --template ./templates/starter` 初始化；仓库内依赖用 `workspace:*`。独立使用时应改成匹配的已发行版本。配乐编译需要本机 Alda 2.4.8；观众只需浏览器。构建的 `dist/index.html` 可通过 `file://` 打开；首次点击播放解锁声音，旁白回退到浏览器语音，不会请求付费朗读。

可以这样玩：

- 开始播放后点输入框，第一下就暂停且可输入；点“发送”看到自己的文字。1984 可以开文件菜单，1995 可以开开始菜单。
- 2007 用键盘编辑短信，悬停左侧提示查看触碰说明；触屏可轻点提示。
- 2024 可以试建议、改请求、发送，草稿始终是标明的预设演示，不会实时推理。
- 拖底部橙色游标到任何年份，先取消一次，再确认一次。目标章节的 `actionEntry: 'after'` 让确认后立即进入对应年代。按回车可触发脚本拖拽；多目标选择也可通过播放器章节菜单完成。
- “重置”只丢弃自由体验；继续播放、跳步或换章节恢复剧本。封面和转场卡不接受舞台交互，需先开始播放。

素材先收集，再实现。来源、作者、许可证、提取范围、事实资料均在 [assets/SOURCES.md](assets/SOURCES.md)。MIT CSS 只取窗口、按钮及 Devices.css 通用黑色手机外框基元，排除附带字体及系统图标；字体使用 OFL 的 IBM Plex Mono，中文回退到设备现有字体。四首乐句均为原创，不使用系统开机声。

主题源文件为 `themes/forty.source.css`；修改后运行 `node examples/button-40-years/assemble-theme.mjs` 重新组装字体和复古样式，保持离线单文件 CSS。不要直接修改生成的 `themes/forty.css`。

这次沉淀的通用经验位于 `joplo skill demo / review` 与 `content/patterns`、`alda`：像视频的必要条件（不硬切、不静止、章节接力、配乐交叉淡化、节奏）、胶片条必经检查、进退场与漂移的用法、穿过主体的 match cut 配方，以及细纹理在缩放下的摩尔纹等常见坑。调试日志、胶片条和视频在仓库忽略的 scratch/，不进入分发物。
