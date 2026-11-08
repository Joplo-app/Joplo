# ADR-0003：演示模型与架构

- 状态：已采纳（截至 0.1.2）
- 依据：DECISIONS.md D35、D39–D51、D53–D56
- 取代 ADR-0002 中看板布局、组件目录、设备与演示呈现等相关约定；文件权威源、路径堆叠和编译 IR 模型继续适用。

## 模型

**层级是独立页面。** Option.layers 用 `layer(title, tree)` 声明每种视角，各层单独编译成 Scene，共享同一场景状态；切层只改变观看视角，不改变步骤。全景由作者显式声明。组件词汇对齐 Mantine，低保真渲染由 Joplo 实现。

**导演跟随镜头。** flow 步骤通过 `shot(...ids)` 指定焦点，第一个镜头的层决定导演去向，`shot()` 回到整层。观众可手动切层、缩放平移、只重放一层，再恢复导演。core 的 cameraAt/displaySceneId 推导镜头与显示画面，手动播放、截图、视频与发布站共用。

**trace 表达调用链。** Diagram 定义分组、节点和连线，自动布局；trace 解析节点/边为调用路径，diagramStateAt 推算 active/ok/error/dim/idle。trace.fail 表示失败，trace.skip 表示未调用，trace 也提供镜头目标。多个焦点节点形成紧凑小图；when 负责逐段出现，完整布局预先计算。

**字幕与一屏演示。** 画面铺满可用区域，下方显示本步说明和 explain；说明建议 24 字以内、explain 48 字以内，超出给 warning。长内容放说明层。导演与连线动画完成后再推进；全屏保留画面、字幕与可淡出的控制。

**每页一种设备。** 默认电脑页，viewport 为 mobile 的页固定 390 宽并置于 Phone 外框；手机版单独设计。截图输出尺寸只改变容纳与像素，不改变页面设备。

**故事的其他路线与展示投影（D56）。** fork 编译为本步的 label/scenarioId/at，公共前缀只比较动作和业务效果；marksAt 读取本步标注，changedAt 对比 core 回放的相邻业务状态。按键记录从当前位置与控制器预览推导，均不写入业务状态。Email、DataCard、StateFlow 是组件目录中的纯 IR 渲染；后两者使用绑定路径匹配变化。标注随镜头测量，隐藏或画面外不画。发布保留这些演示信息。

## 主题、进程与分发

- **主题**：九个内置主题与 themes/name.css 通过 CSS 变量作用于演示、字幕和手机外框。config.theme 是项目默认，IR 保存作者 CSS；本机 settings.json 保存看板覆盖，发布站使用项目默认。
- **单进程多项目**：同一 JOPLO_HOME 下一个本地看板服务多个项目，各项目按需编译与独立热更新。再次 dev 注册到存活实例；projects.json 记项目，server.json 记实例，settings.json 记设置。
- **npm 结构**：joplo 是命令入口；`@joplo-app/kit` 创作，core 编译/播放/校验，web 提供预构建界面，server 提供服务/构建/渲染，cli 接线命令，`@joplo-app/plugin-diagram` 交付图表内容形态。七个包同版本发布；作者模块在本机执行，看板和 Published site 只消费 IR。
- **发布边界**：build 仅保留 pick 的方案和可演示内容，不发布规则来源、缺口、待决问题与源码位置；观众使用同一套演示布局，可导出图片，本地另可录制视频。

用法见 [CLI](../cli.md)、[看板](../web.md)、[主题](../themes.md)；发布流程见 [release.md](../release.md)。
