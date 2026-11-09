/** 文档必须与真实的配乐提交锚点保持一致。 */
import { expect, it } from 'vitest';
import { skill } from '../../../plugins/alda/src/guide.ts';
it('Alda 指南按 commitGapMs 的完整计划解释锚点，不再教上一 hold 单独推进',()=>{
 expect(skill).not.toContain('Anchors advance by the preceding hold (default 3000ms)');
 expect(skill).toContain('commitGapMs');
 expect(skill).toContain("next step's action demonstration");
});
