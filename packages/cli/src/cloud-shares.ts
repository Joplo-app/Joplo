import { JoploError } from '@joplo-app/core';
import { CloudError, terminalText } from './cloud-error.ts';
import { embedSnippets, type EmbedSnippets } from './cloud-embed.ts';
import { httpUrl, nonempty, object, type CloudClient } from './cloud.ts';
import { SHARE_ID } from './cloud-feedback.ts';

export type ShareVisibility = 'public' | 'private';
export type CloudShare = {
  shareId: string;
  title: string;
  status: 'draft' | 'live';
  version: number;
  visibility: ShareVisibility;
  passwordProtected: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  url: string;
};
export type CloudShareDetails = CloudShare & { embed: EmbedSnippets };

const iso = (value: unknown): value is string | null => value === null || typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

export function readCloudShare(value: unknown): CloudShare {
  const share = object(value);
  if (!nonempty(share.shareId) || !SHARE_ID.test(share.shareId) || !nonempty(share.title) || share.title.length > 200 || !['draft', 'live'].includes(String(share.status)) || !integer(share.version) || !['public', 'private'].includes(String(share.visibility)) || typeof share.passwordProtected !== 'boolean' || !iso(share.publishedAt) || !iso(share.expiresAt)) throw new CloudError('INVALID_RESPONSE');
  return {
    shareId: share.shareId,
    title: share.title,
    status: share.status as CloudShare['status'],
    version: share.version,
    visibility: share.visibility as ShareVisibility,
    passwordProtected: share.passwordProtected,
    publishedAt: share.publishedAt,
    expiresAt: share.expiresAt,
    url: httpUrl(share.url),
  };
}

export async function listCloudShares(client: CloudClient): Promise<CloudShare[]> {
  const { token } = await client.requireAuth();
  const data = await client.request('/api/v1/shares', token);
  if (!Array.isArray(data.items) || data.items.length > 10_000) throw new CloudError('INVALID_RESPONSE');
  return data.items.map(readCloudShare);
}

export async function showCloudShare(client: CloudClient, shareId: string): Promise<CloudShareDetails> {
  if (!SHARE_ID.test(shareId)) throw new JoploError('USAGE', 'Share id must be 10 letters or digits');
  const { token } = await client.requireAuth();
  const share = readCloudShare(await client.request(`/api/v1/shares/${shareId}`, token));
  if (share.shareId !== shareId) throw new CloudError('INVALID_RESPONSE');
  return { ...share, embed: embedSnippets(share.url, share.title) };
}

export async function deleteCloudShare(client: CloudClient, shareId: string): Promise<void> {
  if (!SHARE_ID.test(shareId)) throw new JoploError('USAGE', 'Share id must be 10 letters or digits');
  const { token } = await client.requireAuth();
  const data = await client.request(`/api/v1/shares/${shareId}`, token, undefined, { method: 'DELETE' });
  if (data.success !== true) throw new CloudError('INVALID_RESPONSE');
}

export function cloudShareLine(share: CloudShare): string {
  const title = terminalText(share.title).replace(/[\r\n]+/g, ' ');
  return `${share.shareId}  ${share.status}  v${share.version}  ${share.visibility}${share.passwordProtected ? ' · password' : ''}  ${title}\n${share.url}`;
}

export function cloudShareText(share: CloudShareDetails): string[] {
  return [
    cloudShareLine(share),
    `Published: ${share.publishedAt ?? 'not published'} · Expires: ${share.expiresAt ?? 'never'}`,
    `Embed (iframe): ${share.embed.iframe}`,
    `Embed (Markdown): ${share.embed.markdown}`,
    `Badge: ${share.embed.badge}`,
    `Preview: ${share.embed.preview}`,
  ];
}
