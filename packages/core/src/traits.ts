import { z } from 'zod';
import type { ElementTraits } from '@joplo-app/kit/plugin';
const key = z.string().min(1).refine(s => !['__proto__', 'prototype', 'constructor'].includes(s));
const keys = z.array(key).min(1);
export const ElementTraitsSchema: z.ZodType<ElementTraits> = z.strictObject({
  native: z.strictObject({ action: z.enum(['type', 'toggle', 'select']), prop: key, deselect: z.boolean().optional() }).optional(),
  draggable: z.boolean().optional(),
  hover: z.boolean().optional(),
  selectionGate: z.strictObject({ owner: key, item: key.optional(), value: key, fallbackFirst: z.boolean().optional() }).optional(),
  disabledPresentation: z.boolean().optional(),
  frame: z.boolean().optional(),
  input: z.enum(['single', 'multiple']).optional(),
  gate: keys.optional(),
  choices: z.union([
    z.strictObject({ prop: key }),
    z.strictObject({ descendants: keys, value: key.optional(), label: key.optional(), labelChild: key.optional() }),
    z.strictObject({ range: key }),
  ]).optional(),
  toggleCaption: z.literal('check').optional(),
  selfEvident: z.boolean().optional(),
  layout: z.record(key, z.strictObject({ size: key, defaultSize: z.number().finite().nonnegative(), breakpoint: z.boolean().optional() })).optional(),
  region: key.optional(),
  childWidth: z.strictObject({ value: z.number().finite().positive(), when: z.strictObject({ prop: key, value: z.union([z.string(), z.number().finite(), z.boolean()]), width: z.number().finite().positive() }).optional() }).optional(),
  text: z.array(key).optional(),
  textPaths: z.array(keys).optional(),
});
export const InheritSchema = z.array(z.strictObject({ target: key, props: keys }));
