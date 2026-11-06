/**
 * 测试用：把 examples/ 下的样板复制到临时目录，给没有 pick 的功能补上选定方案（只改副本，不动仓库里的样板）。
 * camping、agent-arch 没有 pick，直接 build 时不发布任何场景（NOT_PICKED）；发布产物完整性与发布站回放的检查
 * 要让它们真正发布出场景、画面与图表布局才有意义。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const EXAMPLES = path.resolve(import.meta.dirname, '../../../examples');

/** 样板 → 发布检查用的方案（与三个分支的样板一致：invite 本来就选了 a-modal）。 */
export const SAMPLE_PICKS: Record<string, string> = { invite: 'a-modal', 'agent-arch': 'a-hybrid', camping: 'a-chat' };

/** 复制样板并补 pick；返回临时项目目录（真实路径）。调用方负责删除。 */
export function pickedExample(name: string, pick = SAMPLE_PICKS[name]): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `joplo-${name}-`)));
  fs.cpSync(path.join(EXAMPLES, name), dir, { recursive: true, filter: (src) => !/[/\\](dist|node_modules|\.joplo)([/\\]|$)/.test(src) });
  const featuresDir = path.join(dir, 'features');
  for (const f of fs.readdirSync(featuresDir)) {
    const file = path.join(featuresDir, f, 'feature.ts');
    if (!fs.existsSync(file) || !pick) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (/^\s*pick\s*:/m.test(src)) continue;
    if (!fs.existsSync(path.join(featuresDir, f, 'options', `${pick}.tsx`))) continue;
    const at = src.lastIndexOf('});');
    if (at < 0) throw new Error(`${file}: cannot find the end of feature({...})`);
    fs.writeFileSync(file, `${src.slice(0, at).replace(/,?\s*$/, ',')}\n  pick: '${pick}',\n${src.slice(at)}`);
  }
  return dir;
}
