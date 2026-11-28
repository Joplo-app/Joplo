import { sankey as d3Sankey, type SankeyLink, type SankeyNode } from 'd3-sankey';
import type { ComponentCtx, PluginIRNode } from '@joplo-app/kit/plugin';
import { motion, useRoot } from '@joplo-app/kit/renderer';
import type { SankeyLinkInput, SankeyNodeInput } from '../components.ts';
import { ChartHeader, useAnchorAttrs, useVizChart } from './hooks.tsx';
import {
  DIMMED,
  EASE_OUT_EXPO,
  INK,
  LINE,
  MONO,
  SURFACE,
  VIZ_FONT_SANS,
  arr,
  dim,
  formatNumber,
  num,
  str,
  tint,
  vizColor,
} from './tokens.ts';

type LayoutNode = SankeyNode<SankeyNodeInput, SankeyLinkInput> & SankeyNodeInput;
type LayoutLink = SankeyLink<SankeyNodeInput, SankeyLinkInput> & SankeyLinkInput;

/** Closed cubic-Bezier ribbon band so width scales cleanly with zero stroke-cap distortion. */
function ribbonPath(link: LayoutLink): string {
  const src = link.source as LayoutNode;
  const dst = link.target as LayoutNode;
  const x0 = src.x1 ?? 0;
  const x1 = dst.x0 ?? 0;
  const y0 = link.y0 ?? 0;
  const y1 = link.y1 ?? 0;
  const hw = Math.max(1.5, (link.width ?? 2) / 2);
  const mx = (x0 + x1) / 2;
  return [
    `M ${x0},${y0 - hw}`,
    `C ${mx},${y0 - hw} ${mx},${y1 - hw} ${x1},${y1 - hw}`,
    `L ${x1},${y1 + hw}`,
    `C ${mx},${y1 + hw} ${mx},${y0 + hw} ${x0},${y0 + hw}`,
    'Z',
  ].join(' ');
}

function SankeyNodeBox({
  nodeItem,
  color,
  vbW,
  vbH,
  unit,
  dimmed,
  animate,
  anchors,
}: {
  nodeItem: LayoutNode;
  color: string;
  vbW: number;
  vbH: number;
  unit: string;
  dimmed: boolean;
  animate: boolean;
  anchors: Map<string, PluginIRNode>;
}) {
  const anchorProps = useAnchorAttrs(anchors, nodeItem.id, nodeItem.label);
  const x0 = nodeItem.x0 ?? 0;
  const x1 = nodeItem.x1 ?? 0;
  const y0 = nodeItem.y0 ?? 0;
  const y1 = nodeItem.y1 ?? 0;
  const hPx = Math.max(22, y1 - y0);
  const leftPct = (x0 / vbW) * 100;
  const widthPct = ((x1 - x0) / vbW) * 100;
  const isRightSide = x0 > vbW * 0.6;
  const valText = nodeItem.valueLabel ?? (typeof nodeItem.value === 'number' ? formatNumber(nodeItem.value, unit) : '');

  return (
    <motion.div
      {...anchorProps}
      data-jsankey-node={nodeItem.id}
      initial={false}
      animate={{ opacity: dimmed ? 0.22 : 1 }}
      transition={animate ? { duration: 0.3, ease: EASE_OUT_EXPO } : { duration: 0 }}
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        top: y0,
        width: `${widthPct}%`,
        height: hPx,
        borderRadius: 6,
        background: color,
        boxShadow: `0 2px 6px ${tint(color, 26)}`,
        zIndex: 3,
      }}
    >
      {/* Zero-stretch external label placed cleanly outside the vertical node bar */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          ...(isRightSide ? { right: 'calc(100% + 10px)', textAlign: 'right' } : { left: 'calc(100% + 10px)', textAlign: 'left' }),
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          background: 'rgba(255,255,255,0.88)',
          padding: '2px 6px',
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{nodeItem.label}</span>
        {(valText || nodeItem.sub) && (
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: dimmed ? DIMMED : color }}>
            {valText}
            {nodeItem.sub ? ` · ${nodeItem.sub}` : ''}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function SankeyLinkAnchor({
  link,
  vbW,
  label,
  color,
  dimmed,
  animate,
  anchors,
}: {
  link: LayoutLink;
  vbW: number;
  label: string;
  color: string;
  dimmed: boolean;
  animate: boolean;
  anchors: Map<string, PluginIRNode>;
}) {
  const anchorProps = useAnchorAttrs(anchors, link.id, label);
  const src = link.source as LayoutNode;
  const dst = link.target as LayoutNode;
  const mxPct = ((((src.x1 ?? 0) + (dst.x0 ?? 0)) / 2) / vbW) * 100;
  const my = ((link.y0 ?? 0) + (link.y1 ?? 0)) / 2;

  return (
    <motion.div
      {...anchorProps}
      data-jsankey-link={link.id ?? `${src.id}->${dst.id}`}
      initial={false}
      animate={{ opacity: dimmed ? 0.14 : 1 }}
      transition={animate ? { duration: 0.3, ease: EASE_OUT_EXPO } : { duration: 0 }}
      style={{
        position: 'absolute',
        left: `${mxPct}%`,
        top: my,
        transform: 'translate(-50%, -50%)',
        padding: '2px 7px',
        borderRadius: 999,
        background: SURFACE,
        border: `1px solid ${dimmed ? LINE : tint(color, 36)}`,
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 800,
        color: dimmed ? DIMMED : color,
        whiteSpace: 'nowrap',
        zIndex: 4,
        pointerEvents: 'none',
      }}
    >
      {label}
    </motion.div>
  );
}

export function SankeyView({ ctx }: { ctx: ComponentCtx }) {
  const { node, p, animate, anchors, focusSet } = useVizChart(ctx);
  const {
    title,
    subtitle,
    nodes: rawNodes,
    links: rawLinks,
    unit: rawUnit,
    nodeWidth,
    nodePadding,
    nodeIds: _nids,
    w,
    h,
    ...rest
  } = p;

  const H = num(h, 240)!;
  const root = useRoot(node, rest, {
    style: {
      width: dim(w) ?? '100%',
      minWidth: 0,
      fontFamily: VIZ_FONT_SANS,
      color: INK,
    },
  });

  const inNodes = arr(rawNodes).filter(
    (n): n is SankeyNodeInput => !!n && typeof n === 'object' && typeof (n as SankeyNodeInput).id === 'string',
  );
  const nodeIds = new Set(inNodes.map((n) => n.id));
  const inLinks = arr(rawLinks).filter(
    (l): l is SankeyLinkInput =>
      !!l &&
      typeof l === 'object' &&
      typeof (l as SankeyLinkInput).source === 'string' &&
      typeof (l as SankeyLinkInput).target === 'string' &&
      nodeIds.has((l as SankeyLinkInput).source) &&
      nodeIds.has((l as SankeyLinkInput).target) &&
      typeof (l as SankeyLinkInput).value === 'number' &&
      (l as SankeyLinkInput).value > 0,
  );

  if (!inNodes.length || !inLinks.length) return <div {...root} role="status">Sankey · no flows</div>;

  const unit = str(rawUnit);
  const vbW = 900;
  const vbH = Math.max(150, H);
  const nw = num(nodeWidth, 16)!;
  const np = num(nodePadding, 18)!;

  // Deep-clone inputs so d3-sankey's in-place mutation never leaks into props or subsequent renders
  const graph = d3Sankey<SankeyNodeInput, SankeyLinkInput>()
    .nodeId((d) => d.id)
    .nodeWidth(nw)
    .nodePadding(np)
    .extent([
      [6, 10],
      [vbW - 6, vbH - 10],
    ])({
    nodes: inNodes.map((n) => ({ ...n })),
    links: inLinks.map((l) => ({ ...l })),
  });

  const nodes = graph.nodes as LayoutNode[];
  const links = graph.links as LayoutLink[];

  const nodeColorMap = new Map<string, string>();
  nodes.forEach((n, idx) => {
    nodeColorMap.set(n.id, vizColor(n.color ?? n.tone, idx));
  });

  // Focusing a node or link illuminates its directly connected flow chain
  const isLinkFocused = (link: LayoutLink): boolean => {
    if (!focusSet) return true;
    const src = link.source as LayoutNode;
    const dst = link.target as LayoutNode;
    return (
      (!!link.id && focusSet.has(link.id)) ||
      focusSet.has(`${src.id}->${dst.id}`) ||
      focusSet.has(src.id) ||
      focusSet.has(dst.id)
    );
  };

  const activeNodeIds = new Set<string>();
  if (focusSet) {
    for (const id of focusSet) activeNodeIds.add(id);
    for (const link of links) {
      if (isLinkFocused(link)) {
        activeNodeIds.add((link.source as LayoutNode).id);
        activeNodeIds.add((link.target as LayoutNode).id);
      }
    }
  }

  const gradPrefix = `jp-sankey-${node.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  return (
    <figure {...root} style={{ ...root.style, margin: 0 }} aria-label={typeof title === 'string' ? title : 'Sankey'}>
      <ChartHeader title={typeof title === 'string' ? title : undefined} subtitle={typeof subtitle === 'string' ? subtitle : undefined} />

      <div style={{ position: 'relative', width: '100%', height: vbH }}>
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: vbH, display: 'block', overflow: 'visible' }}
        >
          <defs>
            {links.map((link, idx) => {
              const src = link.source as LayoutNode;
              const dst = link.target as LayoutNode;
              const c1 = link.color ? vizColor(link.color) : (nodeColorMap.get(src.id) ?? vizColor('accent'));
              const c2 = link.color ? vizColor(link.color) : (nodeColorMap.get(dst.id) ?? c1);
              return (
                <linearGradient key={idx} id={`${gradPrefix}-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={c1} />
                  <stop offset="100%" stopColor={c2} />
                </linearGradient>
              );
            })}
          </defs>

          {links.map((link, idx) => {
            const focused = isLinkFocused(link);
            return (
              <path
                key={link.id ?? idx}
                d={ribbonPath(link)}
                fill={`url(#${gradPrefix}-${idx})`}
                fillOpacity={focused ? (focusSet ? 0.56 : 0.34) : 0.08}
                data-jsankey-ribbon={link.id ?? idx}
                style={{ transition: animate ? 'fill-opacity 280ms ease' : undefined }}
              />
            );
          })}
        </svg>

        {/* Addressable node bars + crisp HTML labels */}
        {nodes.map((n) => (
          <SankeyNodeBox
            key={n.id}
            nodeItem={n}
            color={nodeColorMap.get(n.id) ?? vizColor('accent')}
            vbW={vbW}
            vbH={vbH}
            unit={unit}
            dimmed={!!focusSet && !activeNodeIds.has(n.id)}
            animate={animate}
            anchors={anchors}
          />
        ))}

        {/* Mid-ribbon labels for annotated or addressable links */}
        {links.map((link, idx) => {
          const text = link.label ?? (link.id ? formatNumber(link.value, unit) : '');
          if (!text) return null;
          const dst = link.target as LayoutNode;
          const color = link.color ? vizColor(link.color) : (nodeColorMap.get(dst.id) ?? vizColor('accent'));
          return (
            <SankeyLinkAnchor
              key={link.id ?? `lbl_${idx}`}
              link={link}
              vbW={vbW}
              label={text}
              color={color}
              dimmed={!isLinkFocused(link)}
              animate={animate}
              anchors={anchors}
            />
          );
        })}
      </div>
    </figure>
  );
}
