import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as JSX from 'react/jsx-runtime';
import * as JSXDev from 'react/jsx-dev-runtime';
import { standardRuntimes } from './plugins/standard';
/**
 * 插件运行时注册表（D86）：看板、截图路由与发布站共用。
 *
 * 载入方式：
 * - 看板（joplo dev）：IR 推送里带每个插件运行时的地址（Vite 提供的 /@fs/…），loadPluginRuntimes 动态 import；
 * - 发布站（joplo build）：每个插件运行时打成一个文件，以 <script type="module"> 内联在入口脚本之前，
 *   执行时 push 到 globalThis.__JOPLO_PLUGINS__；本模块载入时取走已有的，之后的 push 直接注册。
 *
 * 不变量：同一个插件 id 只注册一次（热更新换地址时重新载入并替换）；接口版本不一致时不注册，记录原因，
 * 舞台把它的组件画成带说明的占位框，演示其余部分照常播放。
 */
import { useSyncExternalStore } from 'react';
import type { PluginRuntime } from '@joplo-app/kit/plugin';

export const PLUGIN_API_VERSION = 2;

export type PluginStatus = { state: 'loading' } | { state: 'ready'; runtime: PluginRuntime } | { state: 'error'; message: string };

const status = new Map<string, PluginStatus>();
const loadedUrl = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => {
  version++;
  for (const l of listeners) l();
};

function isRuntime(v: unknown): v is PluginRuntime {
  return typeof v === 'object' && v !== null && typeof (v as PluginRuntime).id === 'string' && typeof (v as PluginRuntime).components === 'object';
}

/** 注册一个插件运行时（发布站的内联脚本、看板的动态 import 都走这里）。 */
export function registerPluginRuntime(v: unknown, expectedId?: string): void {
  const r = (v && typeof v === 'object' && 'default' in v ? (v as { default: unknown }).default : v) as unknown;
  if (!isRuntime(r)) {
    if (expectedId) status.set(expectedId, { state: 'error', message: 'runtime module has no default export made with defineRuntime' });
    notify();
    return;
  }
  if (expectedId && r.id !== expectedId) status.set(expectedId, { state: 'error', message: `runtime id is ${r.id}, expected ${expectedId}` });
  else if (r.apiVersion !== 1 && r.apiVersion !== PLUGIN_API_VERSION) status.set(r.id, { state: 'error', message: `plugin API ${String(r.apiVersion)}; this Joplo supports ${PLUGIN_API_VERSION}` });
  else status.set(r.id, { state: 'ready', runtime: r });
  notify();
}

// 发布站：内联的插件脚本可能先于本模块执行
type Factory = { id: string; load(): void };
type Queue = { push: (v: unknown) => unknown };
const g = globalThis as {
  __JOPLO_PLUGINS__?: unknown[] | Queue;
  __JOPLO_SHARED__?: Record<string, unknown>;
  __JOPLO_PLUGIN_FACTORIES__?: Factory[] | { push(factory: Factory): void };
};
g.__JOPLO_SHARED__ = { react: React, 'react/jsx-runtime': JSX, 'react/jsx-dev-runtime': JSXDev, 'react-dom': ReactDOM, 'react-dom/client': ReactDOMClient };
const early = Array.isArray(g.__JOPLO_PLUGINS__) ? g.__JOPLO_PLUGINS__ : [];
g.__JOPLO_PLUGINS__ = { push: (v: unknown) => registerPluginRuntime(v) };
for (const v of early) registerPluginRuntime(v);
for (const r of standardRuntimes) registerPluginRuntime(r);
const factories = Array.isArray(g.__JOPLO_PLUGIN_FACTORIES__) ? g.__JOPLO_PLUGIN_FACTORIES__ : [];
const loadFactory = (factory: Factory) => {
  try { factory.load(); }
  catch (e) { status.set(factory.id, { state: 'error', message: e instanceof Error ? e.message : String(e) }); notify(); }
};
g.__JOPLO_PLUGIN_FACTORIES__ = { push: loadFactory };
for (const factory of factories) loadFactory(factory);

/** 看板：按 IR 推送的地址载入（地址没变就不重复载入）。 */
export function loadPluginRuntimes(urls: Readonly<Record<string, string>> | null | undefined): void {
  for (const [id, url] of Object.entries(urls ?? {})) {
    if (standardRuntimes.some(r => r.id === id)) continue;
    if (loadedUrl.get(id) === url) continue;
    loadedUrl.set(id, url);
    if (!status.has(id) || status.get(id)!.state !== 'ready') status.set(id, { state: 'loading' });
    notify();
    import(/* @vite-ignore */ url).then(
      (m: unknown) => registerPluginRuntime(m, id),
      (e: unknown) => {
        status.set(id, { state: 'error', message: e instanceof Error ? e.message : String(e) });
        notify();
      },
    );
  }
}

/** 某个插件此刻的状态；从未请求过的插件视为 loading（发布站的脚本还没执行，或看板还没收到地址）。 */
export function pluginStatus(id: string): PluginStatus {
  return status.get(id) ?? { state: 'loading' };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** React：插件状态变化时重新渲染。 */
export function usePluginStatus(id: string): PluginStatus {
  useSyncExternalStore(subscribe, () => version, () => version);
  return pluginStatus(id);
}
