import '../../../scripts/test/render-fixtures.ts';
/**
 * 条目的界面（D102 修订，docs/work-model.md 第 7 节；方案 A「左栏章节清单」）。夹具见 work-fixture.ts（真实编译 work() / chapter()）。
 * 没有“形态”，只有能力的组合；四种搭配：
 *   A 独立作品 + 章节（linear）        B 独立作品 + 独立切片（independent）
 *   C 功能 + 独立切片（与以前完全一样）  D 功能 + 选定方案用章节（左栏仍是功能；发布站 / 嵌入 / 手机叫“章节”并编号）
 * 不变量：
 * 1. 界面只问 Entry 的能力（featureId / sequencing / draft），不读内部字段、不按情况或方案数推断；
 * 2. 打开功能（C）时下拉、封面、首页卡片、嵌入与以前一样；
 * 3. 首页卡片、封面、左栏的标题 / 简介 / 观众 / 切片数 / 时长都从 Entry 取（Entry.ms / EntrySlice.ms）；
 * 4. linear 时章节按播放顺序从 01 编号，支线不编号、单独一组，作者标题原样；independent 不编号；
 * 5. 每个发布出去的项目打开时先落在首页或封面上：一个条目 → 它的封面（没有首页与条目切换），多个 → 首页；嵌入与评审模式停在封面；
 * 6. 草稿作品看板能打开并标“草稿 · 不发布”，发布站里不存在；
 * 7. 新文案十种语言齐全、复数正确，左栏在 1280 / 1440 下不横向溢出；
 * 8. 边界：没有切片、只有一个切片、标题很长、没写 audience、全是支线、只有作品 / 只有功能 / 两种都有。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { entriesOf, entryOf, type Project } from '@joplo-app/core';
import { I18nProvider } from '../src/i18n/context';
import { dictionary } from '../src/i18n/dictionaries';
import { boardDictionary, boardEnglish } from '../src/i18n/board/dictionaries';
import { locales } from '../src/i18n/locale';
import { SiteApp, SiteHome } from '../src/site/SiteApp';
import { embedCover, embedInitial, embedScenarioItems, embedSliceName, parseEmbedParams } from '../src/site/embed-model';
import { coverFor, coverShown } from '../src/player/cover-content';
import { Curtain } from '../src/player/Curtain';
import { WatchView, type Chapter } from '../src/player/WatchView';
import { resolvePlay } from '../src/player/playRoute';
import { approxLength, chapterNumber, entryMetaText, firstSlice, siteLanding, sliceRows } from '../src/player/work-view';
import { featureMenu, reviewStripCommand, workMenu, entryMenuHint } from '../src/board/nav-model';
import { featureCard } from '../src/board/home-model';
import { WorkNav, WorkRail } from '../src/board/WorkNav';
import { CaseNav } from '../src/board/CaseNav';
import { DemoController } from '../src/runtime/demo';
import { boardLayout } from '../src/player/layout';
import { textW } from '../src/player/controls-fit';
import { DEFAULT_SLICES, workProject } from './work-fixture';

const en = dictionary('en');
const loc = { hash: '', search: '', href: 'https://joplo.app/s/x/' };
const site = (project: Project, search = '', locale = 'en') => renderToStaticMarkup(<I18nProvider explicit={locale}><SiteApp data={{ project, home: null }} search={search} /></I18nProvider>);
const nav = (project: Project, id = 'midterms', scenarioId: string | null = null, locale = 'en') =>
  renderToStaticMarkup(<I18nProvider explicit={locale} extend={boardDictionary}><WorkNav project={project} entry={entryOf(project, id)!} scenarioId={scenarioId} onScenario={() => {}} onCopy={() => {}} /></I18nProvider>);
const curtain = (p: Project, scenarioId: string) => renderToStaticMarkup(<I18nProvider explicit="en"><Curtain project={p} scenarioId={scenarioId} position={0} cover={coverFor(p, scenarioId)} theme="sketch" width={1132} height={700} animate={false} passive /></I18nProvider>);
/** 手机竖屏的观看视图（SSR）。 */
function watch(chapters: Chapter[], naming?: 'chapters' | 'scenarios', project = workProject()) {
  const ctl = new DemoController(null);
  ctl.setProject(project, 1, null);
  const snap = ctl.getSnapshot();
  return renderToStaticMarkup(<I18nProvider explicit="en"><WatchView layout="portrait" viewport={{ w: 390, h: 844 }} ctl={ctl} snap={snap} scenario={ctl.scenario()} subtitle={null} stage={null} title="T" brand={null} chapters={chapters} naming={naming} onChapter={() => {}} onRestart={() => {}} /></I18nProvider>);
}
/** 只有功能的项目（C）或功能 + 章节（D）。 */
const featureOnly = (o: { linear?: boolean; mode?: 'dev' | 'publish' } = {}) => workProject({ noWork: true, withDemo: o.linear ? 'linear' : true, mode: o.mode });

afterEach(() => vi.unstubAllGlobals());

describe('四种能力搭配', () => {
  it('A 独立作品 + 章节：看板左栏是章节清单（编号、时长 · 步数、审片命令），封面写「N 章 · 约 M」', () => {
    const p = workProject();
    const e = entryOf(p, 'midterms')!;
    expect(e).toMatchObject({ featureId: null, sequencing: 'linear' });
    const html = nav(p, 'midterms', 'midterms.basics');
    expect(html).toContain('data-sequencing="linear"');
    expect(html).toContain('>Chapters<');
    expect(html).toContain('>Side chapters<');
    expect([...html.matchAll(/data-testid="slice-no">(\d+)</g)].map((m) => m[1])).toEqual(['01', '02', '03']);
    expect(html).toContain('data-testid="review-strip-command">npx joplo render --film --chain --scenario-id midterms.hook<');
    expect(html).not.toMatch(/work-switch|case-|gap-count/);
    expect(coverFor(p, 'midterms.hook')!.entry).toMatchObject({ at: 'entry', linear: true, meta: entryMetaText(e, en) });
    expect(entryMetaText(e, en)).toMatch(/^3 chapters · about /);
    expect(entryMenuHint(e)).toBe(`3 chapters · ${en.player.clock(e.ms)}`);
  });

  it('B 独立作品 + 独立切片：同一个左栏，但不编号、叫“场景”、没有审片命令；封面写「N 个场景 · 约 M」', () => {
    const p = workProject({ linear: false });
    const e = entryOf(p, 'midterms')!;
    expect(e).toMatchObject({ featureId: null, sequencing: 'independent' });
    const html = nav(p);
    expect(html).toContain('data-sequencing="independent"');
    expect(html).toContain('>Scenarios<');
    expect(html).toContain('>Side scenarios<');
    expect(html).not.toContain('slice-no');
    expect(html).not.toContain('>Chapters<');
    expect(html).not.toContain('review-strip');
    expect(reviewStripCommand(e)).toBeNull();
    expect(entryMetaText(e, en)).toMatch(/^3 scenarios · about /);
    expect(entryMenuHint(e)).toBe(`3 scenarios · ${en.player.clock(e.ms)}`);
    expect(coverFor(p, 'midterms.hook')!.entry).toMatchObject({ at: 'entry', linear: false, chapter: null });
    // 从中间某个场景打开：小字只写作品标题，不写“第 n 章”
    const mid = curtain(p, 'midterms.results');
    expect(mid).toContain('data-testid="entry-cover" data-at="slice"');
    expect(mid).toContain('data-testid="cover-owner">After he lost Congress<');
    expect(mid).not.toContain('Chapter');
    expect(sliceRows(e, null, en).main.every((r) => r.no === null)).toBe(true);
    vi.stubGlobal('location', loc);
    const s = site(workProject({ linear: false, mode: 'publish' }));
    expect(s).toContain('data-sequencing="independent"');
    expect(s).toContain('>Scenarios<');
    expect(s).not.toContain('>Chapters<');
    expect(s).not.toContain('slice-no');
  });

  it('C 功能 + 独立切片：看板下拉、封面、发布站左栏、首页卡片、嵌入与以前一样', () => {
    const p = featureOnly();
    const e = entryOf(p, 'invite')!;
    expect(e).toMatchObject({ featureId: 'invite', sequencing: 'independent' });
    expect(workMenu(p, 'invite').map(({ featureId: _f, draft: _d, ...rest }: any) => rest)).toEqual(featureMenu(p, 'invite'));
    expect(coverFor(p, 'invite.a.main')).toMatchObject({ entry: null, feature: 'Invite teammates', work: 'A · Banner' });
    expect(curtain(p, 'invite.a.main')).toContain('data-testid="scene-cover"');
    expect(featureCard(p, 'invite')!.work).toBeNull();
    const home = renderToStaticMarkup(<I18nProvider explicit="en"><SiteHome project={featureOnly({ mode: 'publish' })} onView={() => {}} /></I18nProvider>);
    expect(home).toContain('>Features<');
    expect(home).toContain('For: Admin · 1 scenario');
    expect(home).not.toMatch(/data-independent-work|site-work-meta/);
    vi.stubGlobal('location', loc);
    const s = site(featureOnly({ mode: 'publish' }));
    expect(s).toMatch(/data-testid="scenario-nav">/);
    expect(s).toContain('>Scenarios<');
    expect(embedCover(featureOnly({ mode: 'publish' }), 'invite.a.main', en)).toEqual({ title: 'Midterms 2026', meta: 'Interactive prototype · 1 scenario', play: 'Play demo' });
    expect(embedSliceName(featureOnly({ mode: 'publish' }), 'invite.a.main', en)).toBeNull();
    // 手机列表：不传 naming，与以前一样一组、叫“章节”、写步数
    const w = watch([{ id: 'invite.a.main', name: 'Send an invite', current: true, steps: '1 step' }], undefined, p);
    expect(w).toContain('Chapters · 1');
    expect(w).not.toContain('watch-side-chapters');
  });

  it('D 功能 + 选定方案用章节：看板仍是功能左栏；发布站 / 嵌入 / 手机里叫“章节”并编号，封面外观不变', () => {
    const p = featureOnly({ linear: true });
    const e = entryOf(p, 'invite')!;
    expect(e).toMatchObject({ featureId: 'invite', sequencing: 'linear' });
    // 看板：下拉与以前一样（选定方案与缺口），左栏是功能的方案 / 情况
    expect(workMenu(p, 'invite').map(({ featureId: _f, draft: _d, ...rest }: any) => rest)).toEqual(featureMenu(p, 'invite'));
    const board = renderToStaticMarkup(<I18nProvider explicit="en" extend={boardDictionary}><CaseNav project={p} featureId="invite" workId="invite.a" caseId={null} scenarioId={null} onWork={() => {}} onCase={() => {}} onScenario={() => {}} onWorkCase={() => {}} onCopy={() => {}} /></I18nProvider>);
    expect(board).toContain('data-testid="work-switch"');
    // 封面：功能的场景封面（D61）不变
    expect(coverFor(p, 'invite.a.follow')!.entry).toBeNull();
    expect(curtain(p, 'invite.a.follow')).toContain('data-testid="scene-cover"');
    // 发布站
    vi.stubGlobal('location', loc);
    const pub = featureOnly({ linear: true, mode: 'publish' });
    const s = site(pub);
    expect(s).toContain('data-sequencing="linear"');
    expect(s).toContain('>Chapters<');
    expect(s).toContain('>Invite teammates<');
    expect([...s.matchAll(/data-testid="slice-no">(\d+)</g)].map((m) => m[1])).toEqual(['01', '02']);
    const home = renderToStaticMarkup(<I18nProvider explicit="en"><SiteHome project={pub} onView={() => {}} /></I18nProvider>);
    expect(home).toContain('For: Admin · 2 chapters');
    // 嵌入
    expect(embedScenarioItems(pub, null, en).map((i) => i.label)).toEqual(['01 · Send an invite', '02 · Follow up']);
    expect(embedSliceName(pub, 'invite.a.follow', en)).toBe('02 · Follow up');
    expect(embedCover(pub, 'invite.a.main', en)).toEqual({ title: 'Midterms 2026', meta: 'Interactive prototype · 2 chapters', play: 'Play demo' });
    // 手机
    const rows = sliceRows(entryOf(pub, 'invite')!, 'invite.a.follow', en);
    const w = watch(rows.main.map((r) => ({ id: r.id, name: r.title, no: r.no, side: false, current: r.current, steps: en.player.clock(r.ms) })), 'chapters', pub);
    expect(w).toContain('Chapters · 2');
    expect(w).toContain('Chapter 2 of 2');
  });

  it('项目里两种都有：下拉先“作品”后“功能”；只有一组时没有分组标题', () => {
    const mixed = workProject({ withDemo: true });
    expect(workMenu(mixed, 'invite').map((e) => ('heading' in e ? `# ${e.heading}` : e.id))).toEqual(['# Works', 'midterms', '# Features', 'invite']);
    expect(workMenu(workProject({ second: { key: 'v1', title: 'Earlier cut' } }), 'midterms').some((e) => 'heading' in e)).toBe(false);
    expect(workMenu(featureOnly(), 'invite').some((e) => 'heading' in e)).toBe(false);
    expect(workMenu(mixed, 'invite').find((e) => 'name' in e && e.id === 'invite')).toMatchObject(featureMenu(mixed, 'invite').find((f) => f.id === 'invite')!);
    expect(entriesOf(mixed).map((x) => x.id)).toEqual(['invite', 'midterms']);
    const home = renderToStaticMarkup(<I18nProvider explicit="en"><SiteHome project={workProject({ withDemo: true, mode: 'publish', audience: 'Curious readers' })} onView={() => {}} /></I18nProvider>);
    expect(home).toContain('>Works<');
    expect(home).toMatch(/data-testid="site-feature-row-midterms" data-independent-work=""/);
    expect(home).toMatch(/data-testid="site-feature-row-invite">/);
    expect(home).toContain('For: Curious readers');
    expect(home).toContain('For: Admin · 1 scenario');
  });
});

describe('不变量 1：只问能力', () => {
  it('同一份创作把 chapter() 换成 flow()：只有叫法和编号变，左栏与封面结构不变', () => {
    const linear = nav(workProject());
    const independent = nav(workProject({ linear: false }));
    for (const html of [linear, independent]) expect(html).toContain('data-testid="work-brief"');
    expect(linear).toContain('slice-no');
    expect(independent).not.toContain('slice-no');
  });

  it('只有一个方案、没有情况的功能仍按功能呈现（不推断）', () => {
    const p = structuredClone(featureOnly());
    const f = p.features.invite!;
    f.workIds = ['invite.a'];
    f.caseIds = [];
    delete p.works['invite.b'];
    expect(entryOf(p, 'invite')!.featureId).toBe('invite');
    expect(coverFor(p, 'invite.a.main')!.entry).toBeNull();
    expect(workMenu(p, 'invite')[0]).toMatchObject({ featureId: 'invite', hint: featureMenu(p, 'invite')[0]!.hint });
  });

  it('呈现代码里没有“影片 / 形态”的判断，也没有按情况 / 方案数量推断的写法', () => {
    for (const file of ['../src/player/work-view.ts', '../src/board/WorkNav.tsx', '../src/site/embed-model.ts', '../src/player/cover-content.ts', '../src/site/SiteApp.tsx', '../src/board/nav-model.ts', '../src/player/WatchView.tsx']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(src, file).not.toMatch(/caseIds\.length|workIds\.length|\.standalone\b|\bkind === 'film'|isFilm|filmOf/);
    }
    // 界面词典里不再有按“影片 / 功能演示”命名的类别
    expect(Object.keys(en.player)).not.toEqual(expect.arrayContaining(['film']));
    for (const key of ['film', 'featureDemo', 'filmMeta']) expect(en.player).not.toHaveProperty(key);
    for (const key of ['films', 'watchFilm', 'embedPlayFilm']) expect(en.site).not.toHaveProperty(key);
    for (const key of ['films', 'featureDemos', 'filmMenuHint', 'filmReview']) expect(boardEnglish.board).not.toHaveProperty(key);
  });
});

describe('不变量 3：只读 Entry', () => {
  it('作品封面时长 = Entry.ms，切片封面 = EntrySlice.ms；标题、简介、观众来自 Entry', () => {
    const p = workProject({ audience: 'Curious readers' });
    const e = entryOf(p, 'midterms')!;
    const c = coverFor(p, 'midterms.hook')!;
    expect(c.ms).toBe(e.ms);
    expect(c.entry).toEqual({ at: 'entry', linear: true, title: e.title, summary: e.summary, audience: 'Curious readers', meta: entryMetaText(e, en), chapter: 1, inSequence: true });
    const r = coverFor(p, 'midterms.results')!;
    expect(r.ms).toBe(e.slices.find((s) => s.id === 'midterms.results')!.ms);
    expect(r).toMatchObject({ title: 'How big was the blue wave?', description: 'Seats in both chambers', entry: { at: 'slice', chapter: 3 } });
    // 切片没写 description 时不退回作品简介
    expect(coverFor(p, 'midterms.basics')).toMatchObject({ description: null, entry: { at: 'slice', chapter: 2 } });
    const html = curtain(p, 'midterms.hook');
    expect(html).toContain('data-testid="entry-cover" data-at="entry"');
    expect(html).toContain('For: Curious readers');
    expect(html).not.toContain('cover-owner');
    expect(curtain(p, 'midterms.results')).toContain('Chapter 3 · After he lost Congress');
    expect(curtain(p, 'midterms.aside')).toContain('Side chapter · After he lost Congress');
  });

  it('「N 章 · 约 M」：数量 = 顺序里的切片数，时长 = approxLength(Entry.ms)；各语言格式', () => {
    const e = entryOf(workProject(), 'midterms')!;
    const d = approxLength(e.ms);
    expect(entryMetaText(e, en)).toBe(en.player.chaptersAbout(3, d.min, d.sec));
    expect(approxLength(280_000)).toEqual({ min: 4, sec: 40 });
    expect(approxLength(298_000)).toEqual({ min: 5, sec: 0 });
    expect(approxLength(35_100)).toEqual({ min: 0, sec: 35 });
    expect(en.player.chaptersAbout(5, 4, 40)).toBe('5 chapters · about 4 min 40 sec');
    expect(en.player.scenariosAbout(3, 0, 40)).toBe('3 scenarios · about 40 sec');
    expect(dictionary('zh-CN').player.chaptersAbout(5, 4, 40)).toBe('5 章 · 约 4 分 40 秒');
    expect(dictionary('zh-CN').player.chaptersAbout(5, 4, 0)).toBe('5 章 · 约 4 分');
    expect(dictionary('zh-CN').player.scenariosAbout(3, 0, 40)).toBe('3 个场景 · 约 40 秒');
    expect(boardDictionary('zh-CN').board.chaptersClock(5, en.player.clock(280_000))).toBe('5 章 · 4:40');
    expect(boardDictionary('zh-CN').board.scenariosClock(3, en.player.clock(40_000))).toBe('3 个场景 · 0:40');
  });

  it('看板章节行与发布站卡片的数字来自 Entry', () => {
    const p = workProject();
    const e = entryOf(p, 'midterms')!;
    const html = nav(p);
    for (const s of e.slices) expect(html).toContain(boardEnglish.board.sliceMeta(en.player.clock(s.ms), s.steps));
    expect(html).toContain(`data-testid="work-meta">${entryMetaText(e, en)}<`);
    const pub = workProject({ mode: 'publish', withDemo: true });
    const home = renderToStaticMarkup(<I18nProvider explicit="en"><SiteHome project={pub} onView={() => {}} /></I18nProvider>);
    expect(home).toContain(`data-testid="site-work-meta-midterms">${entryMetaText(entryOf(pub, 'midterms')!, en)}<`);
    expect(home).toContain('aria-label="Watch “After he lost Congress”"');
    // audience 没写时用角色的名字
    expect(featureCard(p, 'midterms')!.work).toMatchObject({ audience: null });
  });
});

describe('不变量 4：编号', () => {
  it('按播放顺序从 01 编号；支线不编号、单独一组；作者标题原样；嵌入菜单同序', () => {
    const p = workProject({ slices: [{ key: 'a', title: '00 Cold open' }, { key: 'b', title: 'Aside', side: true }, { key: 'c', title: 'Second', from: 'a' }, { key: 'd', title: 'Restart', from: null }] });
    const e = entryOf(p, 'midterms')!;
    const rows = sliceRows(e, 'midterms.c', en);
    expect(rows.main.map((r) => [r.no, r.title, r.current])).toEqual([['01', '00 Cold open', false], ['02', 'Second', true], ['03', 'Restart', false]]);
    expect(rows.side.map((r) => [r.no, r.title])).toEqual([[null, 'Aside']]);
    expect(chapterNumber(e, 'midterms.d')).toBe(3);
    expect(chapterNumber(e, 'midterms.b')).toBeNull();
    const html = nav(p);
    expect(html).toContain('>00 Cold open<');
    expect(html.indexOf('data-testid="work-slices"')).toBeLessThan(html.indexOf('data-testid="work-side-slices"'));
    expect(embedScenarioItems(p, null).map((i) => i.label)).toEqual(['01 · 00 Cold open', '02 · Second', '03 · Restart', 'Aside']);
  });

  it('发布站电脑左栏与手机列表同一份编号与时长；左栏标题电脑上也叫“章节”', () => {
    vi.stubGlobal('location', loc);
    const p = workProject({ mode: 'publish' });
    const e = entryOf(p, 'midterms')!;
    const html = site(p);
    expect(html).toContain('>Chapters<');
    expect(html).not.toContain('>Scenarios<');
    expect(html).toContain('>Side chapters<');
    for (const [i, s] of e.slices.filter((x) => x.inSequence).entries()) expect(html).toMatch(new RegExp(`site-scenario-${s.id.replace(/\./g, '\\.')}"[^>]*>.*?>0${i + 1}<.*?>${en.player.clock(s.ms)}<`));
    for (const locale of ['zh-CN', 'ja', 'ru'] as const) expect(site(p, '', locale)).toContain(`>${dictionary(locale).player.watchChapters}<`);
    const rows = sliceRows(e, 'midterms.aside', en);
    const all = [...rows.main, ...rows.side].map((r) => ({ id: r.id, name: r.title, no: r.no, side: !r.inSequence, current: r.current, steps: en.player.clock(r.ms) }));
    const w = watch(all, 'chapters', p);
    expect(w).toContain('Chapters · 3');
    expect(w).toContain('data-testid="watch-side-chapters"');
    expect(w).toContain('Side chapters · 1');
    expect(w).toContain('Side chapter');
    const ws = watch(all.map((c) => ({ ...c, no: null })), 'scenarios', p);
    expect(ws).toContain('Scenarios · 3');
    expect(ws).toContain('Side scenarios · 1');
  });
});

describe('不变量 5：先落在首页或封面上', () => {
  it('siteLanding：一个条目 → 它；多个或没有 → 首页；草稿不进发布 IR', () => {
    expect(siteLanding(workProject({ mode: 'publish' }))).toEqual({ kind: 'work', featureId: 'midterms' });
    expect(siteLanding(featureOnly({ mode: 'publish' }))).toEqual({ kind: 'work', featureId: 'invite' });
    expect(siteLanding(workProject({ mode: 'publish', withDemo: true }))).toEqual({ kind: 'home' });
    expect(siteLanding(workProject({ mode: 'publish', second: { key: 'v1', title: 'Earlier cut' } }))).toEqual({ kind: 'home' });
    expect(siteLanding(workProject({ mode: 'publish', second: { key: 'v1', title: 'Earlier cut', draft: true } }))).toEqual({ kind: 'work', featureId: 'midterms' });
  });

  it('只有一件作品：打开就是第一个切片第 0 步的作品封面；没有首页、项目名不是回首页的链接、没有条目切换', () => {
    vi.stubGlobal('location', loc);
    for (const linear of [true, false]) {
      const p = workProject({ mode: 'publish', linear });
      for (const scoped of [false, true]) {
        const html = renderToStaticMarkup(<I18nProvider explicit="en"><SiteApp data={{ project: p, home: null, scoped }} search="" /></I18nProvider>);
        expect(html).not.toContain('data-testid="site-home"');
        expect(html).toMatch(/data-testid="site-scenario-midterms\.hook" aria-current="true"/);
        expect(html).toMatch(/<span data-testid="crumb-project"/);
        expect(html).not.toMatch(/<button[^>]*data-testid="crumb-project"/);
        expect(html).not.toContain('Switch feature');
      }
      const r = resolvePlay(p, { featureId: 'midterms' });
      expect(r).toMatchObject({ scenarioId: 'midterms.hook', step: 0 });
      expect(coverShown(p.scenarios[r.scenarioId!], r.step, false, null)).toBe(true);
      expect(coverFor(p, r.scenarioId)!.entry!.at).toBe('entry');
    }
  });

  it('只有一个功能同样直接是它的封面；两个条目时是首页，项目名可回首页', () => {
    vi.stubGlobal('location', loc);
    const html = site(featureOnly({ mode: 'publish' }));
    expect(html).not.toContain('data-testid="site-home"');
    expect(resolvePlay(featureOnly({ mode: 'publish' }), { featureId: 'invite' })).toMatchObject({ scenarioId: 'invite.a.main', step: 0 });
    expect(site(workProject({ mode: 'publish', withDemo: true }))).toContain('data-testid="site-home"');
  });

  it('第一个切片是支线时封面画在顺序里的第一章；深链到中间某一章是那一章的封面', () => {
    const p = workProject({ slices: [{ key: 'intro', title: 'Intro', side: true }, { key: 'one', title: 'One', from: null }, { key: 'two', title: 'Two' }] });
    expect(resolvePlay(p, { featureId: 'midterms' }).scenarioId).toBe('midterms.one');
    expect(coverFor(p, 'midterms.one')!.entry).toMatchObject({ at: 'entry', chapter: 1 });
    expect(coverFor(p, 'midterms.two')!.entry).toMatchObject({ at: 'slice', chapter: 2 });
    expect(coverFor(p, 'midterms.intro')!.entry).toMatchObject({ at: 'slice', chapter: null, inSequence: false });
    expect(resolvePlay(p, { featureId: 'midterms', scenarioId: 'midterms.two' })).toMatchObject({ scenarioId: 'midterms.two', step: 0 });
  });

  it('嵌入（?embed=1）、评审模式（?embed=1&review=1）、深链切片的嵌入都停在封面；作品的封面写作品标题与切片数', () => {
    vi.stubGlobal('location', loc);
    for (const linear of [true, false]) {
      const p = workProject({ mode: 'publish', linear });
      const meta = entryMetaText(entryOf(p, 'midterms')!, en);
      for (const search of ['?embed=1', '?embed=1&review=1', '?embed=1&scenario=midterms.results']) {
        expect(embedInitial(p, parseEmbedParams(search)!).covered, search).toBe(true);
        const html = site(p, search);
        expect(html, search).toContain('data-testid="embed-cover"');
        expect(html, search).toContain('>After he lost Congress<');
        expect(html, search).toContain(`>${meta}<`);
        expect(html, search).toContain('aria-label="Play · After he lost Congress"');
      }
    }
    const p = workProject({ mode: 'publish' });
    expect(embedInitial(p, parseEmbedParams('?embed=1&scenario=midterms.results')!).scenarioId).toBe('midterms.results');
    // autoplay=1 是嵌入方显式要求跳过封面（云端嵌入契约），照旧
    expect(embedInitial(p, parseEmbedParams('?embed=1&autoplay=1')!).covered).toBe(false);
    const side = workProject({ mode: 'publish', slices: [{ key: 'intro', title: 'Intro', side: true }, { key: 'one', title: 'One', from: null }] });
    expect(embedInitial(side, parseEmbedParams('?embed=1')!).scenarioId).toBe('midterms.one');
    expect(embedInitial(side, parseEmbedParams('?embed=1&scenario=midterms.intro')!).scenarioId).toBe('midterms.intro');
  });
});

describe('不变量 6：草稿', () => {
  it('看板能打开，下拉与左栏标“草稿 · 不发布”；发布 IR 里没有它', () => {
    const p = workProject({ second: { key: 'v1', title: 'Earlier cut', draft: true } });
    const v1 = entryOf(p, 'v1')!;
    expect(v1.draft).toBe(true);
    expect(workMenu(p, 'v1').find((e) => 'name' in e && e.id === 'v1')).toMatchObject({ draft: true, hint: `2 chapters · ${en.player.clock(v1.ms)} · Draft · not published` });
    expect(resolvePlay(p, { featureId: 'v1' })).toMatchObject({ ok: true, scenarioId: 'v1.hook' });
    expect(nav(p, 'v1')).toContain('data-testid="work-draft">Draft · not published<');
    expect(nav(p, 'midterms')).not.toContain('work-draft');
    expect(featureCard(p, 'v1')!.work!.draft).toBe(true);
    expect(Object.keys(workProject({ mode: 'publish', second: { key: 'v1', title: 'Earlier cut', draft: true } }).works)).toEqual(['midterms']);
  });
});

describe('不变量 7：十种语言', () => {
  it('新文案每种语言都有；俄语复数正确', () => {
    for (const locale of locales) {
      const t = { ...dictionary(locale), ...boardDictionary(locale) };
      for (const v of [t.player.sideChapter, t.player.sideChapters, t.player.sideScenarios, t.site.works, t.site.watch, t.site.embedPlay, t.board.draftNotPublished, t.board.reviewStrip, t.board.reviewStripHint, t.board.copyCommand, t.board.workEmptyTitle]) expect(v.trim(), locale).not.toBe('');
      expect(t.player.chapterNo(3)).toBe('03');
      expect(t.player.clock(280_000)).toBe('4:40');
      expect(t.board.workEmptyBody('works/x.tsx')).toContain('works/x.tsx');
      expect(t.site.watchFor('Author work')).toContain('Author work');
      for (const v of [t.player.chaptersAbout(5, 4, 40), t.player.scenariosAbout(3, 0, 40), t.site.embedCoverMetaChapters(2), t.player.watchScenarioOf(1, 3)]) expect(v).not.toMatch(/undefined|NaN/);
    }
    const ru = dictionary('ru');
    expect([1, 2, 5, 11, 21, 22, 25, 1.5].map((n) => ru.player.chapterCount(n))).toEqual(['1 глава', '2 главы', '5 глав', '11 глав', '21 глава', '22 главы', '25 глав', '1,5 главы']);
    expect(ru.player.chaptersAbout(21, 4, 40)).toBe('21 глава · около 4 мин 40 с');
    expect(ru.player.scenariosAbout(22, 0, 40)).toBe('22 сценария · около 40 с');
    expect([1, 2, 5].map((n) => ru.player.sideScenarioCount(n))).toEqual(['1 побочный сценарий', '2 побочных сценария', '5 побочных сценариев']);
    expect(boardDictionary('ru').board.sliceMeta('0:28', 22)).toBe('0:28 · 22 шага');
    expect(ru.site.embedCoverMetaChapters(5)).toBe('Интерактивный прототип · 5 глав');
  });

  for (const locale of locales) for (const width of [1280, 1440] as const) {
    it(`${locale} ${width}: 作品左栏的单行文字放得下，长文字可换行（不横向滚动）`, () => {
      const t = { ...dictionary(locale), ...boardDictionary(locale) };
      const L = boardLayout(width, t, 'English');
      const inner = L.navWidth - 24 - 16;
      const head = (title: string, right: string) => textW(title, 12) + title.length + textW(right, 12) + 8;
      for (const title of [t.player.watchChapters, t.site.scenarios, t.player.sideChapters, t.player.sideScenarios]) expect(head(title, t.board.itemCount(12)), title).toBeLessThanOrEqual(inner);
      // 切片行第二行：编号列 24 + 间距 10
      expect(textW(t.board.sliceMeta(t.player.clock(95_000), 12), 12)).toBeLessThanOrEqual(inner - 24 - 10);
      const html = nav(workProject({ slices: [{ key: 'long', title: 'A'.repeat(140) }, ...DEFAULT_SLICES.slice(1)] }), 'midterms', null, locale);
      expect(html).toMatch(/line-clamp-2[^"]*\[overflow-wrap:anywhere\][^"]*">A{140}</);
      expect(html).toMatch(/\[overflow-wrap:anywhere\]" data-testid="review-strip-command">npx joplo render --film --chain --scenario-id midterms\.long</);
      expect(html).toMatch(new RegExp(`aria-label="${t.board.copyCommand}"[^>]*data-testid="review-strip-copy"`));
      expect(html).not.toMatch(/whitespace-nowrap[^"]*"[^>]*>A{10}/);
    });
  }
});

describe('不变量 8：边界输入', () => {
  it('没有切片：左栏是空状态（写哪个文件、第一个切片怎么写），没有审片命令；发布站与嵌入不报错', () => {
    vi.stubGlobal('location', loc);
    const p = workProject({ slices: [] });
    const e = entryOf(p, 'midterms')!;
    expect(e.slices).toEqual([]);
    expect(entryMetaText(e, en)).toBe(e.sequencing === 'linear' ? '0 chapters' : '0 scenarios');
    expect(reviewStripCommand(e)).toBeNull();
    expect(firstSlice(e)).toBeNull();
    const html = nav(p);
    expect(html).toContain('data-testid="work-empty"');
    expect(html).toMatch(/Add the first chapter or scenario to scenarios in [^<]*works\/midterms\.tsx:/);
    expect(html).toContain("hook: chapter(&#x27;…&#x27;).system(&#x27;…&#x27;),");
    expect(html).not.toMatch(/review-strip|work-slices/);
    expect(resolvePlay(p, { featureId: 'midterms' })).toMatchObject({ ok: true, scenarioId: null });
    expect(() => site(workProject({ mode: 'publish', slices: [] }))).not.toThrow();
    expect(() => site(workProject({ mode: 'publish', slices: [] }), '?embed=1')).not.toThrow();
  });

  it('只有一个切片：单数；没写 audience：不出“给：”', () => {
    const p = workProject({ slices: [{ key: 'only', title: 'Only', steps: 2 }] });
    const e = entryOf(p, 'midterms')!;
    expect(entryMetaText(e, en)).toMatch(/^1 chapter · about/);
    expect(entryMetaText(entryOf(workProject({ linear: false, slices: [{ key: 'only', title: 'Only' }] }), 'midterms')!, en)).toMatch(/^1 scenario · about/);
    expect(e.audience).toBeNull();
    expect(nav(p)).not.toMatch(/work-audience|For:/);
    expect(coverFor(p, 'midterms.only')!.entry).toMatchObject({ at: 'entry', audience: null });
    expect(curtain(p, 'midterms.only')).not.toContain('cover-audience');
    expect(nav(workProject({ audience: 'Readers' }))).toContain('For: Readers');
  });

  it('全部切片都是支线：摘要写支线数，没有编号；审片命令与封面落在第一个支线', () => {
    const p = workProject({ slices: [{ key: 'x', title: 'X', side: true }, { key: 'y', title: 'Y', side: true, from: null }] });
    const e = entryOf(p, 'midterms')!;
    expect(entryMetaText(e, en)).toBe('2 side chapters');
    expect(sliceRows(e, null, en).main).toEqual([]);
    expect(reviewStripCommand(e)).toBe('npx joplo render --film --chain --scenario-id midterms.x');
    expect(coverFor(p, 'midterms.x')!.entry).toMatchObject({ at: 'entry', chapter: null, meta: '2 side chapters' });
    expect(workMenu(p, 'midterms')[0]).toMatchObject({ hint: '2 side chapters' });
    const html = nav(p);
    expect(html).not.toContain('work-slices"');
    expect(html).toContain('work-side-slices');
    const ind = entryOf(workProject({ linear: false, slices: [{ key: 'x', title: 'X', side: true }] }), 'midterms')!;
    expect(entryMetaText(ind, en)).toBe('1 side scenario');
    // 手机列表：没有顺序里的切片时不出空的主列表
    const w = watch([{ id: 'midterms.x', name: 'X', no: null, side: true, current: true, steps: '0:04' }], 'chapters', p);
    expect(w).not.toContain('Chapters · 0');
    expect(w).toContain('Side chapters · 1');
  });

  it('窄屏竖条：linear 时只剩编号，independent 是图标；当前切片高亮', () => {
    const rail = (p: Project) => renderToStaticMarkup(<I18nProvider explicit="en" extend={boardDictionary}><WorkRail entry={entryOf(p, 'midterms')!} scenarioId="midterms.basics" /></I18nProvider>);
    const linear = rail(workProject());
    expect([...linear.matchAll(/data-testid="rail-slice">(\d+)</g)].map((m) => m[1])).toEqual(['01', '02', '03']);
    expect(linear).toMatch(/bg-jb-selected[^"]*" data-testid="rail-slice">02</);
    expect(rail(workProject({ linear: false }))).not.toMatch(/data-testid="rail-slice">\d/);
  });
});

describe('看板切到功能的其他方案', () => {
  it('选定方案是章节时，打开另一个方案仍从那个方案自己的第一个场景开始', () => {
    const p = workProject({ noWork: true, withDemo: 'linear' });
    expect(resolvePlay(p, { featureId: 'invite' })).toMatchObject({ workId: 'invite.a', scenarioId: 'invite.a.main' });
    expect(resolvePlay(p, { featureId: 'invite', workId: 'invite.b' })).toMatchObject({ workId: 'invite.b', scenarioId: 'invite.b.only' });
  });
});

describe('看板首页', () => {
  it('项目摘要按能力计数：只有功能时与以前一样；有独立作品时单独写“N 件作品”；作品卡片的打开按钮写“观看”', async () => {
    const { projectMeta } = await import('../src/board/home-model');
    expect(projectMeta(featureOnly())).toBe('1 feature · Picked 1 / 1');
    expect(projectMeta(workProject())).toBe('1 work');
    expect(projectMeta(workProject({ withDemo: true, second: { key: 'v1', title: 'v1', draft: true } }))).toBe('2 works · 1 feature · Picked 1 / 1');
    expect(projectMeta(workProject(), boardDictionary('zh-CN') as never)).toBe('1 件作品');
  });
});
