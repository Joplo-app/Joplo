import { expect, it } from 'vitest';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { dictionary } from '../src/i18n/dictionaries';
import { boardDictionary } from '../src/i18n/board/dictionaries';
import { locales, type Locale } from '../src/i18n/locale';

// Exact keys and locale scopes only; additions require a reason. No blanket namespace exceptions.
const unchanged: Record<string, { locales: readonly Locale[]; reason: string; values?: readonly string[] }> = {
  "board.cloudPublic": { locales: ["fr"], reason: "Public is also the French adjective." },
  "player.speedValue": { locales: ["zh-CN", "zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Numeric speed and multiplication sign; Intl handles formatting." },
  "player.number": { locales: ["zh-CN", "zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Numeric formatter; no translatable words." },
  "player.list": { locales: ["zh-CN", "zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Intl list formatting; empty and single-item lists have no connective." },
  "board.cloudPlanPro": { locales: ["zh-CN", "zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Pro is the plan's product name, kept as-is (C27)." },
  "board.cloudStorageOf": { locales: ["zh-CN", "zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Formatted byte values joined by a neutral slash." },
  "board.appearanceName": { locales: ["zh-CN", "zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Author/theme/font values joined by a neutral separator." },
  "player.space": { locales: ["zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Physical Space key name, preserved across languages." },
  "site.contentSourceTag": { locales: ["es", "fr", "de", "pt-BR"], reason: "\"Original\" is the native word for the source-language tag in these languages." },
  "site.itemCount": { locales: ["zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Numeric count only; Intl handles formatting." },
  "board.itemCount": { locales: ["zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Author value or numeric count only." },
  "board.markerGothic": { locales: ["zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Font family brand name." },
  "board.fontSample": { locales: ["zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Font sample glyphs, not interface copy." },
  "board.wenKai": { locales: ["de"], reason: "Font brand name with online, also the German word." },
  "board.diagnosticSeparator": { locales: ["ko", "es", "de", "pt-BR", "ru"], reason: "Semicolon is normal punctuation in these locales." },
  "board.labelPrefix": { locales: ["ko", "es", "de", "pt-BR", "ru"], reason: "Author label plus locale-appropriate punctuation." },
  "board.selectionSyncFailed": { locales: ["ko", "es", "de", "pt-BR", "ru"], reason: "Nested localized messages and author values, joined by punctuation." },
  "board.coverageTip": { locales: ["ko", "es", "de", "pt-BR", "ru"], reason: "Option letter and already localized status, joined by punctuation." },
  "player.error": { locales: ["es"], reason: "Error is also the Spanish noun." },
  "player.director": { locales: ["es"], reason: "Director is also the Spanish noun." },
  "stage.error": { locales: ["es"], reason: "Error is also the Spanish noun." },
  "board.projectErrorCount": { locales: ["es"], reason: "Spanish singular error matches English; plural errores is localized.", values: ["1 error"] },
  "board.errorError": { locales: ["es"], reason: "Spanish Error plus the unchanged state identifier error." },
  "board.projectErrorBadge": { locales: ["es"], reason: "Spanish singular error matches English; plural errores is localized.", values: ["1 error"] },
  "board.error": { locales: ["es"], reason: "Error is also the Spanish noun." },
  "board.panel": { locales: ["es"], reason: "Panel is also the Spanish noun." },
  "board.terminal": { locales: ["es", "fr", "de", "pt-BR"], reason: "Terminal is the established term in these languages." },
  "player.transition": { locales: ["fr"], reason: "Transition is also the French word." },
  "player.transitionPrefix": { locales: ["fr"], reason: "French Transition with the neutral timeline separator." },
  "player.pause": { locales: ["fr"], reason: "Pause is also the French control label." },
  "player.zoom": { locales: ["fr", "de", "pt-BR"], reason: "Zoom is the established term in French, German and Portuguese." },
  "player.initial": { locales: ["fr"], reason: "Initial is also the French adjective." },
  "stage.document": { locales: ["fr"], reason: "Document is also the French noun." },
  "stage.code": { locales: ["fr", "de"], reason: "Code is also the French and German noun." },
  "stage.navigation": { locales: ["fr", "de"], reason: "Navigation is also the French and German noun." },
  "stage.image": { locales: ["fr"], reason: "Image is also the French noun." },
  "board.optionCount": { locales: ["fr"], reason: "French option/options matches English, with locale number formatting." },
  "board.option": { locales: ["fr"], reason: "Option is also the French noun." },
  "board.options": { locales: ["fr"], reason: "Options is also the French plural." },
  "board.optionName": { locales: ["fr"], reason: "French Option plus author values." },
  "board.optionLabel": { locales: ["fr"], reason: "French Option plus an author value." },
  "board.page": { locales: ["fr"], reason: "Page is also the French noun." },
  "board.note": { locales: ["fr"], reason: "Note is also the French noun." },
  "board.interruption": { locales: ["fr"], reason: "Interruption is also the French noun." },
  "board.pagination": { locales: ["fr"], reason: "Pagination is also the French term." },
  "board.notification": { locales: ["fr"], reason: "Notification is also the French noun." },
  "player.system": { locales: ["de"], reason: "System is also the German noun." },
  "player.systemPrefix": { locales: ["de"], reason: "German System with the neutral timeline separator." },
  "player.element": { locales: ["de"], reason: "Element is also the German noun." },
  "board.joploBoard": { locales: ["de"], reason: "Board is the established German product term." },
  "board.link": { locales: ["pt-BR"], reason: "Link is the established Brazilian Portuguese term." },
  "player.chapterNo": { locales: ["zh-CN", "zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Two-digit chapter number (D102); Intl handles the digits." },
  "player.clock": { locales: ["zh-CN", "zh-TW", "ja", "ko", "es", "fr", "de", "pt-BR", "ru"], reason: "Clock-style m:ss duration (D102); Intl handles the digits." },
  "player.film": { locales: ["fr", "de"], reason: "Film is also the French and German noun." },
  "site.films": { locales: ["fr"], reason: "Films is also the French plural." },
  "board.films": { locales: ["fr"], reason: "Films is also the French plural." },
};
const leaves = (value: object): Record<string, unknown> => Object.fromEntries(Object.entries(value).flatMap(([ns,entries])=>Object.entries(entries).map(([key,v])=>[`${ns}.${key}`,v])));
const args = new Map<string, string[]>();
for (const relative of ['../src/i18n/en.ts','../src/i18n/board/en.ts']) {
  const source = ts.createSourceFile(relative,readFileSync(new URL(relative,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  function visit(node: ts.Node, ns = '') {
    if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer)) {
      for(const child of node.initializer.properties) visit(child,node.name.getText(source));
      return;
    }
    if(ts.isPropertyAssignment(node) && ts.isArrowFunction(node.initializer)) args.set(`${ns}.${node.name.getText(source)}`,node.initializer.parameters.map(p=>p.type!.getText(source)));
    ts.forEachChild(node,child=>visit(child,ns));
  }
  visit(source);
}
function samples(key: string) {
  return [0,1,2,5,11,21,22,25,101,1.5,1000,'Author',''].flatMap((v)=>[false,true].map(flag=>args.get(key)!.map(type=>type==='boolean'?flag:type.includes('[]')?(v===''?[]:v===0?['Author']:['Author','Text']):type==='string'?(typeof v==='string'?v:'Author'):v)));
}

it('translates every non-English leaf; intentional matches have an explicit, current allowlist', () => {
  const source = leaves({...dictionary('en'),...boardDictionary('en')});
  const errors: string[] = [];
  const used = new Set<string>();
  for(const locale of locales.filter(l=>l!=='en')) {
    const target = leaves({...dictionary(locale),...boardDictionary(locale)});
    expect(Object.keys(target).sort()).toEqual(Object.keys(source).sort());
    for(const [key, english] of Object.entries(source)) {
      const translated = target[key];
      const matches = typeof english==='function'
        ? samples(key).filter(a=>english(...a)===(translated as Function)(...a)).map(a=>english(...a))
        : english === translated ? [english] : [];
      const same = matches.length > 0;
      const exception = unchanged[key];
      if(same) {
        if(exception?.locales.includes(locale) && matches.every(v=>!exception.values || exception.values.includes(v))) { expect(exception.reason.trim()).not.toBe(''); used.add(`${locale}:${key}`); }
        else errors.push(`${locale}:${key}`);
      }
    }
  }
  expect(errors,'Untranslated values').toEqual([]);
  const stale = Object.entries(unchanged).flatMap(([key,e])=>e.locales.map(l=>`${l}:${key}`)).filter(key=>!used.has(key));
  expect(stale,'Remove stale translation exceptions').toEqual([]);
});

it('keeps interpolation values verbatim and supplies all required CLDR plural categories', () => {
  for(const locale of locales) {
    const t = {...dictionary(locale),...boardDictionary(locale)};
    expect(t.player.autoType('Author label','Author value')).toContain('Author label');
    expect(t.player.autoType('Author label','Author value')).toContain('Author value');
    expect(t.board.gapTitle('Author option','Author case','Author status')).toContain('Author status');
    expect(t.board.gapBody('Author option','Author reason')).toContain('Author reason');
    expect(t.board.gapBody('Author option','')).not.toMatch(/undefined|null/);
    expect(t.stage.artifactSummary('Author artifact',true)).toContain('Author artifact');
    expect(t.stage.artifactSummary('Author artifact',false)).toContain('Author artifact');
    if(locale==='en'||locale==='zh-CN')continue;
    const cats = ['ja','ko','zh-TW'].includes(locale)?['other']:locale==='ru'?['one','few','many','other']:['one','other'];
    for(const relative of [`../src/i18n/${locale}.ts`,`../src/i18n/board/${locale}.ts`]) {
      const source=ts.createSourceFile(relative,readFileSync(new URL(relative,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
      function visit(node: ts.Node) {
        if(ts.isCallExpression(node)&&node.expression.getText(source)==='plural') {
          const forms=node.arguments[1] as ts.ObjectLiteralExpression;
          expect(forms.properties.map(p=>p.name!.getText(source)).sort(),`${locale}: ${node.getText(source)}`).toEqual([...cats].sort());
        }
        ts.forEachChild(node,visit);
      }
      visit(source);
    }
  }
  const ru=dictionary('ru').site;
  expect([1,2,5,11,21,22,25,1.5].map(n=>ru.stepCount(n))).toEqual(['1 шаг','2 шага','5 шагов','11 шагов','21 шаг','22 шага','25 шагов','1,5 шага']);
});

it('preserves every interpolation value used by the source dictionary', () => {
  const source = leaves({...dictionary('en'),...boardDictionary('en')});
  for(const locale of locales.filter(l=>l!=='en')) {
    const target = leaves({...dictionary(locale),...boardDictionary(locale)});
    for(const [key, english] of Object.entries(source)) {
      if(typeof english !== 'function')continue;
      const input = args.get(key)!.map((type,i)=>type==='boolean'?true:type.includes('[]')?[`Author${i}a`,`Author${i}b`]:type==='string'?`Author${i}`:41+i);
      const original = english(...input);
      const translated = (target[key] as Function)(...input);
      for(const arg of input.flat()) {
        if(typeof arg==='boolean')continue;
        if(original.includes(String(arg)))expect(translated,`${locale}:${key} lost ${arg}`).toContain(String(arg));
      }
    }
  }
});
