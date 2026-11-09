import { $, option, flow, free, eq, set, patch, narrate, hold, done, shot, not } from '@joplo-app/kit';
import { Button, TextInput, Textarea, PromptInput } from '@joplo-app/plugin-ui';
import { Canvas, camera } from '@joplo-app/plugin-content';
import { music } from '@joplo-app/plugin-alda';
import { eras } from '../../../facts';

const sent = (id: string) => free.click(id, set($.ui.sent, true));
const enter = (year: string, i: number) => [
  patch($.ui, { era: year, cursorX: 66 + i * 280, sent: false, menu: false, hint: false, handoff: false }),
  music.play(['chip', 'desktop', 'touch', 'intent'][i], { loop: true, fadeMs: 500, volume: .42 }),
  camera(), shot(), hold(4),
];
const sendButton = (id: string, className: string, text = '发送') =>
  <Button id={id} className={`send ${className}`} motion="the-same-send" motionMs={1500} when={not($.ui.handoff)}>{text}</Button>;

export default option({
  name: '一封跨越四十年的消息',
  idea: '一个连续的发送按钮，在四套可探索的界面间变形；观看与动手共享同一画面。',
  state: { ui: { era: '1984', cursorX: 66, sent: false, menu: false, hint: false, handoff: false }, inputs: { letter: '', mail: '', sms: '', prompt: '' } },
  free: {
    send84: sent('send84'), send95: sent('send95'), send07: sent('send07'), send24: sent('send24'),
    file84: free.click('file84', set($.ui.menu, true)), close84: free.click('close84', set($.ui.menu, false)),
    start95: free.click('start95', set($.ui.menu, true)), mail95: free.click('mail95', set($.ui.menu, false)),
    close95: free.click('close95', set($.ui.menu, false)),
    suggest24: free.click('suggest24', set($.inputs.prompt, '帮我把周六见面写成一封简短邀请。'), set($.ui.sent, false)),
    touchHint: free.hover('touch_hint', 450, set($.ui.hint, true)),
  },
  on: { '/': { story: <div className="film-shell" style={{ position: 'relative', width: '100%', height: 800 }}>
    <div className="film-window" style={{ position: 'absolute', left: 0, top: 80, width: 1280, height: 520 }}>
    <Canvas w={1280} h={520} view={[1280, 520]}>
    <div className="b40" style={{ position: 'absolute', inset: 0 }}>
      <section when={eq($.ui.era, '1984')} id="desktop84" className="desktop84 interface">
        <nav className="menu84"><span className="brand-mark">●</span><Button id="file84" className="plain84">文件</Button><span>编辑</span><span>信件</span><span className="menu-time">09:41</span></nav>
        <div id="paper84" className="paper84 mono-window">
          <div className="mono-title"><span>写给未来的一封信</span></div>
          <div className="address84">收件人：未来的我</div>
          <Textarea id="letter" className="letter84" aria-label="1984 信件正文" placeholder="想对未来说点什么？" minRows={3} />
          <div className="send-row">{sendButton('send84', 'send84')}<span id="receipt84" className="receipt84" when={$.ui.sent}>✓ 已寄出<span className="echo">{$.inputs.letter}</span></span></div>
        </div>
        <div className="popup84 mono-window" when={$.ui.menu}><strong>文件</strong><p>信件会留在本地体验中。</p><Button id="close84" className="plain84">返回信件</Button></div>
        <div className="desktop-note">点中它，命令才发生。</div>
      </section>

      <section when={eq($.ui.era, '1995')} id="desktop95" className="desktop95 interface">
        <div id="window95" className="win-window mail95">
          <div className="title95">信箱 / 新消息<span>— □</span></div>
          <div className="tools95">文件　编辑　查看　帮助</div>
          <div className="mail-body95"><div className="address95">致：未来的我</div>
            <Textarea id="mail" className="input95" aria-label="1995 邮件正文" placeholder="键入一封新邮件……" minRows={3} />
            <div className="send-row">{sendButton('send95', 'win-button')}<span id="receipt95" className="receipt95" when={$.ui.sent}>✓ 发件箱 +1<span className="echo">{$.inputs.mail}</span></span></div>
          </div>
        </div>
        <div className="start-menu95 win-window" when={$.ui.menu}><div className="start-stripe">DESKTOP / 95</div><div><Button id="mail95" className="menu-entry">信箱　　↗</Button><p>从开始菜单打开应用</p><Button id="close95" className="menu-entry">收起菜单</Button></div></div>
        <div className="taskbar95"><Button id="start95" className="win-button">● 开始</Button><div className="task-item95">信箱 · 新消息</div><span>09:41</span></div>
      </section>

      <section when={eq($.ui.era, '2007')} id="touch07" className="touch07 interface">
        <div className="touch-note"><div className="micro-label">POINTER → FINGER</div><p>指针，<span>变成了手指。</span></p><div id="touch_hint" className="touch-tip">悬停这里，或轻点一下 ↗</div><div when={$.ui.hint} className="touch-tooltip">给指腹留出空间。</div></div>
        <div id="handset07" className="handset07">
          <div className="speaker07" />
          <div id="phone_screen07" className="phone-screen07"><div className="status07">09:41<span>●●●　▰</span></div><div className="phone-title07">消息 / 未来的我</div>
            <div id="messages07" className="messages07"><div className="bubble07 incoming">二十三年后，<span>你还会给自己写信吗？</span></div><div className="bubble07 outgoing" when={$.ui.sent}>{$.inputs.sms}</div><div className="delivered07" when={$.ui.sent}>已发送 · 本地演示</div></div>
            <div id="composer07" className="composer07"><TextInput id="sms" aria-label="2007 短信正文" placeholder="写条消息" />{sendButton('send07', 'send07')}</div>
            <div className="keyboard-caption07">点输入框，用你的键盘试试。</div>
          </div><div className="home07" />
        </div>
      </section>

      <section when={eq($.ui.era, '2024')} id="ai24" className="ai24 interface">
        <div className="ai-top"><span className="ai-dot" /> 空白 / 对话<span className="demo-badge">预设演示 · 未连接模型</span></div>
        <div className="ai-conversation"><div className="ai-question" when={$.ui.sent}>{$.inputs.prompt}</div>
          <div className="ai-answer" when={$.ui.sent}><div className="micro-label">一份邀请草稿</div><p>周六见个面吧。<span>聊聊这些年，也聊聊接下来。</span></p><small>预设内容；不根据自由输入推理。</small></div>
          <div when={eq($.ui.sent, false)} className="ai-empty"><div className="spark24">✳</div><h3>这次，你可以交代意图。</h3><Button id="suggest24" className="suggest24">试试：帮我写一封邀请 ↗</Button></div>
        </div>
        <div id="composer24" className="ai-composer"><PromptInput id="prompt" placeholder="写下你想做的事……" />{sendButton('send24', 'send24', '↑')}</div>
        <div className="ai-foot">同样是发送，从执行命令，走到表达意图。</div>
      </section>

      <div when={$.ui.handoff} className="transfer-shade" />
      {eras.slice(0, 3).map(era => <div when={eq($.ui.era, era.year)}>
        <div when={$.ui.handoff} className={`carry carry-${era.year}`} motion="the-same-send" motionMs={1500}>发送</div>
      </div>)}
    </div>
    </Canvas></div>
    <div className="b40 film-chrome" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <header className="film-header"><h1>同一个按钮的 <span className="accent">40 年</span></h1><span>1984—2024</span></header>
      {eras.map((era, i) => <div when={eq($.ui.era, era.year)}>
        <div className="era-label"><span className="chapter-no">0{i + 1}</span><span className="year">{era.year}</span><h2>{era.label}</h2></div>
        <div className="fact-source">{['Apple / 1984 原始发布稿', 'Microsoft / Windows 95 周年回顾', 'Apple / 2007 发布稿', 'OpenAI / 2024 发布稿'][i]} · 风格化演绎</div>
      </div>)}
      <nav className="timeline" aria-label="年代时间轴" style={{ pointerEvents: 'auto' }}>
        <div className="timeline-top"><span>↔ 拖动游标，回到任何年代</span><span>随时点界面，暂停即上手</span></div>
        <div className="timeline-line" />
        {eras.map((era, i) => <div id={`year_${era.year}`} className="timeline-year" style={{ left: 40 + i * 280 }}><div className="timeline-dot" /><span>{era.year}</span></div>)}
        <Button id="scrubber" className="scrubber" style={{ position: 'absolute', left: $.ui.cursorX, top: 57 }} motion="time-cursor" motionMs={600}>↔ 拖动</Button>
      </nav>
      <div className="credits">视觉：system.css / 98.css / Devices.css · MIT　字体：IBM Plex Mono · OFL　原创配乐</div>
    </div>
  </div> } },
  scenarios: {
    mac: flow('1984 · 指向命令', { start: '/', actionEntry: 'after', cases: ['mac'], description: '同一个发送按钮，四十年的交互变化。' })
      .drag('scrubber', 'year_1984', '1984 · 鼠标指向命令', enter('1984', 0), narrate('同样是发一句话。先回到一九八四年，鼠标把命令放进了可见的窗口和菜单。'))
      .click('file84', '打开文件菜单', set($.ui.menu, true), hold(2))
      .click('close84', '回到信件', set($.ui.menu, false), hold(2))
      .type('letter', '未来的我，周六见。', '给未来写封信', camera('paper84', { pad: 26, zoom: 1.25 }), hold(3))
      .system('指向发送', '一条命令，有了位置', camera('send84', { pad: 100, zoom: 2.0, ms: 1100 }), hold(2))
      .click('send84', '点一下，信寄出了', set($.ui.sent, true), camera('send84', 'receipt84', { pad: 64, zoom: 1.7 }), narrate('先指向，再按下。屏幕上的按钮，让一条命令有了具体的位置。'), hold(5))
      .system('寄出', '按钮会变，发送还在', camera(), set($.ui.handoff, true), music.stop({ fadeMs: 700 }), done('第一站：指向命令'), hold(2)),
    desktop: flow('1995 · 找到应用', { from: 'mac', actionEntry: 'after', cases: ['desktop'], description: '从开始菜单找到信箱，再按下发送。' })
      .drag('scrubber', 'year_1995', '1995 · 按钮来到桌面', enter('1995', 1), narrate('十一年后，Windows 九十五带来了开始菜单和任务栏。同一个按钮，落进了更忙碌的桌面。'))
      .click('start95', '从开始菜单出发', set($.ui.menu, true), hold(3))
      .click('mail95', '打开信箱', set($.ui.menu, false), narrate('先找到应用，再找到动作。这个凸起的边框，像一颗等着被按下的实体开关。'), hold(3))
      .type('mail', '未来的我，周六见。', '键入同一句话', camera('window95', { pad: 26, zoom: 1.2 }), hold(3))
      .system('指向发送', '凸起的边框，邀请你按下', camera('send95', { pad: 100, zoom: 2.0, ms: 1100 }), hold(2))
      .click('send95', '消息进入发件箱', set($.ui.sent, true), camera('send95', 'receipt95', { pad: 64, zoom: 1.6 }), hold(4))
      .system('送达', '发件箱里多了一封信', camera(), set($.ui.handoff, true), music.stop({ fadeMs: 700 }), done('第二站：找到应用'), hold(2)),
    touch: flow('2007 · 直接触碰', { from: 'desktop', actionEntry: 'after', cases: ['touch'], description: '手指成为指针，消息装进口袋。' })
      .drag('scrubber', 'year_2007', '2007 · 按钮装进口袋', enter('2007', 2), narrate('二零零七年，iPhone 的发布把多点触摸带到人们眼前。现在，手指可以直接碰到内容。'))
      .hover('touch_hint', 450, '给手指留出空间', set($.ui.hint, true), hold(3))
      .type('sms', '未来的我，周六见。', '在手机上写下约定', camera('messages07', 'composer07', { pad: 44, zoom: 1.6 }), narrate('不再隔着鼠标。一句话从键盘进入口袋，发送键也长得更适合触碰。'), hold(3))
      .system('手指落下', '让手指直接碰到动作', camera('send07', { pad: 100, zoom: 2.0, ms: 1100 }), hold(2))
      .click('send07', '消息变成对话气泡', set($.ui.sent, true), camera('messages07', 'composer07', { pad: 44, zoom: 1.6 }), hold(4))
      .system('送达', '手指成为新的指针', camera(), set($.ui.handoff, true), music.stop({ fadeMs: 700 }), done('第三站：直接触碰'), hold(2)),
    intent: flow('2024 · 说出意图', { from: 'touch', actionEntry: 'after', cases: ['intent'], description: '发送的从一句消息，变成一个意图。' })
      .drag('scrubber', 'year_2024', '2024 · 按钮收到一个意图', enter('2024', 3), narrate('走到二零二四年的 AI 对话界面。我们仍然按发送，却可以把想做的事交代给它。'))
      .click('suggest24', '从一句请求开始', set($.inputs.prompt, '帮我把周六见面写成一封简短邀请。'), hold(3))
      .type('prompt', '帮我把周六见面写成一封简短邀请。', '这次输入的是意图', camera('composer24', { pad: 140, zoom: 1.35 }), hold(3))
      .system('指向发送', '同样的动作，不同的期待', camera('send24', { pad: 100, zoom: 2.0, ms: 1100 }), hold(2))
      .click('send24', '一份邀请草稿出现了', set($.ui.sent, true), camera('ai24', { pad: 12, zoom: 1.15 }), narrate('这是一份预设的演示草稿。它想说明的变化是：从告诉机器按哪个命令，到告诉它你希望完成什么。'), hold(5))
      .system('四十年', '按钮会变，表达的愿望还在', camera(), music.stop({ fadeMs: 900 }), narrate('四十年，同一个发送动作。现在暂停，写一句你自己的话，或者拖回一个熟悉的年代。'), done('回到任意年代，亲手试试'), hold(5)),
  },
});
