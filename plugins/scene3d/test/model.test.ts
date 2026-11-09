import { expect, it, vi } from 'vitest';
import { loadModel, disposeModel } from '../src/model.ts';
function triangle() {
  const body=JSON.stringify({asset:{version:'2.0'},buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0});
  const json=Buffer.from(body.padEnd(Math.ceil(body.length/4)*4,' '));
  const out=Buffer.alloc(28+json.length+36); out.write('glTF'); out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);out.writeUInt32LE(36,20+json.length);out.writeUInt32LE(0x004e4942,24+json.length);Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer).copy(out,28+json.length);
  return 'data:model/gltf-binary;base64,'+out.toString('base64');
}
it('parses a real embedded GLB triangle offline and frees its geometry',async()=>{
  const model=await loadModel(triangle()); let mesh:any; model.traverse(o=>{if('isMesh' in o) mesh=o;}); expect(mesh.geometry.attributes.position.count).toBe(3);
  const dispose=vi.spyOn(mesh.geometry,'dispose'); disposeModel(model);expect(dispose).toHaveBeenCalledOnce();
});
it('rejects missing, corrupt and remote sources as recoverable loader errors',async()=>{
  await expect(loadModel('')).rejects.toThrow(); await expect(loadModel('https://example.test/model.glb')).rejects.toThrow(/asset/);
  await expect(loadModel('data:model/gltf-binary;base64,YmFk')).rejects.toThrow(/Invalid GLB/);
});
