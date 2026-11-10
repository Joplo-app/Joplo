# 双画幅讲解示例

横屏 `landscape`（1280×720）与竖屏 `portrait`（720×1280）共享同一份中性虚构数据。每个作品都有可播放的短引语/照片章节，以及继承前章状态的长引语/未定比例章节。不生成旁白，不访问外部素材或付费服务。

```sh
pnpm install --frozen-lockfile
pnpm joplo check examples/explainer-layouts
pnpm joplo build examples/explainer-layouts
pnpm joplo dev examples/explainer-layouts
```

`shared/components.tsx` 是本示例维护的可复用包装组件，不属于 Core 或新插件。它们转发 `when`、`enter`、`exit`、`motion` 和绑定等通用属性。`PhotoPanel` 支持本地照片资源、署名、年份和焦点；随附 `assets/exhibit.svg` 是本仓库原创矢量示意图，明确标为非实拍，可随仓库使用，不冒充新闻照片。替换照片时使用自己有权使用的本地文件，填写真实署名并检查焦点。

`QuoteCard` 同时展示原文、标明译文的中文、双语姓名、身份、日期与长来源名。`StatusBadge` 的状态/解释由作者传入；示例的“演示数据”不表示核实或认证。`RatioBar` 接收左右计数、总量、阈值与标签；中间保留未定量，不将已知部分重新归一化。纯计算测试覆盖总量和阈值边界。

画面将品牌放在上方，主体从下方开始；来源状态与字幕有独立底部空间。长引语使用实际换行高度，竖屏不是横屏整体缩小。发布前检查每个章节终态和动态转换，长来源名、译文和图片署名都必须可见。密集点阵在窄屏中可改用比例条；本例不包含席位点阵，避免未经验证的点径算法。

这是仓库 example，不改独立的 `Joplo-app/joplo-templates` 模板仓库。可复用实践已同步 `joplo skill content/patterns`：双画幅的安全区、长引语真实测量、资料状态的作者语义与未定比例。

导出需区分逻辑舞台与输出像素。看板默认桌面舞台预览竖屏世界时会留白；这不等于原生 9:16 导出。显式设置逻辑舞台，镜头与固定屏幕层才使用对应设计尺寸：

```sh
pnpm joplo render examples/explainer-layouts --scenario-id portrait.long --sheet --viewport 720x1280 --no-frame --out portrait-sheet.png
pnpm joplo render examples/explainer-layouts --scenario-id landscape.long --sheet --viewport 1280x720 --no-frame --out landscape-sheet.png
pnpm joplo render examples/explainer-layouts --scenario-id portrait.short --video --chain --voice off --clean --viewport 720x1280 --width 720 --height 1280 --no-frame --out portrait.webm
```

`--width/--height` 只决定输出画幅，不能代替 `--viewport`。`--clean` 隐藏播放器步骤标题/完成徽标，保留作品自行绘制的品牌、来源及字幕区；静态 sheet 的播放器标题仍可能显示在作品之上。
