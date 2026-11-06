import { describe, expect, it, vi } from 'vitest';
import { boardHash, isLocalHost, parseBoardHash, parseSiteHash, unknownPlayParams, warnUnknownPlayParams } from '../src/runtime/route';

describe('深链接里不认识的参数（开发模式提示，不影响播放）', () => {
  it('只报演示页 hash 查询里不认识的参数；已知参数、空查询、非演示页都不报', () => {
    expect(unknownPlayParams('#/p/f/invite?o=invite.a&s=invite.a.happy&layer=review&step=2')).toEqual(['layer']);
    expect(unknownPlayParams('#/f/invite?scenario=x&l=main&option=a')).toEqual(['scenario', 'option']);
    expect(unknownPlayParams('#/p/f/invite?o=a&c=b&s=c&step=1&l=d&speed=1.5')).toEqual([]);
    expect(unknownPlayParams('#/p/f/invite')).toEqual([]);
    expect(unknownPlayParams('')).toEqual([]);
    expect(unknownPlayParams('#/p/f/invite?layer=a&layer=b')).toEqual(['layer']);
  });
  it('不认识的参数不改变解析结果（照常播放）', () => {
    const hash = '#/p/f/invite?s=invite.a.happy&layer=review&step=2';
    expect(parseBoardHash(hash)).toEqual(parseBoardHash('#/p/f/invite?s=invite.a.happy&step=2'));
    expect(boardHash(parseBoardHash(hash))).toBe('#/p/f/invite?s=invite.a.happy&step=2');
    expect(parseSiteHash('#/f/invite?layer=x&l=main')).toEqual(parseSiteHash('#/f/invite?l=main'));
  });
  it('提示写进控制台一次，列出参数和正确写法；没有未知参数时不输出', () => {
    const warn = vi.fn();
    expect(warnUnknownPlayParams('#/p/f/invite?layer=review', warn)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('layer');
    expect(warn.mock.calls[0]![0]).toContain('l=<layer key>');
    expect(warnUnknownPlayParams('#/p/f/invite?l=review', warn)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('发布站只在本机预览时算开发模式', () => {
    for (const h of ['localhost', '127.0.0.1', '[::1]']) expect(isLocalHost(h)).toBe(true);
    for (const h of ['joplo.app', 'abc.share.joplo.app', '127.0.0.2.example.com', '']) expect(isLocalHost(h)).toBe(false);
  });
});
