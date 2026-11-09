/**
 * asset('./photo.jpg')：把项目里的图片、GLB 或音频读成 data URI，内嵌进演示（本地看板、build、share 都带着它，不依赖外网）。
 * 路径相对于调用 asset() 的源文件，和 import 一样。作者模块在 Node 里执行，这里按需取 node:fs，
 * 不在模块顶层静态导入，免得别处只为类型引用 kit 时牵出 Node 依赖。
 */
import { callsite } from './node.ts';

const MIME: Record<string, string> = {
  glb: 'model/gltf-binary',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  // 媒体插件（D96 / D98）：视频片段与 Lottie 动画 JSON
  mp4: 'video/mp4',
  webm: 'video/webm',
  json: 'application/json',
};

/** 单个文件的上限：再大会拖慢看板加载并撑大发布包，应先压缩。 */
export const ASSET_MAX_BYTES = 2 * 1024 * 1024;

type Fs = { readFileSync: (p: string) => Uint8Array; statSync: (p: string) => { size: number; isFile: () => boolean } };
type Path = { resolve: (...p: string[]) => string; dirname: (p: string) => string; extname: (p: string) => string };
type Buf = { from: (b: Uint8Array) => { toString: (enc: 'base64') => string } };

function builtin<T>(name: string): T {
  const get = (globalThis as { process?: { getBuiltinModule?: (n: string) => unknown } }).process?.getBuiltinModule;
  if (!get) throw new Error('asset() runs while Joplo loads the project in Node (22.3 or newer)');
  return get(name) as T;
}

/** 读入图片或二进制资源，返回 data URI（用于 <Image src={…}>，也可以写进 style 的 backgroundImage: `url(${asset(…)})`）。 */
export function asset(path: string, from?: string): string {
  const fs = builtin<Fs>('node:fs');
  const p = builtin<Path>('node:path');
  const { Buffer } = builtin<{ Buffer: Buf }>('node:buffer');
  const caller = from ?? callsite()?.replace(/:\d+:\d+$/, '');
  const file = caller ? p.resolve(p.dirname(caller), path) : p.resolve(path);
  const ext = p.extname(file).slice(1).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new Error(`asset("${path}"): unsupported asset type ".${ext}" (use ${Object.keys(MIME).join(', ')})`);
  let size: number;
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) throw new Error('not a file');
    size = st.size;
  } catch {
    throw new Error(`asset("${path}"): file not found at ${file} (paths are relative to the file that calls asset())`);
  }
  const limit = mime.startsWith('image/') ? ASSET_MAX_BYTES : 50 * 1024 * 1024;
  if (size > limit)
    throw new Error(`asset("${path}"): ${Math.round(size / 1024)} KB is over the ${limit / 1024 / 1024} MB limit; compress or resize the asset first`);
  return `data:${mime};base64,${Buffer.from(fs.readFileSync(file)).toString('base64')}`;
}
