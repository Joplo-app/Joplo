# 素材与事实来源

核实时间：2026-11-08。作品是一段以 1984—2024 为观察窗口的交互短片；四套界面为风格化创作，不是原系统截图或精确复刻。“发送”是贯穿故事的设计母题，不宣称这些产品当年拥有本片展示的邮件或 AI 功能。

| 素材 | 来源 / 作者 | 许可证 | 使用与改动 |
| --- | --- | --- | --- |
| system.css | https://github.com/sakofchit/system.css / Sakun Acharige | MIT；见 system.LICENSE | retro.css 的单色窗口、条纹标题栏；改名并限定 .b40 作用域、调整尺寸颜色；去掉所有字体、图标和其他组件 |
| 98.css | https://github.com/jdan/98.css / Jordan Scales | MIT；见 98.LICENSE | retro.css 的窗口与凸起按钮；解析色彩变量、限定作用域、放大；未使用其字体和图标 |
| Devices.css 黑色外框基元 | https://github.com/marvelapp/devices.css / Marvelapp | MIT；见 devices.LICENSE | device-frame.css 摘取外壳、玻璃内圈、听筒与圆形按键；限定 .b40 并改名，调整尺寸材质；排除相机、传感器、商标等。取材于较晚的框架样式，仅作通用拟物外框，不宣称是 2007 年真实机型 |
| IBM Plex Mono Regular | https://github.com/google/fonts/tree/main/ofl/ibmplexmono / IBM Corp. | SIL OFL 1.1；见 OFL.txt | 原字体未修改；许可文本仅统一 LF 换行并清理行末空格；只用于数字与拉丁字，主题内嵌保证离线。中文回退到设备已安装字体，未再分发系统字体 |
| 四段背景音乐 | 本项目 music.ts / Joplo 示例作者 | MIT（本示例 LICENSE） | 原创 Alda 乐句，不使用系统开机音乐或外部录音；构建时编译 MIDI |

没有分发系统图标、商标、截图、外部音效或采样。画面署名位于左下角；字体与 CSS 的完整许可位于此目录。themes/forty.css 由 assemble-theme.mjs 从 retro.css、device-frame.css、字体及主题源组装，不依赖 CDN。组装后的主题也保留四份完整许可文本，随内嵌 CSS / 字体进入离线导出。

## 核实的事实

- 1984-01-24，Macintosh 发布；原始新闻稿描述鼠标与屏幕菜单：https://www-leland.stanford.edu/dept/SUL/sites/mac/primary/docs/pr1.html （原稿 Apple，Stanford 档案）。只说鼠标与菜单，不声称这是 GUI 的发明。
- 1995-08-24，Windows 95 发布，并引入开始菜单和任务栏：https://blogs.windows.com/windows-insider/2020/08/24/looking-back-the-25th-anniversary-of-windows-95/ （Microsoft）。98.css 只提供相近的凸起视觉基元，不作为 1995 事实依据。
- 2007-01-09，iPhone 发布，采用大尺寸多点触摸显示屏、手指操作：https://www.apple.com/newsroom/2007/01/09Apple-Reinvents-the-Phone-with-iPhone/ （Apple）。不声称发明触屏。
- 2024-05-13，GPT-4o 发布，支持文本、音频和视觉的组合交互：https://openai.com/index/hello-gpt-4o/ （OpenAI）。本片只展示通用文字对话的意图表达，不复刻品牌、不连接模型、不宣称 2024 是聊天或 AI 的起点。

交互范式的四段归纳是本片的叙事解读，不是“某年唯一的交互方式”。片中所有消息、联系人和生成结果均为演示数据。
