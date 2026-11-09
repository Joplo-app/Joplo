import '../../../scripts/test/render-fixtures.ts';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { LocalText } from '../src/i18n/LocalText';
import { dictionary } from '../src/i18n/dictionaries';
import { boardDictionary, boardEnglish } from '../src/i18n/board/dictionaries';
import { m as shared, translate } from '../src/i18n/messages';
import { m } from '../src/i18n/board/messages';
import { locales } from '../src/i18n/locale';
import { plural, number, list } from '../src/i18n/format';
import { noticeView } from '../src/player/states';
import { typeLabel } from '../src/board/labels';
import uiPlugin from '@joplo-app/plugin-ui';
// 组件的显示名来自插件清单（dev IR 的 project.plugins），看板自己不带任何组件名
const uiPlugins = { ui: { id: 'ui', title: uiPlugin.title, components: Object.fromEntries(Object.entries(uiPlugin.components).map(([name, c]) => [name, { ...(c.label ? { label: c.label } : {}) }])) } };

import { appearanceMessage } from '../src/board/appearance-model';
import { exportImage, startVideo } from '../src/runtime/dev-client';

const zh = { ...dictionary('zh-CN'), ...boardDictionary('zh-CN') };
afterEach(() => vi.unstubAllGlobals());

describe('deferred messages', () => {
  it('retranslates an existing notice without changing its key or author content', () => {
    const notice = { kind: 'out_of_order' as const, nodeId: 'send', text: shared.player.inThisScenarioTheNextStepIs('作者 caption') };
    expect(noticeView(notice, dictionary('en'))?.text).toBe('In this scenario, the next step is: 作者 caption');
    expect(noticeView(notice, zh)?.text).toBe('按当前场景，下一步是：作者 caption');
    expect(notice.text).toMatchObject({ns:'player',key:'inThisScenarioTheNextStepIs',args:['作者 caption']});
  });
  it('retranslates the same flash element, including nested appearance names and errors', () => {
    const name = appearanceMessage({theme:'sketch',font:'hand',stroke:null}, []);
    const flash = <LocalText value={m.board.allProjectsNowUseExceptProjectsWithTheirOwn(name)} />;
    const en = renderToStaticMarkup(<I18nProvider explicit="en" extend={boardDictionary}>{flash}</I18nProvider>);
    const cn = renderToStaticMarkup(<I18nProvider explicit="zh-CN" extend={boardDictionary}>{flash}</I18nProvider>);
    expect(en).toContain('Paper white · Marker Gothic');
    expect(cn).toContain('纸白 · 漫黑');
    const error = m.board.imageExportFailed(m.board.thisPageHasNoLocalToken);
    expect(translate(error, boardEnglish)).toBe('Image export failed: This page has no local token');
    expect(translate(error, zh)).toBe('导出图片失败：页面没有本地令牌');
  });
  it('shows component names alone in English and localized descriptions elsewhere', () => {
    expect(typeLabel('ui:Thinking', uiPlugins, boardEnglish, 'en')).toBe('ui:Thinking');
    expect(typeLabel('ui:Thinking', uiPlugins, zh, 'zh-CN')).toBe('ui:Thinking（思考过程）');
    // 没启用的插件、没声明名字的组件：只显示类型名
    expect(typeLabel('ui:Thinking', undefined, zh, 'zh-CN')).toBe('ui:Thinking');
    expect(typeLabel('ui:Unknown', uiPlugins, zh, 'zh-CN')).toBe('ui:Unknown');
    expect(typeLabel('#text', uiPlugins, zh, 'zh-CN')).toBe(zh.board.componentTypeName('#text', zh.board.text2));
  });
});

describe('Intl formatting and locale registration', () => {
  it('uses all Russian CLDR plural forms and locale number/list formatting', () => {
    const forms = {one:'# one',few:'# few',many:'# many',other:'# other'};
    expect([1,2,5,21,1.5].map((n)=>plural(n,forms,'ru'))).toEqual(['1 one','2 few','5 many','21 one','1,5 other']);
    expect(number(1234.5,'de')).toBe(new Intl.NumberFormat('de').format(1234.5));
    expect(list(['a','b','c'],'en')).toBe(new Intl.ListFormat('en',{style:'long',type:'conjunction'}).format(['a','b','c']));
    expect(list(['a','b','c'],'zh-CN')).toBe('a、b、c');
    expect(dictionary('en').site.stepCount(1)).toBe('1 step');
    expect(dictionary('en').site.stepCount(2)).toBe('2 steps');
  });
  it('registers ten complete, translated dictionaries', () => {
    expect(locales).toHaveLength(10);
    for (const locale of locales) {
      const t = dictionary(locale);
      for (const ns of ['player','stage','site'] as const) expect(Object.keys(t[ns]).sort()).toEqual(Object.keys(dictionary('en')[ns]).sort());
      expect(Object.keys(boardDictionary(locale).board).sort()).toEqual(Object.keys(boardEnglish.board).sort());
      if (locale !== 'en') expect(t.player.play).not.toBe('Play');
    }
  });
});

it('sends the current locale in both image and video export bodies', async () => {
  vi.stubGlobal('document', {querySelector:()=>({content:'local-test-token'})});
  const fetch = vi.fn().mockResolvedValueOnce(new Response('png',{status:200})).mockResolvedValueOnce(new Response(JSON.stringify({job:{id:'job'}}),{status:202}));
  vi.stubGlobal('fetch',fetch);
  await exportImage('project',{scenarioId:'scenario',position:2,theme:'sketch',locale:'ja'});
  await startVideo('project',{scenarioId:'scenario',theme:'sketch',locale:'ru'});
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({scenarioId:'scenario',position:2,theme:'sketch',locale:'ja'});
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({scenarioId:'scenario',theme:'sketch',locale:'ru'});
});
