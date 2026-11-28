import type { ComponentCtx } from '@joplo-app/kit/plugin';
import { useRoot } from '@joplo-app/kit/renderer';
import { color } from '@joplo-app/kit/renderer-style';
import { readTrack } from './item-track.ts';

export function ItemTrackView({ ctx }: { ctx: ComponentCtx }) {
  const { capacity, entries, direction, emptyLabel, issues } = readTrack(ctx.node.props);
  const root = useRoot(ctx.model, ctx.node.props, { style: { width: '100%', minWidth: 0, position: 'relative' } });
  return <div {...root} data-jitem-track="">
    <ol style={{ display: 'grid', gridTemplateColumns: `repeat(${direction === 'column' ? 1 : Math.max(1, capacity)}, minmax(0, 1fr))`, gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
      {Array.from({ length: capacity }, (_, index) => {
        const entry = entries[index];
        const motion = entry ? JSON.stringify([ctx.node.id, entry.key]) : undefined;
        const accent = color(entry?.accent) ?? entry?.accent ?? 'var(--jp-line-strong)';
        return <li key={motion ?? index} data-jtrack-item={entry ? '' : undefined} data-jp-content-motion={motion} data-jp-content-enter={entry ? 'rise' : undefined}
          title={entry?.label} style={{
            padding: '0 .65em', lineHeight: '2.5em', textAlign: 'center', borderRadius: 6,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            border: entry ? `1px solid ${accent}` : '1px dashed var(--jp-line)',
            color: entry ? 'var(--jp-ink)' : 'var(--jp-muted)', backgroundColor: entry ? 'var(--jp-surface)' : 'transparent',
          }}>{entry?.label ?? emptyLabel}</li>;
      })}
    </ol>
    {issues.length > 0 && <small role="status">ItemTrack · {issues.join(' ')}</small>}
  </div>;
}
