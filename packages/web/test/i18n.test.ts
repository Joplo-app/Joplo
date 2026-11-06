import { describe, expect, it } from 'vitest';
import { resolveLocale, readLocale, saveLocale } from '../src/i18n/locale';

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
