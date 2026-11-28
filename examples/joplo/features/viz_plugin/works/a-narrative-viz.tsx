import { $, callout, done, flow, highlight, hold, narrate, patch, set, uses, work } from '@joplo-app/kit';
import { camera } from '@joplo-app/plugin-content';
import { pulse, setStatus } from '@joplo-app/plugin-diagram';
import { focusDatum, revealTo, setCursor } from '@joplo-app/plugin-viz';
import {
  DELTA_BASELINE_PATCH,
  INITIAL_VIZ_UI,
  RADAR_SERIES_BASE,
  RADAR_SERIES_BOTH,
  SCATTER_BASE_POINTS,
  SCATTER_WITH_NEW,
  type VizProtoUiState,
} from '../../../shared/viz-plugin/data.ts';
import { VizPluginWorld } from '../../../shared/viz-plugin/world.tsx';

const setUi = (next: Partial<VizProtoUiState>) => patch($.ui, next);

export default work({
  title: 'A · 叙事型数据可视化插件（@joplo-app/plugin-viz 十类组件实装）',
  summary: '把 DeltaBar / BarChart / RatioBar / LineChart / TimeLanes / ScatterPlot / Heatmap / Sankey / Waterfall / Radar 统一收口进 @joplo-app/plugin-viz，彻底移出 ui 与 diagram',
  focus: '十类高频叙事图型的真实组件渲染、幽灵基线对比手感，以及编译期确定性快照',
  tradeoffs: [
    '彻底搬家（1A）不留双份同名图表，Agent 不会左右互搏',
    '十类图型共用 d3-scale / d3-shape / d3-array / d3-sankey 纯数学（~25 KB）+ 宿主 motion（2A），确保文字零拉伸与逐项 data-jid 寻址',
    '本演示全部 10 类图表均由真实 @joplo-app/plugin-viz 组件与 focusDatum / revealTo / setCursor 效果驱动',
  ],
  state: {
    ui: INITIAL_VIZ_UI,
    data: {
      scatterPoints: SCATTER_BASE_POINTS,
      radarSeries: RADAR_SERIES_BASE,
    },
  },
  stage: <VizPluginWorld />,
  scenarios: {
    before_after_delta: flow('对比前后性能收益：用 DeltaBar 替换旧 RatioBar', {
      cases: ['before_after_delta'],
      expected: '直击旧 RatioBar 错配，切到真实 DeltaBar 体验基线态、幽灵轮廓收缩、单点聚焦与双条备选样式',
    })
      .system(
        '历史痛点：旧 RatioBar 硬套降幅',
        '三条满格蓝条配「节省 ~70% 0%/100%」，绿条变灰',
        setUi({ deltaView: 'old', ...DELTA_BASELINE_PATCH, hudNote: '01 · 历史痛点 vs 真实 DeltaBar' }),
        camera('zone_delta', { pad: 34 }),
        highlight('old_ratio_row'),
        uses('migrate_clean'),
        narrate('拿占比条硬套性能下降，还没切流就写着节省七成零除以一百，绿条也被吃成了灰色。'),
      )
      .click(
        'ctl_ghost',
        '切到真实 DeltaBar · 基准态',
        '先立住 Python 100% 基线，不提前剧透结果',
        setUi({ ...DELTA_BASELINE_PATCH }),
        focusDatum('viz_delta', null),
        uses('ghost_baseline', 'direct_labels'),
        narrate('换成新插件的 DeltaBar：切流前先立住三条基准，去图例、不剧透。注意看接下来柱子怎么变。'),
      )
      .click(
        'ctl_drop',
        '观察：Rust 切流后保留原位幽灵基线',
        '三条柱平滑收缩，虚线框锚住旧基准，绿区直标降幅',
        uses('ghost_baseline', 'compile_frame_snapshot'),
        narrate(false),
        hold(2.4),
      )
      .system(
        '单点聚焦：锁定单请求内存',
        'focusDatum 联动 data-jid，气泡直钉目标柱',
        focusDatum('viz_delta', 'delta_mem'),
        callout('delta_mem', '原位虚线框一眼对比 100% → 20%', { side: 'top' }),
        uses('compile_frame_snapshot'),
        narrate('旧位置留虚线轮廓，净减量区直标负七成、负八成和负两成，每条数据都能精准钉气泡。'),
      )
      .click(
        'ctl_paired',
        '备选对比：上下双条并列',
        '同组数据切到双条样式，暂停时可点顶栏来回比手感',
        focusDatum('viz_delta', null),
        narrate('顶栏也备了双条并列样式：幽灵轮廓省高度、差值感强，双条则适合同时读两个绝对值。'),
      )
      .click(
        'ctl_old',
        '切回旧反例做最后一眼反差',
        '顶栏四个按钮暂停时都可自由点击试玩',
        narrate(false),
        hold(0.8),
      )
      .click(
        'ctl_ghost',
        '回到推荐的幽灵轮廓视图',
        '编译期快照保证跳步与导出零漂移',
        done('确认真实 DeltaBar 替换旧 RatioBar 的视觉与交互手感'),
      ),

    scale_and_invariance: flow('展示量级权衡与锁定不变量：BarChart', {
      cases: ['scale_and_invariance'],
      expected: '用真实 BarChart 展示量级堆叠柱与锁定不变量横向联动柱',
    })
      .system(
        '量级落差与双段堆叠',
        '对数刻度 + 堆叠构成直标，彻底告别手搓 div 柱子',
        setUi({ loopCount: '1', loopDepthVal: 24, loopAccVal: 42, hudNote: '02 · 真实 BarChart 量级堆叠与不变量锁定' }),
        camera('bar_scale', { pad: 44, waitForMove: true }),
        callout('bar_mla', '512 潜核 + 64 位置签堆叠直标', { side: 'left' }),
        uses('d3_host_motion', 'direct_labels'),
        narrate('以前做模型解析得手搓几百行 div。迁进 viz 插件后，量级塔、双段堆叠和落差一次声明就行。'),
      )
      .system(
        '锁定不变量：1 圈基准态',
        '权重显存标为 locked，观察切档时谁动谁不动',
        camera('bar_invariant', { pad: 44, waitForMove: true }),
        highlight('bar_weights'),
        uses('direct_labels'),
        narrate('再看右边：权重显存标成锁定不变量。接下来循环从一圈加到四圈，注意看第一条绿柱。'),
      )
      .click('loop_2', '切到 2 圈：深度翻倍，显存不动', '动静分离直接传达“参数共享”的核心机制', narrate(false), hold(1.6))
      .click('loop_4', '切到 4 圈：深度拉满，权重仍 1.0×', '暂停时可自由点按 1 / 2 / 4 圈验证', narrate('等效深度拉到四倍，权重显存纹丝不动。这种动静对照比写两百字说明直白得多。'))
      .click('loop_1', '归位到 1 圈基准', '全部交互档位均已验证', camera('zone_bar', { pad: 34 }), done('验证 BarChart 堆叠与不变量锁定表达')),

    ratio_and_trend: flow('呈现占比阈值与渐进趋势：RatioBar 与 LineChart', {
      cases: ['ratio_and_trend'],
      expected: '真实 RatioBar 干净呈现部分-整体与门槛线；真实 LineChart 通过 revealTo 分步展开并支持逐点寻址',
    })
      .system(
        '改版 RatioBar：回归整体占比',
        '单值直接标 98%，去掉丑陋的重复分母',
        setUi({ showProdRatio: false, hudNote: '03 · 真实 RatioBar 与渐进 LineChart' }),
        revealTo('viz_line', 2),
        camera('viz_ratio_box', { pad: 48, waitForMove: true }),
        uses('migrate_clean', 'direct_labels'),
        narrate('迁入后的 RatioBar 只做整体占比。单值直接写百分之九十八，不再硬拼重复分母。'),
      )
      .system(
        '拉出线上一致率与 99% 上线门槛',
        '需要门槛对比时立出清晰的竖向标尺',
        setUi({ showProdRatio: true }),
        callout('ratio_prod', '距离 99% 门槛还有巨大缺口', { side: 'top' }),
        narrate('把真实线上一致率和百分之九十九上线门槛摆在一起，一眼就能看出离达标差多远。'),
      )
      .system(
        'LineChart 前半段：高差异平台期',
        'revealTo 先露出 4–5 月，留出后半段悬念',
        camera('viz_line_box', { pad: 46, waitForMove: true }),
        uses('d3_host_motion', 'compile_frame_snapshot'),
        narrate('重写后的折线图文字绝不拉扁，还支持分拍展开。先只看四五月高平台，注意看六月之后。'),
      )
      .system('观察：曲线展开并跌穿 0.1% 门槛', 'revealTo 推到 9 月，规则沉淀带来断崖收敛', revealTo('viz_line', 6), narrate(false), hold(2.2))
      .system(
        '逐点可寻址：锁定 6 月收敛拐点',
        '每个数据点自带 data-jid，原生气泡精准落点',
        callout('pt_june', '6 月沉淀 60 条规则 → 差异率断崖下降', { side: 'top' }),
        uses('d3_host_motion'),
        narrate('六月沉淀规则后差异率断崖收敛，九月跌破千分之一。每个数据点都能直接挂气泡和评审。'),
        done('验证 RatioBar 改版与 LineChart 渐进揭示'),
      ),

    time_lanes_cursor: flow('推进时间泳道并单点聚焦：TimeLanes', {
      cases: ['time_lanes_cursor'],
      expected: '从 diagram 迁入真实 TimeLanes，展示月度竖向刻度、滑动游标、窄条外挂标签与泳道聚焦',
    })
      .system(
        '迁入 TimeLanes：补齐月度竖向刻度',
        '4–5 月游标停在内环排障，其他阶段退暗',
        setUi({ laneFocus: 'inner', laneCursor: 4.9, laneCursorLabel: '4.9 月 · 内环', hudNote: '04 · 真实 TimeLanes 刻度与推进游标' }),
        focusDatum('viz_lanes', ['span_inner', 'span_seam']),
        setCursor('viz_lanes', 4.9, '4.9 月 · 内环'),
        camera('zone_lanes', { pad: 22, waitForMove: true }),
        uses('migrate_clean', 'compile_frame_snapshot'),
        narrate('原本塞在架构插件的 TimeLanes 迁进 viz 后，补齐逐月竖线和推进游标，此刻聚焦内环排障。'),
      )
      .click(
        'lane_t2',
        '观察：游标滑向 6.9 月 · 规则点亮',
        '工程师精力从查个案外移到制定规则',
        focusDatum('viz_lanes', 'span_rules'),
        setCursor('viz_lanes', 6.9, '6.9 月 · 规则'),
        narrate(false),
        hold(2.0),
      )
      .click(
        'lane_t3',
        '8.6 月：聚焦零停服切流',
        '窄条自动外挂完整标签，每段泳道块可挂 callout',
        focusDatum('viz_lanes', 'span_cutover'),
        setCursor('viz_lanes', 8.6, '8.6 月 · 切流'),
        callout('span_cutover', '外环稳住后，公开流量零停服切入 Rust', { side: 'left' }),
        narrate('游标推到八月下旬，焦点自动切到公开流量切流。窄条文字自动外挂不裁切，演进节奏一目了然。'),
      )
      .click(
        'lane_t1',
        '可随时回点早期阶段',
        '三段游标按钮暂停时均可自由探索',
        focusDatum('viz_lanes', null),
        setCursor('viz_lanes', 4.9, '4.9 月 · 内环'),
        narrate(false),
        hold(0.8),
      )
      .click(
        'lane_t3',
        '停在最终切流态',
        '完成时间泳道迁入验证',
        focusDatum('viz_lanes', 'span_cutover'),
        setCursor('viz_lanes', 8.6, '8.6 月 · 切流'),
        done('验证 TimeLanes 迁入与游标聚焦体验'),
      ),

    pareto_and_heatmap: flow('展示帕累托前沿与热力矩阵：ScatterPlot 与 Heatmap', {
      cases: ['pareto_and_heatmap'],
      expected: '验证真实 ScatterPlot 帕累托前沿自动连线，以及真实 Heatmap 暗格反白与单行聚焦',
    })
      .system(
        'ScatterPlot：先看旧帕累托前沿',
        '左上标出高性价比区，灰点为被支配旧模型',
        set($.data.scatterPoints, SCATTER_BASE_POINTS),
        focusDatum('viz_heat', null),
        setUi({ hudNote: '05 · 真实 ScatterPlot & Heatmap' }),
        camera('viz_scatter_box', { pad: 44, waitForMove: true }),
        uses('all_in_one_suite', 'd3_host_motion'),
        narrate('高阶常用图型也一次配齐。先看成本与精度散点图，虚线自动连出旧方案的帕累托前沿。'),
      )
      .system(
        '观察：新架构推进帕累托前沿',
        '新点落在左上高性价比区，前沿自动重算推进',
        set($.data.scatterPoints, SCATTER_WITH_NEW),
        callout('pt_pareto_new', '成本压到 $4.4，精度逼近旗舰线', { side: 'bottom' }),
        uses('compile_frame_snapshot'),
        narrate('新方案一出现，前沿折线自动向左上角推开一大截。模型评测或技术选型，一张图胜过三页表。'),
      )
      .system(
        'Heatmap：聚焦「Rust」行权重',
        '其余行退暗，高权重格自动反白并支持单格锚点',
        focusDatum('viz_heat', 'row:Rust'),
        camera('viz_heat_box', { pad: 44, waitForMove: true }),
        callout('heat_cell_rust_code', '最高权重 0.46 落在「代码」上', { side: 'top' }),
        uses('direct_labels'),
        narrate('右边热力矩阵：深色格自动反白，一键聚焦单行，讲注意力、混淆矩阵或延迟分布都顺手。'),
      )
      .system(
        '切回散点与热力全景',
        '两张高阶图型共享同一套编辑级克制视觉',
        focusDatum('viz_heat', null),
        camera('zone_pareto_heat', { pad: 34 }),
        done('验证 ScatterPlot 帕累托前沿与 Heatmap 矩阵体验'),
      ),

    flow_attribution_radar: flow('拆解流向、归因与多维轮廓：Sankey / Waterfall / Radar', {
      cases: ['flow_attribution_radar'],
      expected: '验证真实 d3-sankey 弯曲流带、真实 Waterfall 逐步归因与真实 Radar 五边形蛛网叠加',
    })
      .system(
        'Sankey：首周镜像请求逐级分流',
        '100% 流量经三次贝塞尔弯曲流带由宽到窄层层拆解',
        focusDatum('viz_sankey', null),
        revealTo('viz_waterfall', 1),
        set($.data.radarSeries, RADAR_SERIES_BASE),
        setUi({ hudNote: '06 · 真实 Sankey / Waterfall / Radar' }),
        camera('viz_sankey_box', { pad: 44, waitForMove: true }),
        uses('all_in_one_suite', 'd3_host_motion'),
        narrate('看流向、归因和雷达三件套。桑基图由 d3-sankey 计算比例布局，弯曲流带由宽到窄逐级展开。'),
      )
      .system(
        '单路聚焦：只追踪 75% 差异指纹去向',
        '一致放行路退暗，层层收束到 54% 自愈与 6% 人工拦截',
        focusDatum('viz_sankey', 'sn_diff'),
        callout('sankey_human_gate', '层层过滤后，真正耗人力的拦截只占 6%', { side: 'left' }),
        narrate('一点聚焦异常流，一致路退暗，一眼看清七成五差异如何层层收束到百分之六人工拦截。'),
      )
      .system(
        'Waterfall：逐步拆解 70% CPU 收益',
        '三级阶梯把 100% 拆到 30%，告别笼统总数字',
        focusDatum('viz_sankey', null),
        revealTo('viz_waterfall', 5),
        camera('viz_waterfall_box', { pad: 44, waitForMove: true }),
        uses('compile_frame_snapshot'),
        narrate('左下瀑布图把省掉的七成按去解释器、零拷贝和异步调度逐级拆清楚。'),
      )
      .system(
        'Radar：五维能力轮廓叠加',
        '叠加 Rust 轮廓，看清短板补齐与优势保留',
        set($.data.radarSeries, RADAR_SERIES_BOTH),
        camera('viz_radar_box', { pad: 44, waitForMove: true }),
        narrate('右下五边形蛛网雷达叠加新旧轮廓：效率短板拉满的同时，一致率与迭代速度依然守住。'),
      )
      .system(
        '三件套全景回看',
        '10 类高频叙事图型齐聚同一套克制视觉语言',
        camera('zone_flow_attr', { pad: 34 }),
        done('验证 Sankey / Waterfall / Radar 三件套体验'),
      ),

    plugin_architecture: flow('核对插件边界、编译快照与轻量运行时', {
      cases: ['plugin_architecture'],
      expected: '用架构图验证 1A 彻底搬家、compile.frame 自动基线快照与 2A D3 + 宿主 motion 渲染路径',
    })
      .system(
        '1A 彻底搬家：划清三插件边界',
        'ui 做界面、diagram 做拓扑，10 图进 plugin-viz',
        setUi({ hudNote: '07 · 插件边界与编译期确定性数据流' }),
        setStatus('arch_ui', 'active'),
        setStatus('arch_diag', 'active'),
        setStatus('arch_node', 'active'),
        pulse('fe_ui_node', { label: '移出 3 类旧图', tone: 'info' }),
        pulse('fe_diag_node', { label: '移出 TimeLanes', tone: 'info' }),
        camera('zone_arch', { pad: 30, waitForMove: true }),
        uses('migrate_clean'),
        narrate('按你的决定：ui 移出旧图表、diagram 移出泳道，十类图型一次收口进 plugin-viz。'),
      )
      .system(
        'Node 编译期：十类图型共用快照',
        'compile.frame 自动算基线差值，写入 step.ext.viz',
        setStatus('arch_ui', 'healthy'),
        setStatus('arch_diag', 'healthy'),
        setStatus('arch_node', 'healthy'),
        setStatus('arch_frame', 'active'),
        setStatus('arch_ir', 'active'),
        pulse('fe_node_frame', { label: '校验 + 降级效果', tone: 'accent' }),
        pulse('fe_frame_ir', { label: '每步完整快照', tone: 'accent' }),
        uses('compile_frame_snapshot'),
        narrate('基线、差值、展开和聚焦都在编译期算好写进 IR。播放器只读快照，跳步截图零漂移。'),
      )
      .system(
        '2A 浏览器运行时：~25 KB 可寻址',
        'D3 纯数学 + 宿主 motion + 逐项 data-jid',
        setStatus('arch_frame', 'healthy'),
        setStatus('arch_ir', 'healthy'),
        setStatus('arch_d3', 'active'),
        setStatus('arch_dom', 'active'),
        pulse('fe_ir_d3', { label: '只读快照', tone: 'ok' }),
        pulse('fe_d3_dom', { label: 'SVG + HTML 渲染', tone: 'ok' }),
        uses('d3_host_motion'),
        narrate('浏览器只带二十五 KB 的 D3 纯数学模块，十类图型原生支持镜头、标注与评审定位。'),
        done('完成 @joplo-app/plugin-viz 十类图型与架构实装验证'),
      ),
  },
});
