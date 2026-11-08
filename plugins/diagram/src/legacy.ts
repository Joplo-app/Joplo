/** Strict historical input adapter for comparison, not a browser playback fallback. */
import { DiagramLayoutSchema } from './schema.ts';
import { docs } from './catalog.ts';
import { graphStructure, sequenceStructure } from './model.ts';
import type { PluginIRNode as SceneNode } from '@joplo-app/kit/plugin';
export function adaptLegacyPublic(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const project = input as Record<string, any>;
  if (!project.scenes || typeof project.scenes !== 'object') return input;
  const node = (raw: any): any => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const n = { ...raw, ...(Array.isArray(raw.children) ? { children: raw.children.map(node) } : {}) };
    if (typeof n.type !== 'string' || !Object.hasOwn(docs, n.type)) return n;
    n.type = `diagram:${n.type}`;
    if (n.layout !== undefined && !n.ext?.diagram) {
      const parsed = DiagramLayoutSchema.safeParse(n.layout);
      if (parsed.success) {
        n.ext = { ...n.ext, diagram: { layout: parsed.data, structure: n.type === 'diagram:Sequence' ? sequenceStructure(n as SceneNode) : graphStructure(n as SceneNode) } };
        delete n.layout;
      }
      // Invalid/unknown layout fields remain, so the strict host schema rejects them.
    }
    return n;
  };
  return { ...project, scenes: Object.fromEntries(Object.entries(project.scenes).map(([id, raw]) => {
    const scene = raw as any;
    return [id, scene && typeof scene === 'object' ? { ...scene, root: node(scene.root) } : scene];
  })) };
}
