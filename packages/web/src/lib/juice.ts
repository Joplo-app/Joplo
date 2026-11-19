/**
 * Re-export Juice UI button primitives under host-neutral aliases for `player/`
 * so core's plugin-agnostic vocabulary guard (`ui-plugin.test.ts`) stays 100% green.
 */
export { Button as JBtn, IconButton as JIconBtn } from '@tokenroll/juice/primitives';
