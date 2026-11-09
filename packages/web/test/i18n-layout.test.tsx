import '../../../scripts/test/render-fixtures.ts';
/** Layout budgets plus server-rendered nowrap contracts; no browser/e2e runner. */
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Project } from '@joplo-app/core';
import { dictionary } from '../src/i18n/dictionaries';
import { boardDictionary } from '../src/i18n/board/dictionaries';
import { locales, localeNames } from '../src/i18n/locale';
import { I18nProvider } from '../src/i18n/context';
import { boardLayout, dockWidth, topbarCollapse, topbarMeasurements } from '../src/player/layout';
import { CTRL, textW, fullscreenBarCollapse, directorW, navGroup, speedGroup, layersGroup, rowWidth } from '../src/player/controls-fit';
import { SPEEDS } from '../src/runtime/pace';
import { Btn, Segmented } from '../src/player/controls';
import { CaseNav } from '../src/board/CaseNav';
import { FONT_CHOICES } from '../src/board/appearance-model';
import { typeLabel } from '../src/board/labels';

const project = Project.parse({schemaVersion:2,mode:'dev',name:'Author project',features:{f:{id:'f',name:'Author feature',goal:'Author goal',optionIds:['f.a'],caseIds:['f.main'],pick:'f.a'}},options:{'f.a':{id:'f.a',featureId:'f',key:'a',name:'Author option',idea:'Author idea',coverage:{'f.main':{status:'missing',basis:'derived'}}}},cases:{'f.main':{id:'f.main',featureId:'f',title:'Author case',dimension:'main'}}});

for(const locale of locales) for(const [width,height] of [[1280,800],[1440,900]] as const) {
  it(`${locale} ${width}×${height}: fits the topbar, dock, fullscreen bar and sidebar without wrapping labels`, () => {
    const t={...dictionary(locale),...boardDictionary(locale)};
    const font=FONT_CHOICES(t).map(f=>f.name).sort((a,b)=>textW(b,13)-textW(a,13))[0]!;
    const appearance=t.board.appearanceButtonLabel(t.board.appearanceName(t.board.paperWhite,font));
    const contents={brand:74.375,breadcrumbs:[260,260],fullscreen:32,language:{full:42+textW(localeNames[locale],13),collapsed:32}};
    for(const site of [false,true]) {
      const dimensions=topbarMeasurements({...contents,...(site?{copyLink:{full:44+textW(t.site.copyLink,13),collapsed:32}}:{inspect:{full:67+textW(t.board.inspect,13),collapsed:32},appearance:{full:50+textW(appearance,13),collapsed:32},export:{full:64+textW(t.player.export,13),collapsed:32}})});
      const top=topbarCollapse(width,dimensions);
      expect(top.width).toBeLessThanOrEqual(width);
      if(top.collapsed.size)expect([...top.collapsed][0]).toBe('language');
      const L=boardLayout(width,t,localeNames[locale],dimensions);
      for(const label of [t.player.play,t.player.pause,t.player.resume,t.player.replay]) {
        expect(label).not.toMatch(/[\r\n]/);
        expect(dockWidth(L,label,SPEEDS,5,t),label).toBeLessThanOrEqual(width-L.navWidth-32);
        const titles=['Client','Server'];
        for(const director of [false,true]) {
          const collapsed=fullscreenBarCollapse(width-48,label,SPEEDS,titles,director,titles[0]!,t);
          const fixed=16+CTRL.sm+18+directorW(director,titles[0]!,t);
          const groups=[navGroup(CTRL.sm,label,t),speedGroup(SPEEDS,CTRL.sm,t),layersGroup(titles,CTRL.sm,t)];
          expect(rowWidth(fixed,groups,collapsed,CTRL.gap,2)).toBeLessThanOrEqual(width-48);
        }
      }
      // Sidebar has 12px outer and 8px row padding on either side. Labels, unlike author case titles, stay on one line.
      const inner=L.navWidth-24-16;
      const head=(title:string,right:string)=>textW(title,12)+title.length+textW(right,12)+8;
      expect(head(t.board.options,t.board.itemCount(3))).toBeLessThanOrEqual(inner);
      expect(head(t.board.cases,t.board.coverageFor('A'))).toBeLessThanOrEqual(inner);
      for(const label of [t.board.otherScenarios,t.board.optionLabel('A'),t.board.missingCount(3),t.board.undecidedCount(1),t.board.allCovered]) {
        expect(textW(label,12),label).toBeLessThanOrEqual(inner);
        expect(label).not.toMatch(/[\r\n]/);
      }
      expect(textW(t.board.picked,11)+12).toBeLessThanOrEqual(inner-24-10);
      // Existing sidebar scrolls independently; the fixed controls leave stage and subtitle space at both heights.
      expect(height-52-56-24-36-54-30).toBeGreaterThan(400);
    }
    const markup=renderToStaticMarkup(<I18nProvider explicit={locale} extend={boardDictionary}>
      <Btn label={t.player.play} /><Btn label={t.player.export} /><Btn label={t.player.inspect} />
      <Segmented value="1" items={SPEEDS.map(n=>({value:String(n),label:t.player.speedValue(n)}))} label={t.player.playbackSpeed(1)} onChange={()=>{}} />
      <CaseNav project={project} featureId="f" optionId="f.a" caseId="f.main" scenarioId={null} onOption={()=>{}} onCase={()=>{}} onScenario={()=>{}} onOptionCase={()=>{}} onCopy={()=>{}} />
    </I18nProvider>);
    const buttons=[...markup.matchAll(/<button\b([^>]*)>/g)].map(m=>m[1]!);
    expect(buttons.slice(0,3+SPEEDS.length).every(attributes=>attributes.includes('whitespace-nowrap'))).toBe(true);
    expect(markup).toMatch(/class="[^"]*whitespace-nowrap[^"]*"/);
    expect(markup).toContain('truncate');
    expect(typeLabel('Button',t,locale)).toBe(locale==='en'?'Button':t.board.componentTypeName('Button',t.board.button));
    expect(typeLabel('AppShell.Header',t,locale)).toBe(locale==='en'?'AppShell.Header':t.board.componentTypeName('AppShell.Header',t.board.header));
  });
}
