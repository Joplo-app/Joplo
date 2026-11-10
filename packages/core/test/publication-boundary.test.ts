/** 离开作者机器的数据必须排除完整的草稿与空作品，而不是只隐藏条目。 */
import { describe, expect, it } from 'vitest';
import { publicationSource, PRIVATE } from './fixtures/publication.ts';
import { compile, localizeProject, reviewManifest, resolveScope, scopeProject, type AuthoringProject, type Project } from '../src/index.ts';
import { projectSegments } from '../../server/src/voice-run.ts';

const safe = (value: unknown) => {const json=JSON.stringify(value); for(const secret of PRIVATE) expect(json).not.toContain(secret);};
const built = (src: AuthoringProject, mode: 'dev'|'publish'|'review') => {const r=compile(src,mode);expect(r.diagnostics.filter(d=>d.severity==='error')).toEqual([]);return r.project!;};

describe('完整草稿发布边界',()=>{
  it.each(['stage','on','routes','translated'] as const)('%s 草稿的文字、id、译文与派生快照不进入任何导出数据',kind=>{
    const src=publicationSource(kind);const dev=built(src,'dev');
    expect(JSON.stringify(dev)).toContain('PRIVATE_TEXT_729');
    for(const mode of ['publish','review'] as const){
      const pub=built(src,mode);safe(pub);safe(scopeProject(pub,['live.main.one'],mode));
      for(const p of [dev,localizeProject(dev,'ja')]){
        safe(reviewManifest(p,mode));
        const scoped=scopeProject(p,['live.main.one'],mode);safe(scoped);safe(reviewManifest(scoped.project,mode));
      }
    }
  });
  it('全局画面与其他作品不受草稿影响，草稿自己的视图仍完整保留',()=>{
    const p=built(publicationSource('on'),'dev');
    safe(p.scenes['@/']);safe(p.scenes['live.main@/']);safe(p.scenarios['live.main.one']);
    expect(JSON.stringify(p.scenes['privwork729.main@/'])).toContain('PRIVATE_TEXT_729');
  });
  it('范围分享不允许直接选草稿或借用草稿元素',()=>{
    const p=built(publicationSource('on'),'dev');
    for(const mode of ['publish','review'] as const){
      expect(()=>resolveScope(p,{features:['privwork729']},mode)).toThrow(/draft/i);
      expect(()=>scopeProject(p,['privwork729.main.one'],mode)).toThrow(/draft/i);
      const tampered=structuredClone(p);
      // 即使收到旧版含草稿贡献的 dev IR，也不能把借用规则当成解除草稿保护。
      const node=structuredClone(tampered.scenes['privwork729.main@/']!.root.children!.find(n=>n.from==='privwork729.main')!);
      tampered.scenes['live.main@/']!.root.children!.push(node);
      tampered.scenarios['live.main.one']!.steps[0]!.shots=[{layer:'@page',targets:['private_node729']}];
      expect(()=>scopeProject(tampered,['live.main.one'],mode)).toThrow(/draft|private/i);
    }
  });
  it('旧 dev IR 的草稿贡献即使占据整棵根树，也不能被裁剪回退恢复',()=>{
    const p=built(publicationSource('on'),'dev');
    const draft=structuredClone(p.scenes['privwork729.main@/']!.root.children!.find(n=>n.from==='privwork729.main')!);
    p.scenes['live.main@/']!.root=draft;
    expect(()=>scopeProject(p,['live.main.one'])).toThrow(/draft|private/i);
  });
  it('CLI 批量朗读候选不含草稿原文或译文',()=>{
    const p=built(publicationSource('translated'),'dev');safe(projectSegments(p));safe(projectSegments(localizeProject(p,'ja')));
  });
});

describe('没有切片的独立作品只留本地',()=>{
  it.each(['stage','on','routes'] as const)('%s 空作品在公开两模式完全跳过，dev 保留空状态',kind=>{
    const src=publicationSource(kind);src.works!.privwork729!.draft=false;src.works!.privwork729!.scenarios={};
    const dev=built(src,'dev');expect(dev.features.privwork729).toBeDefined();
    for(const mode of ['publish','review'] as const){
      const r=compile(src,mode);expect(r.project).not.toBeNull();safe(r.project);safe(reviewManifest(dev,mode));
      expect(r.diagnostics).toContainEqual(expect.objectContaining({code:'WORK_EMPTY',severity:'info',message:expect.stringMatching(/not.*publish|not.*review|skipped/i)}));
      expect(()=>resolveScope(dev,{features:['privwork729']},mode)).toThrow(/empty|no slices|no scenarios/i);
    }
  });
});
