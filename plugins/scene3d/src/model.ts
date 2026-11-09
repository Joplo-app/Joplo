import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
export function modelStructureKey(props: Record<string, unknown>): string {
  return JSON.stringify([props.at, props.size, props.rotate, props.outline]);
}
/** Parse self-contained GLB bytes; no external buffer/texture or decoder requests. */
export async function loadModel(src: unknown): Promise<THREE.Group> {
  if (typeof src !== 'string' || !/^(data:model\/gltf-binary;base64,|\/__joplo\/p\/[^/]+\/binary\/)/.test(src)) throw new Error('Use asset(GLB) or a compiled local model resource');
  const response = await fetch(src,{signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error('Model unavailable');
  const bytes = await response.arrayBuffer(), view = new DataView(bytes);
  if (bytes.byteLength < 24 || view.getUint32(0,true) !== 0x46546c67 || view.getUint32(4,true) !== 2 || view.getUint32(8,true) !== bytes.byteLength || view.getUint32(16,true) !== 0x4e4f534a) throw new Error('Invalid GLB');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,view.getUint32(12,true))));
  if ([...(json.buffers??[]),...(json.images??[])].some((v:{uri?:string})=>v.uri && !v.uri.startsWith('data:'))) throw new Error('GLB must embed textures and buffers');
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const model = await loader.parseAsync(bytes,'');
  return model.scene;
}
export function disposeModel(model: THREE.Object3D) {
  const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
  model.traverse(o => {
    if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.LineSegments)) return;
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material)?o.material:[o.material]) { materials.add(m); for(const v of Object.values(m)) if(v instanceof THREE.Texture) textures.add(v); }
  });
  for(const t of textures) { t.dispose(); if(typeof ImageBitmap !== 'undefined' && t.image instanceof ImageBitmap) t.image.close(); }
  for(const m of materials) m.dispose(); for(const g of geometries) g.dispose();
}
