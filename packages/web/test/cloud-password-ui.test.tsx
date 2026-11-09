import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { PasswordFields, PublicationLinks, VisibilityFields } from '../src/board/CloudPublish';
const render=(node:React.ReactNode)=>renderToStaticMarkup(<I18nProvider explicit="zh-CN">{node}</I18nProvider>);
const props={visibility:'private' as const,plan:'pro' as const,server:'https://cloud.example',protectedLink:false,value:undefined,onChange:()=>{},disabled:false,review:false};
test('免费：Pro 标记与新标签升级链接，不能填写；公开时隐藏',()=>{
 const html=render(<PasswordFields {...props} plan="free" />);
 expect(html).toContain('设置访问密码（Pro）'); expect(html).toContain('href="https://cloud.example/settings/billing"'); expect(html).toContain('target="_blank"'); expect(html).not.toContain('type="password"');
 expect(render(<PasswordFields {...props} visibility="public" />)).toBe('');
});
test('Pro：隐藏输入、显示切换、移除；更新已有加密链接默认保持；降级后仍能去掉',()=>{
 const html=render(<PasswordFields {...props} value="" review />);
 expect(html).toContain('type="password"'); expect(html).toContain('显示密码'); expect(html).toContain('同一密码');
 const existing=render(<PasswordFields {...props} protectedLink />);
 expect(existing).toContain('已加密'); expect(existing).toContain('保持'); expect(existing).toContain('去掉密码'); expect(existing).not.toContain('type="password"');
 expect(render(<PasswordFields {...props} protectedLink plan="free" />)).toContain('去掉密码');
 expect(render(<PublicationLinks result={{visibility:'private',passwordProtected:true}} server={props.server} />)).toContain('已加密');
});

test('已有加密链接禁止直接改公开，说明先私密去掉密码',()=>{
 const html=render(<VisibilityFields visibility="private" review={false} disabled={false} restricted={false} protectedLink onVisibility={()=>{}} onReview={()=>{}} />);
 expect(html).toMatch(/<input(?=[^>]*value="public")(?=[^>]*disabled)[^>]*>/); expect(html).toContain('先以私密发布去掉密码');
});
