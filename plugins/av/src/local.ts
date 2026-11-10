import type { PluginLocal } from '@joplo-app/kit/plugin';
import { wavInfo } from './sfx.ts';
export default { compilers: { sfx: {
  version: 'pcm-wav-1', mime: 'audio/wav',
  async inspect(input) { return { durationMs: wavInfo(input).durationMs }; },
  compile(input, ctx) {
    const { bytes } = wavInfo(input);
    if (bytes.length > ctx.maxBytes) throw new Error('Sound effect exceeds resource size limit');
    return bytes;
  },
} } } satisfies PluginLocal;
