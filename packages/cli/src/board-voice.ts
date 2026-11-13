import { JoploError } from '@joplo-app/core';
import { terminalText } from './cloud-error.ts';
import type { BoardClient } from './board.ts';

export type BoardVoiceProfile = {
  id: string;
  name: string;
  kind: string;
  voice: string;
  voices: { id: string; name: string }[];
  key: { saved: boolean; hint: string | null; env: string | null; envSet: boolean };
  removable: boolean;
  unsupported: boolean;
};

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function readProfile(value: unknown): BoardVoiceProfile {
  const profile = object(value), key = object(profile.key);
  if (typeof profile.id !== 'string' || typeof profile.name !== 'string' || typeof profile.kind !== 'string' || typeof profile.voice !== 'string' || !Array.isArray(profile.voices) || typeof key.saved !== 'boolean' || !(key.hint === null || typeof key.hint === 'string') || !(key.env === null || typeof key.env === 'string') || typeof key.envSet !== 'boolean' || typeof profile.removable !== 'boolean' || typeof profile.unsupported !== 'boolean') throw new JoploError('INVALID_SCHEMA', 'The board returned an invalid voice profile');
  return {
    id: profile.id, name: profile.name, kind: profile.kind, voice: profile.voice,
    voices: profile.voices.map(value => { const voice = object(value); if (typeof voice.id !== 'string' || typeof voice.name !== 'string') throw new JoploError('INVALID_SCHEMA', 'The board returned an invalid voice choice'); return { id: voice.id, name: voice.name }; }),
    key: { saved: key.saved, hint: key.hint, env: key.env, envSet: key.envSet }, removable: profile.removable, unsupported: profile.unsupported,
  };
}

export async function boardVoiceProfiles(client: BoardClient): Promise<{ profiles: BoardVoiceProfile[]; file: string }> {
  const data = object(await client.voiceProfiles());
  if (!Array.isArray(data.profiles) || typeof data.file !== 'string') throw new JoploError('INVALID_SCHEMA', 'The board returned an invalid voice profile list');
  return { profiles: data.profiles.map(readProfile), file: data.file };
}

export function voiceProfileLine(profile: BoardVoiceProfile): string {
  const key = profile.kind === 'cloud' ? 'account login' : profile.key.saved ? `saved ${profile.key.hint ?? ''}` : profile.key.envSet ? `from ${profile.key.env}` : `not saved${profile.key.env ? ` (env: ${profile.key.env})` : ''}`;
  const voices = profile.voices.length ? `\n  Voices: ${profile.voices.map(voice => `${voice.id} (${terminalText(voice.name)})`).join(', ')}` : '';
  return `${profile.id}  ${terminalText(profile.name)}  ${profile.unsupported ? 'unsupported' : profile.kind}  narrator=${profile.voice}  key: ${key}${voices}`;
}

export async function setBoardVoiceKey(client: BoardClient, profileId: string, key: string): Promise<BoardVoiceProfile> {
  if (!key.trim() || key.length > 500 || /[\r\n]/.test(key)) throw new JoploError('USAGE', 'JOPLO_VOICE_KEY must contain a non-empty API key without newlines');
  const { profiles } = await boardVoiceProfiles(client);
  const profile = profiles.find(item => item.id === profileId);
  if (!profile) throw new JoploError('NOT_FOUND', `Unknown voice profile: ${profileId}`);
  if (profile.kind !== 'openai' && profile.kind !== 'elevenlabs') throw new JoploError('USAGE', 'Keys can be saved only for OpenAI or ElevenLabs; Joplo Cloud uses your login');
  const data = object(await client.writeVoiceProfile(profileId, { key }));
  return readProfile(data.profile);
}

export async function testBoardVoiceKey(client: BoardClient, profileId: string, key?: string): Promise<{ ok: boolean; contentType?: string; bytes?: number; error?: unknown }> {
  const data = object(await client.testVoiceKey({ id: profileId, ...(key ? { key } : {}) }));
  if (typeof data.ok !== 'boolean') throw new JoploError('INVALID_SCHEMA', 'The board returned an invalid key test result');
  if (data.ok) return { ok: true, ...(typeof data.contentType === 'string' ? { contentType: data.contentType } : {}), ...(Number.isSafeInteger(data.bytes) ? { bytes: data.bytes as number } : {}) };
  return { ok: false, error: data.error };
}

export async function selectBoardNarrator(client: BoardClient, profileId: string, voiceId: string): Promise<BoardVoiceProfile> {
  const { profiles } = await boardVoiceProfiles(client);
  const profile = profiles.find(item => item.id === profileId);
  if (!profile) throw new JoploError('NOT_FOUND', `Unknown voice profile: ${profileId}`);
  if (!profile.voices.some(voice => voice.id === voiceId)) throw new JoploError('USAGE', `Unknown narrator ${voiceId} for ${profileId}. Run npx joplo voice profiles to list valid ids`);
  const data = object(await client.writeVoiceProfile(profileId, { profile: { voice: voiceId } }));
  return readProfile(data.profile);
}
