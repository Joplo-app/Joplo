import { model } from '@joplo-app/plugin-3d';
/** Original asset: one subject, explicit materials and low-poly budget; output is committed. */
export const apple = model({
  prompt: 'A single ripe red apple with a short curved brown wooden stem and one small green leaf. Original stylized low-poly design, gently faceted rounded shape, matte red skin, no logos, no text, no ground, no background objects.',
  smart_low_poly: true,
  face_limit: 10000,
  texture: true,
  pbr: true,
  compress: 'geometry',
});
