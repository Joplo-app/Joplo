/**
 * Joplo 下一阶段核心产品体验演示（基于 Astra + Sol 联合评审结论）。
 * 以「成员邀请超时后，管理员再点一次会不会重复发送」为贯穿全片的具象案例。
 */

export const PALETTE = {
  void: '#0c1017',
  surface: '#151c28',
  slate: '#253045',
  slateBright: '#3f4f6e',
  cyan: '#22d3ee',
  cyanSoft: 'rgba(34, 211, 238, 0.15)',
  emerald: '#34d399',
  emeraldSoft: 'rgba(52, 211, 153, 0.16)',
  amber: '#f59e0b',
  amberSoft: 'rgba(245, 158, 11, 0.16)',
  danger: '#f87171',
  dangerSoft: 'rgba(248, 113, 113, 0.16)',
  ink: '#f3f4f6',
  muted: '#94a3b8',
  faint: '#526079',
} as const;

export const FONT_SANS =
  'system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif';

export type ForkOption = 'a' | 'b';

export const FORK_SPECS: Record<
  ForkOption,
  {
    label: string;
    btnColor: string;
    gateLabel: string;
    gateSub: string;
    dbRows: readonly { text: string; bad?: boolean }[];
    uiOutcome: string;
    uiBad: boolean;
    summary: string;
  }
> = {
  a: {
    label: '方案 A · 仅前端防抖（常见坑）',
    btnColor: '#7f1d1d',
    gateLabel: '无服务端去重',
    gateSub: '刷新页面再点 → 请求直接放行',
    dbRows: [
      { text: '#1 · lin@acme.com · 待确认' },
      { text: '#2 · lin@acme.com · 重复写入 ✕', bad: true },
    ],
    uiOutcome: '✕ 发出 2 封重复邮件 + 脏数据',
    uiBad: true,
    summary: '只靠前端按钮防抖，超时刷新后立刻失效——开工前不演出来极易漏掉',
  },
  b: {
    label: '方案 B · 服务端幂等去重（推荐）',
    btnColor: '#0e7490',
    gateLabel: '🔑 幂等键命中 · 拦截重复',
    gateSub: '同一请求复用已建记录，不重发邮件',
    dbRows: [{ text: '#1 · lin@acme.com · 仅保留 1 条 ✓' }],
    uiOutcome: '✓ 页面提示「该成员已在待确认中」',
    uiBad: false,
    summary: '服务层用幂等键兜底：界面友好、邮件不重发、数据库绝不多写一条',
  },
};

export const DO_NOW = [
  '1 · Agent 默认输出「最小待拍板配方」（成功 + 失败 + 关键分歧，压低创作耗时）',
  '2 · 停在分歧处拍板 + 反馈处理回执定点复审 + 决定与理由沉淀进 Git',
  '3 · 2–4 周 5 位外部重度用户实测过线 → Q2 只接 1 条团队已有测试证据',
] as const;

export const NOT_NOW = [
  '✕ 任意仓库零配置全量 PR 自动行为证明',
  '✕ 自建通用运行时 Trace 采集与测试基础设施',
  '✕ 把多语言文档另立为第二条并列商业主线',
  '✕ 通用视频剪辑特效堆料 / 无代码 PM 拖拽编辑器',
] as const;
