import { feature, question, role, rule } from '@joplo-app/kit';

export default feature({
  order: 20,
  pick: 'a-narrative-viz',
  name: '数据可视化插件：十类叙事图表一次性收口，彻底移出 UI 与架构图',
  goal: '作者与 Agent 在 Joplo 里表达前后收益对比、量级权衡、占比门槛、渐进趋势、时间泳道、帕累托前沿、热力矩阵、桑基流向、瀑布归因与多维雷达时，不再滥用 RatioBar 或手搓 div，统一由 @joplo-app/plugin-viz 提供确定性、逐项可寻址的叙事图表',
  roles: {
    author: role('演示作者 / Agent', { desc: '用一套统一的语义化图表原语写出零 BI 塑料感、逐项可寻址的数据叙事画面' }),
    reviewer: role('方案评审者', { desc: '一眼分辨前后差值、锁定不变量、前沿权衡与流量去向，并可暂停互动对比' }),
  },
  cases: {
    before_after_delta: {
      title: '对比前后性能收益：用 DeltaBar 替换旧 RatioBar',
      dimension: 'main',
      priority: 'high',
      expected: '直击旧 RatioBar 的 100%/100% 错配与剧透文案；切到新版 DeltaBar 后基线态干净无噪音，变化时原位保留虚线幽灵轮廓并就地标出 −70%、−80%+、−20%，支持单点聚焦与双条风格对比',
    },
    scale_and_invariance: {
      title: '展示量级权衡与锁定不变量：BarChart',
      dimension: 'main',
      priority: 'high',
      expected: '同一坐标系呈现 MHA / GQA / MLA 量级落差与 512+64 双段堆叠；切换循环次数时锁定不变量柱纹丝不动，动态柱平滑伸长，数值直标无冗余图例',
    },
    ratio_and_trend: {
      title: '呈现占比阈值与渐进趋势：RatioBar 与 LineChart',
      dimension: 'main',
      priority: 'medium',
      expected: '迁入后的 RatioBar 回归部分-整体与门槛线（单值不再硬拼重复分母）；LineChart 按拍渐进展开曲线、拉出上线门槛虚线并支持逐点 callout 寻址',
    },
    time_lanes_cursor: {
      title: '推进时间泳道并单点聚焦：TimeLanes',
      dimension: 'main',
      priority: 'medium',
      expected: '从 plugin-diagram 迁入 TimeLanes，补齐月度竖向刻度与推进游标；随步骤滑过阶段并自动压暗无关泳道，高亮当前演进阶段',
    },
    pareto_and_heatmap: {
      title: '展示帕累托前沿与热力矩阵：ScatterPlot 与 Heatmap',
      dimension: 'main',
      priority: 'high',
      expected: 'ScatterPlot 清晰标出成本 vs 精度象限与帕累托前沿折线，新方案推进前沿可直标定位；Heatmap 呈现二维权重热力与单行聚焦，暗格反白高对比可读',
    },
    flow_attribution_radar: {
      title: '拆解流向、归因与多维轮廓：Sankey / Waterfall / Radar',
      dimension: 'main',
      priority: 'high',
      expected: 'Sankey 按比例连带展示请求/成本去向并单路高亮；Waterfall 逐步拆解 100%→30% CPU 节省贡献；Radar 同图叠加新旧方案五维能力轮廓',
    },
    plugin_architecture: {
      title: '核对插件拆离边界、编译期快照与轻量运行时',
      dimension: 'consistency',
      priority: 'high',
      expected: '架构图演完完整链路：从 ui 与 diagram 彻底搬家到 @joplo-app/plugin-viz，10 类图表共享 D3 纯数学 + 宿主 motion，Node 编译期 frame 算好快照写入 step.ext.viz',
    },
  },
  rules: {
    migrate_clean: rule('彻底搬家（1A）：从 plugin-ui 移出 RatioBar / BarChart / LineChart，从 plugin-diagram 移出 TimeLanes，统一收口到 @joplo-app/plugin-viz；plugin-ui 仅保留定性切换 Compare 与常规 UI 控件', {
      origin: 'user',
      status: 'confirmed',
      cases: ['before_after_delta', 'ratio_and_trend', 'time_lanes_cursor', 'plugin_architecture'],
      elements: ['arch_ui', 'arch_diag'],
    }),
    d3_host_motion: rule('渲染底座（2A）：十类常用图型共享 d3-scale / d3-shape / d3-array / d3-sankey 纯数学计算（~25 KB）+ Joplo 宿主 motion SVG 与 HTML 文本层，保障字体不拉伸、无 ResizeObserver 抖动与单数据项 data-jid 寻址', {
      origin: 'user',
      status: 'confirmed',
      cases: ['scale_and_invariance', 'ratio_and_trend', 'pareto_and_heatmap', 'flow_attribution_radar', 'plugin_architecture'],
      elements: ['arch_d3', 'arch_dom'],
    }),
    all_in_one_suite: rule('一次性补齐十类高频叙事图型（用户明确要求不分二期）：DeltaBar / BarChart / RatioBar / LineChart / TimeLanes / ScatterPlot / Heatmap / Sankey / Waterfall / Radar 随首版完整交付', {
      origin: 'user',
      status: 'confirmed',
      cases: ['before_after_delta', 'scale_and_invariance', 'ratio_and_trend', 'time_lanes_cursor', 'pareto_and_heatmap', 'flow_attribution_radar'],
      elements: ['zone_pareto_heat', 'zone_flow_attr'],
    }),
    ghost_baseline: rule('DeltaBar 发生数值变化时，旧基准值以浅虚线幽灵轮廓留在原位，单柱直接过渡真实 width（零 FLIP 文字拉伸），变化区淡底色带直贴差值百分比；基线态不提前剧透节省文案', {
      origin: 'user',
      status: 'confirmed',
      cases: ['before_after_delta'],
      elements: ['delta_cpu', 'delta_mem', 'delta_ttft'],
    }),
    direct_labels: rule('十类图表默认去掉扫视图例与厚重卡片边框，把名称、数值、锁定标记与差值直接贴在数据体旁，窄条自动外挂完整标签不裁切', {
      origin: 'user',
      status: 'confirmed',
      cases: ['before_after_delta', 'scale_and_invariance', 'ratio_and_trend', 'pareto_and_heatmap', 'flow_attribution_radar'],
      elements: ['bar_scale', 'bar_invariant', 'viz_ratio_box'],
    }),
    compile_frame_snapshot: rule('基线记忆、前后差值、revealTo 截断点、setCursor 游标与 focusDatum 高亮态全部在 compile.frame 写入 step.ext.viz；animate=false 瞬间落终态，跳步与 --sheet/--film 导出零漂移', {
      origin: 'user',
      status: 'confirmed',
      cases: ['before_after_delta', 'ratio_and_trend', 'time_lanes_cursor', 'pareto_and_heatmap', 'flow_attribution_radar', 'plugin_architecture'],
      elements: ['arch_frame', 'arch_ir'],
    }),
  },
  questions: {
    q_delta_style: question('DeltaBar 的变化区表达：你更偏好「原位虚线幽灵轮廓 + 实心新柱 + 就地差值胶囊」，还是「上下双细条并列（灰旧条在上、彩新条在下）」？第 1 场景已支持一键切换对比。', {
      severity: 'major',
      refs: ['before_after_delta'],
    }),
    q_ratio_format: question('迁入后的 RatioBar：单值占比（如 98% 测试通过）默认直接显示「98%」，仅在显式开启 showDenominator 时才展示「98 / 100」，是否更符合直觉？', {
      severity: 'minor',
      refs: ['ratio_and_trend'],
    }),
    q_ten_suite_complete: question('当前一次性拉齐的 10 类图型（DeltaBar / BarChart / RatioBar / LineChart / TimeLanes / ScatterPlot / Heatmap / Sankey / Waterfall / Radar）覆盖是否齐了？还有没有你高频会用到的图型（如 Donut 环图或 BoxPlot 箱线图）需要顺手补进首版？', {
      severity: 'major',
      refs: ['pareto_and_heatmap', 'flow_attribution_radar'],
    }),
  },
});
