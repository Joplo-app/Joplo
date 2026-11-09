# 同一个按钮的 40 年

一部约两分钟的可交互短片。观察窗口是 **1984—2024**：鼠标命令、桌面应用、手指触碰、自然语言意图。四套界面都是风格化创作；年代与产品锚点来自原始或官方资料，不宣称复刻其真实功能。

同一颗发送按钮用 `motion="the-same-send"` 在年代间移动、缩放、变形。每章以 `from` 接续上一章的确定终态，用同一步切换界面与原创 Alda 配乐。年代界面占据主体：全景开场、输入时推近、发送键特写、结果拉远；前三章的按钮会离开界面，成为居中过渡物件，再落进下一年代。镜头只在中部 1280×520 的 Canvas 画框内运动；时间轴、角标与来源位于外部固定布局，底部给引擎输入提示留白。影片没有外部模型或消息后端，AI 草稿明确标成预设内容。

在仓库根目录运行：

```sh
pnpm install
pnpm joplo skill install examples/button-40-years
pnpm joplo check examples/button-40-years
pnpm joplo dev examples/button-40-years --port 4814
pnpm joplo build examples/button-40-years
```

使用本地模板 `joplo init --template ./templates/starter` 初始化；仓库内依赖用 `workspace:*`。独立使用时应改成匹配的已发行版本。配乐编译需要本机 Alda 2.4.8；观众只需浏览器。构建的 `dist/index.html` 可通过 `file://` 打开；首次点击播放解锁声音，旁白回退到浏览器语音，不会请求付费朗读。

可以这样玩：

- 开始播放后点输入框，第一下就暂停且可输入；点“发送”看到自己的文字。1984 可以开文件菜单，1995 可以开开始菜单。
- 2007 用键盘编辑短信，悬停提示区查看触碰说明；触屏可轻点提示区。
- 2024 可以试建议、改请求、发送，草稿始终是标明的预设演示，不会实时推理。
- 拖底部橙色游标到任何年份，先取消一次，再确认一次。目标章节的 `actionEntry: 'after'` 让确认后立即进入对应年代。按回车可触发脚本拖拽；多目标选择也可通过播放器章节菜单完成。
- “重置”只丢弃自由体验；继续播放、跳步或换章节恢复剧本。封面和转场卡不接受舞台交互，需先开始播放。

素材先收集，再实现。来源、作者、许可证、提取范围、事实资料均在 [assets/SOURCES.md](assets/SOURCES.md)。MIT CSS 只取窗口、按钮及 Devices.css 通用黑色手机外框基元，排除附带字体及系统图标；字体使用 OFL 的 IBM Plex Mono，中文回退到设备现有字体。四首乐句均为原创，不使用系统开机声。

主题源文件为 `themes/forty.source.css`；修改后运行 `node examples/button-40-years/assemble-theme.mjs` 重新组装字体和复古样式，保持离线单文件 CSS。不要直接修改生成的 `themes/forty.css`。

这次沉淀的通用经验位于 `joplo skill story / authoring / demo / check` 及 `ui/patterns`、`content/patterns`、`alda`：素材许可分层核实、作用域主题、连续同物件与可体验界面、效果工厂组合、具名自由反应、确认后落到动作结果，以及章节画面与配乐同一步切换。调试日志和截图在仓库忽略的 scratch/，不进入分发物。
