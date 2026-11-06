# 网页多语言

`en.ts` 是共用词典唯一源，包含 `player`（播放控件、字幕、通知）、`stage`（渲染器默认文字、内置主题名称）、`site`（观众侧首页）。`board/en.ts` 是创作侧唯一源，包含看板、检查器、外观、导出状态。发布站禁止运行时导入 `board/`；DemoController 的创作侧通知通过 type-only schema + `reference` 保存消息键，发布站不带这些文案。

当前源词典共 **463 个叶子键**：player 121、stage 41、site 17、board 284（包括数字／列表格式化函数）。

目前 `zh-CN.ts` 与 `board/zh-CN.ts` 保留原中文；`dictionaries.ts`、`board/dictionaries.ts` 中其余八种语言标有 `TODO(T3)`，暂用英文，并按实际 locale 格式化数字。没有新增运行时依赖。

## 增加语言或文案

- 增加语言：在 `locale.ts` 注册 BCP-47 标签和母语名，增加与英文结构相同的词典工厂，再注册两个 `dictionaries.ts` 的工厂。用 `defineDictionary<Dictionary>()` / `defineDictionary<BoardDictionary>()` 定义翻译；缺键、多键、插值参数类型或数量不同都会 typecheck 失败。
- 增加文案：先在对应英文命名空间增加有意义的键，再补中文原文和其他语言。带参数的完整句子使用函数，避免在组件里拼接句子。纯模型最后一个参数接收词典；组件使用 `useI18n` / `useBoardI18n`。
- 数字、列表使用 `number` / `list`；复数使用 `plural`，按 `Intl.PluralRules` 返回的 CLDR 类别提供形式。俄语需要 `one/few/many/other`，不可只判断是否为 1。
- 放入状态的通知使用 `m` / `reference` 保存 `{ ns, key, args }`；flash 使用 `<LocalText value={消息引用} />`。不要把 `t.xxx` 的结果存入 state，嵌套参数中的外观名称同样必须是消息引用。
- T3：保留参数名、顺序和类型，翻译完整句子；不翻译 Joplo、组件名、命令、路径、IR 作者内容。文案长度尽量接近英文；新增语言必须运行长文案布局测试。`systemPrefix` / `transitionPrefix` 的 ` · ` 是时间线修饰；`fontSample` 是字体预览样本；`board.english` 仅用于空舞台时请求字体的样本文字。内置字体 Marker Gothic / WenKai 的中文显示名沿用 D56。

## 语言与导出的数据流（T4）

1. 用户点 `player/LanguageMenu.tsx` → Provider `setLocale` → 内存状态立即更新，并尝试写 `localStorage['joplo.locale']` → 下次启动 `initialLocale` 通过 `readLocale` 读取 → `resolveLocale` 优先手动选择，再按 `navigator.languages` 匹配，最后 `en` → Provider、纯模型、`html.lang` 和界面字体消费。存储异常只影响记忆，不影响当前使用。
2. 看板图片：`board/App.tsx` → `exportImage` 的请求体 `{ scenarioId, position, theme, font, stroke, locale }` → `POST /__joplo/p/:id/export/image`。视频：相同当前 locale 经 `useVideoExport.start(..., locale)` → `startVideo` → `POST .../export/video`。前端单测验证两个请求体。
3. **待 T4 转发**：`packages/server/src/export.ts` 的 `parseRequest` 读取并校验 `body.locale`，传入 `ExportManager.image` / `startVideo`；它们在 `renderUrl` 生成图片页面和录制页面 URL 时增加 `locale`。目前服务端未实现这段；字段已发出但会被旧服务端忽略。
4. RenderApp URL：`?render=1&...&locale=zh-CN` → `src/main.tsx` 读取 `locale` 参数并传入 Provider `explicit` → `initialLocale` 优先于 storage / 浏览器规则 → RenderApp、RecordStage、Stage、Subtitle、渲染器默认文字消费。空值、不支持的标签回退到 storage / 浏览器 / en；不写回 storage。独立 `renderStep` 路径若支持 locale，T4 还应在 `packages/server/src/render.ts` 的 `renderQuery` 参数类型与 URLSearchParams 中转发。

## 验证

`pnpm --filter @joplo-app/web typecheck`、`pnpm test`、`pnpm --filter @joplo-app/web build`。I1 守卫扫描源码的 CJK 字符；语言原生名有明确例外，作者 CJK 字宽判断使用数字码点，无需白名单。构建检查发布站产物不包含创作侧英文标记文案。无新增 e2e 测试。
