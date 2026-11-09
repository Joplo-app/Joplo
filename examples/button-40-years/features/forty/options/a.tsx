import { $, option, flow, free, eq, set, patch, narrate, hold, done, not, stream } from '@joplo-app/kit';
import { Button, TextInput, Textarea, PromptInput } from '@joplo-app/plugin-ui';
import { Canvas, camera } from '@joplo-app/plugin-content';
import { music } from '@joplo-app/plugin-alda';
import { eras } from '../../../facts';

/*
 * 一个镜头讲完四十年：四个年代的发送按钮都落在同一个世界坐标（.lens 所在的位置）。
 * 每章结尾镜头推进到按钮占满画面（穿过按钮）；下一章第一步在按钮遮住画面时换年代——旧界面 exit、新界面 enter、
 * 按钮用同一个 motion 键变形——镜头同时缓慢拉开，露出新界面。下一年代的配乐在推进时就先淡入（J-cut）。
 */
const scores = ['chip', 'desktop', 'touch', 'intent'] as const;
const sent = (id: string) => free.click(id, set($.ui.sent, true));
const arrive = (i: number) => patch($.ui, { era: eras[i]!.year, cursorX: 66 + i * 280, sent: false, menu: false, hint: false, kbd: false });
/** 推进穿过发送按钮；下一年代的音乐在这一刻先进来，与旧曲交叉。 */
const throughTheButton = (next: number) => [
  camera('lens', { pad: 0, zoom: 9, ms: 1800, drift: 1.03 }),
  music.play(scores[next]!, { loop: true, fadeMs: 2600, volume: .42 }),
];
/** 四个年代的发送按钮共用一个 motion 键：换年代时从上一颗按钮的大小变形过来（中心都在 .lens 上）。 */
const sendButton = (id: string, className: string, text = '发送', when?: unknown) =>
  <Button id={id} className={`send ${className}`} motion="the-same-send" {...(when === undefined ? {} : { when, enter: 'shrink', enterMs: 600 })}>{text}</Button>;

export default option({
  name: '一封跨越四十年的消息',
  idea: '一个镜头讲完四十年：观众始终盯着同一个发送按钮，年代在它身边换掉；暂停即可上手每个年代的界面。',
  state: { ui: { era: '1984', cursorX: 66, sent: false, menu: false, hint: false, kbd: false, open: false, draft: '' }, inputs: { letter: '', mail: '', sms: '', prompt: '' } },
  free: {
    send84: sent('send84'), send95: sent('send95'), send07: sent('send07'), send24: sent('send24'),
    file84: free.click('file84', set($.ui.menu, true)), close84: free.click('close84', set($.ui.menu, false)),
    start95: free.click('start95', set($.ui.menu, true)), mail95: free.click('mail95', set($.ui.menu, false)),
    close95: free.click('close95', set($.ui.menu, false)),
    suggest24: free.click('suggest24', set($.inputs.prompt, '帮我把周六见面写成一封简短邀请。'), set($.ui.sent, false)),
    touchHint: free.hover('touch_hint', 450, set($.ui.hint, true)),
  },
  on: { '/': { story: <div className="film-shell" style={{ position: 'relative', width: '100%', height: 800 }}>
    <Canvas w={1280} h={800} view={[1280, 800]} safe={[86, 0, 196, 0]} drift={{ zoom: 1.08, ms: 6000 }}>
    <div className="b40 world" style={{ position: 'absolute', inset: 0 }}>
      <section when={eq($.ui.era, '1984')} id="desktop84" className="desktop84 interface" enter="fade" enterMs={900} exit="fade" exitMs={900}>
        <nav className="menu84"><span className="brand-mark">●</span><Button id="file84" className="plain84">文件</Button><span>编辑</span><span>信件</span><span className="menu-time">09:41</span></nav>
        <div id="paper84" className="paper84 mono-window" when={$.ui.open} enter="shrink" enterMs={700}>
          <div className="mono-title"><span>写给未来的一封信</span></div>
          <div className="address84">收件人：未来的我<span className="caret84" /></div>
          <Textarea id="letter" className="letter84" aria-label="1984 信件正文" placeholder="想对未来说点什么？" minRows={2} />
          <span id="receipt84" className="receipt receipt84" when={$.ui.sent} enter="wipe" enterMs={500}>✓ 已寄出<span className="echo">{$.inputs.letter}</span></span>
        </div>
        <div id="popup84" className="popup84 mono-window" when={$.ui.menu} exit="fade" exitMs={200}><strong>文件</strong><p>信件会留在本地体验中。</p><Button id="close84" className="plain84">返回信件</Button></div>
        {sendButton('send84', 'send84', '发送', $.ui.open)}
      </section>

      <section when={eq($.ui.era, '1995')} id="desktop95" className="desktop95 interface" enter="fade" enterMs={900} exit="fade" exitMs={900}>
        <div id="window95" className="win-window mail95">
          <div className="title95">信箱 / 新消息<span>— □</span></div>
          <div className="tools95">文件　编辑　查看　帮助</div>
          <div className="mail-body95"><div className="address95">致：未来的我</div>
            <Textarea id="mail" className="input95" aria-label="1995 邮件正文" placeholder="键入一封新邮件……" minRows={2} />
            <span id="receipt95" className="receipt receipt95" when={$.ui.sent} enter="rise" enterMs={450}>✓ 发件箱 +1<span className="echo">{$.inputs.mail}</span></span>
          </div>
        </div>
        {sendButton('send95', 'win-button send95')}
        <div id="start_menu95" className="start-menu95 win-window" when={$.ui.menu} enter="rise" enterMs={380} exit="rise" exitMs={260}><div className="start-stripe">DESKTOP / 95</div><div><Button id="mail95" className="menu-entry">信箱　　↗</Button><p>从开始菜单打开应用</p><Button id="close95" className="menu-entry">收起菜单</Button></div></div>
        <div id="taskbar95" className="taskbar95"><Button id="start95" className="win-button start95">● 开始</Button><div className="task-item95">信箱 · 新消息</div><span>09:41</span></div>
      </section>

      <section when={eq($.ui.era, '2007')} id="touch07" className="touch07 interface" enter="fade" enterMs={900} exit="fade" exitMs={900}>
        <div id="touch_hint" className="touch-tip">悬停这里，或轻点一下 ↗</div>
        <div when={$.ui.hint} id="touch_tooltip" className="touch-tooltip" enter="rise" enterMs={350}>给指腹留出空间：按钮至少一指宽。</div>
        <div id="handset07" className="handset07">
          <div className="speaker07" />
          <div id="phone_screen07" className="phone-screen07"><div className="status07">09:41<span>●●●　▰</span></div><div className="phone-title07">消息 / 未来的我</div>
            <div id="messages07" className="messages07"><div className="bubble07 incoming">二十三年后，<span>你还会给自己写信吗？</span></div><div className="bubble07 outgoing" when={$.ui.sent} enter="shrink" enterMs={420}>{$.inputs.sms}</div><div className="delivered07" when={$.ui.sent} enter="fade" enterDelay={300}>已发送 · 本地演示</div></div>
            <div id="composer07" className="composer07"><TextInput id="sms" aria-label="2007 短信正文" placeholder="写条消息" /></div>
            <div id="keyboard07" className="keyboard07" when={$.ui.kbd} enter="rise" enterMs={420}>{['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map(row => <div className="keys07">{row.split('').map(k => <span>{k}</span>)}</div>)}<div className="keys07"><span className="wide07">123</span><span className="space07">空格</span><span className="wide07">换行</span></div></div>
          </div><div className="home07" />
        </div>
        {sendButton('send07', 'send07')}
      </section>

      <section when={eq($.ui.era, '2024')} id="ai24" className="ai24 interface" enter="fade" enterMs={900} exit="fade" exitMs={900}>
        <div className="ai-top"><span className="ai-dot" /> 空白 / 对话<span className="demo-badge">预设演示 · 未连接模型</span></div>
        <div id="conversation24" className="ai-conversation">
          <div className="ai-question" when={$.ui.sent} enter="rise" enterMs={400}>{$.inputs.prompt}</div>
          <div className="ai-answer" when={$.ui.sent} enter="fade" enterDelay={250}><div className="micro-label">一份邀请草稿 · 预设内容</div><p>{$.ui.draft}</p></div>
          <div when={eq($.ui.sent, false)} className="ai-empty" exit="fade" exitMs={250}><div className="spark24">✳</div><h3>这次，你可以交代意图。</h3><Button id="suggest24" className="suggest24">试试：帮我写一封邀请 ↗</Button></div>
        </div>
        <div id="composer24" className="ai-composer"><PromptInput id="prompt" placeholder="写下你想做的事……" unmodeled /></div>
        {sendButton('send24', 'send24', '↑')}
        <div className="ai-foot">草稿是预设内容，不根据自由输入推理。</div>
      </section>
      <div id="lens" className="lens" />
    </div>
    <div screen className="b40 chrome">
      <header className="film-header"><h1>同一个按钮的 <span className="accent">40 年</span></h1><span>1984—2024</span></header>
      {eras.map((era, i) => <div when={eq($.ui.era, era.year)} className="era-label" enter="rise" enterMs={700} exit="fade" exitMs={500}>
        <span className="chapter-no">0{i + 1}</span><span className="year">{era.year}</span><h2>{era.label}</h2>
      </div>)}
      {eras.map((era, i) => <div when={eq($.ui.era, era.year)} className="fact-source" enter="fade" exit="fade">{['Apple / 1984 原始发布稿', 'Microsoft / Windows 95 周年回顾', 'Apple / 2007 发布稿', 'OpenAI / 2024 发布稿'][i]} · 风格化演绎</div>)}
      <nav className="timeline" aria-label="年代时间轴">
        <div className="timeline-top"><span>↔ 拖动游标，回到任何年代</span><span>随时点界面，暂停即上手</span></div>
        <div className="timeline-line" />
        {eras.map((era, i) => <div id={`year_${era.year}`} className="timeline-year" style={{ left: 40 + i * 280 }}><div className="timeline-dot" /><span>{era.year}</span></div>)}
        <Button id="scrubber" className="scrubber" style={{ position: 'absolute', left: $.ui.cursorX, top: 57 }} motion="time-cursor" motionMs={1400}>↔ 拖动</Button>
      </nav>
      <div className="credits">视觉：system.css / 98.css / Devices.css · MIT　字体：IBM Plex Mono · OFL　原创配乐</div>
    </div>
    </Canvas>
  </div> } },
  scenarios: {
    mac: flow('1984 · 指向命令', { start: '/', actionEntry: 'after', cases: ['mac'], description: '同一个发送按钮，四十年的交互变化。' })
      .drag('scrubber', 'year_1984', '1984 · 鼠标指向命令', arrive(0), set($.ui.open, true), music.play('chip', { loop: true, fadeMs: 1200, volume: .42 }), camera('paper84', { pad: 60, ms: 2200 }), narrate('一九八四年，鼠标把命令放进了屏幕。'), hold(2.5))
      .click('file84', '打开文件菜单', set($.ui.menu, true), camera('popup84', 'paper84', { pad: 30, ms: 1100 }), hold(1.6))
      .click('close84', '回到信件', set($.ui.menu, false), camera('paper84', { pad: 40, ms: 1000 }), hold(1.2))
      .type('letter', '未来的我，周六见。', '给未来写封信', camera('letter', 'send84', { pad: 40, zoom: 1.7, ms: 1400 }), narrate('先指向，再按下。'), hold(1.5))
      .click('send84', '点一下，信寄出了', set($.ui.sent, true), camera('receipt84', 'send84', { pad: 50, zoom: 2.2, ms: 1100 }), narrate('屏幕上的按钮，让命令有了位置。'), hold(2))
      .system('穿过按钮', '按钮会变，发送还在', ...throughTheButton(1), done('第一站：指向命令'), hold(1.2)),
    desktop: flow('1995 · 找到应用', { from: 'mac', actionEntry: 'after', cases: ['desktop'], description: '从开始菜单找到信箱，再按下发送。' })
      .drag('scrubber', 'year_1995', '1995 · 按钮来到桌面', arrive(1), camera('window95', { pad: 30, ms: 2600 }), narrate('十一年后，按钮落进了更忙碌的桌面。'), hold(2.6))
      .click('start95', '从开始菜单出发', set($.ui.menu, true), camera('start_menu95', 'taskbar95', 'window95', { pad: 10, ms: 1200 }), hold(1.6))
      .click('mail95', '打开信箱', set($.ui.menu, false), camera('window95', { pad: 30, ms: 1100 }), narrate('先找到应用，再找到动作。'), hold(1.5))
      .type('mail', '未来的我，周六见。', '键入同一句话', camera('mail', 'send95', { pad: 40, zoom: 1.7, ms: 1300 }), hold(1.2))
      .click('send95', '消息进入发件箱', set($.ui.sent, true), camera('receipt95', 'send95', { pad: 50, zoom: 2.2, ms: 1100 }), narrate('凸起的边框，像一颗等着被按下的开关。'), hold(2))
      .system('穿过按钮', '发件箱里多了一封信', ...throughTheButton(2), done('第二站：找到应用'), hold(1.2)),
    touch: flow('2007 · 直接触碰', { from: 'desktop', actionEntry: 'after', cases: ['touch'], description: '手指成为指针，消息装进口袋。' })
      .drag('scrubber', 'year_2007', '2007 · 按钮装进口袋', arrive(2), camera('handset07', { pad: 40, ms: 2600 }), narrate('二零零七年，手指可以直接碰到内容。'), hold(2.6))
      .hover('touch_hint', 450, '给手指留出空间', set($.ui.hint, true), camera('touch_tooltip', 'handset07', { pad: 30, ms: 1200 }), hold(1.6))
      .system('键盘升起', '轻点输入框，键盘升起', set($.ui.kbd, true), camera('phone_screen07', { pad: 30, ms: 1100 }), hold(1.2))
      .type('sms', '未来的我，周六见。', '在手机上写下约定', camera('composer07', 'keyboard07', 'send07', { pad: 30, zoom: 2, ms: 1100 }), narrate('不再隔着鼠标。'), hold(1.2))
      .click('send07', '消息变成对话气泡', set($.ui.sent, true), camera('messages07', 'send07', { pad: 30, ms: 1100 }), narrate('一句话，从指尖装进了口袋。'), hold(2))
      .system('穿过按钮', '手指成为新的指针', ...throughTheButton(3), done('第三站：直接触碰'), hold(1.2)),
    intent: flow('2024 · 说出意图', { from: 'touch', actionEntry: 'after', cases: ['intent'], description: '发送的从一句消息，变成一个意图。' })
      .drag('scrubber', 'year_2024', '2024 · 按钮收到一个意图', arrive(3), set($.ui.draft, ''), camera('ai24', { pad: 20, ms: 2600 }), narrate('走到二零二四年。我们仍然按发送。'), hold(2.6))
      .click('suggest24', '从一句请求开始', set($.inputs.prompt, '帮我把周六见面写成一封简短邀请。'), camera('composer24', 'send24', { pad: 70, zoom: 1.6, ms: 1200 }), narrate('但这一次，交代的是意图。'), hold(1.5))
      .click('send24', '一份邀请草稿出现了', set($.ui.sent, true), stream($.ui.draft, '周六见个面吧。聊聊这些年，也聊聊接下来。'), camera('conversation24', 'composer24', { pad: 20, ms: 1200 }), narrate('这是一份预设的演示草稿，不连接模型。'), hold(2.5))
      .system('四十年', '按钮会变，表达的愿望还在', camera({ ms: 2600, drift: { zoom: 1.03, ms: 9000 } }), music.stop({ fadeMs: 5000 }), narrate('四十年，同一个发送动作。现在暂停，写一句你自己的话。'), done('回到任意年代，亲手试试'), hold(4)),
  },
});
