/**
 * 发布站水印（D83）：发布站默认在舞台右上角带一个小 Joplo 图标。
 * 只有页面里有 <meta name="joplo-branding" content="off"> 才去掉；这个标记只由 Joplo Cloud 在发出 Pro 创作者的分享页时注入
 * （Cloud 同时删掉作者自带的同名标记），本地 build、自己托管的站点一律带水印。
 */
export const BRANDING_META = 'joplo-branding';

export function readBranding(doc: Pick<Document, 'querySelector'> | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  const content = doc?.querySelector(`meta[name="${BRANDING_META}"]`)?.getAttribute('content');
  return content?.trim().toLowerCase() !== 'off';
}
