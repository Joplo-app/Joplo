import { expect, it } from 'vitest';
import { auditArea, auditOptions } from '../src/layout-audit.ts';
import { runCli } from '../src/cli.ts';
it('preserves selectors and CSS rectangles with explicit importance/exclusion', () => {
  expect(auditArea('[data-jid="frame"]')).toBe('[data-jid="frame"]');
  expect(auditArea(':is(#frame,#other)')).toBe(':is(#frame,#other)');
  expect(auditArea('0,20,320,40')).toEqual({x:0,y:20,width:320,height:40});
  expect(auditOptions({auditLayout:true,auditImportant:['#quote'],auditExclude:['#stamp'],auditSafeArea:['0,400,800,50']})).toMatchObject({important:['#quote'],exclude:['#stamp'],safeAreas:[{x:0,y:400,width:800,height:50}]});
  expect(()=>auditOptions({auditImportant:['#quote']})).toThrow('--audit-layout');
});
it.each([['--audit-layout','--video'],['--audit-layout','--sheet'],['--audit-layout','--film','--resume'],['--audit-layout','--film','--sample-ms','100']])('rejects unsupported audit mode before rendering: %j', async (...flags) => {
  let output='';
  const code=await runCli(['render','.','--scenario-id','film.one','--out','/tmp/layout-test.png',...flags],{stdout:text=>output+=text,stderr:text=>output+=text});
  expect(code).toBe(2); expect(output).toMatch(/audit|Audit/);
});
