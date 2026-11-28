import { $, eq, neq, oneOf, patch } from '@joplo-app/kit';
import { Button } from '@joplo-app/plugin-ui';
import { Canvas } from '@joplo-app/plugin-content';
import {
  ARCH_SPECS,
  HEAD_LANES,
  PALETTE as P,
  SPECIMEN_META,
  SPECIMEN_WORD,
  type ArchChoice,
} from './data.ts';

export type MlaUiState = {
  __plugins?: {
    content?: {
      camera?: { targets: string[]; pad?: number };
    };
  };
  /** 岛 1：'mha' | 'gqa' | 'ask' */
  wallMode: string;
  vramPillarH: string;
  vramPillarColor: string;
  vramPillarLabel: string;
  headsPillarH: string;
  headsPillarColor: string;
  headsPillarLabel: string;
  /** 岛 2：'compress' | 'naive_expand' | 'absorbing' | 'absorbed' */
  absorbStage: string;
  /** 岛 3：'blocked' | 'decoupling' | 'decoupled' */
  ropeStage: string;
  /** 岛 4：'mha' | 'gqa' | 'mla' */
  labArch: ArchChoice;
  /** 右上角极简论文脚注 */
  hudSource: string;
};

const at = (x: number, y: number, w?: number, h?: number) => ({
  position: 'absolute' as const,
  left: x,
  top: y,
  ...(w !== undefined ? { width: w } : {}),
  ...(h !== undefined ? { height: h } : {}),
});

const pickArch = (choice: ArchChoice) => patch($.ui, { labArch: choice });

export function MlaWorld() {
  const ui = $.ui as unknown as MlaUiState;

  return (
    <Canvas
      w={3400}
      h={2140}
      view={[1600, 1000]}
      safe={[118, 64, 116, 64]}
      bg={P.void}
      drift={0.75}
    >
      {/* =====================================================================
          岛 1（左上）：128 头 KV 显存墙 vs GQA 砍头妥协（去外框面板，纯几何轨道）
         ===================================================================== */}
      <div id="zone_wall" style={at(140, 130, 1220, 740)}>
        {/* 顶部单行锚点标题 */}
        <div style={{ ...at(0, 14, 1200), textAlign: 'center', fontSize: 28, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>
          <span when={eq(ui.wallMode, 'mha')}>标准多头注意力（MHA）：128 个头各自缓存一份 K 和 V</span>
          <span when={eq(ui.wallMode, 'gqa')}>分组查询（GQA）：省了显存，但多个头被迫共用同一份 K、V</span>
          <span when={eq(ui.wallMode, 'ask')}>核心追问：能不能显存只存极小一团，却保留 128 种独立视角？</span>
        </div>

        {/* 左侧具象词元样本 */}
        <div
          motion="tok_specimen"
          style={{
            ...at(10, 276, 224, 136),
            borderRadius: 18,
            background: '#141a26',
            border: `2.5px solid ${P.cyan}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 0 28px rgba(34,211,238,0.18)',
          }}
        >
          <span style={{ fontSize: 36, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>{SPECIMEN_WORD}</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: P.muted, whiteSpace: 'nowrap' }}>{SPECIMEN_META}</span>
        </div>

        {/* 指向箭头 */}
        <div style={{ ...at(246, 326, 44), textAlign: 'center', fontSize: 30, fontWeight: 900, color: P.muted }}>
          →
        </div>

        {/* 中央区域 A：MHA 8 条代表性头轨各自塞满 K、V 砖块 */}
        <div
          when={eq(ui.wallMode, 'mha')}
          enter="fade"
          style={{ ...at(300, 108, 490, 520), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
        >
          {HEAD_LANES.map((h) => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 14, height: 50 }}>
              <span style={{ width: 68, fontSize: 18, fontWeight: 800, color: P.muted, whiteSpace: 'nowrap' }}>
                头 #{h + 1}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 8,
                  background: P.dangerSoft,
                  border: `2px solid ${P.danger}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 900,
                  color: P.danger,
                  whiteSpace: 'nowrap',
                }}
              >
                独立 K_{h + 1}（128维）
              </div>
              <div
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 8,
                  background: P.amberSoft,
                  border: `2px solid ${P.amber}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 900,
                  color: P.amber,
                  whiteSpace: 'nowrap',
                }}
              >
                独立 V_{h + 1}（128维）
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, color: P.muted, paddingTop: 6, whiteSpace: 'nowrap' }}>
            示意 8 轨代表 128 头 · 每词每层共塞入 32,768 维
          </div>
        </div>

        {/* 中央区域 B：GQA 强行合并为 2 块灰色克隆共享块 */}
        <div
          when={eq(ui.wallMode, 'gqa')}
          enter="fade"
          style={{ ...at(300, 136, 490, 460), display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}
        >
          {[0, 1].map((g) => (
            <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div
                style={{
                  width: 270,
                  height: 156,
                  borderRadius: 16,
                  background: P.slate,
                  border: `2.5px dashed ${P.amber}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 23, fontWeight: 900, color: P.amber, whiteSpace: 'nowrap' }}>
                  共享组 #{g + 1} K / V
                </span>
                <span style={{ fontSize: 17, fontWeight: 700, color: P.muted, whiteSpace: 'nowrap' }}>
                  多个头被迫读同一份键值
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[0, 1, 2, 3].map((sub) => (
                  <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: P.amber }} />
                    <span style={{ fontSize: 17, fontWeight: 800, color: P.muted, whiteSpace: 'nowrap' }}>
                      头 #{g * 4 + sub + 1}（同质视角）
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 中央区域 C：MLA 悬念轮廓（极小潜核 -> 依然辐射出 8 个独立彩色头视角） */}
        <div
          when={eq(ui.wallMode, 'ask')}
          enter="zoom"
          style={{ ...at(300, 140, 490, 450), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div
            className="mla-live"
            style={{
              width: 196,
              height: 132,
              borderRadius: 66,
              background: P.cyanSoft,
              border: `3px solid ${P.cyan}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: '0 0 36px rgba(34,211,238,0.28)',
            }}
          >
            <span style={{ fontSize: 28, fontWeight: 900, color: P.cyan, whiteSpace: 'nowrap' }}>极小潜向量 ?</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: P.ink, whiteSpace: 'nowrap' }}>只存几百维</span>
          </div>

          <span style={{ fontSize: 32, fontWeight: 900, color: P.cyan }}>──▶</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {HEAD_LANES.map((h) => (
              <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: P.emerald }} />
                <span style={{ fontSize: 18, fontWeight: 850, color: P.emerald, whiteSpace: 'nowrap' }}>
                  头 #{h + 1} 独立视角 ✓
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧双零基线立柱：KV 显存占用 vs 多头独立表达力 */}
        <div style={{ ...at(846, 136, 350, 480), display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end' }}>
          {/* 柱 1：KV 显存 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 19, fontWeight: 900, color: ui.vramPillarColor, whiteSpace: 'nowrap' }}>
              {ui.vramPillarLabel}
            </span>
            <div
              style={{
                width: 78,
                height: 340,
                borderRadius: 14,
                background: '#151b26',
                border: `2px solid ${P.slateBright}`,
                display: 'flex',
                alignItems: 'flex-end',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: ui.vramPillarH,
                  background: ui.vramPillarColor,
                  transition: 'height 520ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>
            <span style={{ fontSize: 20, fontWeight: 850, color: P.muted, whiteSpace: 'nowrap' }}>KV 显存占用</span>
          </div>

          {/* 柱 2：多头独立视角 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 19, fontWeight: 900, color: ui.headsPillarColor, whiteSpace: 'nowrap' }}>
              {ui.headsPillarLabel}
            </span>
            <div
              style={{
                width: 78,
                height: 340,
                borderRadius: 14,
                background: '#151b26',
                border: `2px solid ${P.slateBright}`,
                display: 'flex',
                alignItems: 'flex-end',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: ui.headsPillarH,
                  background: ui.headsPillarColor,
                  transition: 'height 520ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>
            <span style={{ fontSize: 20, fontWeight: 850, color: P.muted, whiteSpace: 'nowrap' }}>多头独立视角</span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          岛 2（右上）：低秩潜向量 c_KV + 矩阵吸收双向飞行（静音观察高潮 #1）
         ===================================================================== */}
      <div id="zone_absorb" style={at(1960, 130, 1280, 740)}>
        {/* 顶部标题 */}
        <div style={{ ...at(0, 16, 1260), textAlign: 'center', fontSize: 28, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>
          <span when={eq(ui.absorbStage, 'compress')}>第一步：把全层 K、V 联合压成一粒 512 维潜向量 c_KV</span>
          <span when={eq(ui.absorbStage, 'naive_expand')}>假省显存陷阱：若推理时再乘 W_UK、W_UV 展开，32,768 维照样爆带宽！</span>
          <span when={oneOf(ui.absorbStage, ['absorbing', 'absorbed'])}>
            矩阵吸收：W_UK 左滑并入 Query，W_UV 右滑并入 Output——永不解压！
          </span>
        </div>

        {/* 左站：Query 查询侧（吸收后接纳 motion="mat_wuk"） */}
        <div style={{ ...at(20, 270, 396, 180), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 184,
                height: 108,
                borderRadius: 16,
                background: '#161e2e',
                border: `2.5px solid ${P.slateBright}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 23, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>查询投影 W_UQ</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: P.muted, whiteSpace: 'nowrap' }}>128 头独立查询</span>
            </div>

            {/* 吸收态：W_UK 飞抵左侧与 W_UQ 严丝合缝合体！ */}
            <div
              when={oneOf(ui.absorbStage, ['absorbing', 'absorbed'])}
              motion="mat_wuk"
              motionMs={850}
              style={{
                width: 176,
                height: 108,
                borderRadius: 16,
                background: P.cyanSoft,
                border: `2.5px solid ${P.cyan}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 0 26px rgba(34,211,238,0.28)',
              }}
            >
              <span style={{ fontSize: 23, fontWeight: 900, color: P.cyan, whiteSpace: 'nowrap' }}>× W_UK⊤</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: P.emerald, whiteSpace: 'nowrap' }}>已并入查询侧 ✓</span>
            </div>
          </div>

          <span
            when={oneOf(ui.absorbStage, ['absorbing', 'absorbed'])}
            enter="rise"
            style={{ fontSize: 19, fontWeight: 900, color: P.emerald, whiteSpace: 'nowrap' }}
          >
            合并算子 W_UQ · W_UK⊤（直接向潜向量提问）
          </span>
        </div>

        {/* 中站：驻留在 HBM 显存里的唯一主角 c_KV（512 维，稳如磐石！） */}
        <div style={{ ...at(468, 250, 320, 220), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div
            className="mla-live"
            style={{
              width: 248,
              height: 132,
              borderRadius: 66,
              background: P.cyanSoft,
              border: `3.5px solid ${P.cyan}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: '0 0 40px rgba(34,211,238,0.3)',
            }}
          >
            <span style={{ fontSize: 30, fontWeight: 900, color: P.cyan, whiteSpace: 'nowrap' }}>潜向量 c_KV</span>
            <span style={{ fontSize: 20, fontWeight: 850, color: P.ink, whiteSpace: 'nowrap' }}>仅 512 维</span>
          </div>

          <span style={{ fontSize: 19, fontWeight: 850, color: P.emerald, whiteSpace: 'nowrap' }}>
            <span when={eq(ui.absorbStage, 'compress')}>压缩 64 倍（32,768 → 512）</span>
            <span when={eq(ui.absorbStage, 'naive_expand')} style={{ color: P.amber }}>一旦解压就前功尽弃…</span>
            <span when={oneOf(ui.absorbStage, ['absorbing', 'absorbed'])}>显存全程只存它 · 零解压 ✓</span>
          </span>
        </div>

        {/* 未吸收态（中右）：W_UK 与 W_UV 挂在潜向量右侧试图解压 */}
        <div
          when={oneOf(ui.absorbStage, ['compress', 'naive_expand'])}
          style={{ ...at(808, 200, 450, 320), display: 'flex', alignItems: 'center', gap: 20 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div
              motion="mat_wuk"
              style={{
                width: 176,
                height: 100,
                borderRadius: 16,
                background: '#192234',
                border: `2.5px solid ${P.cyan}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 900, color: P.cyan, whiteSpace: 'nowrap' }}>解压键 W_UK</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: P.muted, whiteSpace: 'nowrap' }}>升维还原 128 头 K</span>
            </div>

            <div
              motion="mat_wuv"
              style={{
                width: 176,
                height: 100,
                borderRadius: 16,
                background: '#192234',
                border: `2.5px solid ${P.cyan}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 900, color: P.cyan, whiteSpace: 'nowrap' }}>解压值 W_UV</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: P.muted, whiteSpace: 'nowrap' }}>升维还原 128 头 V</span>
            </div>
          </div>

          {/* 假省显存警告：一旦真的乘出来，32,768 维巨型张量重回带宽！ */}
          <div
            when={eq(ui.absorbStage, 'naive_expand')}
            enter="zoom"
            exit="shrink"
            style={{
              width: 244,
              height: 228,
              borderRadius: 18,
              background: P.dangerSoft,
              border: `3px dashed ${P.danger}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 16,
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 25, fontWeight: 900, color: P.danger, whiteSpace: 'nowrap' }}>✕ 128 头大矩阵</span>
            <span style={{ fontSize: 19, fontWeight: 850, color: P.ink, whiteSpace: 'nowrap' }}>32,768 维重现</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: P.danger, whiteSpace: 'nowrap' }}>HBM 带宽照样堵死</span>
          </div>
        </div>

        {/* 右站：Output 输出侧（吸收后接纳 motion="mat_wuv"） */}
        <div
          when={oneOf(ui.absorbStage, ['absorbing', 'absorbed'])}
          enter="fade"
          style={{ ...at(848, 270, 404, 180), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              motion="mat_wuv"
              motionMs={850}
              style={{
                width: 176,
                height: 108,
                borderRadius: 16,
                background: P.cyanSoft,
                border: `2.5px solid ${P.cyan}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 0 26px rgba(34,211,238,0.28)',
              }}
            >
              <span style={{ fontSize: 23, fontWeight: 900, color: P.cyan, whiteSpace: 'nowrap' }}>W_UV ×</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: P.emerald, whiteSpace: 'nowrap' }}>已并入输出侧 ✓</span>
            </div>

            <div
              style={{
                width: 184,
                height: 108,
                borderRadius: 16,
                background: '#161e2e',
                border: `2.5px solid ${P.slateBright}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 23, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>输出投影 W_O</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: P.muted, whiteSpace: 'nowrap' }}>汇总多头结果</span>
            </div>
          </div>

          <span style={{ fontSize: 19, fontWeight: 900, color: P.emerald, whiteSpace: 'nowrap' }}>
            合并算子 W_UV · W_O（直接汇总潜空间输出）
          </span>
        </div>

        {/* 底部结合律本质点睛 */}
        <div
          when={eq(ui.absorbStage, 'absorbed')}
          enter="rise"
          style={{ ...at(80, 560, 1120), textAlign: 'center', fontSize: 24, fontWeight: 850, color: P.ink, whiteSpace: 'nowrap' }}
        >
          矩阵乘法结合律：Q · (c_KV · W_UK)⊤  ＝  (Q · W_UK⊤) · c_KV⊤ —— 省掉中间巨型 K 张量！
        </div>
      </div>

      {/* =====================================================================
          岛 3（左下）：RoPE 旋转卡壳 -> “解耦 RoPE”双轨分离（静音观察高潮 #2）
         ===================================================================== */}
      <div id="zone_rope" style={at(140, 1210, 1260, 740)}>
        <div style={{ ...at(0, 16, 1240), textAlign: 'center', fontSize: 28, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>
          <span when={eq(ui.ropeStage, 'blocked')}>
            拦路虎：旋转位置编码 RoPE 夹在 Q 与 K 中间随距离变化，挡死了矩阵吸收！
          </span>
          <span when={oneOf(ui.ropeStage, ['decoupling', 'decoupled'])}>
            解耦 RoPE：位置拆去 64 维共享窄轨，512 维语义主干立刻恢复畅通吸收！
          </span>
        </div>

        {/* 上轨：语义内容主轨（NoPE） */}
        <div style={{ ...at(20, 148), fontSize: 20, fontWeight: 850, color: P.cyan, whiteSpace: 'nowrap' }}>
          语义内容主轨（512 维）
        </div>

        {/* 左端固定 W_UQ */}
        <div
          style={{
            ...at(20, 196, 196, 108),
            borderRadius: 16,
            background: '#161e2e',
            border: `2.5px solid ${P.slateBright}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 23, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>查询 W_UQ</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: P.muted, whiteSpace: 'nowrap' }}>等待吸收 W_UK</span>
        </div>

        {/* 状态 1（blocked）：RoPE 旋转锁硬卡在 W_UQ 与 W_UK 中间 */}
        <div when={eq(ui.ropeStage, 'blocked')}>
          <div
            motion="rope_gear"
            className="mla-gear"
            style={{
              ...at(276, 188, 256, 124),
              borderRadius: 20,
              background: P.amberSoft,
              border: `3px solid ${P.amber}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: '0 0 30px rgba(248,113,113,0.32)',
            }}
          >
            <span style={{ fontSize: 24, fontWeight: 900, color: P.amber, whiteSpace: 'nowrap' }}>↻ RoPE 位置矩阵</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: P.danger, whiteSpace: 'nowrap' }}>随词距 m−n 实时改变 ✕</span>
          </div>

          <div
            motion="rope_wuk"
            style={{
              ...at(592, 196, 196, 108),
              borderRadius: 16,
              background: '#192234',
              border: `2.5px dashed ${P.danger}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 23, fontWeight: 900, color: P.cyan, whiteSpace: 'nowrap' }}>W_UK 被卡住</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: P.danger, whiteSpace: 'nowrap' }}>◀ 无法跨过位置锁</span>
          </div>

          <div
            style={{
              ...at(856, 196, 336, 108),
              borderRadius: 18,
              background: P.cyanSoft,
              border: `2.5px solid ${P.cyan}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 25,
              fontWeight: 900,
              color: P.cyan,
              whiteSpace: 'nowrap',
            }}
          >
            潜向量 c_KV · 512 维
          </div>
        </div>

        {/* 状态 2（decoupling / decoupled）：RoPE 飞入下层窄轨，上层 W_UK 顺畅左滑合体！ */}
        <div when={oneOf(ui.ropeStage, ['decoupling', 'decoupled'])}>
          {/* W_UK 左滑紧贴 W_UQ */}
          <div
            motion="rope_wuk"
            motionMs={850}
            style={{
              ...at(228, 196, 206, 108),
              borderRadius: 16,
              background: P.cyanSoft,
              border: `2.5px solid ${P.cyan}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              boxShadow: '0 0 26px rgba(34,211,238,0.28)',
            }}
          >
            <span style={{ fontSize: 23, fontWeight: 900, color: P.cyan, whiteSpace: 'nowrap' }}>× W_UK⊤ 畅通合体</span>
            <span style={{ fontSize: 16, fontWeight: 850, color: P.emerald, whiteSpace: 'nowrap' }}>无位置干扰（NoPE）✓</span>
          </div>

          {/* 畅通连线 */}
          <div style={{ ...at(462, 232, 370), textAlign: 'center', fontSize: 24, fontWeight: 900, color: P.emerald, whiteSpace: 'nowrap' }}>
            ────── 免解压直连 ──────▶
          </div>

          {/* 下层：共享位置窄轨 */}
          <div style={{ ...at(20, 412), fontSize: 20, fontWeight: 850, color: P.amber, whiteSpace: 'nowrap' }}>
            解耦位置窄轨（128 头共享同一份位置键）
          </div>

          <div
            motion="rope_gear"
            motionMs={850}
            style={{
              ...at(228, 456, 268, 102),
              borderRadius: 18,
              background: P.amberSoft,
              border: `2.5px solid ${P.amber}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 23, fontWeight: 900, color: P.amber, whiteSpace: 'nowrap' }}>↻ 解耦 RoPE 窄轨</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: P.ink, whiteSpace: 'nowrap' }}>单独承载相对词距信息</span>
          </div>

          <div style={{ ...at(522, 488, 310), textAlign: 'center', fontSize: 22, fontWeight: 900, color: P.amber, whiteSpace: 'nowrap' }}>
            ──── 仅追加极薄一层 ────▶
          </div>

          {/* 右侧：最终叠合的 512 + 64 = 576 维双色缓存胶囊！ */}
          <div style={{ ...at(856, 186, 356, 400), display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              className="mla-live"
              style={{
                height: 156,
                borderRadius: '18px 18px 8px 8px',
                background: P.cyanSoft,
                border: `3px solid ${P.cyan}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 27, fontWeight: 900, color: P.cyan, whiteSpace: 'nowrap' }}>语义核 c_KV = 512 维</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: P.ink, whiteSpace: 'nowrap' }}>承载全部 128 头内容特征</span>
            </div>

            <div
              enter="rise"
              style={{
                height: 64,
                borderRadius: '8px 8px 18px 18px',
                background: P.amberSoft,
                border: `3px solid ${P.amber}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 23,
                fontWeight: 900,
                color: P.amber,
                whiteSpace: 'nowrap',
              }}
            >
              + 共享位置签 k^R = 64 维
            </div>

            <div style={{ paddingTop: 12, textAlign: 'center', fontSize: 26, fontWeight: 900, color: P.emerald, whiteSpace: 'nowrap' }}>
              ＝ 仅存 576 维 / 词·层 ✓
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          岛 4（右下）：576 vs 32,768 等基线体量塔 + 128K 架构切换实验台
         ===================================================================== */}
      <div id="zone_scale" style={at(1940, 1210, 1320, 740)}>
        {/* 左半：三座等基线单字缓存维度塔 */}
        <div style={{ ...at(0, 48, 540, 590), display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around' }}>
          {/* 塔 1：MHA 32,768 维 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 21, fontWeight: 900, color: P.danger, whiteSpace: 'nowrap' }}>32,768 维</span>
            <div
              style={{
                width: 126,
                height: 392,
                borderRadius: 10,
                background: P.dangerSoft,
                border: `2.5px solid ${P.danger}`,
              }}
            />
            <span style={{ fontSize: 22, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>标准 MHA</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: P.danger, whiteSpace: 'nowrap' }}>显存巨兽</span>
          </div>

          {/* 塔 2：GQA 2,048 维 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 21, fontWeight: 900, color: P.amber, whiteSpace: 'nowrap' }}>2,048 维</span>
            <div
              style={{
                width: 126,
                height: 104,
                borderRadius: 10,
                background: P.slate,
                border: `2.5px solid ${P.amber}`,
              }}
            />
            <span style={{ fontSize: 22, fontWeight: 900, color: P.muted, whiteSpace: 'nowrap' }}>GQA-8</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: P.amber, whiteSpace: 'nowrap' }}>砍头损精度</span>
          </div>

          {/* 塔 3：MLA 576 维（512 青 + 64 琥珀） */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: P.emerald, whiteSpace: 'nowrap' }}>▼ 直降 93.3%</span>
            <span style={{ fontSize: 23, fontWeight: 900, color: P.cyan, whiteSpace: 'nowrap' }}>仅 576 维</span>
            <div style={{ width: 126, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div className="mla-live" style={{ height: 28, borderRadius: '6px 6px 2px 2px', background: P.cyan }} />
              <div style={{ height: 8, borderRadius: '2px 2px 6px 6px', background: P.amber }} />
            </div>
            <span style={{ fontSize: 23, fontWeight: 900, color: P.cyan, whiteSpace: 'nowrap' }}>DeepSeek MLA</span>
            <span style={{ fontSize: 17, fontWeight: 850, color: P.emerald, whiteSpace: 'nowrap' }}>512 + 64 双轨</span>
          </div>
        </div>

        {/* 右半：可交互 128K 长上下文实验台 */}
        <div style={{ ...at(590, 56, 710, 580), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: P.ink, whiteSpace: 'nowrap' }}>
              128K 长上下文架构对比台（暂停可点按）
            </span>
            <span style={{ fontSize: 19, color: P.muted, whiteSpace: 'nowrap' }}>
              切换 MHA / GQA / MLA，观察“128 头独立视角”与“显存占用”如何解耦
            </span>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            {(['mha', 'gqa', 'mla'] as const).map((k) => (
              <Button
                key={k}
                id={`arch_${k}`}
                color={k === 'mla' ? '#0891b2' : '#334155'}
                onClick={pickArch(k)}
              >
                {ARCH_SPECS[k].label}
              </Button>
            ))}
          </div>

          {(['mha', 'gqa', 'mla'] as const).map((k) => {
            const spec = ARCH_SPECS[k];
            return (
              <div key={k} when={eq(ui.labArch, k)} style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
                {/* 指标 1：128 头独立视角（MHA 与 MLA 均锁在 100% 满格！） */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 21, fontWeight: 850 }}>
                    <span style={{ color: P.muted }}>多头独立表达视角</span>
                    <span style={{ color: spec.headsColor }}>{spec.headsText}</span>
                  </div>
                  <div style={{ height: 24, borderRadius: 12, background: P.slate, overflow: 'hidden' }}>
                    <div
                      motion="const_heads_bar"
                      style={{ width: spec.headsWidth, height: '100%', borderRadius: 12, background: spec.headsColor }}
                    />
                  </div>
                </div>

                {/* 指标 2：128K KV 显存占用 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 21, fontWeight: 850 }}>
                    <span style={{ color: P.muted }}>128K 长文 KV 显存占用</span>
                    <span style={{ color: spec.vramColor }}>{spec.vramText}</span>
                  </div>
                  <div style={{ height: 24, borderRadius: 12, background: P.slate, overflow: 'hidden' }}>
                    <div
                      enter="grow"
                      enterMs={550}
                      style={{ width: spec.vramWidth, height: '100%', borderRadius: 12, background: spec.vramColor }}
                    />
                  </div>
                </div>

                {/* 指标 3：单机最大生成吞吐 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 21, fontWeight: 850 }}>
                    <span style={{ color: P.muted }}>单机最大生成吞吐</span>
                    <span style={{ color: spec.tputColor }}>{spec.tputText}</span>
                  </div>
                  <div style={{ height: 24, borderRadius: 12, background: P.slate, overflow: 'hidden' }}>
                    <div
                      enter="grow"
                      enterMs={650}
                      style={{ width: spec.tputWidth, height: '100%', borderRadius: 12, background: spec.tputColor }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: 20, fontWeight: 800, color: P.ink }}>{spec.note}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 极简右上角论文引用脚注（screen 固定层，无背景框） */}
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
