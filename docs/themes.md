# 主题

主题是 CSS，作用于演示画面，以及跟随它的字幕、手机外框、高光和提示；看板首页、侧栏与普通控制不随主题换色。圈注与箭头始终使用 Rough 手绘路径，颜色由主题控制。定义与变量以 [themes.ts](../packages/web/src/renderer/themes.ts) 为准。

## 九个内置主题

| 名称 | 显示名 | 描边 |
| --- | --- | --- |
| sketch | 手绘（默认） | rough |
| clean | 线框 | clean |
| blueprint | 蓝图 | clean |
| nord | Nord | clean |
| dracula | Dracula | clean |
| solarized-light | Solarized Light | clean |
| terminal | 复古终端 | clean |
| kraft | 牛皮纸 | rough |
| contrast | 高对比 | clean |

## 看板外观：配色、字体、线条（D55）

看板顶栏的「外观」（或按 `T`）打开外观浮层，配色、字体和线条分开选：

| 组 | 选项 | 说明 |
| --- | --- | --- |
| 配色 | 主题名（上表 + 作者主题） | sketch 与 clean 配色相同，合并为一格「纸白」，从别的配色点它时写 sketch；作者主题标 `*`；最后一格「+ 自定义」复制一份主题模板 |
| 字体 | 跟随主题 / 漫黑（手写） / 黑体 / 宋体 / 文楷（手写） / 等宽 | 画面和字幕一起换。手写是已打包的 Excalifont + 霞鹜漫黑，文楷是已打包的霞鹜文楷，按用到的字分片加载；其余用本机字体 |
| 线条 | 手绘（rough）/ 直线（clean）/ 跟随主题 | 跟随主题时由主题的 `--jp-stroke` 决定 |

点一下立即应用并保存；悬停 150ms 临时预览，移开恢复；方向键移动、Enter 应用、Esc 关闭并撤掉预览。演示页里的选择只改当前项目；首页的「外观」改所有项目的默认。「恢复项目默认」回到 joplo.config.ts 的主题（字体、线条跟随主题）；「设为所有项目的默认」把当前这套外观写成默认，单独设置过的其他项目不受影响。

选择保存在本机 `~/.joplo/settings.json`（或 `JOPLO_HOME` 下），不改作者文件：

```json
{ "version": 1, "theme": "nord", "font": "hand", "projects": { "<项目 id>": { "theme": null, "stroke": "clean" } } }
```

每个字段分别按“本项目 > 所有项目 > 项目 config”取值。值为 null 也算写过：`theme: null` 表示用 config 的主题，`font` / `stroke` 为 null 表示跟随主题，即使“所有项目”另有选择也如此。只有 `theme` 的旧文件照常读取；看板进程会丢弃不认识的字体、线条和不合法的主题名，主题文件被删掉时回到 config 的主题。

字体和线条只影响本机看板和导出的图片、视频（导出请求带上 `font`、`stroke`，渲染路由同样应用）。**发布站不支持字体和线条**：joplo.config.ts 仍只有 `theme`，发布站只用它的配色。浮层底部的「复制 theme」复制一行 `theme: 'nord',`，粘进 config 后发布站也用这套配色。CLI `render` 的 `--theme` 参数优先于 config；`renderStep` 的 `font` / `stroke` 缺省时跟随主题。

## 作者主题

项目根目录写 `themes/brand.css`，文件名就是主题名。名称以字母开头，其余可用字母、数字、下划线或连字符；同名作者主题覆盖内置定义。

```css
:root {
  --jp-font: system-ui, sans-serif;
  --jp-ink: #14213d;
  --jp-bg: #f7f7fb;
  --jp-surface: #ffffff;
  --jp-accent: #fca311;
  --jp-info: #2563eb;
  --jp-radius: 10px;
  --jp-stroke: clean;
}
```

在 joplo.config.ts 指定默认主题：

```ts
import { config } from '@joplo-app/kit';
export default config({ name: 'My demo', layout: 'app', theme: 'brand' });
```

保存 CSS 后看板预览与演示热更新；build 将作者 CSS 写入发布 IR。load 读取文件 → IR 的 themes/name→CSS → 渲染器限定选择器范围 → 舞台与字幕消费变量；默认选择由 config.theme 保存，看板外观浮层的本机覆盖另存 settings.json。

## 全部 CSS 变量

| 变量 | 含义 |
| --- | --- |
| `--jp-font` | 正文字体 |
| `--jp-font-mono` | 等宽字体 |
| `--jp-font-size` | 正文字号 |
| `--jp-ink` | 主要文字与线条 |
| `--jp-bg` | 舞台底色 |
| `--jp-surface` | 卡片、输入框、节点背景 |
| `--jp-subtle` | 次级底色，如气泡、分段控件与进度条底 |
| `--jp-muted` | 次要文字 |
| `--jp-faint` | 占位与禁用文字 |
| `--jp-line` | 分隔线与浅边框 |
| `--jp-line-strong` | 较深边框、未完成步骤及 dim 状态 |
| `--jp-border` | clean 描边的组件边框 |
| `--jp-accent` | 高光、镜头焦点与示例输入 |
| `--jp-select` | 选中元素的颜色 |
| `--jp-info` | Diagram active 调用状态 |
| `--jp-ok` | 成功状态 |
| `--jp-warn` | 警告状态 |
| `--jp-annot` | 手绘圈注与箭头；未设置时回落到 --jp-danger，内置主题沿用该主题的 danger 色 |
| `--jp-danger` | 错误状态 |
| `--jp-radius` | 圆角 |
| `--jp-shadow` | 卡片阴影 |
| `--jp-stroke` | rough 为手绘描边，clean 为细线边框 |

可只覆盖需要的变量；省略 stroke 时使用 rough。也可写 `.jbox`、`h1` 等普通选择器细调。选择器会限定到带 data-theme 的 `.jstage` 和 `.jtheme`；`:root`、html、body 等根选择器指向演示根。@media 等嵌套选择器同样处理；@font-face、@keyframes、@import 按 CSS 原样保留。

深色主题应保证 info/ok/danger/accent 与底色的对比度。主题影响 Diagram、Terminal、Phone 和字幕，不改变产品行为。

## THEME_UNKNOWN

config.theme 既不是内置名称、又没有对应的 themes/name.css 时，check 报 THEME_UNKNOWN 并定位到配置。修复名称或补齐 CSS 文件；确认文件名符合上述规则。主题用法也可运行 `npx joplo skill demo` 查看。
