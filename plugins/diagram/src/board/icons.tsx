import type { ComponentCtx } from '@joplo-app/kit/plugin';
import { useRoot } from '@joplo-app/kit/renderer';
import { BT, bool, num, str, tonalWash } from './tokens.ts';
import { BHeader, SLAB_STYLE } from './ui.tsx';
import { TECH_ICON_CATALOG, TECH_ICON_MARKS, type TechIconId } from './svg-marks.tsx';

export type { TechIconId };
export const TECH_ICONS = Object.keys(TECH_ICON_MARKS) as TechIconId[];

export function resolveTechIcon(name: unknown): { id: TechIconId; label: string; category: string; brand: string; Mark: (typeof TECH_ICON_MARKS)[TechIconId] } | null {
  if (typeof name !== 'string' || !name) return null;
  const raw = name.trim().toLowerCase();
  if (raw in TECH_ICON_MARKS) {
    const id = raw as TechIconId;
    return { id, ...TECH_ICON_CATALOG[id], Mark: TECH_ICON_MARKS[id] };
  }
  const k = raw.replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, TechIconId> = {
    amazon: 'aws', amazonwebservices: 'aws', lambda: 'aws-lambda', s3: 'aws-s3', ec2: 'aws-ec2',
    rds: 'aws-rds', dynamodb: 'aws-dynamodb', sqs: 'aws-sqs', cloudfront: 'aws-cloudfront', apigw: 'aws-apigw', apigateway: 'aws-apigw',
    googlecloud: 'gcp', cloudflareworkers: 'workers', k8s: 'kubernetes', pod: 'k8s-pod', deploy: 'k8s-deploy',
    service: 'k8s-svc', ingress: 'k8s-ing', configmap: 'k8s-cm', volume: 'k8s-pv',
    postgresql: 'postgres', pg: 'postgres', mongo: 'mongodb', elastic: 'elasticsearch',
    ts: 'typescript', js: 'javascript', py: 'python', golang: 'go', node: 'nodejs',
    next: 'nextjs', tailwindcss: 'tailwind', opentelemetry: 'otel', gh: 'github',
    actions: 'github-actions', githubactions: 'github-actions', webassembly: 'wasm', argocd: 'argo',
  };
  const hit = aliases[k];
  if (hit && hit in TECH_ICON_MARKS) {
    return { id: hit, ...TECH_ICON_CATALOG[hit], Mark: TECH_ICON_MARKS[hit] };
  }
  return null;
}

export function TechIcon({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const meta = resolveTechIcon(p.icon ?? p.name) ?? resolveTechIcon('docker')!;
  const variant = str(p.variant, 'tile');
  const size = typeof p.size === 'number' ? p.size : variant === 'mark' ? 24 : variant === 'tile' ? 26 : 16;
  const label = str(p.label, variant === 'mark' ? '' : meta.label);
  const mono = bool(p.mono, false);
  const { icon: _ic, name: _nm, variant: _v, size: _s, label: _l, mono: _m, ...rest } = p;
  const { Mark } = meta;

  if (variant === 'mark') {
    const root = useRoot(ctx.model, rest, {
      style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: BT.on },
    });
    return <span {...root} data-bd-root="" data-bd-icon={meta.id}><Mark size={size} mono={mono} /></span>;
  }

  if (variant === 'badge') {
    const root = useRoot(ctx.model, rest, {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '5px 11px 5px 7px',
        borderRadius: 999,
        background: BT.slab,
        border: 'var(--bd-slab-border, none)',
        boxShadow: 'var(--bd-slab-ring, 0 0 0 1px var(--bd-edge)), 0 3px 10px -3px rgba(0,0,0,0.08)',
        fontSize: 12,
        fontWeight: 600,
        color: BT.on,
        whiteSpace: 'nowrap',
      },
    });
    return (
      <span {...root} data-bd-root="" data-bd-icon={meta.id}>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: tonalWash(meta.brand, 14), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: BT.on }}>
          <Mark size={size} mono={mono} />
        </span>
        <span>{label}</span>
      </span>
    );
  }

  const root = useRoot(ctx.model, rest, {
    style: {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      width: 82,
      padding: '10px 6px',
      borderRadius: 'var(--bd-r-inner, 13px)',
      background: BT.slab,
      border: 'var(--bd-slab-border, none)',
      boxShadow: 'var(--bd-slab-ring, 0 0 0 1px var(--bd-edge)), var(--bd-slab-shadow)',
      color: BT.on,
    },
  });
  return (
    <div {...root} data-bd-root="" data-bd-icon={meta.id}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: tonalWash(meta.brand, 12), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: BT.on }}>
        <Mark size={size} mono={mono} />
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: BT.soft, whiteSpace: 'nowrap', maxWidth: 74, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
    </div>
  );
}

export function IconGrid({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const title = str(p.title, 'Tech Stack');
  const cols = num(p.cols, 8);
  const { title: _t, cols: _c, ...rest } = p;
  const root = useRoot(ctx.model, rest, { style: { ...SLAB_STYLE } });
  return (
    <div {...root} data-bd-root="" data-bd-slab="">
      <BHeader title={title} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, auto)`, gap: 10, justifyContent: 'start' }}>
        {ctx.renderChildren()}
      </div>
    </div>
  );
}
