import { tabTitle } from '../player/states';
import { LanguageMenu } from '../player/LanguageMenu';
import { useBoardLayout } from '../player/PlayerPage';
import { LocalText } from '../i18n/LocalText';
import { m } from '../i18n/messages';
import { useI18n } from '../i18n/context';
import { SiteVoiceButton, useSiteVoice } from '../player/SiteVoice';
/**
 * 发布站（`joplo build` 的产物，D39 / D33 / D55「发布站 · 观众看到的」）：与本机看板同一套布局、时间线、字幕、全屏和快捷键，只有一个项目。
 * - 首页 `#/`：左栏列功能；右侧是项目名、说明和功能卡片（整张可点，带缩略图）；
 * - 演示页 `#/f/<功能>?s=&step=&l=`：PlayerPage；顶栏 项目 / 功能 ▾，右侧只有「复制链接」和全屏；左栏是功能名、目标和选定方案的场景
 *   （按场景排列，没有方案切换）；底部标明“用 Joplo 制作的概念原型 · 非正式实现”。
 * - 没有缺口、待决定、规则来源、AI 假设、检查、外观、导出（D33 / D55 不变量 5）；外观固定用 joplo.config.ts 的 theme
 *   （字体、线条暂不发布）。只消费 publish 模式的 IR；没有写接口。hash 路由，file:// 可直接打开。
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { orderedFeatures, type Project } from '@joplo-app/core';
import { DemoController } from '../runtime/demo';
import { isLocalHost, parseSiteHash, siteHash, warnUnknownPlayParams, type PlayRoute, type SiteRoute } from '../runtime/route';
import { scenariosOf } from '../runtime/views';
import { nextScenarioId } from '../player/watch';
import type { StageTheme } from '../renderer/rough';
import { Brand, JOPLO_SITE_URL, PlayerPage, TopBar } from '../player/PlayerPage';
import { ArrowRight, CirclePlay, Link } from 'lucide-react';
import { Btn } from '../player/controls';
import { JoploMark } from '../player/JoploMark';
import { StageThumb } from '../player/StageThumb';
import { displaySceneId } from '@joplo-app/core';
import { siteScenarioRows } from './site-model';
import { EmbedApp } from './EmbedApp';
import { parseEmbedParams } from './embed-model';
import { ThemeStyles } from '../renderer/ThemeStyles';
import { usePlaySync } from '../player/playRoute';
import { copyText, useFlash, useHash } from '../player/util';
import { cn } from '@/lib/utils';

/** scoped：按场景保密分享的产物（D75，joplo share --scenario / --feature）；只有一个功能时打开就进演示，不经过首页。 */
export type SiteData = { project: Project; home: string | null; scoped?: boolean };

export function readInlineIR(): SiteData | null {
  const el = document.getElementById('joplo-ir');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as SiteData;
  } catch {
    return null;
  }
}

/**
 * `search` 缺省读 location.search：只有 `?embed=1` 进入嵌入模式（EmbedApp）；其他情况（含 embed=0、空值）与原来的发布站完全一样。
 */
export function SiteApp({ data, search = typeof location === 'undefined' ? '' : location.search }: { data: SiteData | null; search?: string }) {
  const { t: i18n } = useI18n();
  const embed = useMemo(() => parseEmbedParams(search), [search]);

  if (!data) return <div className="p-8 text-[#c92a2a]">{i18n.site.prototypeDataIsMissingRunJoploBuildAgain}</div>;
  if (embed) return <EmbedApp project={data.project} params={embed} />;
  return <Site project={data.project} scoped={data.scoped === true} />;
}

function Site({ project, scoped }: { project: Project; scoped: boolean }) {
  const { t: i18n } = useI18n();
  const [hash, go] = useHash();
  const route = parseSiteHash(hash);
  const titleFeature = route.kind === 'play' ? project.features[route.play.featureId]?.name ?? null : null;
  useEffect(() => { document.title = i18n.site.prototypeTitle(tabTitle({ feature: titleFeature, project: project.name }, i18n)); }, [titleFeature, project.name, i18n]);
  const navigate = (r: SiteRoute, replace = false) => go(siteHash(r), replace);
  // 只在本机预览发布站时提示（观众看不到）：深链接里不认识的参数照常忽略
  useEffect(() => { if (route.kind === 'play' && isLocalHost(location.hostname)) warnUnknownPlayParams(hash); }, [hash, route.kind]);
  // 旧链接 #/s/<场景>：换成演示页链接
  useEffect(() => {
    if (route.kind !== 'scenario') return;
    const sc = project.scenarios[route.scenarioId];
    const f = sc ? project.options[sc.optionId]?.featureId : null;
    navigate(f ? { kind: 'play', play: { featureId: f, scenarioId: sc!.id } } : { kind: 'home' }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);
  if (route.kind === 'play') return <SitePlayer project={project} play={route.play} navigate={navigate} />;
  // 范围分享只有一个功能：首页没有可选的东西，直接进演示（点面包屑回首页时同样停在演示）
  const only = scoped ? orderedFeatures(project) : [];
  if (only.length === 1) return <SitePlayer project={project} play={{ featureId: only[0]!.id }} navigate={navigate} />;
  return <SiteHome project={project} onView={(f) => navigate({ kind: 'play', play: { featureId: f } })} />;
}

function SiteHome({ project, onView }: { project: Project; onView: (featureId: string) => void }) {
  const { t: i18n } = useI18n();

  const L = useBoardLayout();
  const features = orderedFeatures(project);
  const look = { theme: project.theme, font: null, stroke: null };
  return (
    <div className="flex h-full flex-col overflow-hidden bg-jb-app font-jb text-jb-fg" data-testid="site-home">
      <ThemeStyles themes={project.themes} />
      <TopBar right={<LanguageMenu iconOnly={L.languageIconOnly} />}>
        <Brand href={JOPLO_SITE_URL} />
        <span aria-hidden className="h-5 w-px shrink-0 bg-jb-line" />
        <span className="truncate px-2 text-[14px] font-medium" data-testid="site-name">
          {project.name}
        </span>
      </TopBar>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[276px] shrink-0 flex-col overflow-y-auto border-r border-jb-line bg-jb-surface px-3 py-4">
          <div className="flex items-baseline justify-between px-2 pb-1.5 pt-2 text-[12px]">
            <span className="font-semibold tracking-[1px] text-jb-muted">{i18n.site.features}</span>
            <span className="text-jb-faint">{i18n.site.itemCount(features.length)}</span>
          </div>
          <ul className="flex flex-col gap-1">
            {features.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => onView(f.id)} className="jb-focus w-full truncate rounded-[8px] px-2.5 py-2 text-left text-[14px] hover:bg-jb-hover" data-testid={`site-feature-${f.id}`}>
                  {f.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex-1" />
          <SiteFooter />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
          <div className="flex max-w-[1120px] flex-col gap-5">
            <div>
              <h1 className="text-[24px] font-bold leading-8">{project.name}</h1>
              {project.description ? <p className="mt-1.5 max-w-[860px] text-[14px] leading-[22px] text-jb-muted">{project.description}</p> : null}
            </div>
            {features.length === 0 ? <p className="text-[14px] text-jb-muted">{i18n.site.noFeaturesHaveBeenPublishedYet}</p> : null}
            <section className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
              {features.map((f) => {
                const pick = f.pick ? project.options[f.pick] : null;
                const scs = pick ? scenariosOf(project, pick.id) : [];
                const sc = scs[0];
                return (
                  <div key={f.id} className="group relative flex flex-col overflow-hidden rounded-[10px] border border-jb-line bg-jb-surface hover:border-jb-ink hover:shadow-[var(--jb-e1)]" data-testid={`site-feature-row-${f.id}`}>
                    <button type="button" onClick={() => onView(f.id)} aria-label={i18n.site.openDemoFor(f.name)} className="jb-focus absolute inset-0 z-[2] rounded-[10px]" data-testid={`site-view-${f.id}`} />
                    <StageThumb project={project} scenarioId={sc?.id ?? null} sceneId={sc ? displaySceneId(project, sc.id, 0) : null} look={look} />
                    <div className="flex flex-col gap-1.5 border-t border-jb-line px-4 pb-4 pt-3">
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-[17px] font-bold">{f.name}</span>
                        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold opacity-0 transition-opacity group-hover:opacity-100">
                          {i18n.site.openDemo}<ArrowRight className="size-4" aria-hidden />
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[13px] leading-5 text-jb-muted">{f.goal}</p>
                      {/* 给谁、解决什么（D67）：角色与目标都是发布内容（feature.roles / goal 本来就在发布 IR 里） */}
                      <span className="truncate text-[12px] text-jb-muted">{[f.roles.length ? i18n.player.forRoles(f.roles.map((r) => r.name)) : null, i18n.site.scenarioCount(scs.length)].filter(Boolean).join(' · ')}</span>
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

/** 发布站底部的署名：标明是概念原型（PRD：标明“概念原型 / 尚非正式实现”）。 */
function SiteFooter() {
  const { t: i18n } = useI18n();

  return (
    <div className="flex items-center gap-2 px-2 pt-3 text-[12px] text-jb-faint" data-testid="concept-badge">
      <JoploMark size={16} />
      {i18n.site.conceptPrototypeMadeWithJoploNotAProductionImplementation}</div>
  );
}

function SitePlayer({ project, play, navigate }: { project: Project; play: PlayRoute; navigate: (r: SiteRoute, replace?: boolean) => void }) {
  const L = useBoardLayout();
  const { t: i18n } = useI18n();

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
  // 朗读（D74）：分享带音频时默认开，否则默认关、观众点 🔊 才出声
  const voice = useSiteVoice(ctl, project);
  // 连续播放（mobile_watch）：自动播放放完一个场景，接着放选定方案的下一个场景，像一个分章节的视频；最后一个放完停下
  const optionId = resolved?.ok ? resolved.optionId : null;
  useEffect(() => {
    ctl.autoNext = (id) => nextScenarioId(scenariosOf(project, optionId), id);
    return () => {
      ctl.autoNext = null;
    };
  }, [ctl, project, optionId]);
  const feature = project.features[play.featureId];
  if (!snap.project) return null;
  if (!feature || !resolved?.ok)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-[14px]">
        <span>{i18n.site.featureNotFound}</span>
        <button type="button" className="text-[#1c5fb8] underline" onClick={() => navigate({ kind: 'home' })}>
          {i18n.site.goToHome}</button>
      </div>
    );
  const option = resolved.optionId ? project.options[resolved.optionId] : null;
  const scenario = snap.view === 'stage' ? ctl.scenario() : null;
  const home = () => navigate({ kind: 'home' });
  const scs = scenariosOf(project, resolved.optionId);
  return (
    <>
    <ThemeStyles themes={project.themes} />
    <PlayerPage
      ctl={ctl}
      snap={snap}
      project={project}
      brandHref={JOPLO_SITE_URL}
      crumbs={[
        { label: project.name, testid: 'crumb-project', onClick: home },
        {
          label: feature.name,
          testid: 'crumb-feature',
          // 只有一个功能时没有可切换的，不出下拉（范围分享常见，D75）
          ...(orderedFeatures(project).length > 1 ? { menuLabel: i18n.site.switchFeature } : {}),
          items: orderedFeatures(project).length <= 1 ? undefined : orderedFeatures(project).map((f) => ({ id: `feature-${f.id}`, label: f.name, checked: f.id === feature.id, onClick: () => navigate({ kind: 'play', play: { featureId: f.id, ...(play.speed ? { speed: play.speed } : {}) } }) })),
        },
      ]}
      actions={<Btn iconOnly={!L.topLabels} icon={<Link className="size-4" />} label={i18n.site.copyLink} title={i18n.site.copyLinkToCurrentStep} onClick={() => void copyText(location.href).then((ok) => setFlash(<LocalText value={ok ? m.site.linkCopied : m.site.clipboardUnavailableCopyFromTheAddressBar} />))} data-testid="copy-link" />}
      voice={<SiteVoiceButton voice={voice} />}
      fullscreenVoice={<SiteVoiceButton voice={voice} size={32} testid="fs-voice" />}
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
        <div className="flex min-h-full flex-1 flex-col gap-1 font-jb" data-testid="scenario-nav">
          <div className="px-2 pb-2 pt-1">
            <h2 className="text-[17px] font-bold leading-6">{feature.name}</h2>
            <p className="mt-1 text-[12px] leading-[18px] text-jb-muted">{feature.goal}</p>
            {feature.roles.length ? <p className="mt-1 truncate text-[12px] leading-[18px]" data-testid="site-feature-roles">{i18n.player.forRoles(feature.roles.map((r) => r.name))}</p> : null}
          </div>
          <div className="flex items-baseline justify-between px-2 pb-1.5 pt-2 text-[12px]">
            <span className="font-semibold tracking-[1px] text-jb-muted">{i18n.site.scenarios}</span>
            <span className="text-jb-faint">{i18n.site.itemCount(scs.length)}</span>
          </div>
          <ul className="flex flex-col gap-1">
            {siteScenarioRows(project, resolved.optionId, snap.scenarioId, i18n).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => toPlay({ featureId: feature.id, scenarioId: r.id })}
                  data-testid={`site-scenario-${r.id}`}
                  aria-current={r.current ? 'true' : undefined}
                  className={cn('jb-focus flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[14px]', r.current ? 'bg-jb-selected font-semibold' : 'hover:bg-jb-hover')}
                >
                  <CirclePlay className={cn('size-4 shrink-0', r.current ? 'text-jb-fg' : 'text-jb-muted')} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="shrink-0 text-[11px] font-normal text-jb-faint">{r.steps}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex-1" />
          <SiteFooter />
        </div>
      }
      menu={[]}
      flash={flash}
      watch={{
        title: feature.name,
        chapters: siteScenarioRows(project, resolved.optionId, snap.scenarioId, i18n),
        onChapter: (id) => toPlay({ featureId: feature.id, scenarioId: id }),
        onRestart: () => {
          const first = scs[0];
          if (!first) return;
          if (first.id === snap.scenarioId) void ctl.play({ fromStart: true });
          else {
            ctl.setScenario(first.id, 0, { quiet: true });
            void ctl.play({ fromStart: true });
          }
        },
      }}
    />
    </>
  );
}
