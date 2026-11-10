# 一颗苹果的旅程

一件约三分钟、能播放也能暂停上手的中文作品：天山野苹果 → 伊甸园 → 牛顿 → 格林童话 → 苹果公司符号 → 你的屏幕。六个真实 Tripo GLB、一组公有领域画作、六段原创 Alda 动机变奏和27段旁白。场景之间用 `from` 接力，主角一直保持在画面中央；各时代模型替换，不声称实现网格形变。

## 在仓库中运行

在仓库根目录：

```sh
pnpm install
pnpm joplo check examples/apple-journey
JOPLO_HOME=/tmp/joplo-apple-preview pnpm joplo dev examples/apple-journey --port 4876
pnpm joplo build examples/apple-journey
```

依赖使用 `workspace:*`，通过本地 starter 的 `joplo init` 创建。`.claude/skills/` 是初始化并同步后的引擎与已启用插件技能。`scene3d` 是 `@joplo-app/plugin-3d` 的插件 id；同包包含可选本机生成。

生成的模型与任务元数据已经提交；普通 check/build/render 不调用 Tripo，不需要 API Key。只有改变提示词并显式执行 `joplo resources --allow-spend` 才会生成新的付费资源。不要为复现现有示例再次生成。

Alda 2.4.8 用于将项目内原创乐谱编译为离线 MIDI；`alda instruments` 可检查音色名。本地交付构建已经嵌入27段 Joplo Cloud 旁白。旁白缓存不进Git，新克隆默认使用浏览器声音；要打包录制旁白，在自己的账户下先运行 `pnpm joplo voice examples/apple-journey --dry-run`，确认额度后显式生成。不能把一台机器的凭证或个人配置复制进项目。

## 暂停后可以做什么

|时代|交互|恢复|
|---|---|---|
|山林|拖动/方向键旋转；悬停果实查看起源；点击“查看来处”|重置或继续播放清除临时探索|
|伊甸园|点击金果或按钮，查看原文与双关的证据边界|重置或回到上一拍|
|牛顿|把苹果拖到地面；也可点“放手”|回到第一拍可重新操作；空白处仍可旋转|
|童话|点“咬一口”请求进入支线；可取消或确认，再点一次执行动作|支线结尾有主线入口|
|品牌|把游标拖到三个年代，或点击年代按钮；点开图灵传说说明|重置回到当前脚本年代|
|结尾|接住苹果，缩入手机；最后一拍可回到五个时代|播放器章节列表也能直接选择|

精确匹配下一步动作会推进一次并保持暂停；其他自由反应只改变临时游玩层。童话支线用 `autoplay:false`，自动主线不进入它；手动播放支线结束后停下。主线最后一拍的回跳不会移除正常章节的自动播放资格。

## 素材与事实

- [assets/SOURCES.md](assets/SOURCES.md)：作者、来源、许可证、下载地址、修改和实际花费。
- [assets/MODELS.json](assets/MODELS.json)：六个模型的字节、面数与credits；`node examples/apple-journey/scripts/audit-models.mjs` 离线复核。
- [facts.ts](facts.ts)：事实、来源和不能推断的结论。森林画不是天山实景；“禁果=苹果”的拉丁双关不是定论；牛顿砸头、商标致敬图灵不当作事实。
- [music.ts](music.ts)：同一短动机在笛、钟琴、大键琴、八音盒、合成器、电钢琴间变奏。

没有迪士尼角色或精确品牌标志，没有手搓复杂SVG/3D模型。手机框架和舞台排版是普通布局；历史画作负责环境，生成模型负责主体。

## 验证与复用

```sh
pnpm joplo render examples/apple-journey --scenario-id journey.film.origin --sheet --out origin.png
node examples/apple-journey/scripts/audit-models.mjs
```

其余章键：`eden`、`newton`、`snow`、`modern`、`ending`、`biteBranch`。逐章检查画面，再实际操作暂停/重置/继续和支线取消/确认。将 `dist/index.html` 用浏览器打开并断网，验证GLB、画作、配乐和已打包旁白；静态图片不能证明声音或输入正常。

本示例沉淀进技能的实践：素材先行与证据边界、先做单模型试片、累计实际费用、测量并本地优化贴图、透明3D叠加画作、稳定主体与镜头转场、短窗口布局、可选支线、真实输入恢复测试、Alda音色与构建诊断。相关功能修复覆盖模型名牌、射线悬停、跨画布拖拽、换色免重载、支线确认封面以及自动播放排除。
