import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import type { AssetUsageReport } from '@joplo-app/server';

export async function assetsCommand(directory: string, opts: { scan?: string[]; work?: string; scenario?: string }): Promise<AssetUsageReport> {
  const { assetUsage } = await import('@joplo-app/server');
  const tsconfig = join(directory, 'tsconfig.json');
  return assetUsage({ directory, ...opts, importer: file => tsImport(file, { parentURL: import.meta.url, tsconfig: existsSync(tsconfig) ? tsconfig : false }) });
}
