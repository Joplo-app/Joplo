import { describe, expect, it } from 'vitest';
import { Project } from '@joplo-app/core';
import { DemoController } from '../src/runtime/demo';
import { translate } from '../src/i18n/messages';
import { dictionary } from '../src/i18n/dictionaries';
import { boardEnglish, boardDictionary } from '../src/i18n/board/dictionaries';
import { exportProgress } from '../src/board/states-model';
import type { VideoJob } from '../src/runtime/dev-client';
import { readFileSync } from 'node:fs';

it('translates the static-stage notice with only the published-site dictionary', async () => {
  const ctl = new DemoController(null);
  ctl.setProject(Project.parse({schemaVersion:2,name:'Site',mode:'publish',scenes:{s:{id:'s',optionId:'f.a',route:'/',name:'Stage',root:{id:'root',type:'Stack'}}}}),1);
  ctl.preview('s');
  await ctl.clickNode('unmodeled',{x:0,y:0});
  const notice = ctl.getSnapshot().notice!;
  expect(notice.kind).toBe('info');
  expect(translate(notice.text, dictionary('en'))).toBe('Static stage: this option does not demonstrate this case yet');
  expect(translate(notice.text, dictionary('zh-CN'))).toBe('这是静态画面：当前方案还没有演示这个情况');
  for (const locale of ['en','zh-CN'] as const) expect(translate(notice.text,dictionary(locale))).not.toMatch(/^(?:board|player)\.[A-Za-z]/);
});

describe('structured video cancellation', () => {
  const job = {id:'job',projectId:'p',scenarioId:'s',status:'cancelled',phase:'cancelled',step:2,total:5,percent:40,file:null,error:'Cancelled'} as VideoJob;
  it('stops reporting recording after cancellation and does not expose an error', () => {
    expect(exportProgress(job,'Demo',boardEnglish)).toMatchObject({running:false,done:false,text:'Export cancelled',step:'Cancelled',error:null});
  });
  it('uses status, never display text, to distinguish cancellation from errors', () => {
    expect(exportProgress({...job,status:'error',phase:'error'},'Demo',boardEnglish)?.error).toBe('Cancelled');
    const source=readFileSync(new URL('../src/board/App.tsx',import.meta.url),'utf8');
    expect(source).toContain("job.status === 'cancelled'");
    expect(source).toContain("job.status === 'error'");
    expect(source).not.toMatch(/job\.error\s*!==?/);
  });
});

it('keeps literals and punctuation in the dictionaries, including empty selection labels', () => {
  expect(boardDictionary('zh-CN').board.noFeaturesYetWriteYourFirstFeatureInFeatures).toContain('features/<名称>/feature.ts');
  expect(boardDictionary('zh-CN').board.gapBody('A','')).toContain('方案 A 的页面');
  expect(boardEnglish.board.labelPrefix('A')).toBe('A: ');
  expect(boardEnglish.board.componentTypeName('Email','Email')).toBe('Email');
  expect(boardEnglish.board.diagnosticSeparator).toBe('; ');
  expect(boardEnglish.board.noFeaturesYetWriteYourFirstFeatureInFeatures).toContain('features/<name>/feature.ts');
  expect(boardEnglish.board.gapBody('A','')).toContain('gap, not a demo');
  expect(boardEnglish.board.inspectModeClickAStageElementToSelectIt).toContain('does not execute a step');
  expect(boardEnglish.board.selectedTellAgentWhatYouWantToChange('Send')).toBe('Selected “Send”. Tell Agent what you want to change.');
  expect(boardEnglish.board.selectedTellAgentWhatYouWantToChange('')).toBe('Selection saved. Tell Agent what you want to change.');
});
