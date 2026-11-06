# 网页多语言

`en.ts` 是共用词典唯一源，包含 `player`（播放控件、字幕、通知）、`stage`（渲染器默认文字、内置主题名称）、`site`（观众侧首页、嵌入模式 `?embed=1` 与评审模式 `?embed=1&review=1`）。`board/en.ts` 是创作侧唯一源，包含看板、检查器、外观、导出状态。发布站禁止运行时导入 `board/`；DemoController 的创作侧通知通过 type-only schema + `reference` 保存消息键，发布站不带这些文案。

当前源词典共 **524 个叶子键**：player 144（其中 4 个是 D61 场景封面 `cover*`）、stage 50、site 29（其中 9 个是发布站嵌入模式 `embed*`，2 个是评审模式 `reviewPick*`）、board 301（包括数字／列表格式化函数；其中 13 个是 D66 导出组件的安装卡 `exportSetup*` 等）。

十种语言均有完整的共用与 board 词典，通过两个 `dictionaries.ts` 注册。没有英文回退或新增运行时依赖，数字、列表和复数按各自 locale 格式化。

## 增加语言或文案

- 增加语言：在 `locale.ts` 注册 BCP-47 标签和母语名，增加与英文结构相同的词典工厂，再注册两个 `dictionaries.ts` 的工厂。用 `defineDictionary<Dictionary>()` / `defineDictionary<BoardDictionary>()` 定义翻译；缺键、多键、插值参数类型或数量不同都会 typecheck 失败。
- 增加文案：先在对应英文命名空间增加有意义的键，再补中文原文和其他语言。带参数的完整句子使用函数，避免在组件里拼接句子。纯模型最后一个参数接收词典；组件使用 `useI18n` / `useBoardI18n`。
- 数字、列表使用 `number` / `list`；复数使用 `plural`，按 `Intl.PluralRules` 返回的 CLDR 类别提供形式。俄语需要 `one/few/many/other`，不可只判断是否为 1。
- 放入状态的通知使用 `m` / `reference` 保存 `{ ns, key, args }`；flash 使用 `<LocalText value={消息引用} />`。不要把 `t.xxx` 的结果存入 state，嵌套参数中的外观名称同样必须是消息引用。
- 翻译时保留参数名、顺序和类型，翻译完整句子；不翻译 Joplo、组件名、命令、路径、IR 作者内容。文案长度尽量接近英文；新增语言必须运行长文案布局测试。`systemPrefix` / `transitionPrefix` 的 ` · ` 是时间线修饰；`fontSample` 是字体预览样本；`board.english` 仅用于空舞台时请求字体的样本文字。内置字体 Marker Gothic / WenKai 的中文显示名沿用 D56。

## 语言与导出的数据流

1. 用户点 `player/LanguageMenu.tsx` → Provider `setLocale` → 内存状态立即更新，并尝试写 `localStorage['joplo.locale']` → 下次启动 `initialLocale` 通过 `readLocale` 读取 → `resolveLocale` 优先手动选择，再按 `navigator.languages` 匹配，最后 `en` → Provider、纯模型、`html.lang` 和界面字体消费。存储异常只影响记忆，不影响当前使用。
2. 看板图片：`board/App.tsx` → `exportImage` 的请求体 `{ scenarioId, position, theme, font, stroke, locale }` → `POST /__joplo/p/:id/export/image`。视频：相同当前 locale 经 `useVideoExport.start(..., locale)` → `startVideo` → `POST .../export/video`。前端单测验证两个请求体。
3. `packages/server/src/export.ts` 的 `parseRequest` 用服务端 `locale.ts` 的十种精确标签校验 `body.locale`（缺省或非法值忽略），存入本次导出 `look.locale`，传入 `ExportHub.image` / `startVideo`；图片选项与视频任务闭包保留它，`renderUrl` 生成截图和录制 URL 时增加 `locale`。不保存用户偏好到服务端。
4. RenderApp URL：`?render=1&...&locale=zh-CN` → `src/main.tsx` 读取 `locale` 参数并传入 Provider `explicit` → `initialLocale` 优先于 storage / 浏览器规则 → RenderApp、RecordStage、Stage、Subtitle、渲染器默认文字消费。空值、不支持的标签回退到 storage / 浏览器 / en；不写回 storage。独立截图：`RenderOptions.locale` → `renderStep` → `renderQuery` 校验并转发 → 同一个 RenderApp / Provider。

## 验证

`pnpm --filter @joplo-app/web typecheck`、`pnpm test`、`pnpm --filter @joplo-app/web build`。I1 守卫扫描源码的 CJK 字符；语言原生名有明确例外，作者 CJK 字宽判断使用数字码点，无需白名单。构建检查发布站产物不包含创作侧英文标记文案。无新增 e2e 测试。

## 自动界面文字的 IR 契约

- `core/compile.ts` 在作者没有字幕时写必填英文 `caption`；click/type/select/toggle/back/press 同时写 `captionAuto: { kind, label, value?, keys? }`（schema 严格校验）。event 名称、card 标题和作者显式字幕保持原文，不写自动元数据。dev 与 publish IR 均保留这些字段 → 编译载荷或发布站内联 JSON → 网页唯一入口 `stepCaption(step, t)` → 字幕区、时间线与步骤菜单、out_of_order 通知、系统提示、播放停留时长。步骤选取记录的 label 保持英文；通知与检查器通过 `selectionLabel` 找回步骤，再调用 `stepCaption(step, m)` 延迟翻译。通知用 deferred `m` 保存引用，切换语言后重译；停留时长使用控制器当前词典。CLI / check / selection / Agent 继续使用英文 `caption`（作者内容保留）。
- `mock: { label, outcome, auto?: true }`：compile 只在未写 mock 时标记 auto 并写英文 label → dev / publish IR → `mockLabel` 按当前语言解析自动结果；作者标签保留。
- 推导的 missing 覆盖不再有 reason → dev IR coverage.basis → 情况卡片与缺口提示复用 `thisCaseIsNotCoveredYet`；作者 declared reason 保留。
- `explainClick` 在未写 disabledReason 时返回 null → DemoController 保存默认原因消息引用 → 网页按当前语言解析；作者原因保留。
- 发布 HTML 的 title 正则替换为转义的 `项目名 · Joplo`；SiteApp 运行时用当前词典补充 Concept prototype 的含义。
- T2 CJK 白名单仅余 `server/src/page-report.js` 的字体探针（测试空舞台的字形就绪，不显示为界面文字）。

## 核心术语（T34）

下表是各语言词典的统一用语；按钮允许采用相同词根的动词或短形式。作者内容、kit API 组件名、Joplo、命令和按键名保持原文。

| 概念 | zh-TW | ja | ko | es | fr | de | pt-BR | ru |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| board | 看板 | ボード | 보드 | tablero | tableau | Board | quadro | доска |
| feature | 功能 | 機能 | 기능 | función | fonctionnalité | Funktion | recurso | функция |
| option | 方案 | 案 | 안 | opción | option | Variante | opção | вариант |
| case | 情況 | ケース | 케이스 | caso | cas | Fall | caso | случай |
| scenario | 情境 | シナリオ | 시나리오 | escenario | scénario | Szenario | cenário | сценарий |
| step | 步驟 | ステップ | 단계 | paso | étape | Schritt | etapa | шаг |
| layer | 圖層 | レイヤー | 레이어 | capa | calque | Ebene | camada | слой |
| director | 導演 | ディレクター | 디렉터 | director | réalisation | Regie | diretor | режиссёр |
| caption | 字幕 | 字幕 | 자막 | subtítulo | sous-titre | Untertitel | legenda | субтитр |
| gap | 缺口 | 不足 | 공백 | carencia | manque | Lücke | lacuna | пробел |
| project | 專案 | プロジェクト | 프로젝트 | proyecto | projet | Projekt | projeto | проект |
| route | 路徑 | ルート | 경로 | ruta | route | Route | rota | маршрут |
| page | 頁面 | ページ | 페이지 | página | page | Seite | página | страница |
| stage | 舞台 | ステージ | 스테이지 | escenario visual | scène | Bühne | palco | сцена |
| shot | 鏡頭 | ショット | 샷 | encuadre | cadrage | Ausschnitt | enquadramento | кадр |
| mock | 模擬 | 模擬 | 모의 | simulación | simulation | Simulation | simulação | имитация |
| picked option | 已選方案 | 採用案 | 채택한 안 | opción elegida | option retenue | gewählte Variante | opção escolhida | выбранный вариант |
| covered | 已涵蓋 | 対応済み | 반영됨 | cubierto | couvert | abgedeckt | coberto | охвачено |
| missing | 缺少 | 未対応 | 누락 | sin cubrir | manquant | fehlt | ausente | отсутствует |
| undecided | 待決定 | 未決定 | 미정 | por decidir | à décider | unentschieden | a decidir | не решено |

`zh-TW` 採台灣用語（設定、檔案、預設、影片、連結、程式碼、專案、情境）。英文檢查器只顯示組件 API 名，其他語言由各自詞典的 `componentTypeName` 決定括號與間距。複數：zh-TW / ja / ko 僅 other，fr / es / pt-BR / de 為 one / other，ru 為 one / few / many / other。


T34 验证补充：`i18n-translations.test.ts` 检查所有非英文叶子值和函数输出、所有插值与复数类别。显式例外共 47 个键，按语言限定，仅包含数字／列表／标点格式、字体品牌与样本、Space 按键和法语／西班牙语／德语等与英文同形的正确词语；西语 `1 error` 单独限定，不能掩盖复数漏翻。白名单有过期检查。`i18n-layout.test.tsx` 使用十种真实词典跑 1280×800 和 1440×900 的顶栏、播放坞、全屏控件、左栏空间预算与静态渲染的 nowrap / truncate 约定。Vitest 现在同时收集 `.test.ts` 和 `.test.tsx`。布局验证沿用项目的字宽估算，不含新增浏览器或 e2e 测试。
