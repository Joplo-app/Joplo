/**
 * 整支片子只有这一张画布（<Canvas>）：聊天窗、纸带、模型、概率条 / 抽签带、温度旋钮、计分板、四个问题标签。
 *
 * 写法（不算坐标）：
 * - 只摆几个容器（绝对定位，设计像素）；容器里用普通的 flex 排版。
 * - 同一个物件的每种“排法”写成一段静态 JSX，用 when 切换；同一个物件在各段里用同一个 motion 键，
 *   换排法、换容器时 Joplo 自动让它从旧位置飞到新位置（气泡里的词 → 纸带上的编号，概率条 → 抽签带）。
 * - 镜头在步骤里写 camera('元素', …)，按这些元素的范围取景；章节标记、来源、封面、片尾号召是 screen 元素，不随镜头动。
 */
import { $, and, eq, neq, notEmpty, oneOf, type CondExpr } from '@joplo-app/kit';
import { Button, Canvas, PromptInput } from '@joplo-app/kit/ui';
import { ANSWER_PROBS, ANSWER_TOKENS, BIRTHDAY_A, BIRTHDAY_Q, DATES, namesAt, PROMPT, PROMPT_IDS, PROMPT_TOKENS, STEPS, type Cand } from './data.ts';
import { C, tokenColor } from './palette.ts';
import { Poster } from './poster.tsx';

const ui = $.ui;
const at = (x: number, y: number, w?: number, h?: number) => ({ position: 'absolute' as const, left: x, top: y, ...(w !== undefined ? { width: w } : {}), ...(h !== undefined ? { height: h } : {}) });

// ---------- 版面（设计像素） ----------
export const WORLD = { w: 2560, h: 1600 };
const TAPE = { x: 120, y: 960 };
const MACHINE = { x: 1400, y: 760, w: 480, h: 480 };
const BARS = { x: 1930, y: 770, w: 570 };
const STRIP = { x: 1400, y: 1330, w: 1100, h: 84 };
const DIAL = { x: 1400, y: 1470, w: 1100 };

// ---------- 词元块 ----------
type ChipOpts = { m: string; text: string; bg?: string; size?: number; cls?: string; delay?: number; sub?: string; minW?: number; mono?: boolean; ink?: string };
function Chip({ m, text, bg, size = 34, cls, delay, sub, minW, mono, ink }: ChipOpts) {
  return (
    <span motion={m} className={cls} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', animationDelay: delay ? `${delay}ms` : undefined }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: minW, height: size * 1.45, padding: bg ? `0 ${Math.round(size * 0.25)}px` : 0, borderRadius: 8, background: bg ?? 'transparent', color: ink ?? C.ink, fontSize: size, fontWeight: 800, fontFamily: mono ? 'var(--jp-font-mono)' : undefined, whiteSpace: 'nowrap', boxSizing: 'border-box' }}>{text}</span>
      {sub ? <span style={{ fontSize: 19, fontWeight: 800, color: C.accent, marginTop: 4 }}>{sub}</span> : null}
    </span>
  );
}
const Row = ({ gap, children, when }: { gap: number; children?: unknown; when?: CondExpr }) => (
  <div when={when} style={{ display: 'flex', alignItems: 'flex-start', gap }}>{children as never}</div>
);

/** 你问的那句话：气泡里的三种排法（普通文字 / 切开 / 编号）。 */
const PromptInBubble = () => (
  <>
    <Row gap={0} when={and(eq(ui.pAt, 'bubble'), eq(ui.pMode, 'plain'))}>{PROMPT_TOKENS.map((t, i) => <Chip m={`p_${i}`} text={t} />)}</Row>
    <Row gap={12} when={and(eq(ui.pAt, 'bubble'), eq(ui.pMode, 'split'))}>{PROMPT_TOKENS.map((t, i) => <Chip m={`p_${i}`} text={t} bg={tokenColor(i)} />)}</Row>
    <Row gap={12} when={and(eq(ui.pAt, 'bubble'), eq(ui.pMode, 'ids'))}>{PROMPT_IDS.map((t, i) => <Chip m={`p_${i}`} text={t} bg={tokenColor(i)} size={30} minW={110} mono cls="x-flip" delay={i * 90} />)}</Row>
    <div when={eq(ui.pAt, 'tape')} className="x-fade" style={{ fontSize: 34, fontWeight: 700, lineHeight: '49px' }}>{PROMPT}</div>
  </>
);

/** 第一个回答：逐字出现 → 切开并标出概率 → 名字那一块翻成“南瓜”。 */
const Answer = () => (
  <>
    <Row gap={0} when={eq(ui.ans, 'plain')}>{ANSWER_TOKENS.map((t, i) => <Chip m={`a_${i}`} text={t} cls="x-type" delay={i * 160} />)}</Row>
    <Row gap={10} when={eq(ui.ans, 'split')}>
      {ANSWER_TOKENS.map((t, i) => i === 4
        ? <>
            <span when={eq(ui.ansFlip, false)}><Chip m="a_4" text={t} bg={tokenColor(7 + i)} sub={ANSWER_PROBS[i]} /></span>
            <span when={eq(ui.ansFlip, true)}><Chip m="a_4" text="南瓜" bg={C.accent} ink={C.bg} sub="20%" cls="x-flip" /></span>
          </>
        : <Chip m={`a_${i}`} text={t} bg={tokenColor(7 + i)} sub={ANSWER_PROBS[i]} />)}
    </Row>
  </>
);

/** 纸带上的输出块：第 i 块在 out > i 时出现；快进时一次出现的几块错开 350ms。 */
const outShown = (i: number) => oneOf(ui.out, Array.from({ length: 9 - i }, (_, k) => i + 1 + k));
const STAGGER: Record<number, number> = { 2: 350, 3: 700, 6: 350, 7: 700 };
const TapeOut = () => (
  <>
    {[...ANSWER_TOKENS, '结束'].map((t, i) => i === 4
      ? <>
          <span when={and(outShown(i), eq(ui.outFlip, false))}><Chip m="o_4" text={t} bg={tokenColor(11)} size={28} minW={70} /></span>
          <span when={and(outShown(i), eq(ui.outFlip, true))}><Chip m="o_4" text="南瓜" bg={C.accent} ink={C.bg} size={28} minW={70} cls="x-flip" /></span>
        </>
      : <span when={outShown(i)}><Chip m={`o_${i}`} text={t} bg={i === 8 ? C.accent : tokenColor(7 + i)} ink={i === 8 ? C.bg : C.ink} size={28} minW={70} cls="x-pop" delay={STAGGER[i] ?? 0} /></span>)}
  </>
);

// ---------- 概率条：竖排条形图（从 0 开始、长度按比例）与横排抽签带（宽度 = 概率），同一组 motion 键 ----------
type BarSet = { cands: readonly Cand[]; pick?: number; win?: string };
/** win：第一名的标签带上“下一步要接上纸带的那块”的 motion 键，下一步它就从这里飞到纸带上。 */
export const BAR_SETS: Record<string, BarSet> = {
  first: { cands: STEPS.first, win: 'o_0' },
  firstPick: { cands: STEPS.first, pick: 0 },
  name: { cands: STEPS.name, win: 'o_4' },
  namePick: { cands: STEPS.name, pick: 0 },
  end: { cands: STEPS.end, win: 'o_8' },
  endPick: { cands: STEPS.end, pick: 0 },
};
export const STRIP_SETS: Record<string, BarSet> = {
  strip1: { cands: namesAt(1) },
  strip1Pick: { cands: namesAt(1), pick: 1 },
  stripLo: { cands: namesAt(0.2), pick: 0 },
  stripHi: { cands: namesAt(1.5) },
  dates: { cands: DATES },
  datesPick: { cands: DATES, pick: 0 },
};
const SCALE = 60; // 条形图满刻度 60%
function BarList({ k, set }: { k: string; set: BarSet }) {
  return (
    <div when={eq(ui.bars, k)} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {set.cands.map((c, i) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 52 }}>
          <span motion={i === 0 ? set.win : undefined} style={{ width: 132, textAlign: 'right', fontSize: 30, fontWeight: 850, color: set.pick === i ? C.accent : C.ink }}>{c.label}</span>
          <div style={{ position: 'relative', flex: 1, height: 52, borderRadius: 6, background: C.panel2 }}>
            <div motion={`bar_${i}`} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (c.p / SCALE) * 100)}%`, borderRadius: 6, background: set.pick === i ? C.accent : C.bar }} />
          </div>
          <span style={{ width: 80, fontSize: 26, fontWeight: 800, color: set.pick === i ? C.accent : C.ink }}>{`${Math.round(c.p)}%`}</span>
        </div>
      ))}
    </div>
  );
}
function Strip({ k, set }: { k: string; set: BarSet }) {
  const sum = set.cands.reduce((a, c) => a + c.p, 0);
  return (
    <div when={eq(ui.bars, k)} style={{ display: 'flex', width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden' }}>
      {set.cands.map((c, i) => (
        <div id={k === 'datesPick' ? `seg_${i}` : undefined} motion={`bar_${i}`} style={{ width: `${(c.p / sum) * 100}%`, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: set.pick === i ? C.accent : i === 5 ? '#39406a' : tokenColor(i), color: set.pick === i ? C.bg : C.ink, fontSize: 26, fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {(c.p / sum) * STRIP.w > 80 ? c.label : ''}
        </div>
      ))}
    </div>
  );
}
/** 指针落点：抽签带上第 i 段的中点。 */
const mid = (cands: readonly Cand[], i: number) => {
  const sum = cands.reduce((a, c) => a + c.p, 0);
  return STRIP.x + ((cands.slice(0, i).reduce((a, c) => a + c.p, 0) + cands[i]!.p / 2) / sum) * STRIP.w;
};
export const POINTER: Record<string, number> = { start: STRIP.x + 24, pumpkin: mid(namesAt(1), 1), lo: mid(namesAt(0.2), 0), date: mid(DATES, 0) };

// ---------- 问题标签：钉在各自要讲的地方，章末翻成“✓ 答案”；全景时放大 ----------
const TAGS = [
  { q: '它读到的“字”是什么？', a: '读的是词元，看到的是编号', x: 120, y: 850 },
  { q: '下一个字怎么选？', a: '每一圈只猜下一块', x: 1400, y: 650 },
  { q: '为什么答案会变？', a: '按概率抽签', x: 2010, y: 650 },
  { q: '为什么会一本正经地胡说？', a: '没把握也必须挑一个', x: 120, y: 1100 },
] as const;
function Tag({ i }: { i: number }) {
  const t = TAGS[i]!;
  const key = (ui as unknown as Record<string, never>)[`tag${i}`]!;
  const variant = (state: 'ask' | 'now' | 'done', big: boolean) => {
    const done = state === 'done';
    const bc = done ? C.ok : state === 'now' ? C.accent : C.lineStrong;
    const s = big ? 1.6 : state === 'now' ? 1.08 : 1;
    return (
      <div when={and(eq(key, state), eq(ui.overview, big))} motion={`tag_${i}`} className={done && !big ? 'x-pop' : undefined}
        style={{ position: 'absolute', left: 0, bottom: 0, display: 'inline-flex', alignItems: 'center', gap: 14 * s, height: 64 * s, padding: `0 ${22 * s}px 0 ${10 * s}px`, borderRadius: 40 * s, background: C.panel, border: `${3 * s}px solid ${bc}`, whiteSpace: 'nowrap' }}>
        <span style={{ width: 44 * s, height: 44 * s, borderRadius: '50%', background: bc, color: C.bg, fontWeight: 900, fontSize: 24 * s, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{done ? '✓' : String(i + 1)}</span>
        <span style={{ fontSize: 30 * s, fontWeight: 850, color: done ? C.ok : C.ink }}>{done ? t.a : t.q}</span>
      </div>
    );
  };
  return (
    <div id={`tag_${i}`} style={{ ...at(t.x, t.y, 600, 64) }}>
      {variant('ask', false)}{variant('now', false)}{variant('done', false)}
      {variant('ask', true)}{variant('now', true)}{variant('done', true)}
    </div>
  );
}

const Pill = ({ text, delay }: { text: string; delay: number }) => (
  <span className="x-pop" style={{ display: 'inline-flex', alignItems: 'center', height: 50, padding: '0 20px', borderRadius: 30, background: C.accentSoft, border: `2px solid ${C.accent}`, color: C.accent, fontSize: 26, fontWeight: 850, animationDelay: `${delay}ms` }}>{text}</span>
);
const bubble = (user: boolean) => ({ padding: '14px 28px', borderRadius: 20, background: user ? C.blueSoft : C.panel2, border: `2px solid ${user ? 'rgba(91,140,255,.45)' : C.line}` });

export function WorldLayer() {
  return (
    <Canvas w={WORLD.w} h={WORLD.h} style={{ background: `radial-gradient(120% 90% at 50% 0%, #1b2146 0%, ${C.bg} 65%)`, color: C.ink }}>
      {/* 聊天窗 */}
      <div id="chat" style={{ ...at(60, 60, 1180, 700), borderRadius: 22, background: C.panel, border: `2px solid ${C.lineStrong}`, boxShadow: '0 30px 80px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', borderBottom: `2px solid ${C.line}` }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span style={{ width: 14, height: 14, borderRadius: '50%', background: c }} />)}
          <span style={{ marginLeft: 14, fontSize: 20, color: C.muted }}>和 AI 聊天</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 20, padding: '26px 40px' }}>
          <div when={ui.asked} id="q1_bubble" style={{ alignSelf: 'flex-end', ...bubble(true) }}><PromptInBubble /></div>
          <div when={neq(ui.ans, 'hidden')} id="a1_bubble" style={{ alignSelf: 'flex-start', ...bubble(false) }}><Answer /></div>
          <div when={ui.q2} className="x-rise" style={{ alignSelf: 'flex-end', ...bubble(true), fontSize: 34, fontWeight: 700 }}>{BIRTHDAY_Q}</div>
          <div when={ui.q2} id="a2_bubble" style={{ alignSelf: 'flex-start', ...bubble(false), display: 'flex' }}>
            {[...BIRTHDAY_A].map((ch, i) => <span className="x-type" style={{ fontSize: 34, fontWeight: 800, whiteSpace: 'pre', animationDelay: `${600 + i * 90}ms` }}>{ch}</span>)}
          </div>
          <div when={ui.tips} id="tips" style={{ display: 'flex', gap: 14 }}>
            <Pill text="要出处" delay={0} /><Pill text="开联网" delay={150} /><Pill text="关键数字自己核对" delay={300} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '0 40px 26px' }}>
          <div style={{ flex: 1, fontSize: 26 }}><PromptInput id="prompt" placeholder="问点什么……" /></div>
          <Button id="send" color={C.accent}>发送</Button>
        </div>
      </div>

      {/* 纸带：模型读到的全部内容（问题的编号 + 它自己已经写出的块） */}
      <div id="tape" style={{ ...at(TAPE.x, TAPE.y), display: 'flex', gap: 8, alignItems: 'center', minWidth: 70, height: 60 }}>
        {PROMPT_IDS.map((t, i) => <span when={eq(ui.pAt, 'tape')}><Chip m={`p_${i}`} text={t} bg={tokenColor(i)} size={20} minW={70} mono /></span>)}
        <span id="tape_out" style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 70, height: 60 }}><TapeOut /></span>
      </div>
      <div when={ui.rail} className="x-fade" style={{ ...at(100, TAPE.y + 74, MACHINE.x - 100, 4), borderRadius: 2, background: `linear-gradient(90deg, rgba(91,140,255,0), ${C.blue})` }} />
      <div when={ui.rail} className="x-fade" style={{ ...at(120, TAPE.y + 90), fontSize: 24, color: C.muted }}>模型每一圈都把这整条重新读一遍 →</div>
      <div when={notEmpty(ui.meter)} id="meter" style={{ ...at(780, TAPE.y + 84), display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 46, fontWeight: 900, color: C.accent }}>{ui.meter}</span>
        <span style={{ fontSize: 24, color: C.muted }}>个词元：收费和能读多长都按它算</span>
      </div>

      {/* 模型 */}
      <div id="machine" style={{ ...at(MACHINE.x, MACHINE.y, MACHINE.w, MACHINE.h), borderRadius: 36, background: 'linear-gradient(160deg, #262d5c, #151a36)', border: '3px solid', borderColor: ui.machBd, boxShadow: ui.machGlow, opacity: ui.machOp, overflow: 'hidden', boxSizing: 'border-box', transition: 'opacity 700ms ease, border-color 500ms ease, box-shadow 600ms ease' }}>
        {Array.from({ length: 9 }, (_, i) => <div style={{ position: 'absolute', left: 60, right: 60, top: 70 + i * 40, height: 10, borderRadius: 5, background: C.line }} />)}
        <div style={{ position: 'absolute', left: 40, right: 40, top: ui.scan, height: 26, borderRadius: 13, background: `linear-gradient(90deg, rgba(255,176,32,0), ${C.accent}, rgba(255,176,32,0))`, opacity: ui.scanOp, transition: 'top 1100ms cubic-bezier(.45,0,.55,1), opacity 300ms ease' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 22, textAlign: 'center', fontSize: 30, fontWeight: 900, letterSpacing: 6, color: C.muted }}>大模型</div>
      </div>
      <div when={ui.rail} style={{ ...at(MACHINE.x - 34, TAPE.y + 6), fontSize: 40, color: C.blue }}>▶</div>

      {/* 概率条 / 抽签带 */}
      <div id="bars" style={{ ...at(BARS.x, BARS.y, BARS.w, 456) }}>
        {Object.entries(BAR_SETS).map(([k, set]) => <BarList k={k} set={set} />)}
        <div when={oneOf(ui.bars, Object.keys(BAR_SETS))} style={{ ...at(BARS.w - 130, 470), fontSize: 20, fontWeight: 800, color: C.accent, border: `2px solid ${C.accent}`, borderRadius: 6, padding: '2px 10px' }}>示意数据</div>
      </div>
      <div id="strip" style={at(STRIP.x, STRIP.y, STRIP.w, STRIP.h)}>
        {Object.entries(STRIP_SETS).map(([k, set]) => <Strip k={k} set={set} />)}
      </div>
      {Object.entries(POINTER).map(([k, x]) => (
        <div when={eq(ui.ptr, k)} motion="ptr" motionMs={1800} style={{ ...at(x - 24, STRIP.y - 60, 48), textAlign: 'center', fontSize: 46, color: C.accent, textShadow: '0 4px 12px rgba(0,0,0,.6)' }}>▼</div>
      ))}
      <div id="dial" when={neq(ui.dial, 'none')} className="x-fade" style={{ ...at(DIAL.x, DIAL.y, DIAL.w, 110) }}>
        <div style={{ ...at(0, 22, DIAL.w, 8), borderRadius: 4, background: `linear-gradient(90deg, ${C.blue}, ${C.accent} 50%, ${C.bad})` }} />
        {([['t02', 0.2], ['t1', 1], ['t15', 1.5]] as const).map(([k, t]) => (
          <div when={eq(ui.dial, k)} motion="knob" style={{ ...at((t / 2) * DIAL.w - 80, -54, 160), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: C.accent, whiteSpace: 'nowrap' }}>{`温度 ${t.toFixed(1)}`}</span>
            <span style={{ width: 52, height: 52, borderRadius: '50%', background: C.ink, border: `7px solid ${C.accent}`, boxSizing: 'border-box' }} />
          </div>
        ))}
        <div when={ui.hints} className="x-rise" style={{ ...at(0, 66), fontSize: 26, fontWeight: 800, color: C.blue }}>← 写代码、查资料：调低</div>
        <div when={ui.hints} className="x-rise" style={{ position: 'absolute', right: 0, top: 66, fontSize: 26, fontWeight: 800, color: C.accent, animationDelay: '300ms' }}>起名字、写文案：调高 →</div>
      </div>

      {/* 计分板 */}
      <div id="score" when={neq(ui.score, 'none')} className="x-rise" style={{ ...at(120, 1210, 1120, 290), borderRadius: 22, background: C.panel, border: `2px solid ${C.line}`, padding: 26, boxSizing: 'border-box' }}>
        {(['plain', 'penalty'] as const).map((k) => {
          const pen = k === 'penalty';
          const card = (who: string, value: string, win: boolean, bad: boolean) => (
            <div style={{ flex: 1, borderRadius: 16, background: C.panel2, padding: '18px 22px', border: `3px solid ${win ? C.accent : C.line}` }}>
              <div style={{ fontSize: 24, color: C.muted, fontWeight: 700 }}>{who}</div>
              <div className={pen ? 'x-pop' : undefined} style={{ fontSize: 52, fontWeight: 900, color: bad ? C.bad : win ? C.accent : C.muted }}>{value}</div>
              <div style={{ fontSize: 18, color: C.faint }}>平均每题得分</div>
            </div>
          );
          return (
            <div when={eq(ui.score, k)}>
              <div style={{ fontSize: 28, fontWeight: 850, color: C.accent }}>{pen ? '新规则：答错扣 1 分，不知道得 0 分' : '现在的考法：答对得 1 分，其余都是 0 分'}</div>
              <div style={{ display: 'flex', gap: 24, marginTop: 22 }}>
                {card('蒙一个日期', pen ? '−0.99' : '+0.003', !pen, pen)}
                {card('说“我不知道”', '0', pen, false)}
              </div>
            </div>
          );
        })}
      </div>

      {TAGS.map((_, i) => <Tag i={i} />)}

      {/* 固定在屏幕上：章节标记、来源、片尾号召、封面 */}
      <div screen when={notEmpty(ui.hudN)} style={{ ...at(20, 16), display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px 8px 8px', borderRadius: 10, background: 'rgba(13,16,32,.88)', border: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: 2, color: C.bg, background: C.accent, borderRadius: 5, padding: '3px 10px' }}>{ui.hudN}</span>
        <span style={{ fontSize: 20, fontWeight: 800 }}>{ui.hudT}</span>
      </div>
      <div screen style={{ ...at(28, 776, 1224), fontSize: 12, color: C.faint }}>{ui.src}</div>
      <div screen when={ui.cta} className="x-rise" style={{ ...at(190, 650, 900, 104), borderRadius: 20, background: C.accent, color: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, boxShadow: '0 20px 60px rgba(0,0,0,.6)', pointerEvents: 'none' }}>
        <span style={{ fontSize: 36, fontWeight: 900 }}>自己试一下</span>
        <span style={{ fontSize: 28, fontWeight: 750 }}>同一个问题问两遍，看名字变没变</span>
      </div>
      <Poster />
    </Canvas>
  );
}
