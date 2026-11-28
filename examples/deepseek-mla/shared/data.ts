/**
 * DeepSeek MLA（Multi-head Latent Attention）纯几何样片数据与统一计量模型。
 *
 * 事实依据与示意边界：
 * - 论文实证参数（DeepSeek-V2, arXiv:2405.04434；DeepSeek-V3, arXiv:2412.19437）：
 *   n_h = 128 个注意力头，单头维度 d_h = 128；
 *   标准 MHA 单词单层缓存 2 × 128 × 128 = 32,768 维；
 *   GQA（8 组）单词单层缓存 2 × 8 × 128 = 2,048 维；
 *   DeepSeek MLA 缓存：低秩语义潜向量 d_c = 512 维 + 共享解耦 RoPE d_h^R = 64 维 = 576 维/词·层；
 *   系统实测（DeepSeek-V2 对比 DeepSeek 67B）：KV Cache 降低 93.3%，最大生成吞吐提升至 5.76×。
 * - 舞台视觉简化：用 8 条可视头轨代表 128 个注意力头（显式标注“示意 8 轨代表 128 头”）。
 */

export const PALETTE = {
  void: '#0b0e14',
  slate: '#232b3b',
  slateBright: '#3d4a63',
  cyan: '#22d3ee',
  cyanSoft: 'rgba(34, 211, 238, 0.16)',
  amber: '#f59e0b',
  amberSoft: 'rgba(245, 158, 11, 0.16)',
  emerald: '#34d399',
  emeraldSoft: 'rgba(52, 211, 153, 0.16)',
  danger: '#f87171',
  dangerSoft: 'rgba(248, 113, 113, 0.16)',
  ink: '#f3f4f6',
  muted: '#8d98ad',
  faint: '#4d586e',
} as const;

export const SOURCES = {
  v2: 'DeepSeek-V2: Multi-head Latent Attention · arXiv:2405.04434 (2024)',
  v3: 'DeepSeek-V3 Technical Report · d_c = 512, d_h^R = 64 · arXiv:2412.19437',
} as const;

export const SPECIMEN_WORD = '「净利」';
export const SPECIMEN_META = '128K 财报 · 第 84,210 词';

/** 8 条代表性头轨（等比代表 n_h = 128 头）。 */
export const HEAD_LANES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export type ArchChoice = 'mha' | 'gqa' | 'mla';

export type ArchSpec = {
  key: ArchChoice;
  label: string;
  dimsPerToken: string;
  headsText: string;
  headsWidth: string;
  headsColor: string;
  vramText: string;
  vramWidth: string;
  vramColor: string;
  tputText: string;
  tputWidth: string;
  tputColor: string;
  note: string;
};

export const ARCH_SPECS: Record<ArchChoice, ArchSpec> = {
  mha: {
    key: 'mha',
    label: 'MHA · 标准多头',
    dimsPerToken: '32,768 维 / 词·层',
    headsText: '128 头各自独立（100%）',
    headsWidth: '100%',
    headsColor: PALETTE.emerald,
    vramText: '100% 原始体积（128K 易爆显存）',
    vramWidth: '100%',
    vramColor: PALETTE.danger,
    tputText: '1.0× 基准吞吐（卡在显存带宽）',
    tputWidth: '18%',
    tputColor: PALETTE.slateBright,
    note: '每个头都存完整 K、V：表达力满格，但长文本下显存与带宽最先撑爆',
  },
  gqa: {
    key: 'gqa',
    label: 'GQA · 分组共享',
    dimsPerToken: '2,048 维 / 词·层（8 组）',
    headsText: '仅 8 组共享 K/V（多头同质化）',
    headsWidth: '32%',
    headsColor: PALETTE.amber,
    vramText: '~24% 显存占用（靠砍头妥协）',
    vramWidth: '24%',
    vramColor: PALETTE.amber,
    tputText: '~2.6× 吞吐提升（示意）',
    tputWidth: '45%',
    tputColor: PALETTE.amber,
    note: '强行让 16 个头共用同一份 K、V：显存降了，但损失了细粒度独立注意力视角',
  },
  mla: {
    key: 'mla',
    label: 'MLA · 潜空间吸收',
    dimsPerToken: '512 + 64 = 576 维 / 词·层',
    headsText: '128 头独立视角完整保留（100%）',
    headsWidth: '100%',
    headsColor: PALETTE.emerald,
    vramText: '6.7% 显存占用（直降 93.3%！）',
    vramWidth: '7%',
    vramColor: PALETTE.cyan,
    tputText: '5.76× 最大生成吞吐（DeepSeek-V2 实测）',
    tputWidth: '98%',
    tputColor: PALETTE.cyan,
    note: '存的时候只有 576 维，算的时候靠吸收进各头的 W_UQ·W_UK⊤ 还原 128 种独立视角',
  },
};
