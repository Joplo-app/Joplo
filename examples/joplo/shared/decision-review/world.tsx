import { $, eq, neq, oneOf, patch } from '@joplo-app/kit';
import { Button } from '@joplo-app/plugin-ui';
import { Canvas } from '@joplo-app/plugin-content';
import {
  DO_NOW,
  FONT_SANS,
  FORK_SPECS,
  NOT_NOW,
  PALETTE as P,
  type ForkOption,
} from './data.ts';

export type DecisionReviewUi = {
  __plugins?: {
    content?: {
      camera?: { targets: string[]; pad?: number };
    };
  };
  /** 岛 1：'text' | 'play' */
  contrastMode: string;
  /** 岛 2：'a' | 'b' */
  forkOpt: ForkOption;
  /** 岛 3：'pin' | 'fixing' | 'recheck' */
  loopStage: string;
  /** 岛 4：'evidence' | 'reuse' | 'roadmap' */
  moatStage: string;
  /** 右上角极简锚标 */
  hudTag: string;
};

const at = (x: number, y: number, w?: number, h?: number) => ({
  position: 'absolute' as const,
  left: x,
  top: y,
  ...(w !== undefined ? { width: w } : {}),
  ...(h !== undefined ? { height: h } : {}),
});

const chooseFork = (opt: ForkOption) => patch($.ui, { forkOpt: opt });

export function DecisionReviewWorld() {
  const ui = $.ui as unknown as DecisionReviewUi;

  return (
    <Canvas
      w={3440}
      h={2180}
      view={[1600, 1000]}
      safe={[118, 64, 116, 64]}
      bg={P.void}
      drift={0.7}
    >
      {/* =====================================================================
          岛 1（左上）：读文字靠脑补 vs 按一下演给你看（为什么看视频更省力）
         ===================================================================== */}
      <div id="zone_contrast" style={{ ...at(140, 140, 1240, 740), fontFamily: FONT_SANS }}>
        <div style={{ ...at(0, 14, 1220), textAlign: 'center', fontSize: 29, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>
          <span when={eq(ui.contrastMode, 'text')}>旧方式：读文字 PRD 审需求 —— 大脑要同时人肉脑补三件事</span>
          <span when={eq(ui.contrastMode, 'play')}>Joplo 方式：按一下演 15 秒 —— 省下人肉拼局面的脑力</span>
        </div>

        {/* 具象问题置顶条 */}
        <div
          style={{
            ...at(220, 76, 780, 48),
            borderRadius: 24,
            background: '#161e2e',
            border: `1.5px solid ${P.slateBright}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 21,
            fontWeight: 850,
            color: P.cyan,
            whiteSpace: 'nowrap',
          }}
        >
          真实待拍板场景：成员邀请超时后，管理员再点一次“重试”，会发生什么？
        </div>

        {/* 状态 A：文字 PRD + 大脑工作记忆超载 */}
        <div when={eq(ui.contrastMode, 'text')} enter="fade">
          {/* 左：密密麻麻文字需求 */}
          <div
            style={{
              ...at(24, 168, 464, 420),
              borderRadius: 18,
              background: P.surface,
              border: `2px solid ${P.slate}`,
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 900, color: P.muted }}>PRD · 邀请超时重试规格.md</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 18, color: P.faint, lineHeight: 1.6 }}>
              <span>1. POST /invites 超时 5s 前端提示重试按钮…</span>
              <span>2. 若服务端实际已写入成功但回包丢失…</span>
              <span>3. 管理员未见成功提示，再次点击发送…</span>
              <span>4. 需兼顾过期链接、并发点击与防重发…</span>
              <span>5. 各角色自行阅读并提出边界意见…</span>
            </div>
          </div>

          <div style={{ ...at(508, 344, 96), textAlign: 'center', fontSize: 22, fontWeight: 900, color: P.danger, whiteSpace: 'nowrap' }}>
            脑补 ──▶
          </div>

          {/* 右：大脑同时扛 3 件未解状态 */}
          <div style={{ ...at(620, 168, 590, 420), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                '① 页面报了超时失败，按钮重新变亮？',
                '② 服务端其实已经建好记录发了邮件？',
                '③ 管理员以为没发，刷新又点了一次？',
              ].map((line, i) => (
                <div
                  key={i}
                  style={{
                    padding: '18px 22px',
                    borderRadius: 14,
                    background: P.dangerSoft,
                    border: `2px solid ${P.danger}`,
                    fontSize: 21,
                    fontWeight: 850,
                    color: P.ink,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {line}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 21, fontWeight: 900 }}>
                <span style={{ color: P.muted }}>人类脑力启动成本</span>
                <span style={{ color: P.danger }}>极高 · 本能拖延或扫两眼假懂 ✕</span>
              </div>
              <div style={{ height: 22, borderRadius: 11, background: P.slate, overflow: 'hidden' }}>
                <div enter="grow" enterMs={650} style={{ width: '94%', height: '100%', background: P.danger }} />
              </div>
            </div>
          </div>
        </div>

        {/* 状态 B：Joplo 省力演一遍（三步因果直观摊开） */}
        <div when={eq(ui.contrastMode, 'play')} enter="fade">
          <div style={{ ...at(24, 210, 1188, 220), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* 节点 1 */}
            <div
              style={{
                width: 320,
                height: 172,
                borderRadius: 18,
                background: P.surface,
                border: `2.5px solid ${P.cyan}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 800, color: P.cyan }}>第 1 步 · 首次发送</span>
              <span style={{ fontSize: 26, fontWeight: 900, color: P.ink }}>管理员点「发送邀请」</span>
              <span style={{ fontSize: 17, color: P.muted }}>发给 lin@acme.com</span>
            </div>

            <span style={{ fontSize: 32, fontWeight: 900, color: P.cyan }}>──▶</span>

            {/* 节点 2 */}
            <div
              style={{
                width: 340,
                height: 172,
                borderRadius: 18,
                background: P.amberSoft,
                border: `2.5px solid ${P.amber}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 850, color: P.amber }}>第 2 步 · 5 秒响应超时</span>
              <span style={{ fontSize: 25, fontWeight: 900, color: P.ink }}>页面报错 · 后台其实已成功</span>
              <span style={{ fontSize: 17, color: P.amber }}>回包丢了，界面不知情</span>
            </div>

            <span style={{ fontSize: 32, fontWeight: 900, color: P.amber }}>──▶</span>

            {/* 节点 3 */}
            <div
              style={{
                width: 320,
                height: 172,
                borderRadius: 18,
                background: P.dangerSoft,
                border: `3px dashed ${P.danger}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 850, color: P.danger }}>第 3 步 · 分歧路口！</span>
              <span style={{ fontSize: 26, fontWeight: 900, color: P.ink }}>管理员再次点「重试」</span>
              <span style={{ fontSize: 17, color: P.danger }}>画面停在这里，当场拍板</span>
            </div>
          </div>

          <div style={{ ...at(120, 500, 990), display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 900 }}>
              <span style={{ color: P.muted }}>人类脑力启动成本</span>
              <span style={{ color: P.emerald }}>极低 · 靠着看 15 秒，PM / 架构 / 研发瞬间对齐局面 ✓</span>
            </div>
            <div style={{ height: 22, borderRadius: 11, background: P.slate, overflow: 'hidden' }}>
              <div enter="grow" enterMs={600} style={{ width: '18%', height: '100%', background: P.emerald }} />
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          岛 2（右上）：画面停在分歧处 —— A/B 切换 + 三方同框 + 断言证据诚实标签
         ===================================================================== */}
      <div id="zone_fork" style={{ ...at(1980, 140, 1280, 740), fontFamily: FONT_SANS }}>
        <div style={{ ...at(0, 14, 1260), textAlign: 'center', fontSize: 28, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>
          <span when={eq(ui.forkOpt, 'a')}>停在分歧处：方案 A（仅前端防抖）—— 超时刷新重发会出 2 条脏数据！</span>
          <span when={eq(ui.forkOpt, 'b')}>停在分歧处：方案 B（服务端幂等去重）—— 拦截重发，三方同屏拍板！</span>
        </div>

        {/* 可暂停切换的方案 A/B 按钮 */}
        <div style={{ ...at(30, 82), display: 'flex', alignItems: 'center', gap: 18 }}>
          {(['a', 'b'] as const).map((opt) => (
            <Button key={opt} id={`choose_opt_${opt}`} color={FORK_SPECS[opt].btnColor} onClick={chooseFork(opt)}>
              {FORK_SPECS[opt].label}
            </Button>
          ))}
          <span style={{ fontSize: 18, fontWeight: 700, color: P.muted, whiteSpace: 'nowrap' }}>
            （暂停时可亲自切换对比同一输入的不同后果）
          </span>
        </div>

        {/* 左半：同一笔重试请求在方案 A vs 方案 B 下的不同命运 */}
        {(['a', 'b'] as const).map((opt) => {
          const spec = FORK_SPECS[opt];
          return (
            <div
              key={opt}
              when={eq(ui.forkOpt, opt)}
              style={{ ...at(30, 174, 650, 490), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            >
              {/* 入口重试请求 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    width: 210,
                    height: 92,
                    borderRadius: 16,
                    background: P.surface,
                    border: `2.5px solid ${P.amber}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 21, fontWeight: 900, color: P.amber }}>重试请求 #2</span>
                  <span style={{ fontSize: 16, color: P.muted }}>同一管理员再次提交</span>
                </div>

                <span style={{ fontSize: 28, fontWeight: 900, color: P.muted }}>──▶</span>

                {/* 服务端闸口（方案 B 出现翡翠绿幂等护盾！） */}
                <div
                  enter="zoom"
                  enterEase="spring"
                  style={{
                    flex: 1,
                    height: 92,
                    borderRadius: 16,
                    background: spec.uiBad ? P.dangerSoft : P.emeraldSoft,
                    border: `2.5px ${spec.uiBad ? 'dashed' : 'solid'} ${spec.uiBad ? P.danger : P.emerald}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 21, fontWeight: 900, color: spec.uiBad ? P.danger : P.emerald, whiteSpace: 'nowrap' }}>
                    {spec.gateLabel}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: P.ink, whiteSpace: 'nowrap' }}>{spec.gateSub}</span>
                </div>
              </div>

              {/* 数据库最终行状态 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 850, color: P.muted }}>数据库 invitations 表结果：</span>
                {spec.dbRows.map((row, idx) => (
                  <div
                    key={idx}
                    enter="rise"
                    style={{
                      padding: '15px 20px',
                      borderRadius: 12,
                      background: row.bad ? P.dangerSoft : P.surface,
                      border: `2px solid ${row.bad ? P.danger : P.emerald}`,
                      fontSize: 20,
                      fontWeight: 850,
                      color: row.bad ? P.danger : P.ink,
                    }}
                  >
                    {row.text}
                  </div>
                ))}
              </div>

              {/* 页面最终反馈 */}
              <div
                style={{
                  padding: '16px 22px',
                  borderRadius: 14,
                  background: spec.uiBad ? P.dangerSoft : P.cyanSoft,
                  border: `2.5px solid ${spec.uiBad ? P.danger : P.cyan}`,
                  fontSize: 22,
                  fontWeight: 900,
                  color: spec.uiBad ? P.danger : P.cyan,
                }}
              >
                {spec.uiOutcome}
              </div>

              <span style={{ fontSize: 18, fontWeight: 750, color: P.muted }}>{spec.summary}</span>
            </div>
          );
        })}

        {/* 右半：同一步的三方视角 + 证据绑定到具体断言（绝不把动画冒充已测通！） */}
        <div
          style={{
            ...at(730, 174, 520, 490),
            borderLeft: `2px solid ${P.slate}`,
            paddingLeft: 32,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 900, color: P.ink }}>围着这一步，三方一次定清：</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 900, color: P.cyan }}>PM 定用户看到什么</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: P.ink }}>不报“发送失败”，改示“已在待确认列表中”</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 900, color: P.emerald }}>架构师定服务边界</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: P.ink }}>去重责任归服务端幂等键，前端防抖不兜底</span>
            </div>
          </div>

          {/* 证据绑定到具体断言（核心护栏！） */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: P.amber }}>
              研发看具体断言（不拿动画冒充已通过测试）：
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 12, background: P.surface }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: P.ink }}>断言 1 · 页面只显示 1 条</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: P.amber, whiteSpace: 'nowrap' }}>拟议 · 待验证</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 12, background: P.surface }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: P.ink }}>断言 2 · 服务端绝不重插</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: P.amber, whiteSpace: 'nowrap' }}>拟议 · 待验证</span>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          岛 3（左下）：点一下回传 Agent → 局部修订 → 直达复审步 → 决定进 Git
         ===================================================================== */}
      <div id="zone_loop" style={{ ...at(140, 1240, 1260, 740), fontFamily: FONT_SANS }}>
        <div style={{ ...at(0, 14, 1240), textAlign: 'center', fontSize: 28, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>
          <span when={eq(ui.loopStage, 'pin')}>挑刺不用写 300 字 Prompt：在分歧步点一下，自动带位置推给 Agent</span>
          <span when={eq(ui.loopStage, 'fixing')}>Agent 收到精确定位只改这一处，生成反馈处理回执</span>
          <span when={eq(ui.loopStage, 'recheck')}>评审者回来点「直达复审步」：跳过旧步 3 秒确认，决定写入 Git</span>
        </div>

        {/* 左列：分歧步画面与批注起点 */}
        <div style={{ ...at(24, 152, 360, 440), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 19, fontWeight: 900, color: P.cyan }}>1 · 评审画布（分歧步 #3）</span>

          <div
            style={{
              padding: 20,
              borderRadius: 16,
              background: P.surface,
              border: `2px solid ${P.slateBright}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 20, fontWeight: 900, color: P.ink }}>🔑 幂等去重规则</span>
            <span style={{ fontSize: 16, color: P.muted }}>源码位置：invite.ts · 第 48 行</span>

            {/* pin 阶段：批注胶囊挂在元素上 */}
            <div
              when={eq(ui.loopStage, 'pin')}
              motion="feedback_pin"
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: P.amberSoft,
                border: `2.5px solid ${P.amber}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 900, color: P.amber }}>📌 批注 #1（架构师指出遗漏）</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: P.ink }}>“若原邀请已过期，不能复用旧链接，必须作废重发！”</span>
            </div>

            {/* recheck 阶段：新增分支落地 + 决定写入 Git */}
            <div
              when={eq(ui.loopStage, 'recheck')}
              enter="rise"
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: P.emeraldSoft,
                border: `2.5px solid ${P.emerald}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 900, color: P.emerald }}>✓ v2 新增：过期后重发分支</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: P.ink }}>作废旧链接 → 生成 1 条新邀请</span>
            </div>
          </div>

          <span style={{ fontSize: 17, fontWeight: 750, color: P.muted }}>
            自动携带：步骤编号 + 方案版本 + 源码行号
          </span>
        </div>

        {/* 中列：Coding Agent 接收批注并输出处理回执 */}
        <div style={{ ...at(444, 152, 370, 440), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 19, fontWeight: 900, color: P.amber }}>2 · Coding Agent 局部修订</span>

          <div
            style={{
              padding: 22,
              borderRadius: 16,
              background: '#111622',
              border: `2px solid ${P.slateBright}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              minHeight: 280,
              justifyContent: 'center',
            }}
          >
            <div when={eq(ui.loopStage, 'pin')} style={{ fontSize: 18, color: P.faint, textAlign: 'center' }}>
              等待本地反馈流……
            </div>

            {/* fixing 阶段：feedback_pin 飞入 Agent 收件箱！ */}
            <div
              when={eq(ui.loopStage, 'fixing')}
              motion="feedback_pin"
              motionMs={850}
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: P.cyanSoft,
                border: `2.5px solid ${P.cyan}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 900, color: P.cyan }}>收到批注 #1 · invite.ts:48</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: P.ink }}>只补「已过期重发」分支，不动其他步</span>
            </div>

            <div
              when={oneOf(ui.loopStage, ['fixing', 'recheck'])}
              enter="rise"
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: P.emeraldSoft,
                border: `2px solid ${P.emerald}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 900, color: P.emerald }}>✓ 处理回执已写回评审记录</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: P.ink }}>批注 #1：已处理 → v2 / 第 4 步</span>
            </div>
          </div>

          <span style={{ fontSize: 17, fontWeight: 750, color: P.muted }}>
            改动后旧确认自动失效，防旧签字替新版背书
          </span>
        </div>

        {/* 右列：定点复审步骤条（不用重看全片） */}
        <div style={{ ...at(874, 152, 360, 440), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 19, fontWeight: 900, color: P.emerald }}>3 · 回来定点复审 → 留进 Git</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {['1 · 发送邀请（未变 · 跳过）', '2 · 5 秒超时（未变 · 跳过）', '3 · 幂等拦截（已审过）'].map((st, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: P.surface,
                  fontSize: 17,
                  fontWeight: 750,
                  color: P.faint,
                }}
              >
                {st}
              </div>
            ))}

            <div
              when={eq(ui.loopStage, 'recheck')}
              motion="feedback_pin"
              motionMs={850}
              style={{
                padding: '16px 18px',
                borderRadius: 12,
                background: P.emeraldSoft,
                border: `3px solid ${P.emerald}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                boxShadow: '0 0 28px rgba(52,211,153,0.28)',
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 900, color: P.emerald }}>● 4 · 过期后重发（直达复审 ✓）</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: P.ink }}>已确认 · 条件与理由已存入 Git</span>
            </div>
          </div>

          <span style={{ fontSize: 17, fontWeight: 850, color: P.emerald }}>
            新手看全片省力，复审人直达变化步
          </span>
        </div>
      </div>

      {/* =====================================================================
          岛 4（右下）：Q2 实测证据挂回 + 第二次改需求护城河 + 未来两季度聚焦边界
         ===================================================================== */}
      <div id="zone_moat" style={{ ...at(1980, 1240, 1280, 740), fontFamily: FONT_SANS }}>
        <div style={{ ...at(0, 14, 1260), textAlign: 'center', fontSize: 28, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>
          <span when={eq(ui.moatStage, 'evidence')}>Q2 挂回团队已有测试结果：同一步一眼看清「吻合」还是「冲突」</span>
          <span when={eq(ui.moatStage, 'reuse')}>真正的护城河：3 周后第二次改需求，自动调出上次决定与失效证据</span>
          <span when={eq(ui.moatStage, 'roadmap')}>Astra + Sol 统一结论：未来两季度死磕聚焦，绝不分散火力</span>
        </div>

        {/* 状态 1：真实测试证据挂回具体断言 */}
        <div when={eq(ui.moatStage, 'evidence')} enter="fade" style={{ ...at(60, 152, 1140, 440), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 21, fontWeight: 850, color: P.muted }}>
            代码实现后，将 CI 测试结果挂回当初拍板的两条断言（提交 8f3a2c）：
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div
              style={{
                padding: '24px 28px',
                borderRadius: 16,
                background: P.emeraldSoft,
                border: `2.5px solid ${P.emerald}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: P.ink }}>断言 1 · 超时重试后页面只显示 1 条邀请</span>
                <span style={{ fontSize: 18, color: P.muted }}>来源：Playwright E2E #412 · 真实浏览器执行</span>
              </div>
              <span style={{ fontSize: 24, fontWeight: 900, color: P.emerald, whiteSpace: 'nowrap' }}>✓ 实测吻合</span>
            </div>

            <div
              style={{
                padding: '24px 28px',
                borderRadius: 16,
                background: P.dangerSoft,
                border: `3px solid ${P.danger}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: P.ink }}>断言 2 · 过期重发绝不在数据库留 2 条记录</span>
                <span style={{ fontSize: 18, color: P.danger }}>来源：API 集成测试 #89 · 实际查出 2 条（点击直达日志）</span>
              </div>
              <span style={{ fontSize: 24, fontWeight: 900, color: P.danger, whiteSpace: 'nowrap' }}>✕ 实测冲突！</span>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 23, fontWeight: 900, color: P.cyan }}>
            演得很顺 ≠ 代码已过 —— 在同一步当场抓出偏离，彻底消除“可视化幻觉”
          </div>
        </div>

        {/* 状态 2：3 周后第二次改需求（护城河真正出现） */}
        <div when={eq(ui.moatStage, 'reuse')} enter="fade" style={{ ...at(60, 152, 1140, 440), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ padding: '14px 22px', borderRadius: 12, background: P.surface, border: `2px solid ${P.slateBright}`, fontSize: 21, fontWeight: 900, color: P.muted }}>
              3 周前 · 首次拍板「邀请超时重试」
            </div>
            <span style={{ fontSize: 28, fontWeight: 900, color: P.cyan }}>──────▶</span>
            <div style={{ padding: '14px 22px', borderRadius: 12, background: P.cyanSoft, border: `2.5px solid ${P.cyan}`, fontSize: 21, fontWeight: 900, color: P.cyan }}>
              今天 · 新人接手新增「批量邀请」
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '18px 24px', borderRadius: 14, background: P.surface, borderLeft: `6px solid ${P.emerald}`, fontSize: 22, fontWeight: 850, color: P.ink }}>
              ✓ 自动调出上次决定：去重由服务端幂等键兜底（不用再拉一屋子人重讲）
            </div>
            <div style={{ padding: '18px 24px', borderRadius: 14, background: P.surface, borderLeft: `6px solid ${P.cyan}`, fontSize: 22, fontWeight: 850, color: P.ink }}>
              ✓ 自动提醒上次踩坑：已过期链接不可直接复用，必须作废重发
            </div>
            <div style={{ padding: '18px 24px', borderRadius: 14, background: P.amberSoft, borderLeft: `6px solid ${P.amber}`, fontSize: 22, fontWeight: 850, color: P.amber }}>
              ⚠ 自动标出受影响证据：批量接口改了写入逻辑 → 「断言 2」旧测试失效，转为待重测
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 23, fontWeight: 900, color: P.emerald }}>
            第一次做演示很容易被替代；第二次改需求能瞬间还原上下文，才是真护城河
          </div>
        </div>

        {/* 状态 3：两季度聚焦边界（做这 3 件 vs 果断不碰这 4 件） */}
        <div when={eq(ui.moatStage, 'roadmap')} enter="fade" style={{ ...at(30, 140, 1220, 480), display: 'flex', gap: 48 }}>
          {/* 左：未来两季度只做这 3 件 */}
          <div style={{ flex: 1.15, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: P.emerald }}>✓ 未来 1–2 季度只死磕这 3 件</span>
            {DO_NOW.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '20px 22px',
                  borderRadius: 14,
                  background: P.emeraldSoft,
                  border: `2px solid ${P.emerald}`,
                  fontSize: 20,
                  fontWeight: 850,
                  color: P.ink,
                  lineHeight: 1.45,
                }}
              >
                {item}
              </div>
            ))}
          </div>

          {/* 右：现在果断不碰 */}
          <div style={{ flex: 0.95, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: P.danger }}>✕ 现在果断延后 / 不另立主线</span>
            {NOT_NOW.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '16px 20px',
                  borderRadius: 14,
                  background: P.surface,
                  border: `1.5px solid ${P.slateBright}`,
                  fontSize: 19,
                  fontWeight: 800,
                  color: P.muted,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右上角极简锚标 */}
      <div
        screen
        when={neq(ui.hudTag, '')}
        style={{
          position: 'absolute',
          right: 44,
          top: 24,
          fontFamily: FONT_SANS,
          fontSize: 16,
          fontWeight: 800,
          color: P.faint,
          pointerEvents: 'none',
        }}
      >
        {ui.hudTag}
      </div>
    </Canvas>
  );
}
