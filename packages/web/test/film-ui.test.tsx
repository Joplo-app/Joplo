import '../../../scripts/test/render-fixtures.ts';
/**
 * 影片形态的界面（D102，docs/film-form.md 第 7 节；方案 A「左栏章节清单」）。夹具见 film-fixture.ts（影片形状的 IR）。
 * 不变量：
 * 1. 形态只由 workKind(feature) 决定：同一份 IR 去掉 kind 就按功能演示呈现；不靠“没有情况”“只有一个方案”推断；
 * 2. 功能演示的下拉、封面、首页卡片、嵌入封面与改动前一样（只有功能演示的项目不出现任何影片的东西）；
 * 3. 首页卡片、封面、左栏的标题 / 简介 / 观众 / 切片数 / 时长都从 Entry 取，时长就是 Entry.ms 与 EntrySlice.ms；
 * 4. 发布站打开时先落在首页或封面上：一个作品 → 它的封面，多个 → 首页；嵌入与评审模式默认停在封面；
 * 5. 章节按播放顺序从 01 编号，支线不编号、单独一组，作者标题原样；
 * 6. 草稿影片在看板里能打开，下拉与左栏标“草稿 · 不发布”；
 * 7. 新文案十种语言齐全、复数正确，左栏在 1280 / 1440 宽度下不横向溢出；
 * 8. 边界：没有章节、只有一章、标题很长、没写 audience、全是支线、只有影片 / 只有功能演示 / 两种都有。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { entryOf, entriesOf, type Project } from '@joplo-app/core';
import { I18nProvider } from '../src/i18n/context';
import { dictionary } from '../src/i18n/dictionaries';
import { boardDictionary, boardEnglish } from '../src/i18n/board/dictionaries';
import { locales } from '../src/i18n/locale';
import { SiteApp, SiteHome } from '../src/site/SiteApp';
import { embedFilmCover, embedInitial, embedScenarioItems, parseEmbedParams } from '../src/site/embed-model';
import { coverFor, coverShown } from '../src/player/cover-content';
import { Curtain } from '../src/player/Curtain';
import { resolvePlay } from '../src/player/playRoute';
import { approxLength, chapterNumber, chapterRows, filmMetaText, firstSlice, siteLanding } from '../src/player/work-view';
import { featureMenu, filmReviewCommand, workMenu } from '../src/board/nav-model';
import { featureCard } from '../src/board/home-model';
import { FilmNav, FilmRail } from '../src/board/FilmNav';
import { boardLayout } from '../src/player/layout';
import { textW } from '../src/player/controls-fit';
import { DEFAULT_CHAPTERS, filmProject } from './film-fixture';

const en = dictionary('en');
const site = (project: Project, search = '') => renderToStaticMarkup(<I18nProvider explicit="en"><SiteApp data={{ project, home: null }} search={search} /></I18nProvider>);
const filmNav = (project: Project, id = 'midterms', scenarioId: string | null = null, locale = 'en') =>
  renderToStaticMarkup(<I18nProvider explicit={locale} extend={boardDictionary}><FilmNav project={project} work={entryOf(project, id)!} scenarioId={scenarioId} onScenario={() => {}} onCopy={() => {}} /></I18nProvider>);
/** 同一份 IR 去掉形态标记：应当完全按功能演示呈现。 */
const asDemo = (p: Project, id = 'midterms') => {
  const q = structuredClone(p);
  delete q.features[id]!.standalone;
  for (const oid of q.features[id]!.optionIds) delete q.options[oid]!.sequencing;
  return q;
};

afterEach(() => vi.unstubAllGlobals());

describe('条目能力的机械适配', () => {
  it('功能选定的方案带 linear 时同样显示章节与编号', () => {
    const p=filmProject({withDemo:true});p.options['invite.a']!.sequencing='linear';
    const entry=entryOf(p,'invite')!;
    expect(entry.featureId).toBe('invite');expect(entry.sequencing).toBe('linear');
    expect(chapterRows(entry,'invite.a.main').chapters[0]!.no).toBe('01');
    expect(coverFor(p,'invite.a.main')!.film).not.toBeNull();
  });
  it('独立作品带 independent 时不显示章节编号或审片命令', () => {
    const p=filmProject();delete p.options['midterms.main']!.sequencing;
    const entry=entryOf(p,'midterms')!;
    expect(entry.featureId).toBeNull();expect(entry.sequencing).toBe('independent');
    expect(chapterRows(entry,null).chapters.every(r=>r.no===null)).toBe(true);
    expect(filmReviewCommand(entry)).toBeNull();
    expect(coverFor(p,'midterms.main.basics')!.film!.at).toBe('film');
  });
});

describe('不变量 1：形态只由 workKind 决定', () => {
  it('影片形状的 IR 去掉 kind 后，下拉、封面、嵌入、默认场景都按功能演示（不看有没有情况、有几个方案）', () => {
    const film = filmProject();
    const demo = asDemo(film);
    // 下拉：影片写章节与时长；去掉 kind 后与 featureMenu 一模一样（“已选定 A”那一套）
    expect(workMenu(film, 'midterms')[0]).toMatchObject({ featureId: null, hint: expect.stringContaining('3 chapters') });
    expect(workMenu(demo, 'midterms')).toEqual(featureMenu(demo, 'midterms').map((f) => ({ ...f, featureId: f.id, draft: false })));
    // 封面
    expect(coverFor(film, 'midterms.main.hook')!.film).toMatchObject({ at: 'film' });
    expect(coverFor(demo, 'midterms.main.hook')!.film).toBeNull();
    // 嵌入封面
    expect(embedFilmCover(film, 'midterms.main.hook')).not.toBeNull();
    expect(embedFilmCover(demo, 'midterms.main.hook')).toBeNull();
    // 发布站左栏：影片叫“章节”，功能演示叫“场景”
    vi.stubGlobal('location', { hash: '', search: '', href: 'https://joplo.app/' });
    expect(site(filmProject({ mode: 'publish' }))).toContain('data-kind="film"');
    expect(site(asDemo(filmProject({ mode: 'publish' })))).not.toContain('data-kind="film"');
  });

  it('只有一个方案、没有情况的功能演示仍是功能演示', () => {
    const p = filmProject({ withDemo: true });
    const one = structuredClone(p);
    const f = one.features.invite!;
    f.optionIds = ['invite.a'];
    f.caseIds = [];
    delete one.options['invite.b'];
    expect(entryOf(one, 'invite')!.featureId).toBe('invite');
    expect(coverFor(one, 'invite.a.main')!.film).toBeNull();
    expect(workMenu(one, 'invite').find((e) => 'name' in e && e.id === 'invite')).toMatchObject({ featureId: 'invite', hint: featureMenu(one, 'invite').find((x) => x.id === 'invite')!.hint });
  });

  it('新增的呈现代码里没有按情况 / 方案数量推断形态的写法', () => {
    for (const file of ['../src/player/work-view.ts', '../src/board/FilmNav.tsx', '../src/site/embed-model.ts', '../src/player/cover-content.ts']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(src, file).not.toMatch(/caseIds\.length|optionIds\.length|cases\)\.length/);
    }
  });
});

describe('不变量 2：功能演示的呈现不变', () => {
  it('只有功能演示的项目：下拉没有分组标题，项与 featureMenu 相同；封面没有影片信息；首页没有形态徽标', () => {
    const p = filmProject({ withDemo: true });
    const demoOnly = structuredClone(p);
    delete demoOnly.features.midterms;
    (demoOnly as { featureIds?: string[] }).featureIds = ['invite'];
    expect(workMenu(demoOnly, 'invite').some((e) => 'heading' in e)).toBe(false);
    expect(workMenu(demoOnly, 'invite').map(({ featureId: _f, draft: _d, ...rest }: any) => rest)).toEqual(featureMenu(demoOnly, 'invite'));
    expect(coverFor(demoOnly, 'invite.a.main')).toMatchObject({ film: null, feature: 'Invite teammates', option: 'A · Banner' });
    const home = renderToStaticMarkup(<I18nProvider explicit="en"><SiteHome project={demoOnly} onView={() => {}} /></I18nProvider>);
    expect(home).not.toContain('work-badge');
    expect(home).not.toContain('data-kind');
    expect(home).toContain('>Features<');
    expect(home).toContain('For: Admin · 1 scenario');
    expect(featureCard(demoOnly, 'invite')!.film).toBeNull();
  });

  it('场景封面的 DOM 与以前一样（scene-cover，没有 film-cover）；嵌入封面仍写项目名与场景数', () => {
    const p = filmProject({ withDemo: true });
    const cover = coverFor(p, 'invite.a.main')!;
    const html = renderToStaticMarkup(<I18nProvider explicit="en"><Curtain project={p} scenarioId="invite.a.main" position={0} cover={cover} theme="sketch" width={1132} height={700} animate={false} passive /></I18nProvider>);
    expect(html).toContain('data-testid="scene-cover"');
    expect(html).not.toContain('film-cover');
    expect(html).toContain('Invite teammates · A · Banner');
    expect(embedFilmCover(p, 'invite.a.main')).toBeNull();
  });
});

describe('不变量 3：首页卡片、封面、左栏只读 Entry', () => {
  it('影片封面的时长 = Entry.ms，章节封面 = EntrySlice.ms；标题、简介、观众来自 Entry', () => {
    const p = filmProject({ audience: 'Curious readers' });
    const w = entryOf(p, 'midterms')!;
    const film = coverFor(p, 'midterms.main.hook')!;
    expect(film.ms).toBe(w.ms);
    expect(film.film).toEqual({ at: 'film', title: w.title, summary: w.summary, audience: 'Curious readers', meta: filmMetaText(w, en), chapter: 1 });
    const results = coverFor(p, 'midterms.main.results')!;
    expect(results.ms).toBe(w.slices.find((s) => s.id === 'midterms.main.results')!.ms);
    expect(results).toMatchObject({ title: 'How big was the blue wave?', description: 'Seats in both chambers', film: { at: 'chapter', chapter: 3 } });
    // 章节没写 description 时不退回影片简介（那是影片封面的内容）
    expect(coverFor(p, 'midterms.main.basics')).toMatchObject({ description: null, film: { at: 'chapter', chapter: 2 } });
  });

  it('「N 章 · 约 M」按 Entry 计算：章节数 = 顺序里的切片数，时长 = approxLength(Entry.ms)', () => {
    const w = entryOf(filmProject(), 'midterms')!;
    const d = approxLength(w.ms);
    expect(filmMetaText(w, en)).toBe(en.player.filmMeta(3, d.min, d.sec));
    expect(filmMetaText(w, en)).toMatch(/^3 chapters · about \d+ sec$/);
    expect(approxLength(280_000)).toEqual({ min: 4, sec: 40 });
    expect(approxLength(283_000)).toEqual({ min: 4, sec: 40 });
    expect(approxLength(298_000)).toEqual({ min: 5, sec: 0 });
    expect(approxLength(35_100)).toEqual({ min: 0, sec: 35 });
    expect(en.player.filmMeta(5, 4, 40)).toBe('5 chapters · about 4 min 40 sec');
    expect(dictionary('zh-CN').player.filmMeta(5, 4, 40)).toBe('5 章 · 约 4 分 40 秒');
    expect(dictionary('zh-CN').player.filmMeta(5, 4, 0)).toBe('5 章 · 约 4 分');
    expect(boardDictionary('zh-CN').board.filmMenuHint(5, en.player.clock(280_000))).toBe('5 章 · 4:40');
  });

  it('发布站首页卡片：形态徽标、标题、简介、给：观众、章节数与时长都取自 Entry', () => {
    const p = filmProject({ mode: 'publish', withDemo: true, audience: 'Curious readers' });
    const w = entryOf(p, 'midterms')!;
    const html = renderToStaticMarkup(<I18nProvider explicit="en"><SiteHome project={p} onView={() => {}} /></I18nProvider>);
    expect(html).toContain('>Works<');
    expect(html).toMatch(/data-testid="site-feature-row-midterms" data-kind="film"/);
    expect(html).toMatch(/data-testid="site-feature-row-invite" data-kind="demo"/);
    expect(html).toContain(`data-testid="site-work-meta-midterms">${filmMetaText(w, en)}<`);
    expect(html).toContain('For: Curious readers');
    expect(html).toContain('aria-label="Watch “After he lost Congress”"');
    // 功能演示的卡片沿用角色与场景数
    expect(html).toContain('For: Admin · 1 scenario');
    expect(html).toContain('>Feature demo<');
  });

  it('看板左栏的章节行：时长就是 EntrySlice.ms，步数就是 EntrySlice.steps', () => {
    const p = filmProject();
    const w = entryOf(p, 'midterms')!;
    const html = filmNav(p, 'midterms', 'midterms.main.basics');
    for (const s of w.slices) expect(html).toContain(boardEnglish.board.chapterMeta(en.player.clock(s.ms), s.steps));
    expect(html).toContain(`data-testid="film-meta">${filmMetaText(w, en)}<`);
  });
});

describe('不变量 4：先落在首页或封面上', () => {
  it('siteLanding：一个作品 → 它；多个或没有 → 首页', () => {
    expect(siteLanding(filmProject({ mode: 'publish' }))).toEqual({ kind: 'work', featureId: 'midterms' });
    const demo = filmProject({ mode: 'publish', withDemo: true });
    delete demo.features.midterms;
    expect(siteLanding(demo)).toEqual({ kind: 'work', featureId: 'invite' });
    expect(siteLanding(filmProject({ mode: 'publish', withDemo: true }))).toEqual({ kind: 'home' });
    expect(siteLanding(filmProject({ mode: 'publish', second: { key: 'v1', title: 'Earlier cut' } }))).toEqual({ kind: 'home' });
    // 草稿不进发布 IR：只剩一支影片时直接是它的封面
    expect(siteLanding(filmProject({ mode: 'publish', second: { key: 'v1', title: 'Earlier cut', draft: true } }))).toEqual({ kind: 'work', featureId: 'midterms' });
    const none = filmProject({ mode: 'publish' });
    delete none.features.midterms;
    (none as { featureIds?: string[] }).featureIds = [];
    expect(siteLanding(none)).toEqual({ kind: 'home' });
  });

  it('只有一支影片的发布站：打开就是第一章第 0 步的影片封面，不是首页、也不在播放', () => {
    vi.stubGlobal('location', { hash: '', search: '', href: 'https://joplo.app/s/x/' });
    const p = filmProject({ mode: 'publish' });
    for (const scoped of [false, true]) {
      const html = renderToStaticMarkup(<I18nProvider explicit="en"><SiteApp data={{ project: p, home: null, scoped }} search="" /></I18nProvider>);
      expect(html).not.toContain('data-testid="site-home"');
      expect(html).toContain('data-testid="scenario-nav" data-kind="film"');
      expect(html).toMatch(/data-testid="site-scenario-midterms\.main\.hook" aria-current="true"/);
    }
    const r = resolvePlay(p, { featureId: 'midterms' });
    expect(r).toMatchObject({ scenarioId: 'midterms.main.hook', step: 0 });
    expect(coverShown(p.scenarios[r.scenarioId!], r.step, false, null)).toBe(true);
    expect(coverFor(p, r.scenarioId)!.film!.at).toBe('film');
  });

  it('只有一个功能演示的发布站同样直接是它的封面；两个作品时是首页', () => {
    vi.stubGlobal('location', { hash: '', search: '', href: 'https://joplo.app/s/x/' });
    const demo = filmProject({ mode: 'publish', withDemo: true });
    delete demo.features.midterms;
    (demo as { featureIds?: string[] }).featureIds = ['invite'];
    const html = site(demo);
    expect(html).not.toContain('data-testid="site-home"');
    expect(html).toContain('data-testid="scenario-nav"');
    expect(resolvePlay(demo, { featureId: 'invite' })).toMatchObject({ scenarioId: 'invite.a.main', step: 0 });
    expect(site(filmProject({ mode: 'publish', withDemo: true }))).toContain('data-testid="site-home"');
  });

  it('第一章是支线时影片封面画在顺序里的第一章；深链到中间某一章是那一章的封面', () => {
    const p = filmProject({ chapters: [{ key: 'intro', title: 'Intro', side: true }, { key: 'one', title: 'One', from: null }, { key: 'two', title: 'Two' }] });
    expect(resolvePlay(p, { featureId: 'midterms' }).scenarioId).toBe('midterms.main.one');
    expect(coverFor(p, 'midterms.main.one')!.film).toMatchObject({ at: 'film', chapter: 1 });
    expect(coverFor(p, 'midterms.main.two')!.film).toMatchObject({ at: 'chapter', chapter: 2 });
    expect(coverFor(p, 'midterms.main.intro')!.film).toMatchObject({ at: 'chapter', chapter: null });
    const html = renderToStaticMarkup(<I18nProvider explicit="en"><Curtain project={p} scenarioId="midterms.main.two" position={0} cover={coverFor(p, 'midterms.main.two')} theme="sketch" width={1132} height={700} animate={false} passive /></I18nProvider>);
    expect(html).toContain('data-testid="film-cover" data-at="chapter"');
    expect(html).toContain('Chapter 2 · After he lost Congress');
    const side = renderToStaticMarkup(<I18nProvider explicit="en"><Curtain project={p} scenarioId="midterms.main.intro" position={0} cover={coverFor(p, 'midterms.main.intro')} theme="sketch" width={1132} height={700} animate={false} passive /></I18nProvider>);
    expect(side).toContain('Side chapter · After he lost Congress');
  });

  it('嵌入（?embed=1）与评审模式（?embed=1&review=1）默认停在封面；影片封面写影片标题与章节数', () => {
    vi.stubGlobal('location', { hash: '', search: '', href: 'https://joplo.app/s/x/' });
    const p = filmProject({ mode: 'publish' });
    for (const search of ['?embed=1', '?embed=1&review=1', '?embed=1&scenario=midterms.main.results']) {
      expect(embedInitial(p, parseEmbedParams(search)!).covered, search).toBe(true);
      const html = site(p, search);
      expect(html, search).toContain('data-testid="embed-cover"');
      expect(html, search).toContain('Play film');
      expect(html, search).toContain(`Film · ${filmMetaText(entryOf(p, 'midterms')!, en)}`);
      expect(html, search).toContain('>After he lost Congress<');
    }
    expect(embedInitial(p, parseEmbedParams('?embed=1&scenario=midterms.main.results')!).scenarioId).toBe('midterms.main.results');
    // autoplay=1 是嵌入方显式要求跳过封面（云端嵌入契约），照旧
    expect(embedInitial(p, parseEmbedParams('?embed=1&autoplay=1')!).covered).toBe(false);
    // 第一章是支线时，嵌入默认也从顺序里的第一章开始
    const side = filmProject({ mode: 'publish', chapters: [{ key: 'intro', title: 'Intro', side: true }, { key: 'one', title: 'One', from: null }] });
    expect(embedInitial(side, parseEmbedParams('?embed=1')!).scenarioId).toBe('midterms.main.one');
    expect(embedInitial(side, parseEmbedParams('?embed=1&scenario=midterms.main.intro')!).scenarioId).toBe('midterms.main.intro');
  });
});

describe('不变量 5：章节编号', () => {
  it('按播放顺序从 01 编号；支线不编号、单独一组；作者标题原样', () => {
    const p = filmProject({ chapters: [{ key: 'a', title: '00 Cold open' }, { key: 'b', title: 'Aside', side: true }, { key: 'c', title: 'Second' }, { key: 'd', title: 'Restart', from: null }] });
    const w = entryOf(p, 'midterms')!;
    const rows = chapterRows(w, 'midterms.main.c', en);
    expect(rows.chapters.map((r) => [r.no, r.title, r.current])).toEqual([['01', '00 Cold open', false], ['02', 'Second', true], ['03', 'Restart', false]]);
    expect(rows.side.map((r) => [r.no, r.title])).toEqual([[null, 'Aside']]);
    expect(chapterNumber(w, 'midterms.main.d')).toBe(3);
    expect(chapterNumber(w, 'midterms.main.b')).toBeNull();
    const html = filmNav(p);
    expect(html).toContain('>00 Cold open<');
    expect(html.indexOf('data-testid="film-chapters"')).toBeLessThan(html.indexOf('data-testid="film-side-chapters"'));
    expect(html).toContain('>Side chapters<');
    // 嵌入的切换菜单：章节带编号，支线不带，按播放顺序
    expect(embedScenarioItems(p, null).map((i) => i.label)).toEqual(['01 · 00 Cold open', '02 · Second', '03 · Restart', 'Aside']);
  });

  it('发布站左栏与手机章节列表用同一份编号与时长；左栏标题电脑上也叫“章节”', () => {
    vi.stubGlobal('location', { hash: '', search: '', href: 'https://joplo.app/s/x/' });
    const p = filmProject({ mode: 'publish' });
    const w = entryOf(p, 'midterms')!;
    const html = site(p);
    expect(html).toContain('>Chapters<');
    expect(html).not.toContain('>Scenarios<');
    expect(html).toContain('>Side chapters<');
    for (const [i, s] of w.slices.filter((x) => x.inSequence).entries()) expect(html).toMatch(new RegExp(`site-scenario-${s.id.replace(/\./g, '\\.')}"[^>]*>.*?>0${i + 1}<.*?>${en.player.clock(s.ms)}<`));
    for (const locale of ['zh-CN', 'ja', 'ru'] as const) {
      const t = renderToStaticMarkup(<I18nProvider explicit={locale}><SiteApp data={{ project: p, home: null }} search="" /></I18nProvider>);
      expect(t).toContain(`>${dictionary(locale).player.watchChapters}<`);
    }
  });
});

describe('不变量 6：草稿影片', () => {
  it('看板里能打开，下拉与左栏都标“草稿 · 不发布”；发布 IR 里没有它', () => {
    const p = filmProject({ second: { key: 'v1', title: 'Earlier cut', draft: true } });
    expect(workMenu(p, 'v1').find((e) => 'name' in e && e.id === 'v1')).toMatchObject({ draft: true, hint: '2 chapters · ' + en.player.clock(entryOf(p, 'v1')!.ms) + ' · Draft · not published' });
    expect(resolvePlay(p, { featureId: 'v1' })).toMatchObject({ ok: true, scenarioId: 'v1.main.hook' });
    expect(filmNav(p, 'v1')).toContain('data-testid="film-draft">Draft · not published<');
    expect(filmNav(p, 'midterms')).not.toContain('film-draft');
    expect(featureCard(p, 'v1')!.film!.draft).toBe(true);
    expect(Object.keys(filmProject({ mode: 'publish', second: { key: 'v1', title: 'Earlier cut', draft: true } }).features)).toEqual(['midterms']);
  });
});

describe('不变量 7：十种语言', () => {
  it('新增文案每种语言都有；俄语章节数的复数形式正确', () => {
    for (const locale of locales) {
      const t = { ...dictionary(locale), ...boardDictionary(locale) };
      for (const v of [t.player.film, t.player.featureDemo, t.player.sideChapter, t.player.sideChapters, t.site.films, t.site.works, t.site.watchFilm, t.site.embedPlayFilm, t.board.films, t.board.featureDemos, t.board.draftNotPublished, t.board.filmReview, t.board.filmReviewHint, t.board.filmCopyCommand, t.board.filmEmptyTitle]) expect(v.trim(), locale).not.toBe('');
      expect(t.player.chapterNo(3)).toBe('03');
      expect(t.player.clock(280_000)).toBe('4:40');
      expect(t.board.filmEmptyBody('films/x.tsx')).toContain('films/x.tsx');
      expect(t.site.watchFilmFor('Author film')).toContain('Author film');
      expect(t.player.filmMeta(5, 4, 40)).not.toMatch(/undefined|NaN/);
    }
    const ru = dictionary('ru').player;
    expect([1, 2, 5, 11, 21, 22, 25, 1.5].map((n) => ru.chapterCount(n))).toEqual(['1 глава', '2 главы', '5 глав', '11 глав', '21 глава', '22 главы', '25 глав', '1,5 главы']);
    expect(ru.filmMeta(21, 4, 40)).toBe('21 глава · около 4 мин 40 с');
    expect(boardDictionary('ru').board.chapterMeta('0:28', 22)).toBe('0:28 · 22 шага');
    expect(en.player.chapterCount(1)).toBe('1 chapter');
    expect(dictionary('fr').player.chapterCount(0)).toBe('0 chapitre');
  });

  for (const locale of locales) for (const width of [1280, 1440] as const) {
    it(`${locale} ${width}: 影片左栏的单行文字放得下，长文字可换行（不横向滚动）`, () => {
      const t = { ...dictionary(locale), ...boardDictionary(locale) };
      const L = boardLayout(width, t, 'English');
      const inner = L.navWidth - 24 - 16;
      const head = (title: string, right: string) => textW(title, 12) + title.length + textW(right, 12) + 8;
      expect(head(t.player.watchChapters, t.board.itemCount(12))).toBeLessThanOrEqual(inner);
      expect(head(t.player.sideChapters, t.board.itemCount(3))).toBeLessThanOrEqual(inner);
      // 章节行第二行：编号列 24 + 间距 10
      expect(textW(t.board.chapterMeta(t.player.clock(95_000), 12), 12)).toBeLessThanOrEqual(inner - 24 - 10);
      const html = filmNav(filmProject({ chapters: [{ key: 'long', title: 'A'.repeat(140) }, ...DEFAULT_CHAPTERS.slice(1)] }), 'midterms', null, locale);
      expect(html).toMatch(/line-clamp-2[^"]*\[overflow-wrap:anywhere\][^"]*">A{140}</);
      expect(html).toMatch(/data-testid="film-review-command">npx joplo render --film --chain --scenario-id midterms\.main\.long</);
      expect(html).toMatch(/\[overflow-wrap:anywhere\]" data-testid="film-review-command"/);
      expect(html).not.toMatch(/whitespace-nowrap[^"]*"[^>]*>A{10}/);
      // 复制按钮与命令同一行：按钮只有图标（28），文字在悬停提示与无障碍名称里，任何语言都不挤命令
      expect(html).toMatch(new RegExp(`aria-label="${t.board.filmCopyCommand}"[^>]*data-testid="film-review-copy"`));
    });
  }
});

describe('不变量 8：边界输入', () => {
  it('没有章节：左栏是空状态（写哪个文件、第一章怎么写），没有审片命令；发布站与封面不报错', () => {
    vi.stubGlobal('location', { hash: '', search: '', href: 'https://joplo.app/s/x/' });
    const p = filmProject({ chapters: [] });
    const w = entryOf(p, 'midterms')!;
    expect(w.slices).toEqual([]);
    expect(filmMetaText(w, en)).toBe('0 chapters');
    expect(filmReviewCommand(w)).toBeNull();
    expect(firstSlice(w)).toBeNull();
    const html = filmNav(p);
    expect(html).toContain('data-testid="film-empty"');
    expect(html).toContain('Add the first chapter to chapters in works/midterms.tsx:');
    expect(html).toContain("hook: chapter(&#x27;…&#x27;).system(&#x27;…&#x27;),");
    expect(html).not.toContain('film-review');
    expect(html).not.toContain('film-chapters');
    expect(resolvePlay(p, { featureId: 'midterms' })).toMatchObject({ ok: true, scenarioId: null });
    expect(() => site(filmProject({ mode: 'publish', chapters: [] }))).not.toThrow();
    expect(() => site(filmProject({ mode: 'publish', chapters: [] }), '?embed=1')).not.toThrow();
  });

  it('只有一章：单数；没写 audience：不出“给：”', () => {
    const p = filmProject({ chapters: [{ key: 'only', title: 'Only', steps: 2 }] });
    const w = entryOf(p, 'midterms')!;
    expect(filmMetaText(w, en)).toMatch(/^1 chapter · about/);
    expect(w.audience).toBeNull();
    const html = filmNav(p);
    expect(html).not.toContain('film-audience');
    expect(html).not.toContain('For:');
    expect(coverFor(p, 'midterms.main.only')!.film).toMatchObject({ at: 'film', audience: null });
    const cover = renderToStaticMarkup(<I18nProvider explicit="en"><Curtain project={p} scenarioId="midterms.main.only" position={0} cover={coverFor(p, 'midterms.main.only')} theme="sketch" width={1132} height={700} animate={false} passive /></I18nProvider>);
    expect(cover).not.toContain('cover-audience');
    expect(filmNav(filmProject({ audience: 'Readers' }))).toContain('For: Readers');
  });

  it('全部章节都是支线：摘要写支线数，没有编号；审片命令与封面落在第一个支线', () => {
    const p = filmProject({ chapters: [{ key: 'x', title: 'X', side: true }, { key: 'y', title: 'Y', side: true, from: null }] });
    const w = entryOf(p, 'midterms')!;
    expect(filmMetaText(w, en)).toBe('2 side chapters');
    expect(chapterRows(w, null, en).chapters).toEqual([]);
    expect(filmReviewCommand(w)).toBe('npx joplo render --film --chain --scenario-id midterms.main.x');
    expect(coverFor(p, 'midterms.main.x')!.film).toMatchObject({ at: 'film', chapter: null, meta: '2 side chapters' });
    expect(workMenu(p, 'midterms')[0]).toMatchObject({ hint: '2 side chapters' });
    const html = filmNav(p);
    expect(html).not.toContain('film-chapters');
    expect(html).toContain('film-side-chapters');
  });

  it('作品下拉：只有影片、只有功能演示时没有分组标题；两种都有时先影片后功能演示', () => {
    const films = filmProject({ second: { key: 'v1', title: 'Earlier cut' } });
    expect(workMenu(films, 'midterms').some((e) => 'heading' in e)).toBe(false);
    const mixed = filmProject({ withDemo: true });
    expect(workMenu(mixed, 'invite').map((e) => ('heading' in e ? `# ${e.heading}` : e.id))).toEqual(['# Films', 'midterms', '# Feature demos', 'invite']);
    expect(entriesOf(mixed).map((w) => w.id)).toEqual(['invite', 'midterms']);
    // 功能演示那一项与原来的 featureMenu 一样
    expect(workMenu(mixed, 'invite').find((e) => 'name' in e && e.id === 'invite')).toMatchObject(featureMenu(mixed, 'invite').find((f) => f.id === 'invite')!);
  });

  it('窄屏竖条：章节只剩编号，当前章高亮，支线是一个点', () => {
    const p = filmProject();
    const html = renderToStaticMarkup(<I18nProvider explicit="en" extend={boardDictionary}><FilmRail work={entryOf(p, 'midterms')!} scenarioId="midterms.main.basics" /></I18nProvider>);
    expect([...html.matchAll(/font-bold[^"]*">([^<]+)</g)].map((m) => m[1])).toEqual(['01', '02', '03', '·']);
    expect(html).toMatch(/bg-jb-selected[^"]*">02</);
  });
});
