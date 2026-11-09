import { $, option, flow, free, eq, set, patch, narrate, hold, done, shot } from '@joplo-app/kit';
import { Button, TextInput, Textarea, PromptInput } from '@joplo-app/plugin-ui';
import { Canvas, camera } from '@joplo-app/plugin-content';
import { music } from '@joplo-app/plugin-alda';
import { eras } from '../../../facts';

const sent = (id: string) => free.click(id, set($.ui.sent, true));
const enter = (year: string, i: number) => [
  patch($.ui, { era: year, cursorX: 66 + i * 280, sent: false, menu: false, hint: false }),
  music.play(['chip', 'desktop', 'touch', 'intent'][i], { loop: true, fadeMs: 500, volume: .42 }),
  camera(), shot(), hold(4),
];
const sendButton = (id: string, className: string, text = '发送') =>
  <Button id={id} className={`send ${className}`} motion="the-same-send" motionMs={1300}>{text}</Button>;

export default option({
  name: '一封跨越四十年的消息',
  idea: '一个连续的发送按钮，在四套可探索的界面间变形；观看与动手共享同一画面。',
  state: { ui: { era: '1984', cursorX: 66, sent: false, menu: false, hint: false }, inputs: { letter: '', mail: '', sms: '', prompt: '' } },
  free: {
    send84: sent('send84'), send95: sent('send95'), send07: sent('send07'), send24: sent('send24'),
    file84: free.click('file84', set($.ui.menu, true)), close84: free.click('close84', set($.ui.menu, false)),
    start95: free.click('start95', set($.ui.menu, true)), mail95: free.click('mail95', set($.ui.menu, false)),
    close95: free.click('close95', set($.ui.menu, false)),
    suggest24: free.click('suggest24', set($.inputs.prompt, '帮我把周六见面写成一封简短邀请。'), set($.ui.sent, false)),
    touchHint: free.hover('touch_hint', 450, set($.ui.hint, true)),
  },
  on: { '/': { story: <Canvas w={1280} h={800}>
    <div className="b40" style={{ position: 'absolute', inset: 0 }}>
      <header className="film-header">
        <div className="kicker">AN INTERACTIVE SHORT / 1984—2024</div>
        <h1>同一个按钮的 <span className="accent">40 年</span></h1>
        <div className="episode-number">四种界面，一件小事。</div>
      </header>
      {eras.map((era, i) => <section when={eq($.ui.era, era.year)} className={`era era-${era.year}`}>
        <aside className="era-label">
          <div className="chapter-no">0{i + 1} / 04</div>
          <div className="year" motion="year-label">{era.year}</div>
          <h2>{era.label}</h2><p>{era.detail}</p>
          <div className="tiny-rule" />
          <p className="play-hint">播放时点击即可暂停探索。<span>继续 / 重置会回到剧本。</span></p>
        </aside>
        <footer className="fact-source">{era.source} · 风格化界面，非原系统复刻</footer>
      </section>)}

      <section when={eq($.ui.era, '1984')} className="desktop84 interface">
        <nav className="menu84"><span className="brand-mark">●</span><Button id="file84" className="plain84">文件</Button><span>编辑</span><span>信件</span><span className="menu-time">09:41</span></nav>
        <div className="paper84 mono-window">
          <div className="mono-title"><span>写给未来的一封信</span></div>
          <div className="address84">收件人：未来的我</div>
          <Textarea id="letter" className="letter84" aria-label="1984 信件正文" placeholder="想对未来说点什么？" minRows={3} />
          <div className="send-row">{sendButton('send84', 'send84')}<span className="receipt84" when={$.ui.sent}>✓ 已寄出<span className="echo">{$.inputs.letter}</span></span></div>
        </div>
        <div className="popup84 mono-window" when={$.ui.menu}><strong>文件</strong><p>信件会留在本地体验中。</p><Button id="close84" className="plain84">返回信件</Button></div>
        <div className="desktop-note">点中它，命令才发生。</div>
      </section>

      <section when={eq($.ui.era, '1995')} className="desktop95 interface">
        <div className="win-window mail95">
          <div className="title95">信箱 / 新消息<span>— □</span></div>
          <div className="tools95">文件　编辑　查看　帮助</div>
          <div className="mail-body95"><div className="address95">致：未来的我</div>
            <Textarea id="mail" className="input95" aria-label="1995 邮件正文" placeholder="键入一封新邮件……" minRows={3} />
            <div className="send-row">{sendButton('send95', 'win-button')}<span className="receipt95" when={$.ui.sent}>✓ 发件箱 +1<span className="echo">{$.inputs.mail}</span></span></div>
          </div>
        </div>
        <div className="start-menu95 win-window" when={$.ui.menu}><div className="start-stripe">DESKTOP / 95</div><div><Button id="mail95" className="menu-entry">信箱　　↗</Button><p>从开始菜单打开应用</p><Button id="close95" className="menu-entry">收起菜单</Button></div></div>
        <div className="taskbar95"><Button id="start95" className="win-button">● 开始</Button><div className="task-item95">信箱 · 新消息</div><span>09:41</span></div>
      </section>

      <section when={eq($.ui.era, '2007')} className="touch07 interface">
        <div className="touch-note"><div className="micro-label">POINTER → FINGER</div><p>指针，<span>变成了手指。</span></p><div id="touch_hint" className="touch-tip">悬停这里，或轻点一下 ↗</div><div when={$.ui.hint} className="touch-tooltip">按钮需要留出指腹的空间。<span>这是一条设计解读。</span></div></div>
        <div className="handset07">
          <div className="speaker07" />
          <div className="phone-screen07"><div className="status07">09:41<span>●●●　▰</span></div><div className="phone-title07">消息 / 未来的我</div>
            <div className="messages07"><div className="bubble07 incoming">二十三年后，<span>你还会给自己写信吗？</span></div><div className="bubble07 outgoing" when={$.ui.sent}>{$.inputs.sms}</div><div className="delivered07" when={$.ui.sent}>已发送 · 本地演示</div></div>
            <div className="composer07"><TextInput id="sms" aria-label="2007 短信正文" placeholder="写条消息" />{sendButton('send07', 'send07')}</div>
            <div className="keyboard-caption07">点输入框，用你的键盘试试。</div>
          </div><div className="home07" />
        </div>
      </section>

      <section when={eq($.ui.era, '2024')} className="ai24 interface">
        <div className="ai-top"><span className="ai-dot" /> 空白 / 对话<span className="demo-badge">预设演示 · 未连接模型</span></div>
        <div className="ai-conversation"><div className="ai-question" when={$.ui.sent}>{$.inputs.prompt}</div>
          <div className="ai-answer" when={$.ui.sent}><div className="micro-label">一份邀请草稿</div><p>周六见个面吧。<span>聊聊这些年，也聊聊接下来。</span></p><small>预设内容；不根据自由输入推理。</small></div>
          <div when={eq($.ui.sent, false)} className="ai-empty"><div className="spark24">✳</div><h3>这次，你可以交代意图。</h3><Button id="suggest24" className="suggest24">试试：帮我写一封邀请 ↗</Button></div>
        </div>
        <div className="ai-composer"><PromptInput id="prompt" placeholder="写下你想做的事……" />{sendButton('send24', 'send24', '↑')}</div>
        <div className="ai-foot">同样是发送，从执行命令，走到表达意图。</div>
      </section>

      <nav className="timeline" aria-label="年代时间轴">
        <div className="timeline-top"><span>拖动游标到任意年份</span><span>切换年代前会请你确认 · 也可按回车拖动</span></div>
        <div className="timeline-line" />
        {eras.map((era, i) => <div id={`year_${era.year}`} className="timeline-year" style={{ left: 40 + i * 280 }}><div className="timeline-dot" /><span>{era.year}</span></div>)}
        <Button id="scrubber" className="scrubber" style={{ position: 'absolute', left: $.ui.cursorX, top: 57 }} motion="time-cursor" motionMs={600}>↔ 拖动</Button>
      </nav>
      <div className="credits">视觉基元：system.css / 98.css · MIT　字体：IBM Plex Mono · OFL　原创 Alda 配乐</div>
    </div>
  </Canvas> } },
  scenarios: {
    mac: flow('1984 · 指向命令', { start: '/', actionEntry: 'after', cases: ['mac'], description: '同一个发送按钮，四十年的交互变化。' })
      .drag('scrubber', 'year_1984', '1984 · 鼠标指向命令', enter('1984', 0), narrate('同样是发一句话。先回到一九八四年，鼠标把命令放进了可见的窗口和菜单。'))
      .click('file84', '打开文件菜单', set($.ui.menu, true), hold(2))
      .click('close84', '回到信件', set($.ui.menu, false), hold(2))
      .type('letter', '未来的我，周六见。', '给未来写封信', hold(3))
      .click('send84', '点一下，信寄出了', set($.ui.sent, true), narrate('先指向，再按下。屏幕上的按钮，让一条命令有了具体的位置。'), hold(5))
      .system('寄出', '按钮会变，发送还在', music.stop({ fadeMs: 700 }), done('第一站：指向命令'), hold(2)),
    desktop: flow('1995 · 找到应用', { from: 'mac', actionEntry: 'after', cases: ['desktop'], description: '从开始菜单找到信箱，再按下发送。' })
      .drag('scrubber', 'year_1995', '1995 · 按钮来到桌面', enter('1995', 1), narrate('十一年后，Windows 九十五带来了开始菜单和任务栏。同一个按钮，落进了更忙碌的桌面。'))
      .click('start95', '从开始菜单出发', set($.ui.menu, true), hold(3))
      .click('mail95', '打开信箱', set($.ui.menu, false), narrate('先找到应用，再找到动作。这个凸起的边框，像一颗等着被按下的实体开关。'), hold(3))
      .type('mail', '未来的我，周六见。', '键入同一句话', hold(3))
      .click('send95', '消息进入发件箱', set($.ui.sent, true), hold(4))
      .system('送达', '发件箱里多了一封信', music.stop({ fadeMs: 700 }), done('第二站：找到应用'), hold(2)),
    touch: flow('2007 · 直接触碰', { from: 'desktop', actionEntry: 'after', cases: ['touch'], description: '手指成为指针，消息装进口袋。' })
      .drag('scrubber', 'year_2007', '2007 · 按钮装进口袋', enter('2007', 2), narrate('二零零七年，iPhone 的发布把多点触摸带到人们眼前。现在，手指可以直接碰到内容。'))
      .hover('touch_hint', 450, '给手指留出空间', set($.ui.hint, true), hold(3))
      .type('sms', '未来的我，周六见。', '在手机上写下约定', narrate('不再隔着鼠标。一句话从键盘进入口袋，发送键也长得更适合触碰。'), hold(3))
      .click('send07', '消息变成对话气泡', set($.ui.sent, true), hold(4))
      .system('送达', '手指成为新的指针', music.stop({ fadeMs: 700 }), done('第三站：直接触碰'), hold(2)),
    intent: flow('2024 · 说出意图', { from: 'touch', actionEntry: 'after', cases: ['intent'], description: '发送的从一句消息，变成一个意图。' })
      .drag('scrubber', 'year_2024', '2024 · 按钮收到一个意图', enter('2024', 3), narrate('走到二零二四年的 AI 对话界面。我们仍然按发送，却可以把想做的事交代给它。'))
      .click('suggest24', '从一句请求开始', set($.inputs.prompt, '帮我把周六见面写成一封简短邀请。'), hold(3))
      .type('prompt', '帮我把周六见面写成一封简短邀请。', '这次输入的是意图', hold(3))
      .click('send24', '一份邀请草稿出现了', set($.ui.sent, true), narrate('这是一份预设的演示草稿。它想说明的变化是：从告诉机器按哪个命令，到告诉它你希望完成什么。'), hold(5))
      .system('四十年', '按钮会变，表达的愿望还在', music.stop({ fadeMs: 900 }), narrate('四十年，同一个发送动作。现在暂停，写一句你自己的话，或者拖回一个熟悉的年代。'), done('回到任意年代，亲手试试'), hold(5)),
  },
});
