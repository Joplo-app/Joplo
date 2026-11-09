import { $, eq, not, notEmpty } from '@joplo-app/kit';
import { Canvas } from '@joplo-app/plugin-content';
import { ActionIcon } from '@joplo-app/plugin-ui';

/**
 * 整段演示只有一张画布、一个输入框。所有变化都写在 $.ui 里，由各章的步骤改：
 *
 * 输入框里的文字按“光标”拆成几段，从左到右依次排开：
 *   before（光标前的原文） pivot（可点击的那个字，第 04 章用） spoken（这次说的话，带虚下划线）
 *   tail（停顿时末尾闪的短虚线） caret（光标 + 下面的小麦克风） hint（“请说…”） after（光标后的原文）
 * 空字符串什么也不画，所以同一棵树能表达“空框 / 接在末尾 / 插在中间”三种情况。
 *
 * 动的东西（光标闪、波形跳、末尾虚线闪）都是主题里的 CSS @keyframes：引擎时钟采样它们，暂停时一起停。
 */
const ui = $.ui;

/** 主题里用 CSS mask 画的线条图标。 */
const Icon = ({ name }: { name: string }) => <span className={`mv-ic mv-ic-${name}`} />;

/** 说话时每格竖条的高度（静态帧就是这个样子：左边还是短点，右边是刚说的话）。 */
const LOUD = [2, 2, 2, 3, 6, 12, 18, 14, 20, 9, 16, 22, 13, 19, 8, 15];
/** 一排 16 格的波形：quiet 是一串短点，loud 是高低跳动的竖条（CSS 只做缩放，高度在这里给）。 */
const Wave = ({ loud }: { loud: boolean }) => (
  <span className={loud ? 'mv-wave mv-wave-loud' : 'mv-wave'}>
    {Array.from({ length: 16 }, (_, i) => <span className="mv-bar" style={{ animationDelay: `${-((i * 137) % 700)}ms`, ...(loud ? { height: LOUD[i] } : {}) }} />)}
  </span>
);

/** 输入框里的文字。 */
const Body = () => (
  <div className="mv-body" id="body">
    <div className="mv-text">
      <span>{ui.before}</span>
      <a id="pivot" className="mv-pivot" when={notEmpty(ui.pivot)}>{ui.pivot}</a>
      <span className="mv-spoken" when={notEmpty(ui.spoken)}>{ui.spoken}</span>
      <span className="mv-tail" when={eq(ui.level, 'pause')} />
      <span className="mv-caret" when={ui.caret}>
        <span className="mv-caret-mic" when={ui.rec}><Icon name="mic" /></span>
      </span>
      <span className="mv-hint" when={notEmpty(ui.hint)}>{ui.hint}</span>
      <span>{ui.after}</span>
      <span className="mv-placeholder" when={ui.empty}>分配一个任务或输入 / 查看更多</span>
    </div>
  </div>
);

/** 底栏左侧：添加、已连接的应用。 */
const Tools = () => (
  <div className="mv-tools">
    <span className="mv-plain"><Icon name="plus" /></span>
    <span className="mv-apps">
      <span className="mv-app mv-app-a" />
      <span className="mv-app mv-app-b" />
      <span className="mv-app mv-app-c" />
      <span className="mv-more">+11</span>
    </span>
  </div>
);

/** 平时的底栏右侧：模式、对话、麦克风、发送。 */
const IdleActions = () => (
  <div className="mv-actions" when={not(ui.rec)}>
    <span className="mv-mode">自动<Icon name="down" /></span>
    <span className="mv-plain"><Icon name="chat" /></span>
    <span className="mv-anchor">
      <ActionIcon id="mic" aria-label="语音输入" variant="subtle" className="mv-btn"><Icon name="mic" /></ActionIcon>
      <span className="mv-tip" when={eq(ui.tip, 'mic')}>语音输入 <span className="mv-key">⌃D</span></span>
    </span>
    <span className={'mv-send'} when={not(ui.empty)}><Icon name="up" /></span>
    <span className={'mv-send mv-send-off'} when={ui.empty}><Icon name="up" /></span>
  </div>
);

/** 正在听的底栏右侧：取消、波形、计时、完成、发送。 */
const RecActions = () => (
  <div className="mv-actions" when={ui.rec}>
    <ActionIcon id="cancel" aria-label="取消" variant="subtle" className="mv-btn"><Icon name="x" /></ActionIcon>
    <span when={not(ui.finishing)} className="mv-meter">
      <span when={eq(ui.level, 'loud')}><Wave loud /></span>
      <span when={not(eq(ui.level, 'loud'))}><Wave loud={false} /></span>
      <span className="mv-timer">{ui.timer}</span>
    </span>
    <span when={ui.finishing} className="mv-finishing">正在完成…<span className="mv-spin" /></span>
    <span className="mv-anchor" when={not(ui.finishing)}>
      <ActionIcon id="finish" aria-label="完成" variant="subtle" className="mv-btn"><Icon name="check" /></ActionIcon>
      <span className="mv-tip" when={eq(ui.tip, 'finish')}>完成 <span className="mv-key">⌃D</span></span>
    </span>
    <span className="mv-send"><Icon name="up" /></span>
  </div>
);

export const WORLD = { w: 1280, h: 800 };

export function VoiceWorld() {
  return (
    <Canvas w={WORLD.w} h={WORLD.h} drift={false} className="mv-world">
      <div className="mv-stage">
        <div className="mv-cluster" id="cluster">
          <div className="mv-headline" when={notEmpty(ui.headline)} enter="fade" exit="fade" enterMs={500} exitMs={350}>{ui.headline}</div>
          <div className="mv-box" id="box">
            <div className="mv-chips">
              <span className="mv-chip"><Icon name="cloud" />云服务</span>
              <span className="mv-chip"><Icon name="folder" />选择项目</span>
            </div>
            <div className="mv-card">
              <Body />
              <div className="mv-bar-row">
                <Tools />
                <IdleActions />
                <RecActions />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div screen className="mv-chapter"><span className="mv-chapter-no">{ui.chNo}</span>{ui.chTitle}</div>
      <div screen className="mv-brand">Manus 语音输入</div>
    </Canvas>
  );
}
