import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readAuthor, AuthorLink } from '../src/site/author';
import { I18nProvider } from '../src/i18n/context';
const doc = (content: string | null) => ({querySelector: () => content === null ? null : {getAttribute: () => content}}) as unknown as Document;
const hosted = {origin:'https://joplo.app',pathname:'/s/Abc1234567/'};
test('云端作者标记：严格验证 name、origin 和页面来源', () => {
 const valid=JSON.stringify({name:'作者',url:'https://show.joplo.app/@author'});
 expect(readAuthor(doc(valid),hosted)).toEqual({name:'作者',url:'https://show.joplo.app/@author'});
 for(const payload of [null,'{','{}',JSON.stringify({name:' ',url:'https://show.joplo.app/@a'}),JSON.stringify({name:'A',url:'https://show.joplo.app.evil.test/@a'}),JSON.stringify({name:'A',url:'http://show.joplo.app/@a'}),JSON.stringify({name:'A',url:'javascript:alert(1)'})]) expect(readAuthor(doc(payload),hosted)).toBeNull();
 for(const origin of ['file://','http://localhost:4790','https://example.com']) expect(readAuthor(doc(valid),{origin,pathname:'/s/Abc1234567/'})).toBeNull();
 expect(readAuthor(doc(valid),{...hosted,pathname:'/index.html'})).toBeNull();
});
test('作者条：新标签页、转义姓名、十种语言，无标记不显示', () => {
 for(const locale of ['en','zh-CN','ja','ko','fr','de','es','pt-BR','ru','zh-TW'] as const){
 const html=renderToStaticMarkup(<I18nProvider explicit={locale}><AuthorLink author={{name:'<作者>',url:'https://show.joplo.app/@a'}} /></I18nProvider>);
 expect(html).toContain('&lt;作者&gt;'); expect(html).toContain('target="_blank"'); expect(html).toContain('noopener');
 }
 expect(renderToStaticMarkup(<I18nProvider explicit="en"><AuthorLink author={null} /></I18nProvider>)).toBe('');
});
