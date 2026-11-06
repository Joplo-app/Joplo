import { describe, expect, it } from 'vitest';
import { resolveLocale, readLocale, saveLocale } from '../src/i18n/locale';
import { en } from '../src/i18n/en';
import { boardLayout, dockWidth, topbarCollapse } from '../src/player/layout';
import { fullscreenBarCollapse, navGroup, speedGroup, layersGroup, directorW, rowWidth, CTRL } from '../src/player/controls-fit';
import { SPEEDS } from '../src/runtime/pace';

describe('locale resolution', () => {
  it.each([['zh-Hant','zh-TW'],['zh-TW','zh-TW'],['zh-HK','zh-TW'],['zh-MO','zh-TW'],['zh-SG','zh-CN'],['pt-PT','pt-BR'],['es-419','es'],['de-AT','de'],['ja-JP','ja'],['xx','en']] as const)('%s → %s', (tag, expected) => expect(resolveLocale({ languages: [tag] })).toBe(expected));
  it('uses explicit, saved, browser, English in order, rejecting invalid values', () => {
    expect(resolveLocale({ explicit: 'ru', saved: 'ja', languages: ['fr'] })).toBe('ru');
    expect(resolveLocale({ explicit: '', saved: 'ja', languages: ['fr'] })).toBe('ja');
    expect(resolveLocale({ explicit: 'xx', saved: 'old', languages: ['xx', 'es-MX'] })).toBe('es');
    expect(resolveLocale({ languages: [] })).toBe('en');
    expect(resolveLocale({})).toBe('en');
  });
  it('survives storage getters and methods throwing on file URLs', () => {
    const storage = () => { throw new Error('SecurityError'); };
    expect(readLocale(storage)).toBeNull();
    expect(() => saveLocale('ja', storage)).not.toThrow();
  });
});

describe('long localized controls', () => {
  const long = (s: string) => s.repeat(2);
  const t = { ...en, player: Object.fromEntries(Object.entries(en.player).map(([k,v]) => [k, typeof v === 'string' ? long(v) : v])) as typeof en.player };
  it.each([1280, 1440])('fits a %spx viewport with a pseudo dictionary', (width) => {
    const layout = boardLayout(width, t);
    expect(dockWidth(layout, t.player.play, SPEEDS, 0, t)).toBeLessThanOrEqual(width - layout.navWidth - 32);
    const top = topbarCollapse(width, t, 'Português (Brasil)');
    expect(top.width).toBeLessThanOrEqual(width);
    expect([...top.collapsed][0]).toBe('language');
    const titles = ['Client view', 'Server processing'];
    const c = fullscreenBarCollapse(width - 48, t.player.replay, SPEEDS, titles, true, titles[0]!, t);
    const groups = [navGroup(CTRL.sm, t.player.replay, t), speedGroup(SPEEDS, CTRL.sm), layersGroup(titles, CTRL.sm, t)];
    const fixed = 16 + CTRL.sm + 18 + directorW(true, titles[0]!, t);
    expect(rowWidth(fixed, groups, c, CTRL.gap, 2)).toBeLessThanOrEqual(width - 48);
  });
});

it('keeps all translation keys and interpolation signatures exact at compile time', async () => {
  const { defineDictionary } = await import('../src/i18n/define');
  const define = defineDictionary<{ menu: { title: string; count: (n: number) => string } }>();
  define({menu:{title:'Menu',count:(n:number)=>String(n)}});
  // @ts-expect-error Missing key
  define({menu:{title:'Menu'}});
  // @ts-expect-error Extra nested key
  define({menu:{title:'Menu',count:(n:number)=>String(n),extra:'No'}});
  // @ts-expect-error Wrong interpolation type
  define({menu:{title:'Menu',count:(n:string)=>n}});
  // @ts-expect-error Dropped interpolation argument
  define({menu:{title:'Menu',count:()=>''}});
});
