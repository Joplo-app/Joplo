# SoundFont 配乐管线（D93，RM1–RM4 修订）

本机谱子 → Alda 2.4.8 `parse -o data`（时长/声部/marker）与 `export`（临时 MIDI）→ SpessaSynth Core → 44.1kHz stereo PCM → 固定重采样32kHz → **MP3 96kbps 立体声发布**。FLAC 44.1kHz stereo16 仅为 `.joplo/music-masters/*.flac` 本机母版，不进入发布站，也不提供无损发布开关。浏览器只解码发布音频；原浏览器振荡器/MIDI 合成器已移除。FFmpeg 仅是可选的测量工具，不是渲染/导出依赖。

## 选型与许可

2026-11-09 核对上游仓库、npm 固定版本与官方文档：

| 项目 | 采用 / 比较 | 依据及取舍 |
| --- | --- | --- |
| 渲染器 | spessasynth_core **4.4.9**，Apache-2.0 | [官方 Node PCM 渲染例子](https://spessasus.github.io/spessasynth_core/getting-started/)、[源码/许可](https://github.com/spessasus/spessasynth_core)。活跃维护，固定版本；不需本机音频设备或 WebAudio。SF3 解码依赖 stb-vorbis **0.0.7**（Apache-2.0），直接精确依赖，并在渲染前校验与引擎使用同一解码器实例。上游的 latest 若漂移则明确失败，需包管理器 overrides 固定其 stb-vorbis=0.0.7；不静默改变音频。 |
| 对比 | FluidSynth，LGPL-2.1-or-later | [官方仓库](https://github.com/FluidSynth/fluidsynth)。持续维护、成熟的原生渲染器，但要求作者安装原生程序/库；本任务优先免安装，未采用。 |
| GM 音色 | FluidR3Mono GM **2.312**，MIT | [固定版本的音色及许可](https://github.com/LibreScore/sf3/tree/3a6eda823dac2ec3e134d38544ca839217358f08)。约 14.5MB SF3，完整 GM 和鼓组，保留原作者/Mono 版/打击乐贡献者归属。旧而稳定的样本集，不把它描述为仍在更新。原始立体声 FluidR3 SF2 约 140MB，首次下载成本更高。 |
| 对比 | GeneralUser GS，自定义宽松许可 | [作者仓库/许可](https://github.com/mrbumpy409/GeneralUser-GS)。允许音乐创作和再分发；Fluid 的标准 MIT 和小 SF3 更容易交付。未引入 GeneralUser 文件或依赖。 |
| 本机母版 | libflacjs **5.6.0** standalone asm.js | [上游](https://github.com/mmig/libflac.js)。MIT 包装 + BSD libFLAC，公开构建基于 libFLAC 1.3.4；上游维护频度低于渲染器，故精确固定并用实际解码测试保护样本数、PCM 与校验。单文件 asm.js 避免临时 Node bundle 丢失 WASM/mem sidecar；没有本机 ffmpeg 依赖。 |
| 发布编码 | @breezystack/lamejs **1.2.7**，LGPL-3.0 | [固定源码/许可](https://github.com/gideonstele/lamejs/tree/1fb0ef5fa177413107e2e107d054a9b994e3f79c)、[LAME](https://lame.sourceforge.net/)。纯 JS，在 Node 实编码，无本机 ffmpeg。32kHz、双声道96kbps，明确重采样以避免编码器隐式选采样率。保留为独立、可替换 npm 依赖，未修改库源码。 |
| 构建验证解码 | mpg123-decoder **1.0.3**，原始 JS 为 MIT / libmpg123 为 LGPL-2.1 | [固定源码与构建说明](https://github.com/eshaz/wasm-audio-decoders/tree/8f2428c1cd96b54dab74836c8471ff75fe35cbee)、[上游许可说明](https://github.com/eshaz/wasm-audio-decoders#licensing)、[mpg123](https://www.mpg123.de/)。Node 内嵌 WASM 解码自身 MP3，测实际延迟/填充，未修改库源码。只在作者机运行。 |
| 视频封装 | Mediabunny **1.65.2**，MPL-2.0 | [上游许可](https://github.com/Vanilagy/mediabunny)、[编码包直接复制](https://mediabunny.dev/guide/media-sources)。活跃维护。未修改上游源码；只在 Node 复制 Playwright 的 VP8/VP9 与 MediaRecorder 的 Opus 包到 WebM，不做音频编解码，不用本机 ffmpeg。 |

音色 URL 固定到提交 `3a6eda823dac2ec3e134d38544ca839217358f08`，SHA-256 `cfcd66d89e8386823400eca64934b14fbea7bf48ba1f00d21189af1262794ec2`；许可 SHA-256 `c21ed6be2fea862673953977c616befc28d1b20dfa60349e4461b97c759db6ca`。两者均校验成功才可使用，下载有大小上限和超时，原子落盘到 `JOPLO_HOME/soundfonts/<hash>/`。不把银行文件或作者路径塞进 npm、IR 或站点。

预安装命令（项目目录）：

```sh
node --input-type=module -e "import('@joplo-app/plugin-alda/local').then(m=>m.installSoundfont())"
```

离线机器复制整份经验证的缓存目录（含 LICENSE.md）。缺失/损坏且无法下载时给清楚错误和命令，不替换为振荡器。发布资源成功后生成 `credits.txt` 和 `music-LICENSE.txt`，HTML 通过 `rel=license` 关联。署名/完整许可与音频一起缓存，不依赖检查缓存或 Alda；缺失署名的旧/损坏缓存会明确报错，须恢复完整缓存或重新渲染，不能无署名发布。检查失败诊断仍会转发。


编码器/验证解码器只作为作者侧独立依赖分发，不打包进听众站点；临时本机 worker bundle 也不分发。插件包的 `dist/THIRD-PARTY-NOTICES.txt` 保留来源、精确版本、源码入口和版权说明，`dist/licenses/` 附 LGPL-3.0、GPL-3.0、LGPL-2.1 全文；npm 依赖保留上游许可。使用者可替换/修改 LGPL 库，并为调试其修改而逆向工程，Joplo 许可不限制这些权利；若再分发库修改，须遵守对应 LGPL 并提供相应源码。Joplo 的重采样、探针和裁剪代码在库外，未改动 LAME/libmpg123。源码入口包含构建说明及固定子模块。不要只凭 npm 的 MIT 包装标签忽略 libmpg123 的许可。

MP3原生支持的依据包括[Mozilla媒体支持](https://support.mozilla.org/en-US/kb/audio-and-video-firefox)和[WebKit原生音频读取代码](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/cocoa/AudioFileReaderCocoa.mm)，Chromium在本次用完整字节实际decode验证。格式支持不等于本方案的裁剪边界已在所有平台验证；Safari/iOS/Firefox仍须实机验收。

## 编码、裁剪与循环

- 周期由 Alda 所有声部 current-offset 最大值（包括休止）决定。循环 PCM 将释音/混响折到下一轮，先做128样本端点校正，再以24tap/256phase sinc（截止频率比率×0.92）重采样到32kHz。
- 编码前在音乐外加确定性1600帧相关探针、640帧隔离静音、前后各3840帧周期上下文。构建使用固定解码器解码自身 MP3，以互相关实际测延迟；填充为解码帧数减输入帧数和实测延迟。探针、guard、填充不属于音乐，绝不播放；不能以 MP3 文件总长作为循环周期。
- 浏览器按实际 `AudioBuffer.sampleRate` 换算数字区间（舍入到样本），以 `loopStart/loopEnd` 循环；marker 从 `loopStart + offset` 起播。**在最终原生有损解码 PCM 上**做3ms余弦端点修正，避免只修编码前 PCM 却漏掉有损重建误差。若原生解码器意外剥掉延迟/填充导致长度不符，明确失败，避免播出探针；需在目标浏览器验证，不能假设所有 MP3 解码器边界相同。
- 非循环保留音乐尾音：校准前峰值连续250ms低于-80dBFS时停止，最多12s，20ms guard fade；`contentFrames` 包含尾音，播放区间只去除编码上下文/填充。
- 整曲一次性按音乐区间双声道 RMS 校准至-20dBFS，再限制全文件 sample peak 至-1dBFS；保留内部动态/声像。这不是 LUFS 母带声明。track volume 与旁白 ducking 仍独立相乘。
- 缓存键含精确谱子、loop、编译器 bundle/version、Alda/SpessaSynth/SF3解码器/本机FLAC/MP3编码器/验证解码器、音色哈希和全部格式、码率、采样率、重采样、探针、上下文、裁剪及接缝参数。独立进程渲染避免共享随机 pan；跨 CPU/JS 引擎逐字节一致性未验证。

## 体积与内存预算

96kbps 约 **0.72MB/分钟**；base64 增加约三分之一。build 输出每条 `MEDIA_ASSET` 实际字节/音乐时长、`MEDIA_BUDGET` 全音频原始/内嵌data-URI字节、`SITE_BUDGET` 整站（含字体/模型/旁白）字节。大于2MiB/曲或0.75MB/分钟告警：0.75在0.72基线上给封装留余地，短循环仍可能因固定上下文开销告警。整站达到18MiB告警，为 [Free单次20MiB限制](cli.md) 留空间；服务实际返回的账户限制为准。调低音量不会减少文件大小，需缩短/拆曲或缩小分享范围。

宿主管理的编码缓存上限4MiB/32项、加载并发2；PCM缓存32MiB/32项、解码并发1。按实际 `frames × channels × 4` 字节统计，租约引用固定当前与首曲预取，离场释放后LRU淘汰；相同资源复用inflight，失败Promise移除，下次可重试。destroy释放缓存、录音chunks和流引用。预估/实际超预算拒绝曲目，不无限扩大缓存。48kHz双声道float32每分钟约23MB；十分钟MP3虽小，PCM约230MB，必须拆曲。没有数字长度的外部音频只能解码后核实大小，原生解码器瞬时内部开销不属于缓存统计；不要把缓存上限声称为浏览器总内存上限。

录制只预热首曲、后续按需加载，保持上述预算；冷曲在高负载下可能晚起播。失败播放槽位不会逐帧重试：修复原因后切换场景/关开声音或重载，再重试。发布站不能补做本机渲染。Alda export仍可能需要它自己的Java player：遇到Failed to reach player/超时，先`alda ps`查看并用`alda doctor`修复本机环境，再重试；不要改音频参数掩盖工具故障。build可以警告后省略失败曲目，验收必须核对预期曲目数和MEDIA_ASSET，不能只看退出0。

## 数字字段的端到端流向

| 字段 / API | 写入 → 存储 → 消费 |
| --- | --- |
| `LocalCompiler.inspect` / `resourceInfo` | Alda parse生成时长/声部/marker → 作者机`.info.json` → 二次编译校验marker与音乐检查；不自动进入IR |
| `MusicOptions.from` | 作者marker名 → inspect校验 → 仅数字`MediaCommand.offsetMs` → frames `offsetMs/startOffsetMs` → 引擎seek；`startOffsetMs`保证晚marker淡入从0开始 |
| `LocalArtifact.bytes/audio/credit/license` | 本机compile生成 → `.joplo/resources`整份缓存 → dev响应或scope后build；署名与检查数据独立，缺必需署名为error |
| `AudioRegion` | `sourceSampleRate`32k；`cycleFrames`音乐周期；`contentStartFrame`跳过探针/guard/实测延迟；`contentFrames`音乐含尾音；`decodedFrames`总解码帧；`encoderDelayFrames/paddingFrames/channels`实测边界与声道 → 宿主严格数字schema/区间校验 → `project.mediaInfo[resourceId]`（随scope裁剪）或dev响应audio → MediaEngine → 原生采样率换算/循环/seek/PCM预估 |
| `requiresAttribution` | 本机编译器声明 → describe → worker和缓存读取强制credit/license → build失败或credits/完整LICENSE文件；不进IR |
| `MediaEngine.startCapture/endCapture/calibrate` | 首曲租约预热 → 同一增益输出到MediaStream，恒零输入持续产帧 → Opus MediaRecorder → 真实录制PTS校准 → Node复制包封装WebM |
| 预算统计 | MP3实际bytes/数字音乐时长 → 每曲和aggregate诊断；最终目录实际文件长度 → SITE_BUDGET；纯数字无作者路径 |

只有scope后引用音频、数字媒体快照/播放区间和署名许可发布；源谱、marker名、声部检查数据、银行、临时MIDI、本机母版、local代码及作者路径不发布。check本机解析不下载音色/不渲染：缺Alda只warning；已知工具下未知marker为error。提前静音/过短循环仍按hold确定锚点检查，不能把“无Alda检查通过”称为渲染成功。任务F的跨章继承/交叉淡化不在本任务中。

## 视频同步与已知问题

音频原点来自录制内真实PTS：录完场景及结果停留后，向capture tap播放2000Hz校准脉冲，同时显示洋红全屏标记；从实际视频包/解码帧和Opus包/PCM识别标记，取两者差并居中视频帧量化区间，然后裁去校准段。持续零输入使Chromium录音在静音间隙仍产帧。分析使用独立页面WebCodecs，音频逐包对应PTS（避免AudioDecoder把时间间隙重排为连续）。不使用newPage之前的壁钟；保留原视频起始画面，不需切关键帧或重编码。只复制VP8/VP9与Opus，不依赖本机ffmpeg。

**已知问题RM5**：录音/校准/音频封装失败仍会拒绝整次导出，当前没有保留无声视频回退；先修复错误再重新导出。本次按协调决定只记录，不实现回退。旧浏览器Web Speech旁白仍不可录音。旁白与配乐的最终电平差未经实测，不把纯音乐电平当作最终混音证明。

## 修订实测（2026-11-09）

同机Node26 / Alda2.4.8 / managed Chromium；未经人耳验证。两示例叙事、画面和乐谱未改动。下表由ffmpeg ebur128/true-peak测量**MP3解码后音乐区间**，按mediaInfo裁掉探针/上下文，尚未乘track volume/ducking。

| 示例 / 曲名 | 音乐秒 | MP3 bytes | LUFS-I | true peak dBFS |
| --- | ---: | ---: | ---: | ---: |
| button / chip | 5.455 | 69984 | -16.8 | -11.1 |
| button / desktop | 8.889 | 111024 | -17.7 | -5.4 |
| button / touch | 9.231 | 115344 | -16.9 | -6.4 |
| button / intent | 10.909 | 135216 | -18.1 | -11.9 |
| apple / forest | 20.526 | 250560 | -16.9 | -10.5 |
| apple / eden | 22.500 | 274320 | -14.4 | -1.8 |
| apple / newton | 12.500 | 154224 | -15.5 | -6.5 |
| apple / snow | 18.571 | 227232 | -15.0 | -2.7 |
| apple / modern | 9.600 | 119664 | -17.7 | -3.6 |
| apple / ending | 16.667 | 204336 | -17.0 | -10.2 |

- button-40-years：4曲431568原始字节，575516内嵌字节，整站3121897字节。apple-journey：6曲1230336原始字节，1640586内嵌字节，整站15540474字节（约14.82MiB，低于20MiB）。短chip曲因固定context开销触发0.75MB/min提醒。
- 构建自解码实测编码延迟1105帧/32kHz，每曲填充460–1174帧；不是硬编码“常见MP3延迟”。字节确定性测试两次实际编码一致；本机FLAC母版仍有精确PCM无损回归。
- 离线file:// Chromium最终实播：播放RMS0.011668、seek0.061424、1.5×0.045823，暂停为0。chip最终PCM在44.1kHz下257191总解码帧、240545周期帧；48kHz下279936总解码帧、261818周期帧。两声道端点差及两轮OfflineAudioContext实际连接差均0。接缝前/后10ms RMS：44.1k左0.005560/0.082250、右0.010101/0.079013；48k左0.005373/0.082308、右0.010102/0.079069。尾音衰减和新音攻击能量不同，不宣称样本连续等于听感/和声合适。
- 视频回归25fps（40ms/帧）：正常-20.81ms、newPage前延迟800ms的冷启动+19.19ms、同样延迟并4×CPU限速+18.52ms；全部一帧内。旧壁钟方案800ms延迟曾测得约+683ms，现不依赖该延迟。
- 40首一分钟PCM轮换预算回归：仅1个23.04MB PCM项留存、编码项≤32；十分钟元数据在decode调用前被预算拒绝；销毁后缓存0。测试覆盖并发限制、inflight复用、释放淘汰、失败重试与销毁。此40曲测试使用假设备的buffer尺寸字段计量，未分配40首实际PCM或测量RSS；真实Chromium单曲缓存另测约2.24MB。
- 实际button视频导出为VP9 + Opus；最终配乐（含轨道音量/淡入淡出）-24.5 LUFS-I / -18.5dBFS true peak。该录制没有旁白音轨，不能用它证明人声与配乐的最终电平差。
- 真实缓存探针先渲染钢琴曲并检查，再删除info.json、清空PATH模拟无Alda：仍发布1条MP3、1条完整署名和1份许可，并转发LOCAL_RESOURCE_INSPECTION_FAILED；故障注入测试再移除artifact署名时拒绝发布。
- 尚未在Safari/iOS/Firefox实机验证本方案的原生解码边界、视频WebCodecs校准；未做人耳听审，未验证跨CPU逐字节一致性。
