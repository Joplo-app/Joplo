# SoundFont 配乐管线（D93）

本机谱子 → Alda 2.4.8 `parse -o data`（时长/声部/marker）与 `export`（临时 MIDI）→ SpessaSynth Core → 44.1kHz stereo PCM → 16-bit FLAC。浏览器只解码音频；振荡器与自写 MIDI 解析器已删除。实现和不变量测试分别在 `plugins/alda/src/{local,render,soundfont}.ts`、`plugins/alda/test/audio.test.ts`。

## 选型与许可依据

2026-11-09 核对上游仓库、npm 固定版本与官方文档：

| 项目 | 采用 / 比较 | 依据及取舍 |
| --- | --- | --- |
| 渲染器 | spessasynth_core **4.4.9**，Apache-2.0 | [官方 Node PCM 渲染例子](https://spessasus.github.io/spessasynth_core/getting-started/)、[源码/许可](https://github.com/spessasus/spessasynth_core)。活跃维护，固定版本；不需本机音频设备或 WebAudio。SF3 解码依赖 stb-vorbis **0.0.7**（Apache-2.0），直接精确依赖，并在渲染前校验与引擎使用同一解码器实例。上游的 latest 若漂移则明确失败，需包管理器 overrides 固定其 stb-vorbis=0.0.7；不静默改变音频。 |
| 对比 | FluidSynth，LGPL-2.1-or-later | [官方仓库](https://github.com/FluidSynth/fluidsynth)。持续维护、成熟的原生渲染器，但要求作者安装原生程序/库；本任务优先免安装，未采用。 |
| GM 音色 | FluidR3Mono GM **2.312**，MIT | [固定版本的音色及许可](https://github.com/LibreScore/sf3/tree/3a6eda823dac2ec3e134d38544ca839217358f08)。约 14.5MB SF3，完整 GM 和鼓组，保留原作者/Mono 版/打击乐贡献者归属。旧而稳定的样本集，不把它描述为仍在更新。原始立体声 FluidR3 SF2 约 140MB，首次下载成本更高。 |
| 对比 | GeneralUser GS，自定义宽松许可 | [作者仓库/许可](https://github.com/mrbumpy409/GeneralUser-GS)。允许音乐创作和再分发；Fluid 的标准 MIT 和小 SF3 更容易交付。未引入 GeneralUser 文件或依赖。 |
| 编码器 | libflacjs **5.6.0** standalone asm.js | [上游](https://github.com/mmig/libflac.js)。MIT 包装 + BSD libFLAC，公开构建基于 libFLAC 1.3.4；上游维护频度低于渲染器，故精确固定并用实际解码测试保护样本数、PCM 与校验。单文件 asm.js 避免临时 Node bundle 丢失 WASM/mem sidecar；没有本机 ffmpeg 依赖。 |
| 格式 | 原生 FLAC，44.1kHz 双声道 16-bit | [MDN 编解码支持](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)、[媒体容器支持](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers)、[Chrome 的媒体元素与 decodeAudioData 支持](https://chromestatus.com/feature/5744731434778624)、[WebKit decodeAudioData FLAC 测试](https://github.com/WebKit/WebKit/blob/main/LayoutTests/webaudio/decode-audio-data-flac.html)。当前 Chrome、Firefox、Safari 及 iOS Safari 均可解码；实际设备验证范围另记，不把文档兼容性当作实机验证。FLAC 无压缩编码延迟/填充，保留精确 PCM 边界；代价是比 MP3/Opus 大。 |
| 视频封装 | Mediabunny **1.65.2**，MPL-2.0 | [上游许可](https://github.com/Vanilagy/mediabunny)、[编码包直接复制](https://mediabunny.dev/guide/media-sources)。活跃维护。未修改上游源码；只在 Node 复制 Playwright 的 VP8/VP9 与 MediaRecorder 的 Opus 包到 WebM，不做音频编解码，不用本机 ffmpeg。 |

音色 URL 固定到提交 `3a6eda823dac2ec3e134d38544ca839217358f08`，SHA-256 `cfcd66d89e8386823400eca64934b14fbea7bf48ba1f00d21189af1262794ec2`；许可 SHA-256 `c21ed6be2fea862673953977c616befc28d1b20dfa60349e4461b97c759db6ca`。两者均校验成功才可使用，下载有大小上限和超时，原子落盘到 `JOPLO_HOME/soundfonts/<hash>/`。不把银行文件或作者路径塞进 npm、IR 或站点。

预安装命令（项目目录）：

```sh
node --input-type=module -e "import('@joplo-app/plugin-alda/local').then(m=>m.installSoundfont())"
```

离线机器复制整份经验证的缓存目录（含 LICENSE.md）。缺失/损坏且无法下载时给清楚错误和命令，不替换为振荡器。发布资源成功后生成 `credits.txt`，HTML 通过 `rel=license` 关联。

## 不变量与边界

- **确定性**：资源缓存的 SHA-256 输入包含精确谱子、loop、编译器 bundle/version；其中固定了 Alda、SoundFont 哈希、SpessaSynth、stb-vorbis、FLAC 编码器与信号处理版本。每个资源在独立进程渲染，不共享随机 pan 状态。文件不写当前时间、路径或谱名。浮点 JS 渲染的跨 CPU/JS 引擎逐字节一致性没有保证；缓存与发布验证使用相同 Node 环境。
- **无缝循环**：Alda 各 part 的 current-offset 最大值（含末尾休止）决定精确周期。释音/混响最长渲染 12s，折叠到下一周期，端点 128 样本余弦修正使首尾样本一致，不加编码静音。FLAC 解码测试验证样本总数与量化 PCM 完全一致；真实鼓谱还测接缝 RMS/不连续性。采样连续不等于和声适合循环，仍需人耳判断。
- **尾音**：非循环在结束后继续渲染，直到校准前的峰值连续 250ms 低于 -80dBFS，最长 12s，20ms guard fade 收尾。异常长持续音最多保留这一窗口；不要用无限 sustain 写有限场景。
- **电平**：按乐谱周期内的双声道 RMS 做整曲一次性 -20dBFS 校准，并用全文件峰值限制到 -1dBFS；保留曲内动态与声像，不宣称等于 LUFS 母带。轨道 volume 与旁白 ducking 仍在浏览器独立相乘。
- **体积**：build 对每条实际包含的音频打印 `MEDIA_ASSET` 字节/精确 FLAC 时长；字节是压缩文件本身，HTML 内嵌 base64 另增加约三分之一。大于 10MiB/条或 6MiB/min 告警；后者给 44.1kHz stereo16 无损编码合理空间。不要把约 0.5MB/min 的有损估计用于 FLAC。
- **公开边界**：只有 scope 后引用的音频字节、播放快照和署名进入发布。检查数据（所有 marker 名、各 part）仍在作者机。原谱、SoundFont、临时 MIDI、local 代码与作者文件路径不发布。check 的诊断可以含作者谱名/marker，不能把诊断整包附进公开站点。
- **check**：本机检查不下载 SoundFont，不渲染，不付费。输出每份引用谱的时长/声部/marker。未知 marker 在本机检查可用时为编译 error；缺 Alda 只 warning，并继续结构检查。连续区间剩余乐长比 hold 总长少超过 5s 且不足 75%，报提前静音；周期 <8s、播放 ≥30s 且 ≥4轮报重复提醒。按 hold 测量，旁白等待的额外时间不计入确定锚点。

## 新字段流向与 F 合并范围

| 字段 / API | 写入 → 只读存储 → 消费 |
| --- | --- |
| `LocalCompiler.inspect(input,{directory})` | 插件用 Alda parse 生成 LocalResourceInfo → 作者机 .joplo/resources/*.info.json → 第二次同步 compile |
| `CompileOptions.resourceInfo` / `ctx.resourceInfo(id)` | 本机宿主按请求 ID 提供 → 所属插件只读查询 → 校验 marker 并生成数字媒体命令；不自动入 IR |
| `MusicOptions.from` | 作者标记名 → effect 借 inspection 校验 → 仅 `MediaCommand.offsetMs` 写入下一阶段 |
| `MediaCommand.offsetMs` | effect 毫秒起点 → frames 中 `offsetMs` / `startOffsetMs` → advanceMedia/mediaAt/useMedia → decodeAudioData + source.start(offset)；深链/跳步相同 |
| `startOffsetMs` | 初始 play 偏移 → 每步完整媒体快照（schema 校验） → 淡入按 offset-startOffset 计算，marker 很晚也不跳过淡入 |
| `LocalCompiler.timeoutMs` | 本机声明 → describe 返回有界超时（最多180s）→ 子进程超时与跨进程租约；其它编译器默认30s |
| `MediaEngine.startCapture/endCapture` | RecordStage 开始前解码所需音频 → 同一引擎轨道增益输出 MediaStream → Opus MediaRecorder → Node WebM packet mux；音频错了导出报错 |

与 F 冲突可能集中的文件：kit/plugin.ts（可选 inspect/resourceInfo/offset/timeout 类型）、core/plugins/compiler.ts（effect metadata 读取与 play 偏移）、core/schema.ts（startOffsetMs）、web/runtime/media.ts（generic decoder fallback、淡入起点、record tap）、web/runtime/useMedia.ts（返回 engine ref）、web/RenderApp.tsx（录制挂同一 hook）。不做跨章连续、继承或交叉淡化。`audio-media.ts` 与 `media-mux.ts` 是独立新模块；server export.ts 只在原录画路径增加音频捕获及 packet copy。

视频同步按同机浏览器开始录音的壁钟与创建录画页的时间定位，因此保留原视频录制的起始画面；没有宣称离线逐帧音视频采样锁定。当前录制接入的是媒体轨道（BGM），并未给旧的浏览器 Web Speech 旁白增加可录音能力。

## 本次实测（2026-11-09）

同机 Node 26 / Alda 2.4.8，ffmpeg ebur128 true-peak 测量；下表是**FLAC 文件本身，尚未乘播放器 volume / ducking**。原有两份示例的叙事、画面和谱子均未改动。未经人耳验证。

| 示例 / 曲名 | 秒 | FLAC bytes | LUFS-I | true peak dBFS |
| --- | ---: | ---: | ---: | ---: |
| button-40-years / chip | 5.455 | 489036 | -16.4 | -10.9 |
| button-40-years / desktop | 8.889 | 672565 | -17.3 | -5.6 |
| button-40-years / touch | 9.231 | 454089 | -16.5 | -5.9 |
| button-40-years / intent | 10.909 | 365839 | -17.6 | -11.4 |
| apple-journey / forest | 20.526 | 1122133 | -16.5 | -10.6 |
| apple-journey / eden | 22.500 | 799257 | -14.0 | -2.7 |
| apple-journey / newton | 12.500 | 873077 | -15.1 | -5.9 |
| apple-journey / snow | 18.571 | 1005532 | -14.6 | -2.8 |
| apple-journey / modern | 9.600 | 531892 | -17.2 | -3.2 |
| apple-journey / ending | 16.667 | 452460 | -16.5 | -9.8 |
| 临时钢琴 + GM 鼓谱 | 14.400 | 1024508 | -19.0 | -1.0 |

- 两个独立编译进程渲染鼓谱，SHA-256 都是 `678232b588892401590fa0676c52a94a3df77ef1b6e2b4e24edbe2027756e94d`。15 个钢琴音符、25 个打击乐音符，marker 为0 / 9600ms。
- 鼓谱循环解码635040帧（44100 × 14.4），左右端点差均0。接缝前后10ms RMS分别为左0.000161 / 0.103711、右0.000139 / 0.103615；末尾有谱面长和弦衰减，未把这种音乐结构声称为编码静音。FLAC 无损测试逐样本核对量化PCM，没有额外填充帧。非循环版本为646272帧，14.654694秒，保留约255ms的周期后尾音。
- 离线 `file://` Chromium 实播：播放、跳步、1.5× 时分析器非零，暂停为零。48kHz 浏览器解码 chip，261817帧、5.454521秒，重采样后端点差 `7.45e-6`。
- 使用实际视频导出链路得到 VP9 + Opus WebM，配乐约 -24.0 LUFS-I / -18.1dBFS true peak（包含 track volume 与场景淡入淡出；本次录制没有旁白轨，因此不当作“旁白下的混音电平差”）。原始曲子、最终配乐与旁白差值是三类不同测量。
- Safari/iOS 与 Firefox 依据文档核实支持，未在设备实播；未做人耳听审，未测旁白和配乐的最终人声间隔电平差；跨 CPU/JS 引擎字节一致性未验证。
