import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { Step, Project, type Scenario, type Selection } from '@joplo-app/core';
import { en } from '../src/i18n/en';
import { createZhCN } from '../src/i18n/zh-CN';
import { m, translate } from '../src/i18n/messages';
import { stepCaption, mockLabel, selectionLabel } from '../src/i18n/step-caption';
import { timelineChips } from '../src/player/layout';
import { spokenSubtitleFor, stepTitleFor } from '../src/player/subtitle-content';

it('keeps author captions and mock labels verbatim and translates generated text at consumption', () => {
  const t = createZhCN();
  const step = Step.parse({id:'s#1',kind:'user',action:{type:'click',target:'send'},caption:'Click “Send”',captionAuto:{kind:'click',label:'Send'}});
  expect(stepCaption(step,en)).toBe('Click “Send”');
  expect(stepCaption(step,t)).toBe('点击「Send」');
  const notice = m.player.inThisScenarioTheNextStepIs(stepCaption(step,m));
  expect(translate(notice,t)).toContain('点击「Send」');
  expect(translate(notice,en)).toContain('Click “Send”');
  expect(stepCaption({...step,captionAuto:undefined,caption:'作者的字幕'},en)).toBe('作者的字幕');
  expect(timelineChips([step],1,null,null,false,t)[1]!.label).toBe('点击「Send」');
  const mock = {label:'Mock success',outcome:'success' as const,auto:true as const};
  expect(mockLabel(mock,t)).toBe('模拟成功');
  expect(mockLabel({...mock,auto:undefined,label:'作者的结果'},en)).toBe('作者的结果');
  const sc = {steps:[step],mock} as Scenario;
  expect(spokenSubtitleFor(sc,1,null,t)).toMatchObject({text:'点击「Send」',source:'caption'});
  expect(stepTitleFor(sc,1,null,null,t)).toMatchObject({caption:'点击「Send」'});
  expect(stepTitleFor(sc,1,null,{outcome:'success',text:'作者的说明'},t)).toMatchObject({caption:'场景完成 · 模拟成功',explain:'作者的说明'});
  for (const kind of ['type','select','check','uncheck','switch_on','switch_off','back','press'] as const) {
    const s = {...step,captionAuto:{kind,label:'Send',value:'作者值',keys:'Enter'}};
    expect(stepCaption(s,t)).not.toBe(stepCaption(s,en));
  }
  expect(stepCaption({...step,captionAuto:{kind:'press',label:'',keys:''}},en)).toBe('Press a key');
  expect(Step.safeParse({...step,captionAuto:{kind:'invalid',label:''}}).success).toBe(false);
});

it('reads IR step captions only inside stepCaption (including aliases and indexed access)', () => {
  const root = path.resolve(import.meta.dirname,'..');
  const config = ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile).config;
  const parsed = ts.parseJsonConfigFileContent(config,ts.sys,root);
  const program = ts.createProgram(parsed.fileNames,parsed.options);
  const checker = program.getTypeChecker();
  const errors: string[] = [];
  for (const source of program.getSourceFiles().filter(s=>s.fileName.startsWith(path.join(root,'src')))) {
    function visit(node: ts.Node) {
      let receiver: ts.Node | undefined;
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'caption') receiver = node.expression;
      if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'caption') receiver = node.expression;
      if (ts.isBindingElement(node) && (node.propertyName?.getText(source) ?? node.name.getText(source)) === 'caption' && ts.isVariableDeclaration(node.parent.parent)) receiver = node.parent.parent.initializer;
      if (receiver) {
        const type = checker.getNonNullableType(checker.getTypeAtLocation(receiver));
        const props = checker.getPropertiesOfType(type).map(p=>p.name);
        if (props.includes('captionAuto') || (props.includes('action') && props.includes('kind'))) {
          let scope: ts.Node | undefined = node;
          while (scope && !(ts.isFunctionDeclaration(scope) && scope.name?.text === 'stepCaption' && source.fileName.endsWith('/i18n/step-caption.ts'))) scope = scope.parent;
          if (!scope) errors.push(`${source.fileName}:${source.getLineAndCharacterOfPosition(node.getStart()).line+1}`);
        }
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
  expect(errors).toEqual([]);
}, 30_000); // 整个 web 项目建 TypeScript 程序做类型扫描，CI 上约 5 s，默认 5 s 超时太紧

it('localizes selected-step labels without changing the English selection record', () => {
  const project = Project.parse({entryIds: [], schemaVersion: 3,mode:'dev',name:'Test',scenarios:{s:{id:'s',workId:'f.a',name:'Demo',mock:{label:'Mock',outcome:'other'},initial:{sceneId:'scene'},steps:[{id:'s#1',kind:'user',action:{type:'press',keys:'Enter'},caption:'Press Enter',captionAuto:{kind:'press',label:'',keys:'Enter'}}]}}});
  const selection = {scenarioId:'s',stepId:'s#1',nodeId:null,label:'Press Enter'} as Selection;
  const label = selectionLabel(project,selection);
  expect(translate(label,en)).toBe('Press Enter');
  expect(translate(label,createZhCN())).toBe('按下 Enter');
  expect(selection.label).toBe('Press Enter');
});
