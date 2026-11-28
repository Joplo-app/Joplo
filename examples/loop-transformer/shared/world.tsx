import { Canvas } from '@joplo-app/plugin-content';
import { $, and, eq, neq, oneOf, patch } from '@joplo-app/kit';
import { Button } from '@joplo-app/plugin-ui';
import {
  isCoreLayer,
  LAYER_INDICES,
  LOOP_SPECS,
  MATH_WORDS,
  PALETTE as P,
  RIDDLE,
  type LoopChoice,
} from './data.ts';

const ui = $.ui;
const at = (x: number, y: number, w?: number, h?: number) => ({
  position: 'absolute' as const,
  left: x,
  top: y,
  ...(w !== undefined ? { width: w } : {}),
  ...(h !== undefined ? { height: h } : {}),
});

/**
 * 纯几何舞台（3400 × 2100，4 个相距 >420px 的独立视觉岛）：
 * - 特写时画面 75%+ 是纯净深色留白，不画任何 SaaS 外框卡片或冗余面板头；
 * - 只有层条堆栈、发光词元胶囊、SVG 回流圆弧、门控阀、按词圆点与等比参数塔。
 */
export function LoopWorld() {
  const pickLoop = (k: LoopChoice) => patch($.ui, { labLoops: k });

  // 18 根层条自底向上排列（idx 0 在最底 y=540，idx 17 在最顶 y=166）
  const barY = (idx: number) => 540 - idx * 22;

  return (
    <Canvas
      w={3400}
      h={2100}
      view={[1600, 1000]}
      safe={[72, 48, 96, 48]}
      style={{ background: P.void, color: P.ink }}
    >
      {/* =====================================================================
          岛 1（左上）：层条堆栈 + 回流圆弧 + 门控防爆（无外框，直接浮于黑底）
         ===================================================================== */}
      <div id="zone_stack" style={at(140, 110, 1240, 760)}>
        {/* 顶部模型形态极简标题（单行舒展排布，与加高后的层塔留足间距） */}
        <div style={{ ...at(60, -36, 600), textAlign: 'center', fontSize: 26, fontWeight: 850, color: P.muted, letterSpacing: 1, whiteSpace: 'nowrap' }}>
          {ui.stackTitle}
        </div>

        {/* 左侧极简段落标注（仅在进入 loop 模式后悄然浮现，直贴层条，无图例框） */}
        <div when={oneOf(ui.stackMode, ['loop1', 'loopArc', 'loop2', 'gateBad', 'gateGood'])} enter="fade">
          <div style={{ ...at(0, 172, 164), textAlign: 'right', fontSize: 20, fontWeight: 750, color: P.muted, whiteSpace: 'nowrap' }}>
            后段输出层
          </div>
          <div style={{ ...at(0, 316, 164), textAlign: 'right', fontSize: 22, fontWeight: 900, color: P.coral, whiteSpace: 'nowrap' }}>
            共享循环层 ×2
          </div>
          <div style={{ ...at(0, 492, 164), textAlign: 'right', fontSize: 20, fontWeight: 750, color: P.muted, whiteSpace: 'nowrap' }}>
            前段编码层
          </div>
        </div>
        <div when={oneOf(ui.stackMode, ['normalStart', 'normalTop', 'bigger'])} style={{ ...at(0, 350, 164), textAlign: 'right', fontSize: 20, fontWeight: 750, color: P.muted, whiteSpace: 'nowrap' }}>
          逐层只过 1 遍 —
        </div>

        {/* 18 根基础层条（自底 0 到顶 17） */}
        {LAYER_INDICES.map((idx) => {
          const core = isCoreLayer(idx);
          const y = barY(idx);
          return (
            <div key={idx}>
              {/* 普通 / 巨无霸模式：全部石板灰 */}
              <div
                when={oneOf(ui.stackMode, ['normalStart', 'normalTop', 'bigger'])}
                style={{
                  ...at(180, y, 360, 13),
                  borderRadius: 6,
                  background: P.slateBright,
                }}
              />
              {/* 循环模式：中段 10 根点亮珊瑚红，前段与后段保持冷静石板灰 */}
              <div
                when={oneOf(ui.stackMode, ['loop1', 'loopArc', 'loop2', 'gateBad', 'gateGood'])}
                className={core ? 'lt-live-bar' : undefined}
                style={{
                  ...at(180, y, 360, 13),
                  borderRadius: 6,
                  background: core ? P.coral : P.slate,
                  boxShadow: core ? '0 0 18px rgba(232,106,74,0.28)' : 'none',
                }}
              />
            </div>
          );
        })}

        {/* 巨无霸堆层模式（bigger）：往上额外再叠 8 根灰条，直观表现“硬堆层数与参数” */}
        <div when={eq(ui.stackMode, 'bigger')} enter="rise" enterStagger={35}>
          {Array.from({ length: 8 }, (_, k) => (
            <div
              key={k}
              style={{
                ...at(160, 142 - k * 15, 400, 10),
                borderRadius: 5,
                background: P.slateBright,
                opacity: 0.85,
              }}
            />
          ))}
        </div>

        {/* 守恒运动胶囊（motion="probe"）：同一实体从底穿到顶、绕回流弧、再二进宫出顶！ */}
        <div
          when={eq(ui.probePos, 'bottom')}
          motion="probe"
          style={{
            ...at(316, 578, 88, 44),
            borderRadius: 10,
            background: P.ink,
            color: P.void,
            fontSize: 26,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 28px rgba(255,255,255,0.28)',
          }}
        >
          ?
        </div>
        <div
          when={eq(ui.probePos, 'topWrong')}
          motion="probe"
          style={{
            ...at(306, 98, 108, 48),
            borderRadius: 10,
            background: P.danger,
            color: P.void,
            fontSize: 26,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          6 件 ✕
        </div>
        <div
          when={eq(ui.probePos, 'midPass1')}
          motion="probe"
          style={{
            ...at(302, 238, 116, 44),
            borderRadius: 10,
            background: P.amber,
            color: P.void,
            fontSize: 23,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          第 1 遍 h₁
        </div>
        <div
          when={eq(ui.probePos, 'arcReturn')}
          motion="probe"
          style={{
            ...at(614, 336, 124, 44),
            borderRadius: 22,
            background: P.coral,
            color: P.ink,
            fontSize: 22,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 30px rgba(232,106,74,0.55)',
          }}
        >
          ↻ 回流重想
        </div>
        <div
          when={eq(ui.probePos, 'topRight')}
          motion="probe"
          style={{
            ...at(302, 96, 116, 48),
            borderRadius: 10,
            background: P.emerald,
            color: P.void,
            fontSize: 26,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 32px rgba(52,211,153,0.45)',
          }}
        >
          12 件 ✓
        </div>

        {/* 右侧半圆弧回流轨道（纯 div 圆角右半环，连接第 13 层输出端 y=254 回到第 4 层输入端 y=458） */}
        <div
          when={oneOf(ui.stackMode, ['loop1', 'loopArc', 'loop2', 'gateBad', 'gateGood'])}
          enter="fade"
          className="lt-live-bar"
          style={{
            ...at(546, 254, 134, 208),
            borderTop: `4px dashed ${P.coral}`,
            borderRight: `4px dashed ${P.coral}`,
            borderBottom: `4px dashed ${P.coral}`,
            borderRadius: '0 104px 104px 0',
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: -6,
              bottom: -16,
              fontSize: 24,
              fontWeight: 900,
              color: P.coral,
              lineHeight: 1,
            }}
          >
            ◀
          </span>
        </div>

        {/* 回流弧上的 Gate 门控阀门（gateGood 时点亮翡翠绿） */}
        <div
          when={eq(ui.stackMode, 'gateGood')}
          enter="zoom"
          enterEase="spring"
          style={{
            ...at(618, 334, 118, 48),
            borderRadius: 24,
            background: P.void,
            border: `3px solid ${P.emerald}`,
            color: P.emerald,
            fontSize: 22,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 24px rgba(52,211,153,0.35)',
          }}
        >
          Gate 门控
        </div>

        {/* 底部具体推理题横条（简洁单行，不套大面板） */}
        <div
          style={{
            ...at(90, 646, 540, 56),
            borderRadius: 12,
            background: '#151923',
            border: `1.5px solid ${P.slate}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 23,
            fontWeight: 800,
            color: P.ink,
          }}
        >
          {RIDDLE}
        </div>

        {/* 右侧情境区 A：bigger 模式的显存爆表极简三横条（Bart 同款） */}
        <div
          when={eq(ui.stackMode, 'bigger')}
          enter="rise"
          style={{ ...at(650, 210, 520, 260), display: 'flex', flexDirection: 'column', gap: 34 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 23, fontWeight: 850 }}>
              <span style={{ color: P.muted }}>权重显存（VRAM）</span>
              <span style={{ color: P.danger }}>✕ 暴涨 3 倍</span>
            </div>
            <div style={{ height: 18, borderRadius: 9, background: P.slate, overflow: 'hidden' }}>
              <div enter="grow" enterMs={700} style={{ width: '96%', height: '100%', background: P.danger }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 23, fontWeight: 850 }}>
              <span style={{ color: P.muted }}>硬件部署门槛</span>
              <span style={{ color: P.danger }}>多机集群才装得下</span>
            </div>
            <div style={{ height: 18, borderRadius: 9, background: P.slate, overflow: 'hidden' }}>
              <div enter="grow" enterMs={700} style={{ width: '88%', height: '100%', background: P.amber }} />
            </div>
          </div>
        </div>

        {/* 右侧情境区 B：Logit Lens 潜状态实时候选概率翻转（Pass 1 误判 6 → Pass 2 修正 12） */}
        <div
          when={oneOf(ui.stackMode, ['normalTop', 'loop1', 'loopArc', 'loop2'])}
          enter="fade"
          style={{ ...at(780, 228, 430, 240), display: 'flex', flexDirection: 'column', gap: 26 }}
        >
          <div style={{ fontSize: 21, fontWeight: 800, color: P.muted }}>
            潜状态解码倾向（示意）
          </div>
          {/* 候选 1：「6 件」（直觉陷阱） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ width: 76, fontSize: 26, fontWeight: 900, color: P.muted }}>6 件</span>
            <div style={{ flex: 1, height: 22, borderRadius: 11, background: P.slate, overflow: 'hidden' }}>
              <div
                style={{
                  width: ui.p6Width,
                  height: '100%',
                  background: P.danger,
                  transition: 'width 650ms cubic-bezier(.22,1,.36,1)',
                }}
              />
            </div>
            <span style={{ width: 64, fontSize: 22, fontWeight: 850, color: P.muted, textAlign: 'right' }}>{ui.p6Text}</span>
          </div>
          {/* 候选 2：「12 件」（正确推理） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ width: 76, fontSize: 26, fontWeight: 900, color: P.emerald }}>12 件</span>
            <div style={{ flex: 1, height: 22, borderRadius: 11, background: P.slate, overflow: 'hidden' }}>
              <div
                style={{
                  width: ui.p12Width,
                  height: '100%',
                  background: P.emerald,
                  transition: 'width 650ms cubic-bezier(.22,1,.36,1)',
                }}
              />
            </div>
            <span style={{ width: 64, fontSize: 22, fontWeight: 850, color: P.emerald, textAlign: 'right' }}>{ui.p12Text}</span>
          </div>
          <div when={oneOf(ui.stackMode, ['loop1', 'loopArc', 'loop2'])} style={{ fontSize: 21, fontWeight: 800, color: P.coral }}>
            权重显存：始终 1.0× 不变
          </div>
        </div>

        {/* 右侧情境区 C：数值幅度立柱（解释为什么必须加 Per-Token Gate） */}
        <div
          when={oneOf(ui.stackMode, ['gateBad', 'gateGood'])}
          enter="fade"
          style={{ ...at(780, 148, 470, 430), display: 'flex', alignItems: 'flex-end', gap: 32 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: P.muted }}>隐状态数值幅度</span>
            <div
              style={{
                width: 68,
                height: 320,
                borderRadius: 12,
                background: '#161b26',
                border: `2px solid ${P.slate}`,
                position: 'relative',
                display: 'flex',
                alignItems: 'flex-end',
                overflow: 'hidden',
              }}
            >
              {/* 安全上限虚线 */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: 82, borderTop: `2px dashed ${P.danger}` }} />
              <div
                style={{
                  width: '100%',
                  height: ui.normHeight,
                  background: ui.normColor,
                  transition: 'height 650ms cubic-bezier(.22,1,.36,1), background-color 400ms ease',
                }}
              />
            </div>
          </div>
          <div style={{ flex: 1, paddingBottom: 36, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div when={eq(ui.stackMode, 'gateBad')} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 25, fontWeight: 900, color: P.danger, lineHeight: 1.4 }}>
              <span>无门控硬叠加：</span>
              <span>两轮数值冲破上限，训练直接崩溃</span>
            </div>
            <div when={eq(ui.stackMode, 'gateGood')} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 25, fontWeight: 900, color: P.emerald, lineHeight: 1.4 }}>
              <span>加上逐词 Gate 阀门：</span>
              <span>第 1 遍打底稿，第 2 遍按需小步精修</span>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          岛 2（右上）：消融位置剪影 + 显式长思维链 vs 潜空间循环（Caleb 同款）
         ===================================================================== */}
      <div id="zone_latent" style={at(1940, 110, 1300, 760)}>
        {/* 上半：3 座极简层剪影对比“到底循环哪一段最好？” */}
        <div style={{ ...at(0, 10, 1280, 320), display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontSize: 26, fontWeight: 850, color: P.muted }}>
            消融实验：循环放在哪一段效果最好？
          </div>
          <div style={{ display: 'flex', gap: 56, alignItems: 'flex-end' }}>
            {[
              { label: '循环前段', sub: '特征尚未成型', bands: [true, false, false], win: false },
              { label: '循环中段（主流采用）', sub: '前编码 → 中循环 → 后解码', bands: [false, true, false], win: true },
              { label: '全网从头循环', sub: '首尾耦合，训练易崩', bands: [true, true, true], win: false },
            ].map((item, k) => (
              <div
                key={k}
                style={{
                  width: 340,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  opacity: item.win ? 1 : 0.52,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 200 }}>
                  {[2, 1, 0].map((seg) => (
                    <div
                      key={seg}
                      style={{
                        height: seg === 1 ? 56 : 26,
                        borderRadius: 7,
                        background: item.bands[seg] ? P.coral : P.slateBright,
                        border: item.win && seg === 1 ? `2px solid ${P.amber}` : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        fontWeight: 900,
                        color: P.ink,
                      }}
                    >
                      {item.bands[seg] ? '↻ 循环' : ''}
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 24, fontWeight: 900, color: item.win ? P.amber : P.ink }}>{item.label}</span>
                <span style={{ fontSize: 19, fontWeight: 700, color: item.win ? P.emerald : P.muted }}>{item.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 下半：显式 CoT 狂吐草稿词 vs Loop 潜空间静默循环 */}
        <div when={ui.showLatentCompare} enter="rise" style={{ ...at(0, 390, 1280, 340), display: 'flex', gap: 72 }}>
          {/* 左：显式思维链 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 25, fontWeight: 900, color: P.muted }}>传统显式思维链（吐字打草稿）</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: P.danger }}>占上下文 · 逐词解码慢</span>
            </div>
            <div enterStagger={110} style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {['先算单人速率…', '3÷3=1件…', '再算1小时…', '6人×6小时…', '核对单位…', '所以是 12'].map((t, i) => (
                <span
                  key={i}
                  enter="rise"
                  style={{
                    padding: '10px 16px',
                    borderRadius: 9,
                    background: i === 5 ? P.emeraldSoft : '#181d29',
                    border: `1.5px solid ${i === 5 ? P.emerald : P.slate}`,
                    fontSize: 21,
                    fontWeight: 800,
                    color: i === 5 ? P.emerald : P.muted,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* 右：Loop 潜空间推理 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 25, fontWeight: 900, color: P.coral }}>Loop 潜空间推理（脑内打草稿）</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: P.emerald }}>不吐废话词 · 思维链缩短</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22, paddingTop: 12 }}>
              <div
                className="lt-live-bar"
                style={{
                  padding: '18px 26px',
                  borderRadius: 14,
                  background: P.coralSoft,
                  border: `2.5px solid ${P.coral}`,
                  fontSize: 23,
                  fontWeight: 900,
                  color: P.coral,
                  whiteSpace: 'nowrap',
                }}
              >
                隐向量 h 循环 ×2 ↻
              </div>
              <span style={{ fontSize: 30, color: P.muted }}>→</span>
              <div
                style={{
                  padding: '18px 26px',
                  borderRadius: 14,
                  background: P.emeraldSoft,
                  border: `2.5px solid ${P.emerald}`,
                  fontSize: 25,
                  fontWeight: 900,
                  color: P.emerald,
                  whiteSpace: 'nowrap',
                }}
              >
                直出「12」
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          岛 3（左下）：一排 6 个词 + 词下圆点（固定 2 遍 vs 按词难度自适应遍数）
         ===================================================================== */}
      <div id="zone_adaptive" style={at(140, 1220, 1240, 720)}>
        <div style={{ ...at(0, 20, 1200), textAlign: 'center', fontSize: 28, fontWeight: 900, color: P.ink }}>
          <span when={eq(ui.dotMode, 'fixed')}>当前工业方案：每个词固定跑 2 遍（整齐并行）</span>
          <span when={eq(ui.dotMode, 'adaptive')}>未来演进方向：简单词跑 1 遍，难词多跑几遍（自适应计算）</span>
        </div>

        {/* 6 个数学词元横排 + 下方圆点（Bart 同款极简点阵！） */}
        <div style={{ ...at(40, 150, 1140, 280), display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {MATH_WORDS.map((w, idx) => (
            <div key={idx} style={{ width: 164, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
              <div
                style={{
                  width: 152,
                  height: 108,
                  borderRadius: 16,
                  background: '#161b26',
                  border: `2.5px solid ${w.hard ? P.coral : P.slateBright}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 40,
                  fontWeight: 900,
                  color: P.ink,
                }}
              >
                {w.text}
              </div>

              {/* 固定模式：每个词整齐 2 个珊瑚圆点 */}
              <div when={eq(ui.dotMode, 'fixed')} style={{ display: 'flex', gap: 12, height: 32, alignItems: 'center' }}>
                {[0, 1].map((d) => (
                  <span key={d} style={{ width: 20, height: 20, borderRadius: '50%', background: P.coral }} />
                ))}
              </div>

              {/* 自适应模式：简单词 1 点（灰绿），难词 4 点（亮珊瑚） */}
              <div when={eq(ui.dotMode, 'adaptive')} enterStagger={60} style={{ display: 'flex', gap: 10, height: 32, alignItems: 'center' }}>
                {Array.from({ length: w.adaptive }, (_, d) => (
                  <span
                    key={d}
                    enter="zoom"
                    enterEase="spring"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: w.hard ? P.coral : P.emerald,
                    }}
                  />
                ))}
              </div>

              <span style={{ fontSize: 20, fontWeight: 800, color: w.hard ? P.coral : P.muted }}>
                <span when={eq(ui.dotMode, 'fixed')}>固定 2 遍</span>
                <span when={eq(ui.dotMode, 'adaptive')}>{w.hard ? `难词 · ${w.adaptive} 遍` : `简单 · ${w.adaptive} 遍`}</span>
              </span>
            </div>
          ))}
        </div>

        {/* 底部一句点破工程取舍（无边框纯排版） */}
        <div style={{ ...at(10, 490, 1220), textAlign: 'center', fontSize: 23, fontWeight: 800 }}>
          <span when={eq(ui.dotMode, 'fixed')} style={{ color: P.muted }}>
            代价：连「=」这种简单符号也陪跑两遍，但整批词步调一致，GPU 利用率拉满
          </span>
          <span when={eq(ui.dotMode, 'adaptive')} style={{ color: P.amber }}>
            难点：不同词停机时间不一，快词要等慢词（批处理空泡）——这是下一代自适应循环正在攻克的关卡
          </span>
        </div>
      </div>

      {/* =====================================================================
          岛 4（右下）：等效参数塔 + 暂停可试实验台（权重显存静止 vs 深度增长）
         ===================================================================== */}
      <div id="zone_lab" style={at(1940, 1220, 1300, 720)}>
        {/* 左半：三座等基线层塔（750B Loop ×2 对标 2T–3T 传统堆层） */}
        <div style={{ ...at(0, 60, 520, 560), display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around' }}>
          {/* 塔 1：Loop 模型 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 21, fontWeight: 900, color: P.coral }}>推理能力相当 ──▶</span>
            <div style={{ width: 128, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ height: 34, borderRadius: 6, background: P.slateBright }} />
              <div className="lt-live-bar" style={{ height: 76, borderRadius: 6, background: P.coral }} />
              <div style={{ height: 34, borderRadius: 6, background: P.slateBright }} />
            </div>
            <span style={{ fontSize: 24, fontWeight: 900, color: P.coral }}>750B · Loop ×2</span>
            <span style={{ fontSize: 19, color: P.emerald, fontWeight: 800 }}>省显存体积</span>
          </div>

          {/* 塔 2：2T 传统堆层 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, opacity: 0.65 }}>
            <div style={{ width: 128, height: 280, borderRadius: 8, background: P.slate, border: `2px solid ${P.slateBright}` }} />
            <span style={{ fontSize: 23, fontWeight: 850, color: P.muted }}>~2T 传统模型</span>
            <span style={{ fontSize: 19, color: P.muted }}>纯靠堆参数</span>
          </div>

          {/* 塔 3：3T 传统堆层 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, opacity: 0.5 }}>
            <div style={{ width: 128, height: 390, borderRadius: 8, background: P.slate, border: `2px solid ${P.slateBright}` }} />
            <span style={{ fontSize: 23, fontWeight: 850, color: P.muted }}>~3T 传统模型</span>
            <span style={{ fontSize: 19, color: P.danger }}>显存开销巨大</span>
          </div>
        </div>

        {/* 右半：可交互循环次数切换（权重显存条纹丝不动 = 权重共享不变量！） */}
        <div style={{ ...at(580, 70, 700, 550), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: P.ink }}>亲手调循环圈数：谁变、谁不变？（示意）</span>
            <span style={{ fontSize: 20, color: P.muted }}>暂停播放也可点击下方档位，观察权重显存与推理深度的动静分离</span>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            {(['1', '2', '4'] as const).map((k) => (
              <Button
                key={k}
                id={`loop_${k}`}
                color={k === '2' ? P.coral : P.amber}
                onClick={pickLoop(k)}
              >
                {LOOP_SPECS[k].label}
              </Button>
            ))}
          </div>

          {(['1', '2', '4'] as const).map((k) => {
            const spec = LOOP_SPECS[k];
            return (
              <div key={k} when={eq(ui.labLoops, k)} style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
                {/* 不变量：模型权重显存条始终锁死在 38% 纹丝不动！ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 850 }}>
                    <span style={{ color: P.muted }}>模型权重显存（共享同一套参数）</span>
                    <span style={{ color: P.emerald }}>{spec.weightsLabel}</span>
                  </div>
                  <div style={{ height: 24, borderRadius: 12, background: P.slate, overflow: 'hidden' }}>
                    <div motion="const_vram_bar" style={{ width: `${spec.weightsVramPct}%`, height: '100%', borderRadius: 12, background: P.emerald }} />
                  </div>
                </div>

                {/* 变量 1：等效计算深度随循环次数伸长 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 850 }}>
                    <span style={{ color: P.muted }}>单字等效计算深度</span>
                    <span style={{ color: P.coral }}>{spec.depthLabel}</span>
                  </div>
                  <div style={{ height: 24, borderRadius: 12, background: P.slate, overflow: 'hidden' }}>
                    <div enter="grow" enterMs={550} style={{ width: `${spec.effectiveDepthPct}%`, height: '100%', borderRadius: 12, background: P.coral }} />
                  </div>
                </div>

                {/* 变量 2：多步推理表现 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 850 }}>
                    <span style={{ color: P.muted }}>多步逻辑准确率（示意）</span>
                    <span style={{ color: P.amber }}>{spec.accLabel}</span>
                  </div>
                  <div style={{ height: 24, borderRadius: 12, background: P.slate, overflow: 'hidden' }}>
                    <div enter="grow" enterMs={650} style={{ width: `${spec.accPct}%`, height: '100%', borderRadius: 12, background: P.amber }} />
                  </div>
                </div>

                <div style={{ fontSize: 21, fontWeight: 800, color: P.ink }}>{spec.note}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 极简右上角来源脚标（screen 固定层，无背景框干扰） */}
      <div
        screen
        when={neq(ui.hudSource, '')}
        style={{
          position: 'absolute',
          right: 44,
          top: 24,
          fontSize: 16,
          fontWeight: 700,
          color: P.faint,
          pointerEvents: 'none',
        }}
      >
        {ui.hudSource}
      </div>
    </Canvas>
  );
}
