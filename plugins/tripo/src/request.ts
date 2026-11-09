/** Author-only input. Only this allowlist can be serialized or sent to Tripo. */
export type ModelOptions = { prompt: string; image?: string; model?: 'v3.1-20260211'; texture?: boolean; pbr?: boolean; texture_quality?: 'standard' | 'detailed'; smart_low_poly?: boolean; face_limit?: number; compress?: 'geometry'; model_seed?: number; texture_seed?: number; image_seed?: number; negative_prompt?: string };
export type ModelRequest = ReturnType<typeof normalize>;
export function normalize(input: ModelOptions) {
  const fail = (message: string): never => { throw Object.assign(new Error(message), { code: 'LOCAL_RESOURCE_TRIPO_INPUT' }); };
  if (!input || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 1024) fail('A nonempty description of at most 1024 characters is required.');
  if (input.model !== undefined && input.model !== 'v3.1-20260211') fail('Supported model: v3.1-20260211; pricing must be verified before adding another version.');
  for (const k of ['texture','pbr','smart_low_poly'] as const) if (input[k] !== undefined && typeof input[k] !== 'boolean') fail(`Invalid ${k}`);
  const texture = input.texture ?? true, pbr = input.pbr ?? texture, smart = input.smart_low_poly ?? true;
  if (pbr && !texture) fail('pbr requires texture');
  const face_limit = input.face_limit ?? 10000;
  if (!Number.isInteger(face_limit) || face_limit < 500 || face_limit > (smart ? 20000 : 50000)) fail('face_limit must be 500–20000 with smart_low_poly, or 500–50000 without it.');
  if (input.texture_quality !== undefined && !['standard','detailed'].includes(input.texture_quality)) fail('texture_quality must be standard or detailed');
  if (input.compress !== undefined && input.compress !== 'geometry') fail('compress must be geometry');
  if (input.negative_prompt !== undefined && (typeof input.negative_prompt !== 'string' || input.negative_prompt.length > 255)) fail('negative_prompt must be at most 255 characters');
  const seeds: Partial<Pick<ModelOptions,'model_seed'|'texture_seed'|'image_seed'>> = {};
  for (const k of ['model_seed','texture_seed','image_seed'] as const) if (input[k] !== undefined) { if (!Number.isSafeInteger(input[k]) || input[k]! < 0) fail(`Invalid ${k}`); seeds[k] = input[k]; }
  if (input.image !== undefined && (typeof input.image !== 'string' || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(input.image) || input.image.length > 28 * 1024 * 1024)) fail('Reference image must be asset() PNG/JPEG, at most 20 MB.');
  return { prompt: input.prompt.trim(), model: 'v3.1-20260211' as const, texture, pbr, texture_quality: input.texture_quality ?? 'standard', smart_low_poly: smart, face_limit, ...(input.compress ? {compress:input.compress} : {}), ...seeds, ...(input.negative_prompt ? {negative_prompt:input.negative_prompt} : {}), ...(input.image ? {image:input.image} : {}) };
}
export const estimate = (r: ModelRequest) => (r.image ? 20 : 10) + (r.texture ? 10 : 0) + (r.texture && r.texture_quality === 'detailed' ? 10 : 0) + (r.smart_low_poly ? 10 : 0);
