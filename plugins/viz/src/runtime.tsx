import { defineRuntime } from '@joplo-app/kit/plugin';
import { BarChartView } from './runtime/bar-chart.tsx';
import { DeltaBarView } from './runtime/delta-bar.tsx';
import { HeatmapView } from './runtime/heatmap.tsx';
import { LineChartView } from './runtime/line-chart.tsx';
import { RadarView } from './runtime/radar.tsx';
import { RatioBarView } from './runtime/ratio-bar.tsx';
import { SankeyView } from './runtime/sankey.tsx';
import { ScatterPlotView } from './runtime/scatter-plot.tsx';
import { TimeLanesView } from './runtime/time-lanes.tsx';
import { WaterfallView } from './runtime/waterfall.tsx';

export default defineRuntime({
  id: 'viz',
  components: {
    DeltaBar: { react: DeltaBarView },
    BarChart: { react: BarChartView },
    RatioBar: { react: RatioBarView },
    LineChart: { react: LineChartView },
    TimeLanes: { react: TimeLanesView },
    ScatterPlot: { react: ScatterPlotView },
    Heatmap: { react: HeatmapView },
    Sankey: { react: SankeyView },
    Waterfall: { react: WaterfallView },
    Radar: { react: RadarView },
  },
});
