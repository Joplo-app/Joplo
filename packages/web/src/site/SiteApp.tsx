import { projectThemes } from '@joplo-app/core/runtime';
import { tabTitle } from '../player/states';
import { LanguageMenu } from '../player/LanguageMenu';
import { useBoardLayout } from '../player/PlayerPage';
import { LocalText } from '../i18n/LocalText';
import { m } from '../i18n/messages';
import { useI18n } from '../i18n/context';
import { SiteVoiceButton, useSiteVoice } from '../player/SiteVoice';
import { ContentContext } from '../i18n/content-context';
import { siteContent, viewProject } from '../i18n/content';
import { ContentFallbackNotice } from './ContentNotice';
/**
 * 发布站（`joplo build` 的产物，D39 / D33 / D55「发布站 · 观众看到的」）：与本机看板同一套布局、时间线、字幕、全屏和快捷键，只有一个项目。
 * - 首页 `#/`：左栏列作品；右侧是项目名、说明和作品卡片（整张可点，带缩略图）。卡片只读 core 的 Work（D102）：
 *   影片写「N 章 · 约 M」与观众，功能演示写角色与场景数（不变）；项目里有影片时卡片带形态徽标；
 * - 打开时先落在首页或封面上（D102）：只有一个作品时 `#/` 直接是这个作品的演示页第 0 步（封面），多个作品时是首页；
 * - 影片的左栏叫“章节”（与手机一致），章节带自动编号与时长，支线单独一组；功能演示仍叫“场景”；
 * - 演示页 `#/f/<功能>?s=&step=&l=`：PlayerPage；顶栏 项目 / 功能 ▾，右侧只有「复制链接」和全屏；左栏是功能名、目标和选定方案的场景
 *   （按场景排列，没有方案切换）；底部标明“用 Joplo 制作的概念原型 · 非正式实现”。
 * - 没有缺口、待决定、规则来源、AI 假设、检查、外观、导出（D33 / D55 不变量 5）；外观固定用 joplo.config.ts 的 theme
 *   （字体、线条暂不发布）。只消费 publish 模式的 IR；没有写接口。hash 路由，file:// 可直接打开。
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { orderedFeatures, workKind, workOf, worksOf, type Project, type Work } from '@joplo-app/core/runtime';
import { DemoController } from '../runtime/demo';
import { isLocalHost, parseSiteHash, siteHash, warnUnknownPlayParams, type PlayRoute, type SiteRoute } from '../runtime/route';
import { scenariosOf } from '../runtime/views';
import type { StageTheme } from '../renderer/rough';
import { Brand, JOPLO_SITE_URL, PlayerPage, TopBar } from '../player/PlayerPage';
import { ArrowRight, CirclePlay, Link } from 'lucide-react';
import { Btn } from '../player/controls';
import { JoploMark } from '../player/JoploMark';
import { StageThumb } from '../player/StageThumb';
import { displaySceneId } from '@joplo-app/core/runtime';
import { siteScenarioRows } from './site-model';
import { chapterRows, filmMetaText, firstSlice, formsOf, siteLanding, type ChapterRow } from '../player/work-view';
import { EmbedApp } from './EmbedApp';
import { parseEmbedParams } from './embed-model';
import { AuthorLink, readAuthor, type Author } from './author';
import { readBranding } from './branding';
import { ThemeStyles } from '../renderer/ThemeStyles';
import { usePlaySync } from '../player/playRoute';
import { copyText, useFlash, useHash } from '../player/util';
import { cn } from '@/lib/utils';

/** scoped：按场景保密分享的产物（D75，joplo share --scenario / --feature）。打开时落在哪里与普通发布同一条规则（siteLanding）。 */
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
 * `branding` 缺省读页面里的 joplo-branding 标记（D83）：只有 Joplo Cloud 给 Pro 分享注入 off 时才去掉水印。
 */
export function SiteApp({ data, search = typeof location === 'undefined' ? '' : location.search, branding = readBranding(), author = readAuthor() }: { data: SiteData | null; search?: string; branding?: boolean; author?: Author | null }) {
  const { t: i18n, locale } = useI18n();
  const embed = useMemo(() => parseEmbedParams(search), [search]);
  // 作者内容多语言（D84）：内容语言跟随界面语言，项目没有时退回默认语言；下面所有组件都只看换过语言的 IR
  const content = useMemo(() => (data ? siteContent(data.project, locale) : null), [data, locale]);
  const project = useMemo(() => (data ? viewProject(data.project, content?.locale, locale) : null), [data, content?.locale, locale]);

  if (!data || !project) return <div className="p-8 text-[#c92a2a]">{i18n.site.prototypeDataIsMissingRunJoploBuildAgain}</div>;
  return (
    <ContentContext.Provider value={content}>
      {embed ? <EmbedApp project={project} params={embed} branding={branding} /> : <Site project={project} branding={branding} author={author} />}
    </ContentContext.Provider>
  );
}

function Site({ project, branding, author }: { project: Project; branding: boolean; author?: Author | null }) {
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
  if (route.kind === 'play') return <SitePlayer project={project} play={route.play} navigate={navigate} branding={branding} author={author} />;
  // 只有一个作品：首页没有可选的东西，打开就是这个作品的封面（演示页第 0 步，不自动播放）；点面包屑回首页时同样停在这里
  const landing = siteLanding(project);
  if (landing.kind === 'work') return <SitePlayer project={project} play={{ featureId: landing.featureId }} navigate={navigate} branding={branding} author={author} />;
  return <SiteHome project={project} author={author} onView={(f) => navigate({ kind: 'play', play: { featureId: f } })} />;
}

export function SiteHome({ project, onView, author }: { author?: Author | null; project: Project; onView: (featureId: string) => void }) {
  const { t: i18n } = useI18n();

  const L = useBoardLayout();
  const works = worksOf(project);
  const forms = formsOf(works);
  // 只有一种形态时不出形态徽标（功能演示的项目与以前一样）；左栏标题按形态：功能 / 影片 / 作品
  const mixed = forms.size > 1;
  const listTitle = mixed ? i18n.site.works : forms.has('film') ? i18n.site.films : i18n.site.features;
  const look = { theme: project.theme, font: null, stroke: null };
  return (
    <div className="flex h-full flex-col overflow-hidden bg-jb-app font-jb text-jb-fg" data-testid="site-home">
      <ThemeStyles themes={projectThemes(project)} />
      <TopBar right={<><AuthorLink author={author} /><LanguageMenu iconOnly={L.languageIconOnly} /></>}>
        <Brand href={JOPLO_SITE_URL} />
        <span aria-hidden className="h-5 w-px shrink-0 bg-jb-line" />
        <span className="truncate px-2 text-[14px] font-medium" data-testid="site-name">
          {project.name}
        </span>
      </TopBar>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[276px] shrink-0 flex-col overflow-y-auto border-r border-jb-line bg-jb-surface px-3 py-4">
          <div className="flex items-baseline justify-between px-2 pb-1.5 pt-2 text-[12px]">
            <span className="font-semibold tracking-[1px] text-jb-muted">{listTitle}</span>
            <span className="text-jb-faint">{i18n.site.itemCount(works.length)}</span>
          </div>
          <ul className="flex flex-col gap-1">
            {works.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => onView(w.id)} className="jb-focus w-full truncate rounded-[8px] px-2.5 py-2 text-left text-[14px] hover:bg-jb-hover" data-testid={`site-feature-${w.id}`}>
                  {w.title}
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
            <ContentFallbackNotice />
            {works.length === 0 ? <p className="text-[14px] text-jb-muted">{i18n.site.noFeaturesHaveBeenPublishedYet}</p> : null}
            <section className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
              {works.map((w) => {
                const film = w.kind === 'film';
                const sc = firstSlice(w);
                return (
                  <div key={w.id} className="group relative flex flex-col overflow-hidden rounded-[10px] border border-jb-line bg-jb-surface hover:border-jb-ink hover:shadow-[var(--jb-e1)]" data-testid={`site-feature-row-${w.id}`} data-kind={mixed || film ? w.kind : undefined}>
                    <button type="button" onClick={() => onView(w.id)} aria-label={film ? i18n.site.watchFilmFor(w.title) : i18n.site.openDemoFor(w.title)} className="jb-focus absolute inset-0 z-[2] rounded-[10px]" data-testid={`site-view-${w.id}`} />
                    <StageThumb project={project} scenarioId={sc?.id ?? null} sceneId={sc ? displaySceneId(project, sc.id, 0) : null} look={look} />
                    <div className="flex flex-col gap-1.5 border-t border-jb-line px-4 pb-4 pt-3">
                      {mixed || film ? (
                        <div className="flex min-w-0 items-center gap-2 text-[12px]" data-testid={`site-work-kind-${w.id}`}>
                          <WorkBadge work={w} />
                          {film ? <span className="min-w-0 truncate text-jb-muted" data-testid={`site-work-meta-${w.id}`}>{filmMetaText(w, i18n)}</span> : null}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-[17px] font-bold">{w.title}</span>
                        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold opacity-0 transition-opacity group-hover:opacity-100">
                          {film ? i18n.site.watchFilm : i18n.site.openDemo}<ArrowRight className="size-4" aria-hidden />
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[13px] leading-5 text-jb-muted">{w.summary}</p>
                      {/* 给谁、解决什么（D67）：功能演示写角色与场景数；影片写观众（audience，没写时不显示） */}
                      {film ? (
                        w.audience ? <span className="truncate text-[12px] text-jb-muted" title={w.audience}>{i18n.player.forRoles([w.audience])}</span> : null
                      ) : (
                        <span className="truncate text-[12px] text-jb-muted">{[w.roles.length ? i18n.player.forRoles(w.roles) : null, i18n.site.scenarioCount(w.slices.length)].filter(Boolean).join(' · ')}</span>
                      )}
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

/** 形态徽标（D102）：影片 / 功能演示。 */
function WorkBadge({ work }: { work: Work }) {
  const { t: i18n } = useI18n();
  return (
    <span className={cn('shrink-0 rounded-[4px] px-1.5 py-px text-[11px] font-medium', work.kind === 'film' ? 'bg-jb-inverse text-jb-on-inverse' : 'border border-jb-line text-jb-muted')} data-testid="work-badge">
      {work.kind === 'film' ? i18n.player.film : i18n.player.featureDemo}
    </span>
  );
}

/** 影片的章节行：两位编号、标题（两行内换行）、时长；电脑左栏与手机章节列表用同一份数据（chapterRows）。 */
function SiteChapterRow({ row, onPick }: { row: ChapterRow; onPick: () => void }) {
  const { t: i18n } = useI18n();
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        data-testid={`site-scenario-${row.id}`}
        aria-current={row.current ? 'true' : undefined}
        title={row.title}
        className={cn('jb-focus flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[14px]', row.current ? 'bg-jb-selected font-semibold' : 'hover:bg-jb-hover')}
      >
        {row.no ? (
          <span className="w-5 shrink-0 font-jb-mono text-[12px] font-bold leading-5 text-jb-muted" data-testid="chapter-no">{row.no}</span>
        ) : (
          <CirclePlay className={cn('mt-0.5 size-4 shrink-0', row.current ? 'text-jb-fg' : 'text-jb-muted')} aria-hidden />
        )}
        <span className="line-clamp-2 min-w-0 flex-1 leading-5 [overflow-wrap:anywhere]">{row.title}</span>
        <span className="shrink-0 font-jb-mono text-[11px] font-normal leading-5 text-jb-faint">{i18n.player.clock(row.ms)}</span>
      </button>
    </li>
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

function SitePlayer({ project, play, navigate, branding, author }: { project: Project; play: PlayRoute; navigate: (r: SiteRoute, replace?: boolean) => void; branding: boolean; author?: Author | null }) {
  const L = useBoardLayout();
  const { t: i18n } = useI18n();

  // 同步建好控制器并载入项目（与嵌入一致）：首帧就是第 0 步的封面，不经过空白页；之后换语言时由下面的 effect 热更新
  const ctl = useMemo(() => {
    const c = new DemoController(null);
    c.setProject(project, 1, null);
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot, ctl.getSnapshot);
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
  // 连续播放：控制器缺省就接着放同一方案的下一个场景（D92 U2，与看板一致），这里不再另设规则
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
  // 影片（D102）：左栏与手机章节列表都按 Work 的切片，章节带两位编号与时长；功能演示不变
  const work = workKind(feature) === 'film' ? workOf(project, feature.id) : null;
  const rows = work ? chapterRows(work, snap.scenarioId, i18n) : null;
  const first = work ? firstSlice(work) : scs[0];
  return (
    <>
    <ThemeStyles themes={projectThemes(project)} />
    <PlayerPage
      ctl={ctl}
      snap={snap}
      project={project}
      brandHref={JOPLO_SITE_URL}
      author={author}
      watermark={branding ? { href: JOPLO_SITE_URL, label: i18n.site.embedMadeWithJoplo } : undefined}
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
      nav={work && rows ? (
        <div className="flex min-h-full flex-1 flex-col gap-1 font-jb" data-testid="scenario-nav" data-kind="film">
          <div className="flex flex-col gap-1 px-2 pb-2 pt-1">
            <div className="flex min-w-0 items-center gap-2 text-[12px]">
              <WorkBadge work={work} />
              <span className="min-w-0 truncate text-jb-muted" data-testid="film-meta">{filmMetaText(work, i18n)}</span>
            </div>
            <h2 className="text-[17px] font-bold leading-6 [overflow-wrap:anywhere]">{work.title}</h2>
            <p className="text-[12px] leading-[18px] text-jb-muted">{work.summary}</p>
            {work.audience ? <p className="line-clamp-2 text-[12px] leading-[18px]" title={work.audience} data-testid="site-film-audience">{i18n.player.forRoles([work.audience])}</p> : null}
          </div>
          {rows.chapters.length ? (
            <>
              <div className="flex items-baseline justify-between px-2 pb-1.5 pt-2 text-[12px]">
                <span className="font-semibold tracking-[1px] text-jb-muted">{i18n.player.watchChapters}</span>
                <span className="text-jb-faint">{i18n.site.itemCount(rows.chapters.length)}</span>
              </div>
              <ul className="flex flex-col gap-1" data-testid="site-chapters">
                {rows.chapters.map((r) => <SiteChapterRow key={r.id} row={r} onPick={() => toPlay({ featureId: feature.id, scenarioId: r.id })} />)}
              </ul>
            </>
          ) : null}
          {rows.side.length ? (
            <>
              <div className="flex items-baseline justify-between px-2 pb-1.5 pt-3 text-[12px]">
                <span className="font-semibold tracking-[1px] text-jb-muted">{i18n.player.sideChapters}</span>
                <span className="text-jb-faint">{i18n.site.itemCount(rows.side.length)}</span>
              </div>
              <ul className="flex flex-col gap-1" data-testid="site-side-chapters">
                {rows.side.map((r) => <SiteChapterRow key={r.id} row={r} onPick={() => toPlay({ featureId: feature.id, scenarioId: r.id })} />)}
              </ul>
            </>
          ) : null}
          <div className="flex-1" />
          <SiteFooter />
        </div>
      ) : (
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
      )}
      menu={[]}
      banner={<ContentFallbackNotice />}
      flash={flash}
      watch={{
        title: feature.name,
        chapters: rows ? [...rows.chapters, ...rows.side].map((r) => ({ id: r.id, name: r.title, no: r.no, current: r.current, steps: i18n.player.clock(r.ms) })) : siteScenarioRows(project, resolved.optionId, snap.scenarioId, i18n),
        onChapter: (id) => toPlay({ featureId: feature.id, scenarioId: id }),
        onRestart: () => {
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
