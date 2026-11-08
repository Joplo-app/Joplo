import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { VisibilityFields, PublicationLinks } from '../src/board/CloudPublish';
import { defaultVisibility } from '../src/board/cloud-model';
const render = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider explicit="zh-CN">{node}</I18nProvider>);
test('新建默认公开，更新沿用当前可见性，旧记录按私密',()=>{
 expect(defaultVisibility(null)).toBe('public'); expect(defaultVisibility({})).toBe('private');
 expect(defaultVisibility({visibility:'public'})).toBe('public'); expect(defaultVisibility({visibility:'private'})).toBe('private');
 const html=render(<VisibilityFields visibility={defaultVisibility(null)} review={false} onVisibility={()=>{}} onReview={()=>{}} disabled={false} restricted={false} />);
 expect(html).toMatch(/<input(?=[^>]*value="public")(?=[^>]*checked="")[^>]*>/); expect(html).toContain('被搜索引擎收录'); expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
});
test('受限范围禁用公开并解释，发布结果包含可见性和设置用户名链接',()=>{
 const html=render(<VisibilityFields visibility="private" review={false} onVisibility={()=>{}} onReview={()=>{}} disabled={false} restricted />);
 expect(html).toMatch(/<input(?=[^>]*value="public")(?=[^>]*disabled)[^>]*>/); expect(html).toContain('保密');
 const result=render(<PublicationLinks result={{visibility:'public',portfolio:{workUrl:null,profileUrl:null,needsUsername:true,setupPath:'/settings/profile'}}} server="https://cloud.example" />);
 expect(result).toContain('公开'); expect(result).toContain('href="https://cloud.example/settings/profile"'); expect(result).toContain('target="_blank"');
 expect(render(<PublicationLinks result={{}} server="https://cloud.example" />)).toContain('私密');
});
