/**
 * Loop Transformer 纯几何样片数据与单公式计量模型。
 *
 * 事实依据与示意边界：
 * - 架构事实：Universal Transformer (Dehghani et al., 2018)、Latent Reasoning / Looped Transformers
 *   (Saunshi et al., 2025; Geiping et al., 2025)、GLM-5.4 中段 28 层双次循环 + Per-Token Gate 架构（Z.ai, 2026）。
 * - 示意数值：18 根等比层条代表 Prelude / Looped Core / Coda 三段比例；推理题概率与循环档位读数为示意模型。
 */

export const PALETTE = {
  void: '#0d0f14',
  slate: '#2c3344',
  slateBright: '#47526b',
  coral: '#e86a4a',
  coralSoft: 'rgba(232, 106, 74, 0.18)',
  amber: '#f5b041',
  emerald: '#34d399',
  emeraldSoft: 'rgba(52, 211, 153, 0.16)',
  danger: '#f87171',
  dangerSoft: 'rgba(248, 113, 113, 0.16)',
  ink: '#f3f4f6',
  muted: '#8b95a9',
  faint: '#4b5568',
} as const;

export const SOURCES = {
  ut: 'Universal Transformers · Dehghani et al., 2018',
  latent: 'Reasoning with Latent Thoughts · Saunshi et al., 2025 / Geiping et al., 2025',
  glm: 'Middle-Block Loop + Per-Token Gate · Z.ai GLM-5.4 Technical Report, 2026',
} as const;

/** 经典反直觉推理题：第一遍直觉极易脱口答 6，第二遍细想速率后修正为 12。 */
export const RIDDLE = '3 人 3 小时造 3 件  →  6 人 6 小时造 ___ 件？';

/** 18 根视觉层条：0..3 为前段 Prelude，4..13（10 根）为中段共享循环层，14..17 为后段 Coda。 */
export const LAYER_INDICES = Array.from({ length: 18 }, (_, i) => i);
export const isCoreLayer = (idx: number) => idx >= 4 && idx <= 13;

/** 按词计算量对比词序列（固定 2 遍 vs 按难度自适应遍数）。 */
export const MATH_WORDS = [
  { text: '求', fixed: 2, adaptive: 1, hard: false },
  { text: '∫', fixed: 2, adaptive: 4, hard: true },
  { text: 'x²', fixed: 2, adaptive: 2, hard: false },
  { text: 'dx', fixed: 2, adaptive: 1, hard: false },
  { text: '=', fixed: 2, adaptive: 1, hard: false },
  { text: 'x³/3', fixed: 2, adaptive: 4, hard: true },
] as const;

export type LoopChoice = '1' | '2' | '4';

export type LoopSpec = {
  loops: number;
  label: string;
  /** 权重显存占用百分比——权重共享下恒定不变（42%）！ */
  weightsVramPct: number;
  weightsLabel: string;
  /** 等效推理计算深度（随中段循环次数线性增长）。 */
  effectiveDepthPct: number;
  depthLabel: string;
  /** 多步逻辑题准确率（示意）。 */
  accPct: number;
  accLabel: string;
  note: string;
};

export const LOOP_SPECS: Record<LoopChoice, LoopSpec> = {
  '1': {
    loops: 1,
    label: 'Loop ×1 · 单次直通',
    weightsVramPct: 38,
    weightsLabel: '权重显存 1.0×（基准不变）',
    effectiveDepthPct: 34,
    depthLabel: '等效深度 18 层',
    accPct: 42,
    accLabel: '多步题 42%（易掉直觉坑）',
    note: '每层只过一遍：速度快，但多步逻辑还没来得及在隐状态里展开',
  },
  '2': {
    loops: 2,
    label: 'Loop ×2 · 中段双循环',
    weightsVramPct: 38,
    weightsLabel: '权重显存 1.0×（零新增参数！）',
    effectiveDepthPct: 62,
    depthLabel: '等效深度 28 层（中段 ×2）',
    accPct: 78,
    accLabel: '多步题 78%（甜点档位）',
    note: '同一组中段权重跑两遍：显存一字节不涨，推理深度追平大 2–3 倍的模型',
  },
  '4': {
    loops: 4,
    label: 'Loop ×4 · 深度潜思',
    weightsVramPct: 38,
    weightsLabel: '权重显存 1.0×（零新增参数！）',
    effectiveDepthPct: 96,
    depthLabel: '等效深度 48 层（中段 ×4）',
    accPct: 88,
    accLabel: '多步题 88%（耗时增加）',
    note: '继续加圈可在难题上再榨出推理增益，但单字延迟线性上升且收益逐步递减',
  },
};
