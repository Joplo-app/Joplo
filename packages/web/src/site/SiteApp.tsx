/**
 * 发布站（`joplo build` 的产物，D39 / D33）：与本机看板同一套布局，只有一个项目。
 * - 首页 `#/`：左栏列功能，右侧是功能行和「查看」；
 * - 演示页 `#/f/<功能>?s=&step=&d=`：PlayerPage；左栏是选定方案的场景列表；「…」只有导出图片（浏览器内生成）、线框风格、复制链接。
 * - 没有缺口、规则、源码位置、抽屉和“在编辑器中打开”；只消费 publish 模式的 IR；没有写接口。hash 路由，file:// 可直接打开。
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { domToBlob } from 'modern-screenshot';
import type { Project } from '@joplo-app/core';
import { DemoController } from '../runtime/demo';
import { parseSiteHash, siteHash, type PlayRoute, type SiteRoute } from '../runtime/route';
import { scenariosOf } from '../runtime/views';
import type { StageTheme } from '../renderer/rough';
import { Brand, PlayerPage, TopBar, type MenuItem } from '../player/PlayerPage';
import { ThemeStyles } from '../renderer/ThemeStyles';
import { usePlaySync } from '../player/playRoute';
import { copyText, downloadBlob, useFlash, useHash } from '../player/util';
import { cn } from '@/lib/utils';

export type SiteData = { project: Project; home: string | null };

export function readInlineIR(): SiteData | null {
  const el = document.getElementById('joplo-ir');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as SiteData;
  } catch {
    return null;
  }
}

export function SiteApp({ data }: { data: SiteData | null }) {
  if (!data) return <div className="p-8 text-[#c92a2a]">页面缺少原型数据。请重新运行 joplo build。</div>;
  return <Site project={data.project} />;
}

function Site({ project }: { project: Project }) {
  const [hash, go] = useHash();
  const route = parseSiteHash(hash);
  const navigate = (r: SiteRoute, replace = false) => go(siteHash(r), replace);
  // 旧链接 #/s/<场景>：换成演示页链接
  useEffect(() => {
    if (route.kind !== 'scenario') return;
    const sc = project.scenarios[route.scenarioId];
    const f = sc ? project.options[sc.optionId]?.featureId : null;
    navigate(f ? { kind: 'play', play: { featureId: f, scenarioId: sc!.id } } : { kind: 'home' }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);
  if (route.kind === 'play') return <SitePlayer project={project} play={route.play} navigate={navigate} />;
  return <SiteHome project={project} onView={(f) => navigate({ kind: 'play', play: { featureId: f } })} />;
}

function SiteHome({ project, onView }: { project: Project; onView: (featureId: string) => void }) {
  const features = Object.values(project.features);
  return (
    <div className="flex h-full flex-col bg-[#f8f9fa]" data-testid="site-home">
      <TopBar right={<ConceptBadge />}>
        <Brand />
      </TopBar>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-r bg-white p-3">
          <div className="px-2 text-[12px] text-[#6b6b6b]" data-testid="site-name">
            {project.name}
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {features.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => onView(f.id)} className="w-full truncate rounded-md px-3 py-2 text-left text-[14px] hover:bg-[#f1f3f5]" data-testid={`site-feature-${f.id}`}>
                  {f.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-8">
          <div className="flex max-w-[960px] flex-col gap-3">
            <h1 className="text-[24px] font-semibold">{project.name}</h1>
            {project.description ? <p className="text-[14px] text-[#6b6b6b]">{project.description}</p> : null}
            <h2 className="mt-3 text-[17px] font-semibold">功能</h2>
            {features.length === 0 ? <p className="text-[14px] text-[#6b6b6b]">还没有发布任何功能。</p> : null}
            {features.map((f) => {
              const pick = f.pick ? project.options[f.pick] : null;
              return (
                <div key={f.id} className="flex items-center justify-between gap-4 rounded-lg border bg-white p-4" data-testid={`site-feature-row-${f.id}`}>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold">{f.name}</div>
                    <div className="mt-0.5 text-[13px] text-[#6b6b6b]">{f.goal}</div>
                    {pick ? <div className="mt-2 text-[12px] text-[#5a5a5a]">{pick.name} · {scenariosOf(project, pick.id).length} 个场景</div> : null}
                  </div>
                  <button type="button" onClick={() => onView(f.id)} className="shrink-0 rounded-md border bg-white px-4 py-2 text-[14px] hover:bg-[#f8f9fa]" data-testid={`site-view-${f.id}`}>
                    查看
                  </button>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

function ConceptBadge() {
  return (
    <span className="rounded border border-dashed border-[#b35c00] bg-[#fff8ee] px-2 py-1 text-[12px] font-medium text-[#8a4700]" data-testid="concept-badge">
      概念原型 · 非正式实现
    </span>
  );
}

function SitePlayer({ project, play, navigate }: { project: Project; play: PlayRoute; navigate: (r: SiteRoute, replace?: boolean) => void }) {
  const ctl = useMemo(() => new DemoController(null), []);
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  // 发布站使用项目配置的主题（D51）；作者主题随 IR 一起打包
  const theme: StageTheme = project.theme;
  const [flash, setFlash] = useFlash();
  useEffect(() => {
    ctl.setProject(project, 1, null);
  }, [ctl, project]);
  // 播放速度在切换场景时保留
  const toPlay = (next: PlayRoute, replace = false) => navigate({ kind: 'play', play: { ...(play.speed ? { speed: play.speed } : {}), ...next } }, replace);
  const resolved = usePlaySync(ctl, snap, snap.project, play, (next) => toPlay(next, true));
  const feature = project.features[play.featureId];
  if (!snap.project) return null;
  if (!feature || !resolved?.ok)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-[14px]">
        <span>没有这个功能。</span>
        <button type="button" className="text-[#1c5fb8] underline" onClick={() => navigate({ kind: 'home' })}>
          回到首页
        </button>
      </div>
    );
  const option = resolved.optionId ? project.options[resolved.optionId] : null;
  const scenario = snap.view === 'stage' ? ctl.scenario() : null;
  const home = () => navigate({ kind: 'home' });
  const menu: MenuItem[] = [
    {
      id: 'image',
      label: '导出图片（当前步骤）',
      disabled: !scenario,
      onClick: () => {
        const el = document.querySelector<HTMLElement>('[data-joplo-stage]');
        if (!el || !scenario || !snap.state) return;
        const name = `${scenario.id.replace(/[^\w.-]+/g, '_')}-${snap.state.position}.png`;
        void domToBlob(el, { scale: 2, type: 'image/png' }).then(
          (blob) => {
            downloadBlob(blob, name);
            setFlash(`已下载 ${name}`);
          },
          (e: unknown) => setFlash(`导出图片失败：${e instanceof Error ? e.message : String(e)}`),
        );
      },
    },
    { id: 'link', label: '复制当前步骤的链接', onClick: () => void copyText(location.href).then((ok) => setFlash(ok ? '已复制链接' : '无法访问剪贴板，请从地址栏复制')) },
  ];
  const scs = scenariosOf(project, resolved.optionId);
  return (
    <>
    <ThemeStyles themes={project.themes} />
    <PlayerPage
      ctl={ctl}
      snap={snap}
      project={project}
      onBrand={home}
      crumbs={[
        { label: project.name, testid: 'crumb-project', onClick: home },
        { label: feature.name, testid: 'crumb-feature', onClick: home },
        { label: option?.name ?? '', testid: 'crumb-option' },
        { label: scenario?.name ?? '', testid: 'crumb-scenario' },
      ]}
      layer={play.layer ?? null}
      speed={play.speed ?? 1}
      onSpeed={(v) => {
        const { speed: _s, ...rest } = play;
        navigate({ kind: 'play', play: v === 1 ? rest : { ...rest, speed: v } }, true);
      }}
      onLayer={(l) => {
        const { layer: _l, ...rest } = play;
        toPlay(l ? { ...rest, layer: l } : rest, true);
      }}
      theme={theme}
      nav={
        <div className="flex flex-1 flex-col gap-1" data-testid="scenario-nav">
          <div className="truncate px-2 text-[12px] text-[#6b6b6b]">{feature.name}</div>
          {option ? <div className="truncate rounded-lg bg-[#f1f3f5] px-3 py-2 text-[14px] font-semibold">{option.name}</div> : null}
          <div className="mt-3 flex items-center gap-2 px-2 text-[12px] text-[#6b6b6b]">
            场景
            <span className="h-px flex-1 bg-[#e9ecef]" />
          </div>
          <ul className="flex flex-col gap-0.5">
            {scs.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => toPlay({ featureId: feature.id, scenarioId: s.id })}
                  data-testid={`site-scenario-${s.id}`}
                  className={cn('w-full rounded-md px-3 py-2 text-left text-[14px] hover:bg-[#f1f3f5]', snap.scenarioId === s.id && 'bg-[#e7f0ff] font-semibold hover:bg-[#e7f0ff]')}
                >
                  <div className="truncate">{s.name}</div>
                  <div className="text-[12px] font-normal text-[#868e96]">
                    {s.mock.label} · {s.steps.length} 步
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-4">
            <ConceptBadge />
          </div>
        </div>
      }
      menu={menu}
      flash={flash}
    />
    </>
  );
}
