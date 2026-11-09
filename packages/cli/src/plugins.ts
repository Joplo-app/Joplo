import { enabledPlugins } from '@joplo-app/core/node';
/**
 * 项目启用的插件（D86）：`npx joplo skill` 从当前目录的 joplo.config.ts 读取 config({ plugins })，
 * 列出插件并输出它们自己的技能。只载入 config（插件入口是 Node 端的纯数据），不编译整个项目。
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { isPluginDef, type PluginDef } from '@joplo-app/kit/plugin';

export type ProjectPlugins = { plugins: PluginDef[]; error: string | null };

export async function projectPlugins(dir = '.'): Promise<ProjectPlugins> {
  const root = resolve(dir);
  const file = ['joplo.config.ts', 'joplo.config.tsx'].map((f) => join(root, f)).find((f) => existsSync(f));
  if (!file) return { plugins: enabledPlugins(undefined).filter(isPluginDef), error: null };
  try {
    const tsconfig = join(root, 'tsconfig.json');
    const mod = (await tsImport(file, { parentURL: import.meta.url, tsconfig: existsSync(tsconfig) ? tsconfig : false })) as { default?: { plugins?: unknown } };
    const list = mod.default?.plugins;
    return { plugins: enabledPlugins(list).filter(isPluginDef), error: null };
  } catch (e) {
    return { plugins: [], error: e instanceof Error ? e.message.split('\n')[0]! : String(e) };
  }
}
