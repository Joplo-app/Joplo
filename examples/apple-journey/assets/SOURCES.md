# 素材清单与许可

先收集素材，再创作；以下是下载/生成前确定的清单。核实日期：2026-11-08。

|用途|素材与作者|来源|许可 / 处理|
|---|---|---|---|
|伊甸园背景|《Adam and Eve》，Lucas Cranach the Elder 工作室，约1528|https://commons.wikimedia.org/wiki/File:Cranach_Adam_and_Eve.jpg|PD-Art / PD-old；缩放、暗化裁切显示|
|牛顿背景|《Isaac Newton》，Godfrey Kneller，1689|https://commons.wikimedia.org/wiki/File:GodfreyKneller-IsaacNewton-1689.jpg|PD-Art / PD-old；缩放、暗化裁切显示|
|童话背景|《Snowdrop》，Arthur Rackham，1909（1920重印）|https://www.gutenberg.org/files/37381/37381-h/37381-h.htm|公有领域插画；只提取插画，缩放、暗化显示；不采用迪士尼形象|
|森林背景|Ivan Shishkin，《In the Forest》，1880s|https://commons.wikimedia.org/wiki/File:In_the_Forest_(Shishkin).jpg|PD-Art / PD-old；山林氛围，非天山实景|
|字体|系统字体栈|随设备提供|不分发字体文件；若嵌入字体，仅选 OFL 并随附许可|
|配乐|六段原创 Alda 乐谱|../music.ts|本示例原创；无外部采样、无额外音效|
|3D 主角|Tripo 文本生成，野果/金果/牛顿果/童话果/现代果/手机结尾|models/*.json|原创提示词，不复制商标；参数、任务、实际 credits 见同名元数据；每个 GLB 目标≤2 MB|

## 生成预算

总上限 250 credits。先生成野果单模型打通画面；每轮先 resources --dry-run，后 --allow-spend。目标 textured + smart_low_poly + face_limit 5000，预计每个 30 credits，六个共180 credits；实际以 Tripo 回执为准。不把密钥或临时下载 URL 写入此文件。

## 实际下载与本地处理

- `images/eden.jpg`：原始文件 https://upload.wikimedia.org/wikipedia/commons/c/ca/Cranach_Adam_and_Eve.jpg ，1,920×1,272；画面由 CSS 暗化与裁切，文件未重绘。
- `images/newton.jpg`：原始文件 https://upload.wikimedia.org/wikipedia/commons/3/39/GodfreyKneller-IsaacNewton-1689.jpg ，1,364×1,916。Commons 注明为 Kneller 1689 原作的摹本（页面署 James Thronill）；本片不把摹本当原作实拍。
- `images/forest.jpg`：Ivan Shishkin，《In the Forest》，1880s，公有领域。许可页 https://commons.wikimedia.org/wiki/File:In_the_Forest_(Shishkin).jpg ，原始文件 https://upload.wikimedia.org/wikipedia/commons/1/1f/In_the_Forest_%28Shishkin%29.jpg 。仅作山林氛围，非天山实景。
- `images/snowdrop.jpg`：Arthur Rackham，1909插图（1920单行本重印）。原始文件 https://www.gutenberg.org/files/37381/37381-h/images/pl01.jpg 。作者1939年去世；插画已进入公有领域。本项目仅使用原画，无 Gutenberg 标识或电子书正文。
- 所有下载均保留为本地资源，用 `asset()` 内嵌；文件大小均低于图片限制。
- GLB 使用 glTF Transform 4.5.0 的 `resize --width 1024 --height 1024` 本地缩小内嵌贴图，保持几何、材质、纹理封装与生成记录。没有调用付费重网格化或再次生成。优化工具：https://gltf-transform.dev/cli 。实际字节、三角面、累计花费由 `node scripts/audit-models.mjs` 检查。

## 最终资源账本

- Tripo：6个成功任务，每个30 credits，总计 **180 credits**，未超过250上限；没有失败重试或额外付费优化。
- 优化后的模型共 **5,011,668 bytes**，单个 **633,512–1,091,504 bytes**，**5,610–6,446** 三角面。精确数据见 `MODELS.json`；运行审计脚本可复核。
- Joplo Cloud 原创中文旁白：27段、744字符，全部生成成功；本地构建包含约1,402 KB音频。使用已有月额度，无外部配音素材。旁白正文在场景源码，生成缓存按Joplo约定位于忽略的 `.joplo/voice/`；可分发构建内含音频。新克隆可用浏览器旁白，或在自有账户中显式重新生成，不能假定缓存已进Git。
