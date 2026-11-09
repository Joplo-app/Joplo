/** Offline inspection: no supplier calls. Run after generation or local optimization. */
import { readFileSync, readdirSync } from 'node:fs';
const directory = new URL('../assets/models/', import.meta.url);
let credits = 0, bytes = 0;
const models = readdirSync(directory).filter(name => name.endsWith('.glb')).map(name => {
  const file = readFileSync(new URL(name, directory));
  if (file.toString('ascii', 0, 4) !== 'glTF' || file.readUInt32LE(8) !== file.length) throw Error(`Invalid GLB: ${name}`);
  const gltf = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
  if ([...(gltf.buffers ?? []), ...(gltf.images ?? [])].some(item => item.uri && !item.uri.startsWith('data:'))) throw Error(`External resource: ${name}`);
  const triangles = gltf.meshes.reduce((total, mesh) => total + mesh.primitives.reduce((count, primitive) => {
    if (primitive.mode !== undefined && primitive.mode !== 4) throw Error(`Non-triangle primitive: ${name}`);
    return count + gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
  }, 0), 0);
  const meta = JSON.parse(readFileSync(new URL(name.replace('.glb', '.json'), directory), 'utf8'));
  credits += meta.credits_consumed ?? 0;
  bytes += file.length;
  if (file.length > 2_000_000) throw Error(`Over 2 MB: ${name} (${file.length} bytes). Optimize locally before delivery.`);
  return { file: name, bytes: file.length, triangles, credits: meta.credits_consumed, prompt: meta.prompt };
});
if (models.length !== 6) throw Error(`Expected 6 generated models, found ${models.length}`);
if (credits > 250) throw Error(`Budget exceeded: ${credits}`);
console.log(JSON.stringify({ models, totalBytes: bytes, totalCredits: credits }, null, 2));
